from datetime import datetime, timezone
from typing import Any, List, Optional


def utc_now() -> datetime:
    """Current time as a timezone-aware UTC datetime.

    Never use the deprecated naive ``datetime.utcnow()`` — aware timestamps
    serialize unambiguously and compare correctly against DB ``timestamptz``
    values.
    """
    return datetime.now(timezone.utc)


def now_iso() -> str:
    """Current UTC time as an ISO-8601 string ending in ``Z``."""
    return utc_now().isoformat().replace("+00:00", "Z")


def parse_datetime(value: Optional[Any], assume_utc: bool = True) -> Optional[datetime]:
    """Best-effort parse of a datetime or ISO-8601 string into a datetime.

    Database drivers (psycopg) return ``datetime`` objects for timestamptz
    columns while API payloads/mocks may contain ISO strings. Callers should
    use this helper instead of calling ``.replace("Z", ...)`` or slicing the
    value directly.  Naive datetimes are assumed to be UTC by default.
    """
    if value is None or value == "":
        return None
    dt: Optional[datetime] = value if isinstance(value, datetime) else None
    if dt is None:
        try:
            dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except (ValueError, TypeError):
            return None
    if dt.tzinfo is None and assume_utc:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def iso_date(value: Optional[Any]) -> str:
    """Returns the ``YYYY-MM-DD`` date portion for a datetime or ISO string."""
    dt = parse_datetime(value)
    if dt is not None:
        return dt.date().isoformat()
    return str(value)[:10] if value else ""


def format_date(date_str: Optional[Any]) -> str:
    if not date_str:
        return ""
    try:
        # Formats to DD Month YYYY (e.g., "03 Jul 2026")
        dt = None
        if isinstance(date_str, str):
            dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
        elif isinstance(date_str, datetime):
            dt = date_str
            
        if dt:
            months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
            return f"{dt.day:02d} {months[dt.month - 1]} {dt.year}"
    except Exception:
        pass
    return str(date_str) if date_str is not None else ""


def months_back(count: int) -> List[dict]:
    # Returns the last count months (key: "YYYY-MM", label: "MMM")
    now = datetime.now()
    results = []
    months_labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    
    for i in range(count):
        # Calculate year and month back in ascending chronological order
        m_back = count - 1 - i
        year = now.year
        month = now.month - m_back
        while month <= 0:
            month += 12
            year -= 1
            
        results.append({
            "key": f"{year}-{month:02d}",
            "label": months_labels[month - 1]
        })
    return results
