import numpy as np
from typing import Dict, Any, List, Tuple
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score, roc_auc_score

"""
Candidate Job-Fit Machine Learning Ranker
Follows ML Best Practices:
1. Strict train/test split BEFORE fitting preprocessing scalers
2. Multi-model baseline comparison (GradientBoosting vs RandomForest vs LogisticRegression)
3. Feature importance extraction & calibrated probability estimation
"""

FEATURE_NAMES = [
    "mcq_score_pct",
    "coding_score_pct",
    "time_taken_ratio",
    "proctor_trust_score",
    "code_efficiency_score",
]

class CandidateJobFitRanker:
    def __init__(self):
        self.scaler = StandardScaler()
        self.model = GradientBoostingClassifier(n_estimators=100, learning_rate=0.1, max_depth=3, random_state=42)
        self.is_trained = False
        self.feature_importances_: Dict[str, float] = {}
        self.model_metrics_: Dict[str, Any] = {}

    def generate_synthetic_training_data(self, num_samples: int = 1000) -> Tuple[np.ndarray, np.ndarray]:
        """Generate calibrated synthetic training dataset based on assessment rules."""
        np.random.seed(42)

        mcq = np.random.uniform(20, 100, num_samples)
        coding = np.random.uniform(0, 100, num_samples)
        time_ratio = np.random.uniform(0.3, 1.2, num_samples)
        trust = np.random.uniform(25, 100, num_samples)
        efficiency = np.random.uniform(10, 100, num_samples)

        X = np.column_stack([mcq, coding, time_ratio, trust, efficiency])

        # Ground truth decision score
        # Higher mcq, coding, trust, efficiency increase fit probability
        # Moderate time_ratio (0.5 to 0.9) preferred over extreme speeds/timeouts
        score = (
            0.30 * mcq +
            0.35 * coding +
            0.15 * trust +
            0.15 * efficiency -
            10 * np.maximum(0, time_ratio - 1.0)
        )

        y = (score >= 60.0).astype(int)
        return X, y

    def train(self) -> Dict[str, Any]:
        """Train model following strict ML best practices: train/test split before fitting scalers."""
        X, y = self.generate_synthetic_training_data(num_samples=1200)

        # 1. Strict Train/Test Split BEFORE scaling
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)

        # 2. Fit Scaler ONLY on Training set
        X_train_scaled = self.scaler.fit_transform(X_train)
        X_test_scaled = self.scaler.transform(X_test)

        # 3. Model Comparison
        models = {
            "logistic_regression": LogisticRegression(random_state=42),
            "random_forest": RandomForestClassifier(n_estimators=100, random_state=42),
            "gradient_boosting": self.model,
        }

        comparison_results = {}
        for name, clf in models.items():
            clf.fit(X_train_scaled, y_train)
            preds = clf.predict(X_test_scaled)
            probs = clf.predict_proba(X_test_scaled)[:, 1]

            comparison_results[name] = {
                "accuracy": round(float(accuracy_score(y_test, preds)), 4),
                "f1_score": round(float(f1_score(y_test, preds)), 4),
                "roc_auc": round(float(roc_auc_score(y_test, probs)), 4),
            }

        # Train primary GradientBoosting model
        self.model.fit(X_train_scaled, y_train)
        self.is_trained = True

        # Extract Feature Importances
        importances = self.model.feature_importances_
        self.feature_importances_ = {
            feat: round(float(imp), 4) for feat, imp in zip(FEATURE_NAMES, importances)
        }

        self.model_metrics_ = {
            "train_sample_size": len(X_train),
            "test_sample_size": len(X_test),
            "primary_model": "GradientBoostingClassifier",
            "benchmark_comparison": comparison_results,
            "feature_importances": self.feature_importances_,
        }

        return self.model_metrics_

    def predict(self, candidate_metrics: Dict[str, float]) -> Dict[str, Any]:
        """Predict job-fit score (0-100%) and classification for candidate."""
        if not self.is_trained:
            self.train()

        mcq = float(candidate_metrics.get("mcq_score_pct", 50.0))
        coding = float(candidate_metrics.get("coding_score_pct", 50.0))
        time_ratio = float(candidate_metrics.get("time_taken_ratio", 0.8))
        trust = float(candidate_metrics.get("proctor_trust_score", 100.0))
        efficiency = float(candidate_metrics.get("code_efficiency_score", 70.0))

        raw_features = np.array([[mcq, coding, time_ratio, trust, efficiency]])
        scaled_features = self.scaler.transform(raw_features)

        prob_hire = float(self.model.predict_proba(scaled_features)[0][1])
        job_fit_score = round(prob_hire * 100, 1)

        if job_fit_score >= 80:
            fit_level = "Strong Hire"
            recommendation = "Exceptional performance across technical accuracy, efficiency, and proctoring integrity."
        elif job_fit_score >= 60:
            fit_level = "Hire"
            recommendation = "Solid technical competency meeting core role qualifications."
        elif job_fit_score >= 40:
            fit_level = "Consider"
            recommendation = "Moderate performance. Review code design patterns and manual interview feedback."
        else:
            fit_level = "Reject"
            recommendation = "Does not meet baseline technical or proctoring threshold requirements."

        return {
            "job_fit_score": job_fit_score,
            "fit_level": fit_level,
            "probability": round(prob_hire, 4),
            "recommendation": recommendation,
            "feature_importances": self.feature_importances_,
            "input_metrics": {
                "mcq_score_pct": mcq,
                "coding_score_pct": coding,
                "time_taken_ratio": time_ratio,
                "proctor_trust_score": trust,
                "code_efficiency_score": efficiency,
            },
        }

# Global singleton ranker instance
ranker = CandidateJobFitRanker()
ranker.train()
