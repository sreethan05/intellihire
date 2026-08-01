import pytest
from app.ml_ranker import CandidateJobFitRanker, ranker

def test_ml_ranker_training():
    """Verify ML model trains cleanly and reports benchmark metrics."""
    test_ranker = CandidateJobFitRanker()
    metrics = test_ranker.train()

    assert test_ranker.is_trained is True
    assert "primary_model" in metrics
    assert metrics["primary_model"] == "GradientBoostingClassifier"
    assert "feature_importances" in metrics
    assert len(metrics["feature_importances"]) == 5

    # Check benchmark evaluation metrics
    benchmarks = metrics["benchmark_comparison"]
    assert "gradient_boosting" in benchmarks
    assert benchmarks["gradient_boosting"]["accuracy"] > 0.80
    assert benchmarks["gradient_boosting"]["roc_auc"] > 0.85

def test_ml_ranker_prediction_high_performer():
    """Verify strong hire prediction for top-tier candidate."""
    result = ranker.predict({
        "mcq_score_pct": 95.0,
        "coding_score_pct": 90.0,
        "time_taken_ratio": 0.7,
        "proctor_trust_score": 100.0,
        "code_efficiency_score": 95.0,
    })

    assert result["job_fit_score"] >= 75.0
    assert result["fit_level"] in ["Strong Hire", "Hire"]
    assert "feature_importances" in result
    assert result["probability"] > 0.70

def test_ml_ranker_prediction_low_performer():
    """Verify reject prediction for low-scoring candidate."""
    result = ranker.predict({
        "mcq_score_pct": 20.0,
        "coding_score_pct": 10.0,
        "time_taken_ratio": 1.2,
        "proctor_trust_score": 30.0,
        "code_efficiency_score": 20.0,
    })

    assert result["job_fit_score"] < 50.0
    assert result["fit_level"] in ["Consider", "Reject"]
    assert result["probability"] < 0.50

def test_ml_ranker_robustness():
    """Verify ranker handles default / missing values gracefully."""
    result = ranker.predict({})

    assert 0.0 <= result["job_fit_score"] <= 100.0
    assert result["fit_level"] in ["Strong Hire", "Hire", "Consider", "Reject"]
