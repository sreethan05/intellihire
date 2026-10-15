from app.plagiarism import (
    normalize_code,
    calculate_cosine_similarity,
    calculate_levenshtein_similarity,
    get_similarity_score,
)


def test_normalize_code_comments():
    code = """
        // This is a comment
        /* Multi-line
           comment */
        const x = 42; # Python style comment
    """
    assert normalize_code(code) == "const x = 42;"


def test_normalize_whitespace():
    code = "let    a   =    1;\n\nlet b = 2;"
    assert normalize_code(code) == "let a = 1; let b = 2;"


def test_cosine_similarity_identical():
    code = "function test() { return 42; }"
    assert calculate_cosine_similarity(code, code) == 1.0


def test_cosine_similarity_disjoint():
    assert calculate_cosine_similarity("aaa", "bbb") == 0.0


def test_cosine_similarity_keyword_only():
    code1 = "if (true) { return let; }"
    code2 = "if (false) { return const; }"
    sim = calculate_cosine_similarity(code1, code2, keyword_only=True)
    assert sim >= 0.5


def test_levenshtein_similarity_identical():
    assert calculate_levenshtein_similarity("let x = 1;", "let x = 1;") == 1.0


def test_levenshtein_similarity_slight_variations():
    sim = calculate_levenshtein_similarity("let x = 1;", "let y = 1;")
    assert 0.8 < sim < 1.0


def test_get_similarity_score():
    score = get_similarity_score("let a = 1;", "let b = 1;")
    assert 0 <= score <= 100
    assert score >= 70


def test_get_similarity_score_empty_and_comments():
    """Verify empty or comment-only submissions yield 0 similarity to prevent false positive flags."""
    assert get_similarity_score("", "") == 0
    assert get_similarity_score("   ", "let a = 1;") == 0
    assert get_similarity_score("# only a comment", "# another comment") == 0
    assert get_similarity_score(None, "let x = 1;") == 0


def test_get_similarity_score_ast_structural_renaming():
    """Verify Python code with renamed functions and variables maintains high similarity."""
    code1 = "def calculate_sum(a, b):\n    total = a + b\n    return total\n"
    code2 = "def do_addition(x, y):\n    res = x + y\n    return res\n"
    score = get_similarity_score(code1, code2, language="python")
    assert score >= 80


def test_levenshtein_large_input_efficiency():
    """Verify Levenshtein handles large inputs safely without quadratic freeze."""
    large1 = "x = 1;\n" * 1500
    large2 = "y = 1;\n" * 1500
    sim = calculate_levenshtein_similarity(large1, large2)
    assert 0.0 <= sim <= 1.0


def test_cosine_keyword_only_without_keywords():
    """Verify keyword-only comparison on code without keywords returns 0.0, not 1.0."""
    sim = calculate_cosine_similarity("apple orange banana", "cat dog elephant", keyword_only=True)
    assert sim == 0.0
