from app.insights import (
    create_topic_scores,
    feed_mcq_answer,
    feed_coding_submission,
    feed_communication_score,
    generate_insights,
)


def test_create_topic_scores():
    scores = create_topic_scores()
    assert list(scores.keys()) == [
        "DSA",
        "DBMS",
        "OS",
        "Networking",
        "Communication",
        "Aptitude",
    ]
    assert scores["DSA"]["total"] == 0.0
    assert scores["DSA"]["count"] == 0.0


def test_feed_mcq_answer():
    scores = create_topic_scores()
    feed_mcq_answer(scores, True, "dsa")
    feed_mcq_answer(scores, False, "DSA")
    feed_mcq_answer(scores, True, "unknown-topic")  # falls back to Aptitude

    result = generate_insights(scores)
    dsa_point = next(r for r in result["radarData"] if r["subject"] == "DSA")
    apt_point = next(r for r in result["radarData"] if r["subject"] == "Aptitude")

    assert dsa_point["score"] == 50
    assert apt_point["score"] == 100


def test_feed_coding_submission():
    scores = create_topic_scores()
    feed_coding_submission(scores, 8.0, 10.0)  # 80%
    feed_coding_submission(scores, 4.0, 10.0)  # 40%

    result = generate_insights(scores)
    dsa_point = next(r for r in result["radarData"] if r["subject"] == "DSA")
    assert dsa_point["score"] == 60


def test_feed_communication_score():
    scores = create_topic_scores()
    feed_communication_score(scores, 9.0)  # 90%
    feed_communication_score(scores, 5.0)  # 50%

    result = generate_insights(scores)
    comm_point = next(r for r in result["radarData"] if r["subject"] == "Communication")
    assert comm_point["score"] == 70


def test_strengths_and_weaknesses():
    scores = create_topic_scores()
    feed_mcq_answer(scores, True, "DBMS")
    feed_mcq_answer(scores, True, "DBMS")  # 100% (>= 70 strength)
    feed_mcq_answer(scores, False, "OS")
    feed_mcq_answer(scores, False, "OS")  # 0% (< 50 weakness)

    result = generate_insights(scores)
    assert result["evaluatedCount"] == 2
    assert any("database concept" in s for s in result["strengths"])
    assert any("process scheduling" in w for w in result["weaknesses"])


def test_fallback_messages():
    scores = create_topic_scores()
    result = generate_insights(scores, "Test Profile")

    assert result["evaluatedCount"] == 0
    assert "Test Profile is being populated" in result["strengths"][0]
    assert "Attempt assigned mock" in result["weaknesses"][0]
