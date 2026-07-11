import pytest
from app.exam_pipeline import (
    weighted_random_sample,
    topic_match_score,
    difficulty_match_score,
    calculate_diversity_score,
    recency_score,
    apply_variation,
    apply_coding_variation
)

def test_weighted_random_sample():
    items = ["A", "B", "C"]
    weights = [1.0, 1.0, 0.0]
    sample = weighted_random_sample(items, weights, 2)
    assert len(sample) == 2
    assert "A" in sample
    assert "B" in sample

def test_topic_match_score():
    assert topic_match_score("python", "python") == 1.0
    assert topic_match_score("python", "basics") > 0.0
    assert topic_match_score("python", "sql") == 0.1

def test_difficulty_match_score():
    assert difficulty_match_score("medium", "apply", 2, "medium") == 1.0
    assert difficulty_match_score("easy", "remember", 1, "medium") < 1.0

def test_calculate_diversity_score():
    assert calculate_diversity_score(["loops", "conditionals"], {"loops"}) == 0.5

def test_recency_score():
    assert recency_score(None) == 1.0
    import datetime
    old_date = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=10)).isoformat()
    recent_date = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=1)).isoformat()
    assert recency_score(old_date) > recency_score(recent_date)

def test_apply_variation_numeric():
    question = {
        "question_text": "What is 10 plus 20?",
        "option_a": "30",
        "option_b": "40",
        "option_c": "50",
        "option_d": "60",
        "correct_option": "A"
    }
    varied, formula = apply_variation(question, 1)
    assert "11" in varied["question_text"]

def test_apply_coding_variation_numeric():
    question = {
        "title": "Add 5 and 10",
        "description": "Output sum of 5 and 10 which is 15.",
        "starter_code": "x = 5\ny = 10",
        "test_cases": [{"input": "5\n10\n", "expected_output": "15"}]
    }
    varied, formula = apply_coding_variation(question, 1)
    assert varied["description"] != question["description"]
    assert varied["test_cases"][0]["input"] == "6\n11\n"
