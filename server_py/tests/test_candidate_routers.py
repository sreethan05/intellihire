import pytest
from unittest.mock import MagicMock, patch, AsyncMock
from fastapi import HTTPException
from app.routers.candidate_profile import (
    get_profile,
    update_profile,
    onboarding,
    delete_resume,
    UpdateProfileRequest,
    OnboardingRequest,
)
from app.routers.candidate_dashboard import (
    get_dashboard,
    respond_offer,
    get_offers,
    get_job_pipeline,
    get_portfolio,
    save_practice_attempt,
    get_practice_history,
    get_candidate_badges,
    RespondOfferRequest,
    SavePracticeRequest,
)
from app.routers.candidate_exams import (
    get_exams,
    get_exam,
    join_waitlist,
    get_waitlist_status,
    cancel_waitlist,
    JoinWaitlistRequest,
)
from app.routers.candidate_analytics import (
    get_performance_radar,
    get_topic_mastery,
    get_coding_analytics,
    get_interview_analytics,
    get_streak,
    get_readiness_score,
    get_proctoring_summary,
    get_peer_comparison,
    get_certificates,
)

class AwaitableMock(MagicMock):
    def __init__(self, await_result=None, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._await_result = await_result

    def __await__(self):
        async def _async_func():
            return self._await_result
        return _async_func().__await__()

def make_query_mock(data=None, error=None):
    mock = AwaitableMock(await_result=MagicMock(data=data, error=error))
    mock.select.return_value = mock
    mock.eq.return_value = mock
    mock.neq.return_value = mock
    mock.in_.return_value = mock
    mock.is_.return_value = mock
    mock.lt.return_value = mock
    mock.lte.return_value = mock
    mock.gt.return_value = mock
    mock.gte.return_value = mock
    mock.order.return_value = mock
    mock.limit.return_value = mock
    mock.single.return_value = mock
    mock.maybeSingle.return_value = mock
    mock.update.return_value = mock
    mock.insert.return_value = mock
    mock.delete.return_value = mock
    mock.upsert.return_value = mock
    return mock


# ==========================================
# 1. Candidate Profile Router Tests
# ==========================================

@pytest.mark.asyncio
async def test_get_profile():
    mock_db = MagicMock()
    mock_user = make_query_mock(data={"id": "user_1", "email": "test@example.com"})
    mock_prof = make_query_mock(data={"id": "prof_1", "skills": ["Python"]})

    def mock_from(tbl):
        return mock_user if tbl == "users" else mock_prof

    mock_db.from_.side_effect = mock_from

    with patch("app.routers.candidate_profile.db", mock_db):
        res = await get_profile(user={"id": "user_1"})
        assert res["user"]["id"] == "user_1"
        assert res["profile"]["skills"] == ["Python"]

@pytest.mark.asyncio
async def test_update_profile_success():
    mock_db = MagicMock()
    mock_query = make_query_mock(data={"user_id": "user_1", "phone": "1234567890"})
    mock_db.from_.return_value = mock_query

    req = UpdateProfileRequest(phone="1234567890", skills=["Python"])
    with patch("app.routers.candidate_profile.db", mock_db):
        with patch("app.routers.candidate_profile.Cache.invalidate_pattern") as mock_cache:
            res = await update_profile(req, user={"id": "user_1"})
            assert res["phone"] == "1234567890"
            mock_cache.assert_called_once_with("portfolio:*")

@pytest.mark.asyncio
async def test_onboarding_password_validation_error():
    req = OnboardingRequest(
        password="123",  # Too short
        phone="1234567890",
        skills=["Python"],
        domain_preference="Backend",
    )
    with pytest.raises(HTTPException) as exc:
        await onboarding(req, user={"id": "user_1"})
    assert exc.value.status_code == 400

@pytest.mark.asyncio
async def test_onboarding_success():
    mock_db = MagicMock()
    mock_user_q = make_query_mock(data={"id": "user_1", "profile_complete": True})
    mock_prof_q = make_query_mock(data={"user_id": "user_1", "profile_complete": True})

    def mock_from(tbl):
        return mock_user_q if tbl == "users" else mock_prof_q

    mock_db.from_.side_effect = mock_from

    req = OnboardingRequest(
        password="StrongPassword123!",
        phone="1234567890",
        skills=["Python"],
        domain_preference="Backend",
    )
    with patch("app.routers.candidate_profile.db", mock_db):
        with patch("app.routers.candidate_profile.Cache.invalidate_pattern") as mock_cache:
            res = await onboarding(req, user={"id": "user_1"})
            assert res["profile_complete"] is True
            mock_cache.assert_called_once_with("portfolio:*")

@pytest.mark.asyncio
async def test_delete_resume_success():
    mock_db = MagicMock()
    mock_sel_q = make_query_mock(data={"resume_url": "/uploads/resumes/test.pdf"})
    mock_up_q = make_query_mock(data={"user_id": "user_1", "resume_url": None})

    counter = 0
    def mock_from(tbl):
        nonlocal counter
        counter += 1
        return mock_sel_q if counter == 1 else mock_up_q

    mock_db.from_.side_effect = mock_from

    with patch("app.routers.candidate_profile.db", mock_db):
        with patch("app.routers.candidate_profile.Cache.invalidate_pattern") as mock_cache:
            with patch("os.remove"):
                res = await delete_resume(user={"id": "user_1"})
                assert res["profile"]["resume_url"] is None
                mock_cache.assert_called_once_with("portfolio:*")


# ==========================================
# 2. Candidate Dashboard & Offer Response Tests
# ==========================================

@pytest.mark.asyncio
async def test_get_dashboard():
    mock_db = MagicMock()
    assign_q = make_query_mock(data=[
        {
            "id": "as_1",
            "exam_id": "exam_1",
            "exam": {"id": "exam_1", "title": "Math", "total_marks": 100, "pass_marks": 40, "duration": 30, "available_from": "2026-10-20T10:00:00Z"}
        }
    ])

    att_q = make_query_mock(data=[
        {"id": "att_1", "exam_id": "exam_1", "status": "completed", "score": 80.0, "submitted_at": "2026-10-14T10:00:00Z"}
    ])

    lead_q = make_query_mock(data=[
        {"candidate_id": "user_1", "score": 80.0, "users": {"name": "User 1"}, "exams": {"total_marks": 100}}
    ])

    attempts_count = 0
    def mock_from(tbl):
        nonlocal attempts_count
        if tbl == "exam_assignments":
            return assign_q
        elif tbl == "attempts":
            attempts_count += 1
            return att_q if attempts_count == 1 else lead_q
        return make_query_mock(data=[])

    mock_db.from_.side_effect = mock_from

    with patch("app.routers.candidate_dashboard.db", mock_db):
        res = await get_dashboard(user={"id": "user_1"})
        assert res["stats"]["assigned"] == 1
        assert res["stats"]["completed"] == 1
        assert res["stats"]["averageScore"] == 80.0
        assert len(res["performance"]) == 1

@pytest.mark.asyncio
async def test_respond_offer_invalid_response():
    req = RespondOfferRequest(response="invalid_option")
    with pytest.raises(HTTPException) as exc:
        await respond_offer("job_1", req, user={"id": "user_1"})
    assert exc.value.status_code == 400
    assert "Invalid response" in exc.value.detail

@pytest.mark.asyncio
async def test_respond_offer_not_found():
    mock_db = MagicMock()
    mock_db.from_.return_value = make_query_mock(data=None)

    req = RespondOfferRequest(response="accept")
    with patch("app.routers.candidate_dashboard.db", mock_db):
        with pytest.raises(HTTPException) as exc:
            await respond_offer("job_1", req, user={"id": "user_1"})
        assert exc.value.status_code == 404
        assert "Job application not found" in exc.value.detail

@pytest.mark.asyncio
async def test_respond_offer_not_offered():
    mock_db = MagicMock()
    # status is 'registered'
    mock_db.from_.return_value = make_query_mock(data={"status": "registered"})

    req = RespondOfferRequest(response="accept")
    with patch("app.routers.candidate_dashboard.db", mock_db):
        with pytest.raises(HTTPException) as exc:
            await respond_offer("job_1", req, user={"id": "user_1"})
        assert exc.value.status_code == 400
        assert "Status must be 'offered'" in exc.value.detail

@pytest.mark.asyncio
async def test_respond_offer_already_responded():
    mock_db = MagicMock()
    mock_db.from_.return_value = make_query_mock(data={
        "status": "offered",
        "offer_accepted_at": "2026-10-14T10:00:00Z"
    })

    req = RespondOfferRequest(response="accept")
    with patch("app.routers.candidate_dashboard.db", mock_db):
        with pytest.raises(HTTPException) as exc:
            await respond_offer("job_1", req, user={"id": "user_1"})
        assert exc.value.status_code == 400
        assert "Offer has already been responded to" in exc.value.detail

@pytest.mark.asyncio
async def test_respond_offer_accept_success():
    mock_db = MagicMock()
    mock_sel_q = make_query_mock(data={"status": "offered", "offer_accepted_at": None})
    mock_up_q = make_query_mock(data={"status": "offered", "offer_accepted_at": "2026-10-15T00:00:00"})
    mock_act_q = make_query_mock(data={})

    step = 0
    def mock_from(tbl):
        nonlocal step
        step += 1
        if tbl == "candidate_status":
            return mock_sel_q if step == 1 else mock_up_q
        return mock_act_q

    mock_db.from_.side_effect = mock_from

    req = RespondOfferRequest(response="accept", notes="Thank you!")
    with patch("app.routers.candidate_dashboard.db", mock_db):
        with patch("app.routers.candidate_dashboard.record_pipeline_stage", new=AsyncMock()) as mock_pipe:
            res = await respond_offer("job_1", req, user={"id": "user_1"})
            assert "accept" in res["message"]
            mock_pipe.assert_called_once_with("user_1", "job_1", "offered", "Offer accepted by candidate", "user_1")

@pytest.mark.asyncio
async def test_respond_offer_decline_success():
    mock_db = MagicMock()
    mock_sel_q = make_query_mock(data={"status": "offered", "offer_declined_at": None})
    mock_up_q = make_query_mock(data={"status": "rejected", "offer_declined_at": "2026-10-15T00:00:00"})
    mock_act_q = make_query_mock(data={})

    step = 0
    def mock_from(tbl):
        nonlocal step
        step += 1
        if tbl == "candidate_status":
            return mock_sel_q if step == 1 else mock_up_q
        return mock_act_q

    mock_db.from_.side_effect = mock_from

    req = RespondOfferRequest(response="decline", notes="Found another role")
    with patch("app.routers.candidate_dashboard.db", mock_db):
        with patch("app.routers.candidate_dashboard.record_pipeline_stage", new=AsyncMock()) as mock_pipe:
            res = await respond_offer("job_1", req, user={"id": "user_1"})
            assert "decline" in res["message"]
            mock_pipe.assert_called_once_with("user_1", "job_1", "rejected", "Offer declined by candidate", "user_1")


# ==========================================
# 3. Candidate Exams & Waitlist Tests
# ==========================================

@pytest.mark.asyncio
async def test_get_exams():
    mock_db = MagicMock()
    mock_db.from_.return_value = make_query_mock(data=[{"exam_id": "exam_1"}])

    with patch("app.routers.candidate_exams.db", mock_db):
        res = await get_exams(user={"id": "user_1"})
        assert len(res["exams"]) == 1

@pytest.mark.asyncio
async def test_get_exam_not_assigned():
    mock_db = MagicMock()
    mock_db.from_.return_value = make_query_mock(data=None)

    with patch("app.routers.candidate_exams.db", mock_db):
        with pytest.raises(HTTPException) as exc:
            await get_exam("exam_1", user={"id": "user_1"})
        assert exc.value.status_code == 403
        assert "Exam not assigned" in exc.value.detail

@pytest.mark.asyncio
async def test_get_exam_success_shuffled():
    mock_db = MagicMock()
    assign_q = make_query_mock(data={"id": "as_1", "exam_id": "exam_1"})
    exam_q = make_query_mock(data={"id": "exam_1", "title": "Test", "shuffle_questions": True})
    mcq_q = make_query_mock(data=[
        {"id": "eq_1", "question_id": "q_1", "questions": {"question_text": "Q1"}},
        {"id": "eq_2", "question_id": "q_2", "questions": {"question_text": "Q2"}},
    ])
    coding_q = make_query_mock(data=[])

    def mock_from(tbl):
        if tbl == "exam_assignments":
            return assign_q
        elif tbl == "exams":
            return exam_q
        elif tbl == "exam_questions":
            return mcq_q
        return coding_q

    mock_db.from_.side_effect = mock_from

    with patch("app.routers.candidate_exams.db", mock_db):
        res = await get_exam("exam_1", user={"id": "user_1"})
        assert res["exam"]["id"] == "exam_1"
        assert len(res["mcqQuestions"]) == 2

@pytest.mark.asyncio
async def test_join_waitlist_already_waiting():
    mock_db = MagicMock()
    exam_q = make_query_mock(data={"id": "exam_1"})
    assign_q = make_query_mock(data=None)
    wait_q = make_query_mock(data={"id": "w_1", "status": "waiting"})

    def mock_from(tbl):
        if tbl == "exams":
            return exam_q
        elif tbl == "exam_assignments":
            return assign_q
        return wait_q

    mock_db.from_.side_effect = mock_from

    req = JoinWaitlistRequest(exam_id="exam_1")
    with patch("app.routers.candidate_exams.db", mock_db):
        with pytest.raises(HTTPException) as exc:
            await join_waitlist(req, user={"id": "user_1"})
        assert exc.value.status_code == 400
        assert "already on the waitlist" in exc.value.detail

@pytest.mark.asyncio
async def test_join_waitlist_rejoin_cancelled():
    mock_db = MagicMock()
    exam_q = make_query_mock(data={"id": "exam_1"})
    assign_q = make_query_mock(data=None)

    # previous cancelled row exists
    wait_exist_q = make_query_mock(data={"id": "w_1", "status": "cancelled"})
    pos_q = make_query_mock(data=[{"position": 3}])
    update_q = make_query_mock(data={"id": "w_1", "position": 4, "status": "waiting"})

    waitlist_calls = 0
    def mock_from(tbl):
        nonlocal waitlist_calls
        if tbl == "exams":
            return exam_q
        elif tbl == "exam_assignments":
            return assign_q
        elif tbl == "exam_waitlist":
            waitlist_calls += 1
            if waitlist_calls == 1:
                return wait_exist_q
            elif waitlist_calls == 2:
                return pos_q
            return update_q
        return make_query_mock(data=None)

    mock_db.from_.side_effect = mock_from

    req = JoinWaitlistRequest(exam_id="exam_1")
    with patch("app.routers.candidate_exams.db", mock_db):
        res = await join_waitlist(req, user={"id": "user_1"})
        assert res["position"] == 4
        assert res["waitlistEntry"]["status"] == "waiting"

@pytest.mark.asyncio
async def test_cancel_waitlist_not_on_waitlist():
    mock_db = MagicMock()
    mock_db.from_.return_value = make_query_mock(data=None)

    with patch("app.routers.candidate_exams.db", mock_db):
        with pytest.raises(HTTPException) as exc:
            await cancel_waitlist("exam_1", user={"id": "user_1"})
        assert exc.value.status_code == 400
        assert "not currently on the waitlist" in exc.value.detail


# ==========================================
# 4. Candidate Analytics Router Tests
# ==========================================

@pytest.mark.asyncio
async def test_get_performance_radar():
    mock_db = MagicMock()
    mock_ans = make_query_mock(data=[
        {"is_correct": True, "question": {"topic": "DSA"}, "attempt": {"candidate_id": "user_1"}}
    ])
    mock_prof = make_query_mock(data={"college_id": "col_1", "cgpa": 8.5})
    mock_peers = make_query_mock(data=[{"cgpa": 7.5}, {"cgpa": 8.5}])

    prof_calls = 0
    def mock_from(tbl):
        nonlocal prof_calls
        if tbl == "answers":
            return mock_ans
        elif tbl == "candidate_profiles":
            prof_calls += 1
            return mock_prof if prof_calls == 1 else mock_peers
        return make_query_mock(data=[])

    mock_db.from_.side_effect = mock_from

    with patch("app.routers.candidate_analytics.db", mock_db):
        res = await get_performance_radar(user={"id": "user_1"})
        assert "radarData" in res
        assert "peerPercentile" in res
        assert "strengths" in res
        assert "weaknesses" in res

@pytest.mark.asyncio
async def test_get_topic_mastery_empty():
    mock_db = MagicMock()
    mock_db.from_.return_value = make_query_mock(data=[])

    with patch("app.routers.candidate_analytics.db", mock_db):
        res = await get_topic_mastery(user={"id": "user_1"})
        assert res["topics"] == []
        assert res["strongest"] is None
