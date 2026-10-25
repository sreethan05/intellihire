"""Restart-proof signed download URL tests for app.assets.

Signed download URLs (GET /api/assets/files/{path}?exp=&sig=) are HMAC-SHA256
over "<path>:<expiry>" keyed with JWT_SECRET (app/assets.py). In production the
app runs in a container: the process dies and restarts regularly, but the
secret is re-read from the persistent environment / secret store every boot.
Two properties must therefore hold:

1. Restart stability — re-importing/reloading app.config with the SAME
   JWT_SECRET from the environment must keep old signatures valid (signed URLs
   must not break across a container restart).
2. Rotation semantics — reloading with a DIFFERENT secret must invalidate
   signatures minted with the old one (rotation is the kill switch for leaked
   links), while newly minted signatures keep working.

Route coroutines are verified through the real app via TestClient, exactly as
in tests/test_asset_files.py; a fresh subprocess doubles as a true
"container restarted with the same persistent env" simulation.
"""
import hmac
import importlib
import os
import subprocess
import sys
import textwrap
import time
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

import app.assets as assets_module
import app.config as config_module
from app.main import app

client = TestClient(app)

RESUME_NAME = "1700000000-ab12cd34.pdf"
RESUME_PATH = f"resumes/{RESUME_NAME}"
PDF_BYTES = b"%PDF-1.4 fake document"

# Both well above the 32-character minimum enforced by config.validate_jwt.
SECRET_V1 = "restart-stable-secret-v1-0123456789abcdef"
SECRET_V2 = "rotated-secret-v2-9876543210-fedcba987654"

SERVER_PY_DIR = Path(__file__).resolve().parents[1]


@pytest.fixture()
def signing_key():
    """Reload app.config + app.assets against a controlled JWT_SECRET.

    app/assets.py binds JWT_SECRET by value at import time (``from .config
    import JWT_SECRET``), so — exactly like a restarted process re-importing
    the modules — both modules must be reloaded to pick up the key currently
    in the environment. The original module state is restored afterwards so
    other test modules keep using the real project secret.
    """
    original_secret = config_module.JWT_SECRET

    def reload_with(secret):
        os.environ["JWT_SECRET"] = secret
        importlib.reload(config_module)
        importlib.reload(assets_module)
        return assets_module._sign_asset_path

    yield reload_with

    # Restore: point the env var at the original *effective* secret (it may
    # have come from the git-ignored .env file rather than the environment)
    # and reload both modules back.
    os.environ["JWT_SECRET"] = original_secret
    importlib.reload(config_module)
    importlib.reload(assets_module)


@pytest.fixture()
def storage(tmp_path):
    """A real storage root on disk with one resume (mirrors test_asset_files)."""
    (tmp_path / "resumes").mkdir()
    (tmp_path / "resumes" / RESUME_NAME).write_bytes(PDF_BYTES)
    return tmp_path


def _signed_url(exp, sig):
    return f"/api/assets/files/{RESUME_PATH}?exp={exp}&sig={sig}"


def _restart_in_fresh_process(rel_path, exp, sig, secret):
    """Verify a signature in a brand-new interpreter with only the env set.

    This is the closest local simulation of a container restart: no in-memory
    state, the secret arrives purely through the environment, and the config
    and assets modules are imported from scratch.
    """
    script = textwrap.dedent(
        """
        import hmac, sys
        sys.path.insert(0, sys.argv[4])
        from app.assets import _sign_asset_path
        recomputed = _sign_asset_path(sys.argv[1], int(sys.argv[2]))
        sys.exit(0 if hmac.compare_digest(recomputed, sys.argv[3]) else 1)
        """
    )
    env = {**os.environ, "JWT_SECRET": secret, "PYTHONPATH": str(SERVER_PY_DIR)}
    return subprocess.run(
        [sys.executable, "-c", script, rel_path, str(exp), sig, str(SERVER_PY_DIR)],
        env=env,
        cwd=str(SERVER_PY_DIR),
        capture_output=True,
        text=True,
        timeout=120,
    )


def test_signed_url_survives_secret_reload(storage, signing_key):
    """A signature stays valid across a config reload with the same secret."""
    signing_key(SECRET_V1)
    exp = int(time.time()) + 300
    sig = assets_module._sign_asset_path(RESUME_PATH, exp)
    url = _signed_url(exp, sig)

    with patch("app.assets.storage_root", str(storage)):
        assert client.get(url).status_code == 200

    # "Container restart": config is re-imported with the SAME secret re-read
    # from the environment (persistent env / secret store).
    signing_key(SECRET_V1)
    assert config_module.JWT_SECRET == SECRET_V1

    # The pre-restart URL still verifies over the real route...
    with patch("app.assets.storage_root", str(storage)):
        resp = client.get(url)
    assert resp.status_code == 200
    assert resp.content == PDF_BYTES

    # ...and in a completely fresh interpreter seeded only from the env.
    proc = _restart_in_fresh_process(RESUME_PATH, exp, sig, SECRET_V1)
    assert proc.returncode == 0, proc.stderr


def test_rotated_secret_invalidates_old_signatures(storage, signing_key):
    """Rotating JWT_SECRET kills old signed URLs; new ones keep working."""
    signing_key(SECRET_V1)
    exp = int(time.time()) + 300
    old_sig = assets_module._sign_asset_path(RESUME_PATH, exp)
    old_url = _signed_url(exp, old_sig)

    with patch("app.assets.storage_root", str(storage)):
        assert client.get(old_url).status_code == 200

    # Rotation: same config module, different secret from the environment.
    signing_key(SECRET_V2)
    assert config_module.JWT_SECRET == SECRET_V2

    # The pre-rotation URL is rejected...
    with patch("app.assets.storage_root", str(storage)):
        resp = client.get(old_url)
    assert resp.status_code == 401

    # ...while re-signing with the rotated key proves the link pipeline works.
    new_sig = assets_module._sign_asset_path(RESUME_PATH, exp)
    assert not hmac.compare_digest(new_sig, old_sig)
    with patch("app.assets.storage_root", str(storage)):
        assert client.get(_signed_url(exp, new_sig)).status_code == 200
