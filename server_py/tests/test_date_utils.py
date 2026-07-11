from datetime import datetime
from app.date_utils import format_date, months_back


def test_format_date_valid():
    date_str = "2026-07-03T12:00:00Z"
    formatted = format_date(date_str)
    assert "3" in formatted or "03" in formatted
    assert "Jul" in formatted
    assert "2026" in formatted


def test_format_date_empty():
    assert format_date(None) == ""
    assert format_date("") == ""


def test_months_back_count():
    result = months_back(6)
    assert len(result) == 6
    assert "key" in result[0]
    assert "label" in result[0]


def test_months_back_order():
    result = months_back(3)
    key0 = result[0]["key"]
    key1 = result[1]["key"]
    key2 = result[2]["key"]
    assert key0 < key1
    assert key1 < key2
