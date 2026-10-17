"""Authorization matrix over the registered FastAPI route table.

Every API route must carry an auth dependency (``get_current_user``,
``require_roles`` or the internal shared-secret check) unless it is explicitly
listed as public below. This is a static audit — no HTTP calls — so a newly
added unprotected endpoint fails CI immediately.

The allowlist is checked in both directions:

- a route that is neither protected nor allowlisted fails the test;
- an allowlist entry that no longer exists (route renamed/removed) fails;
- an allowlist entry that has since gained protection fails too, so the list
  stays minimal.
"""
from fastapi.routing import APIRoute

from app.main import app

# (method, path) -> why it is intentionally reachable without a session.
PUBLIC_ROUTES = {
    ("GET", "/metrics"): "Prometheus scrape endpoint (kept on the internal network).",
    ("POST", "/api/auth/login"): "Credential exchange; returns tokens.",
    ("POST", "/api/auth/refresh"): "Refresh-token exchange; token is the credential.",
    ("POST", "/api/auth/logout"): "Revokes a refresh token supplied in the body.",
    ("GET", "/api/docs"): "API documentation UI.",
    ("GET", "/api/docs/"): "API documentation UI (trailing slash).",
    ("GET", "/api/docs/json"): "OpenAPI document consumed by the docs UI.",
    ("GET", "/api/candidate/portfolio/{slug}"): "Shareable public portfolio link.",
    ("GET", "/api/interview/questions"): "Static stage metadata (names/counts only).",
    ("GET", "/api/v1/health"): "Liveness/readiness probe.",
    ("GET", "/api/health"): "Liveness/readiness probe.",
    ("GET", "/"): "SPA shell.",
    ("GET", "/{full_path:path}"): "SPA catch-all for client-side routing.",
}

IGNORED_METHODS = {"HEAD", "OPTIONS"}


def _all_api_routes():
    """Yield every APIRoute, including those inside FastAPI's _IncludedRouter."""
    for route in app.routes:
        if isinstance(route, APIRoute):
            yield route
        elif type(route).__name__ == "_IncludedRouter":
            for inner in route.original_router.routes:
                if isinstance(inner, APIRoute):
                    yield inner


def _dependency_qualnames(route) -> set:
    names = set()
    stack = list(getattr(route, "dependencies", []) or []) + list(route.dependant.dependencies)
    while stack:
        dep = stack.pop()
        call = getattr(dep, "dependency", None) or getattr(dep, "call", None)
        names.add(getattr(call, "__qualname__", "?") or "?")
        stack.extend(getattr(dep, "dependencies", []) or [])
    return names


def _is_protected(route) -> bool:
    markers = ("get_current_user", "require_roles", "internal_secret")
    return any(marker in name for name in _dependency_qualnames(route) for marker in markers)


def test_every_route_is_protected_or_allowlisted():
    unprotected = []
    stale_entries = []
    seen_public = set()

    for route in _all_api_routes():
        methods = (route.methods or set()) - IGNORED_METHODS
        protected = _is_protected(route)
        for method in methods:
            key = (method, route.path)
            if key in PUBLIC_ROUTES:
                seen_public.add(key)
                if protected:
                    stale_entries.append(
                        f"{method} {route.path} is allowlisted as public but now requires auth"
                    )
            elif not protected:
                unprotected.append(f"{method} {route.path}")

    assert not unprotected, (
        "Routes reachable without an auth dependency were found and are not on the "
        f"public allowlist: {sorted(unprotected)}. Add an auth dependency or extend "
        "PUBLIC_ROUTES with a justification."
    )
    assert not stale_entries, stale_entries
    assert seen_public == set(PUBLIC_ROUTES), (
        "Public allowlist entries that no longer match any registered route "
        f"(remove them): {sorted(set(PUBLIC_ROUTES) - seen_public)}"
    )
