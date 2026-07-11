from datetime import datetime
from typing import Any, List, Optional


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
