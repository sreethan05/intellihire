#!/usr/bin/env python3
"""
IntelliHire Score Analytics and Visualization Tool.
Calculates test stats and saves visualization plots of candidate performance.
"""

import os
import json
import sys

try:
    import pandas as pd
    import matplotlib.pyplot as plt
    HAS_PLOT_LIBS = True
except ImportError:
    HAS_PLOT_LIBS = False

class ScorePlotter:
    def __init__(self):
        self.has_libs = HAS_PLOT_LIBS
        if not HAS_PLOT_LIBS:
            print("[Warning] pandas or matplotlib is not installed. Running in statistics mode only.")

    def calculate_stats(self, scores):
        """
        Calculates basic statistical metrics on candidate scores.
        """
        if not scores:
            return {"error": "Score list is empty"}

        count = len(scores)
        mean_score = sum(scores) / count
        sorted_scores = sorted(scores)
        
        # Median
        if count % 2 == 1:
            median_score = sorted_scores[count // 2]
        else:
            median_score = (sorted_scores[count // 2 - 1] + sorted_scores[count // 2]) / 2.0

        min_score = sorted_scores[0]
        max_score = sorted_scores[-1]

        # Pass rates (assuming default 40% passing score)
        passing_score = 40.0
        passed_count = sum(1 for s in scores if s >= passing_score)
        pass_rate = (passed_count / count) * 100.0

        return {
            "total_candidates": count,
            "mean": round(mean_score, 2),
            "median": round(median_score, 2),
            "min": min_score,
            "max": max_score,
            "pass_count": passed_count,
            "fail_count": count - passed_count,
            "pass_rate_percentage": round(pass_rate, 2)
        }

    def generate_distribution_plot(self, scores, output_path="score_distribution.png"):
        """
        Generates and saves a histogram plot of the scores.
        """
        if not self.has_libs:
            print("[Error] Cannot generate plot without pandas/matplotlib installed.")
            return False

        # Create DataFrame
        df = pd.DataFrame(scores, columns=["Score"])

        plt.figure(figsize=(8, 5))
        # Plot histogram
        n, bins, patches = plt.hist(
            df["Score"], bins=10, range=(0, 100), color="#1e40af", edgecolor="#ffffff", alpha=0.85
        )

        # Style customization (matches IntelliHire premium theme colors)
        plt.title("Candidate Exam Score Distribution", fontsize=14, fontweight="bold", pad=15)
        plt.xlabel("Exam Score (0 - 100)", fontsize=11, labelpad=10)
        plt.ylabel("Number of Candidates", fontsize=11, labelpad=10)
        plt.axvline(40.0, color="#ef4444", linestyle="dashed", linewidth=1.5, label="Passing Mark (40)")
        plt.grid(axis='y', linestyle='--', alpha=0.5)
        plt.xlim(0, 100)
        plt.legend(loc="upper left")
        plt.tight_layout()

        # Save image
        plt.savefig(output_path, dpi=300)
        plt.close()
        print(f"Visualization successfully saved to: {output_path}")
        return True

if __name__ == "__main__":
    plotter = ScorePlotter()
    
    # Mock data of candidate exam scores
    sample_scores = [78, 85, 34, 92, 55, 63, 40, 12, 67, 88, 95, 23, 56, 71, 80, 48, 62, 77, 83, 91]

    if len(sys.argv) > 1:
        # User input file containing JSON list of scores
        file_path = sys.argv[1]
        try:
            with open(file_path, 'r') as f:
                data = json.load(f)
                if isinstance(data, list):
                    scores = list(map(float, data))
                elif isinstance(data, dict) and "scores" in data:
                    scores = list(map(float, data["scores"]))
                else:
                    raise ValueError("JSON file must be a list of numbers or have a 'scores' key")
            
            stats = plotter.calculate_stats(scores)
            print("--- Exam Analytics ---")
            print(json.dumps(stats, indent=2))
            
            out_img = sys.argv[2] if len(sys.argv) > 2 else "score_distribution.png"
            plotter.generate_distribution_plot(scores, out_img)
            
        except Exception as e:
            print(f"[Error] Failed to parse input file: {e}")
    else:
        print("IntelliHire Score Analytics loaded successfully.")
        print("Usage: python score_plotter.py <path_to_scores_json> [output_image_path]")
        
        # Run validation demo
        print("\n--- Running Demo Validation with Sample Scores ---")
        stats = plotter.calculate_stats(sample_scores)
        print("Statistics:")
        print(json.dumps(stats, indent=2))
        
        if plotter.has_libs:
            plotter.generate_distribution_plot(sample_scores, "demo_score_distribution.png")
