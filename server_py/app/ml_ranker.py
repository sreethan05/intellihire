import numpy as np
from typing import Dict, Any, List, Tuple
from sklearn.model_selection import train_test_split, StratifiedKFold, GridSearchCV
from sklearn.preprocessing import StandardScaler, PolynomialFeatures
from sklearn.ensemble import (
    GradientBoostingClassifier,
    RandomForestClassifier,
    ExtraTreesClassifier,
    VotingClassifier,
)
from sklearn.calibration import CalibratedClassifierCV
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score, roc_auc_score, precision_score, recall_score

"""
Maximized Enterprise Candidate Job-Fit ML Ranker
Follows Essential ML Practices:
1. Strict train/test split BEFORE fitting scaling & polynomial feature transformers.
2. 5-Fold Stratified Cross-Validation & Hyperparameter Grid Optimization (GridSearchCV).
3. Soft-Voting Ensemble (GradientBoosting + RandomForest + ExtraTrees).
4. Isotonic Probability Calibration (CalibratedClassifierCV).
5. Comprehensive metrics evaluation (Accuracy, F1, ROC-AUC, Precision, Recall).
"""

BASE_FEATURE_NAMES = [
    "mcq_score_pct",
    "coding_score_pct",
    "time_taken_ratio",
    "proctor_trust_score",
    "code_efficiency_score",
]

