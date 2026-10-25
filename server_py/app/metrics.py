"""Custom Prometheus metrics for IntelliHire application internals.

These complement the HTTP metrics that prometheus-fastapi-instrumentator
exposes by default (http_requests_total, http_request_duration_*). They
register on the default REGISTRY, so `Instrumentator().expose()` serves
them at /metrics alongside the defaults. Alert rules in
observability/alert_rules.yml consume these names.
"""
from prometheus_client import Counter, Gauge

# Why logins failed: unknown_user | bad_password | throttled
AUTH_FAILURES = Counter(
    "intellihire_auth_failures_total",
    "Failed login attempts by reason",
    ["reason"],
)

# Depth of the background job queues (grading / interview, plus DLQs)
QUEUE_DEPTH = Gauge(
    "intellihire_queue_depth",
    "Pending jobs in a background queue",
    ["queue"],
)

# Connectivity of backing services as observed by the app itself (1=up, 0=down)
SERVICE_UP = Gauge(
    "intellihire_service_up",
    "Service connectivity as last observed by the app",
    ["service"],
)
