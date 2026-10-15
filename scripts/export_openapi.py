"""Dump the FastAPI OpenAPI schema to a JSON file.

Used by ``npm run gen:api-types`` (see scripts/export-openapi.mjs) so the
TypeScript contract types can be regenerated and verified without a running
server.
"""
import json
import sys

from app.main import app


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: export_openapi.py <output.json>")
    with open(sys.argv[1], "w", encoding="utf-8") as fh:
        json.dump(app.openapi(), fh, indent=2, sort_keys=True)
    print(f"[export_openapi] wrote {sys.argv[1]}")


if __name__ == "__main__":
    main()