class CandidateJobFitRanker:
    def __init__(self):
        self.scaler = StandardScaler()
        self.poly = PolynomialFeatures(degree=2, interaction_only=True, include_bias=False)
        self.model = None
        self.is_trained = False
        self.feature_names_: List[str] = []
        self.feature_importances_: Dict[str, float] = {}
        self.model_metrics_: Dict[str, Any] = {}

    def generate_training_dataset(self, num_samples: int = 2500) -> Tuple[np.ndarray, np.ndarray]:
        """Generate high-cardinality calibrated training dataset for optimal convergence."""
        np.random.seed(42)

        mcq = np.random.uniform(10, 100, num_samples)
        coding = np.random.uniform(0, 100, num_samples)
        time_ratio = np.random.uniform(0.2, 1.3, num_samples)
        trust = np.random.uniform(10, 100, num_samples)
        efficiency = np.random.uniform(10, 100, num_samples)

        X_raw = np.column_stack([mcq, coding, time_ratio, trust, efficiency])

        # Non-linear target decision boundary
        weighted_score = (
            0.28 * mcq +
            0.34 * coding +
            0.18 * trust +
            0.15 * efficiency +
            0.05 * (mcq * coding / 100.0) -
            15.0 * np.maximum(0.0, time_ratio - 1.0)
        )

        # Binary label with logistic threshold
        probs = 1.0 / (1.0 + np.exp(-(weighted_score - 55.0) / 10.0))
        y = (np.random.binomial(1, probs) == 1).astype(int)

        return X_raw, y

    def train(self) -> Dict[str, Any]:
        """Train model to maximum extent using Grid Search, 5-Fold CV, and Ensemble Stacking."""
        X_raw, y = self.generate_training_dataset(num_samples=3000)

        # 1. Strict Train/Test Split BEFORE fitting any transformer
        X_train, X_test, y_train, y_test = train_test_split(
            X_raw, y, test_size=0.2, random_state=42, stratify=y
        )

        # 2. Fit Scaler & Polynomial Interaction Transformer on Train set only
        X_train_scaled = self.scaler.fit_transform(X_train)
        X_train_poly = self.poly.fit_transform(X_train_scaled)

        X_test_scaled = self.scaler.transform(X_test)
        X_test_poly = self.poly.transform(X_test_scaled)

        # Generate interaction feature names
        self.feature_names_ = [f"f_{i}" for i in range(X_train_poly.shape[1])]

        # 3. Hyperparameter Tuning using 5-Fold Cross-Validation
        cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)

        param_grid = {
            "n_estimators": [100, 200],
            "max_depth": [3, 4],
            "learning_rate": [0.05, 0.1],
        }

        grid_search = GridSearchCV(
            estimator=GradientBoostingClassifier(random_state=42),
            param_grid=param_grid,
            cv=cv,
            scoring="roc_auc",
            n_jobs=-1,
        )
        grid_search.fit(X_train_poly, y_train)
        best_gb = grid_search.best_estimator_

        # 4. Soft Voting Ensemble (GradientBoosting + RandomForest + ExtraTrees)
        rf = RandomForestClassifier(n_estimators=200, max_depth=6, random_state=42)
        et = ExtraTreesClassifier(n_estimators=200, max_depth=6, random_state=42)

        ensemble = VotingClassifier(
            estimators=[("gb", best_gb), ("rf", rf), ("et", et)],
            voting="soft"
        )

        # 5. Isotonic Probability Calibration
        calibrated_model = CalibratedClassifierCV(estimator=ensemble, cv=5, method="isotonic")
        calibrated_model.fit(X_train_poly, y_train)

        self.model = calibrated_model
        self.is_trained = True

        # Evaluate on held-out test set
        test_preds = self.model.predict(X_test_poly)
        test_probs = self.model.predict_proba(X_test_poly)[:, 1]

        # Extract base feature importance from tuned GradientBoosting
        gb_importances = best_gb.feature_importances_[: len(BASE_FEATURE_NAMES)]
        total_imp = np.sum(gb_importances) or 1.0
        normalized_imp = gb_importances / total_imp

        self.feature_importances_ = {
            feat: round(float(imp), 4)
            for feat, imp in zip(BASE_FEATURE_NAMES, normalized_imp)
        }

        # Baseline comparison
        lr_baseline = LogisticRegression(random_state=42)
        lr_baseline.fit(X_train_scaled, y_train)
        lr_probs = lr_baseline.predict_proba(X_test_scaled)[:, 1]

        self.model_metrics_ = {
            "train_sample_size": len(X_train),
            "test_sample_size": len(X_test),
            "cross_validation_folds": 5,
            "best_hyperparameters": grid_search.best_params_,
            "ensemble_architecture": "Soft-Voting (GradientBoosting + RandomForest + ExtraTrees) + Isotonic Calibration",
            "test_performance": {
                "accuracy": round(float(accuracy_score(y_test, test_preds)), 4),
                "f1_score": round(float(f1_score(y_test, test_preds)), 4),
                "roc_auc": round(float(roc_auc_score(y_test, test_probs)), 4),
                "precision": round(float(precision_score(y_test, test_preds)), 4),
                "recall": round(float(recall_score(y_test, test_preds)), 4),
            },
            "baseline_logistic_regression_roc_auc": round(float(roc_auc_score(y_test, lr_probs)), 4),
            "feature_importances": self.feature_importances_,
        }

        return self.model_metrics_

    def predict(self, candidate_metrics: Dict[str, float]) -> Dict[str, Any]:
        """Predict job-fit score (0-100%) using maximized ensemble model."""
        if not self.is_trained:
            self.train()

        mcq = float(candidate_metrics.get("mcq_score_pct", 50.0))
        coding = float(candidate_metrics.get("coding_score_pct", 50.0))
        time_ratio = float(candidate_metrics.get("time_taken_ratio", 0.8))
        trust = float(candidate_metrics.get("proctor_trust_score", 100.0))
        efficiency = float(candidate_metrics.get("code_efficiency_score", 70.0))

        raw_features = np.array([[mcq, coding, time_ratio, trust, efficiency]])
        scaled_features = self.scaler.transform(raw_features)
        poly_features = self.poly.transform(scaled_features)

        prob_hire = float(self.model.predict_proba(poly_features)[0][1])
        job_fit_score = round(prob_hire * 100, 1)

        if job_fit_score >= 80:
            fit_level = "Strong Hire"
            recommendation = "Top-tier candidate. Exceptional score across all ML features & calibrated bounds."
        elif job_fit_score >= 60:
            fit_level = "Hire"
            recommendation = "Qualified candidate. Meets baseline technical competency requirements."
        elif job_fit_score >= 40:
            fit_level = "Consider"
            recommendation = "Moderate score. Recommended for manual interview review."
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
            "model_metadata": {
                "algorithm": "Calibrated Soft-Voting Ensemble (GradientBoosting + RandomForest + ExtraTrees)",
                "cross_validation": "5-Fold Stratified K-Fold",
            },
        }

# Global singleton ranker instance.
# Training is deferred to first predict() call to avoid slow startup.
ranker = CandidateJobFitRanker()
