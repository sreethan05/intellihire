"""Property-based testing with Hypothesis for platform algorithms."""
from hypothesis import given, strategies as st
import pytest


# Property 1: Pass mark and total mark validation invariants
@given(
    total_marks=st.integers(min_value=1, max_value=1000),
    obtained_marks=st.integers(min_value=0, max_value=1000),
)
def test_score_percentage_invariants(total_marks, obtained_marks):
    percentage = (min(obtained_marks, total_marks) / total_marks) * 100
    assert 0.0 <= percentage <= 100.0


# Property 2: Plagiarism similarity matrix properties (Symmetry & Boundedness)
def compute_jaccard_similarity(set_a: set, set_b: set) -> float:
    if not set_a and not set_b:
        return 1.0
    union = set_a.union(set_b)
    if not union:
        return 0.0
    return len(set_a.intersection(set_b)) / len(union)


@given(
    tokens_1=st.sets(st.text(min_size=1, max_size=10), max_size=20),
    tokens_2=st.sets(st.text(min_size=1, max_size=10), max_size=20),
)
def test_plagiarism_similarity_properties(tokens_1, tokens_2):
    sim_12 = compute_jaccard_similarity(tokens_1, tokens_2)
    sim_21 = compute_jaccard_similarity(tokens_2, tokens_1)

    # Symmetry invariant
    assert pytest.approx(sim_12) == sim_21

    # Boundedness invariant
    assert 0.0 <= sim_12 <= 1.0

    # Identity invariant
    assert compute_jaccard_similarity(tokens_1, tokens_1) == 1.0
