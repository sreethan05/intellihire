from app.validation import (
    is_valid_email,
    get_password_validation_error,
    get_exam_validation_error,
)


def test_is_valid_email():
    # Correct formats
    assert is_valid_email("test@example.com") is True
    assert is_valid_email("user.name+tag@sub.domain.co") is True

    # Incorrect formats
    assert is_valid_email("test") is False
    assert is_valid_email("test@") is False
    assert is_valid_email("test@example") is False
    assert is_valid_email("@example.com") is False


def test_get_password_validation_error():
    assert get_password_validation_error("Short1") == "Password must be at least 8 characters long"
    assert get_password_validation_error("lowercase123!") == "Password must include at least one uppercase letter"
    assert get_password_validation_error("UPPERCASE123!") == "Password must include at least one lowercase letter"
    assert get_password_validation_error("NoNumberPresent!") == "Password must include at least one number"
    assert get_password_validation_error("StrongPass123!") == ""


def test_get_exam_validation_error():
    # Empty title
    assert get_exam_validation_error({"title": ""}) == "Exam title is required"

    # Short duration
    assert get_exam_validation_error({"title": "Exam 1", "duration": 3}) == "Duration must be at least 5 minutes"

    # Invalid total marks
    assert get_exam_validation_error({"title": "Exam 1", "duration": 10, "total_marks": 0}) == "Total marks must be greater than 0"

    # Negative pass marks
    assert get_exam_validation_error({"title": "Exam 1", "duration": 10, "total_marks": 100, "pass_marks": -5}) == "Pass marks cannot be negative"

    # Pass marks exceeding total marks
    assert get_exam_validation_error({"title": "Exam 1", "duration": 10, "total_marks": 100, "pass_marks": 110}) == "Pass marks cannot be greater than total marks"

    # available_until before available_from
    assert get_exam_validation_error({
        "title": "Exam 1",
        "duration": 10,
        "total_marks": 100,
        "pass_marks": 50,
        "available_from": "2026-07-03T12:00:00Z",
        "available_until": "2026-07-03T11:00:00Z",
    }) == "Attempt until time must be after the start time"

    # Valid exam config
    assert get_exam_validation_error({
        "title": "Exam 1",
        "duration": 10,
        "total_marks": 100,
        "pass_marks": 50,
        "available_from": "2026-07-03T12:00:00Z",
        "available_until": "2026-07-03T13:00:00Z",
    }) == ""
