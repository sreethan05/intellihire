import asyncio
import json
import os
from datetime import datetime, timezone
from typing import List, Optional

from .config import APP_URL
from .db import db
from .logger import logger
from .utils import record_pipeline_stage, storage_root


async def send_result_published_email(
    to: str,
    name: str,
    title: str,
    score: float,
    total_marks: float,
    passed: bool,
    app_url: str
) -> bool:
    subject = f"Exam Result Published - {title}"
    status = "passed" if passed else "failed"
    body = (
        f"Hello {name},\n\n"
        f"Your result for the exam '{title}' has been published.\n"
        f"Score: {score}/{total_marks}\n"
        f"Status: {status.upper()}\n\n"
        f"Log in to view details: {app_url}"
    )
    from .utils import send_email_async
    return await send_email_async(to, subject, body)


class BackgroundGradingQueue:
    def __init__(self):
        self.local_queue: List[str] = []
        self.is_local_processing = False
        self.storage_root = storage_root
        self.queue_file_path = os.path.join(self.storage_root, "grading_queue.json")
        self.redis_client = None
        
        # Start initialization in background if event loop is running
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(self.init_queue())
        except RuntimeError:
            pass

    async def init_queue(self):
        # Preflight Redis check
        from .utils import redis_client as global_redis
        self.redis_client = global_redis
        
        if self.redis_client:
            try:
                # Run ping in thread pool to avoid blocking async loop if redis hangs
                await asyncio.to_thread(self.redis_client.ping)
                logger.info("Bull/Python Redis queue connection preflight successful")
                # Start Redis worker loops
                asyncio.create_task(self.redis_grading_worker())
                asyncio.create_task(self.redis_interview_worker())
            except Exception as err:
                logger.warn(f"Redis unavailable: {err} — using local/disk queue for background grading")
                self.redis_client = None
                await self.init_local_queue()
        else:
            await self.init_local_queue()

    async def init_local_queue(self):
        try:
            os.makedirs(self.storage_root, exist_ok=True)
            if os.path.exists(self.queue_file_path):
                with open(self.queue_file_path, "r", encoding="utf-8") as f:
                    content = f.read()
                    parsed = json.loads(content)
                    if isinstance(parsed, list) and parsed:
                        self.local_queue = parsed
                        logger.info(f"Loaded {len(self.local_queue)} pending attempts from disk queue")
                        if not self.is_local_processing:
                            asyncio.create_task(self.process_local_queue())
        except Exception as e:
            logger.warn(f"Local queue file not found or invalid: {e}")

    async def save_local_queue(self):
        try:
            os.makedirs(self.storage_root, exist_ok=True)
            with open(self.queue_file_path, "w", encoding="utf-8") as f:
                f.write(json.dumps(self.local_queue))
        except Exception as e:
            logger.error(f"Failed to save local grading queue to disk: {e}")

    def push(self, attempt_id: str):
        if not attempt_id:
            return

        if self.redis_client:
            try:
                # LPUSH / RPUSH queue model
                self.redis_client.rpush("grading-queue", json.dumps({"attemptId": attempt_id}))
                logger.info(f"Added attempt {attempt_id} to Redis grading queue")
                return
            except Exception as e:
                logger.warn(f"Failed to push to Redis queue: {e}, falling back to local queue")

        if attempt_id not in self.local_queue:
            self.local_queue.append(attempt_id)
            logger.info(f"Added attempt {attempt_id} to local queue (size: {len(self.local_queue)})")
            asyncio.create_task(self.save_local_queue())

        if not self.is_local_processing:
            asyncio.create_task(self.process_local_queue())

    def push_interview_evaluation(self, interview_id: str):
        if not interview_id:
            return

        if self.redis_client:
            try:
                self.redis_client.rpush("interview-queue", json.dumps({"interviewId": interview_id}))
                logger.info(f"Added interview {interview_id} to Redis interview queue")
                return
            except Exception as e:
                logger.warn(f"Failed to push to Redis interview queue: {e}, running inline")

        logger.info(f"Running interview evaluation inline (fallback) for interview={interview_id}")
        async def run_inline():
            try:
                from .interview_service import evaluate_interview
                await evaluate_interview(interview_id)
            except Exception as e:
                logger.error(f"Inline interview evaluation failed for {interview_id}: {e}")
        asyncio.create_task(run_inline())

    async def redis_grading_worker(self):
        while True:
            try:
                if not self.redis_client:
                    await asyncio.sleep(5.0)
                    continue
                # Poll Redis queue
                data_str = await asyncio.to_thread(self.redis_client.lpop, "grading-queue")
                if data_str:
                    try:
                        data = json.loads(data_str)
                        attempt_id = data.get("attemptId")
                        if attempt_id:
                            logger.info(f"Starting Redis-based grading job for attempt {attempt_id}")
                            await self.grade_attempt(attempt_id)
                    except Exception as job_err:
                        logger.error(f"Error executing Redis grading job: {job_err}")
                else:
                    await asyncio.sleep(1.0)
            except Exception as e:
                logger.error(f"Error in Redis grading worker: {e}")
                await asyncio.sleep(5.0)

    async def redis_interview_worker(self):
        while True:
            try:
                if not self.redis_client:
                    await asyncio.sleep(5.0)
                    continue
                # Poll Redis queue
                data_str = await asyncio.to_thread(self.redis_client.lpop, "interview-queue")
                if data_str:
                    try:
                        data = json.loads(data_str)
                        interview_id = data.get("interviewId")
                        if interview_id:
                            logger.info(f"Starting Redis-based interview evaluation job for interview {interview_id}")
                            from .interview_service import evaluate_interview
                            await evaluate_interview(interview_id)
                    except Exception as job_err:
                        logger.error(f"Error executing Redis interview evaluation job: {job_err}")
                else:
                    await asyncio.sleep(1.0)
            except Exception as e:
                logger.error(f"Error in Redis interview worker: {e}")
                await asyncio.sleep(5.0)

    async def process_local_queue(self):
        self.is_local_processing = True

        while self.local_queue:
            current_attempt_id = self.local_queue.pop(0)
            await self.save_local_queue()
            logger.info(f"Starting local grading for attempt {current_attempt_id}")

            try:
                await self.grade_attempt(current_attempt_id)
                logger.info(f"Local grading completed successfully for attempt {current_attempt_id}")
            except Exception as error:
                logger.error(f"Local grading failed for attempt {current_attempt_id}: {error}")

        self.is_local_processing = False
        logger.info("Local worker idle — no more items in local queue")

    async def grade_attempt(self, attempt_id: str):
        # 1. Fetch the attempt details
        res = await db.from_("attempts").select("*").eq("id", attempt_id).single().execute()
        if res.error or not res.data:
            raise RuntimeError(f"Attempt {attempt_id} not found in database: {res.error.message if res.error else ''}")
        attempt = res.data

        # 2. Fetch all coding submissions associated with this attempt
        sub_res = await db.from_("coding_submissions").select("*, coding_questions(*)").eq("attempt_id", attempt_id).execute()
        if sub_res.error:
            raise RuntimeError(f"Failed to fetch submissions for attempt {attempt_id}: {sub_res.error.message}")
        submissions = sub_res.data or []

        # 3. Grade each submission against its test cases
        for submission in submissions:
            # Skip grading if already tested
            if submission.get("status") == "tested" and (submission.get("score") or 0) > 0:
                logger.info(f"Submission {submission.get('id')} already graded, skipping")
                continue

            if not submission.get("code") or not submission.get("code", "").strip():
                logger.info(f"Submission {submission.get('id')} has empty code, skipping")
                continue

            question = submission.get("coding_questions")
            if not question:
                continue

            # Parse test cases
            test_cases = question.get("test_cases")
            if isinstance(test_cases, str):
                try:
                    test_cases = json.loads(test_cases)
                except Exception:
                    logger.warn(f"Failed to parse test cases for question {question.get('id')}")
                    test_cases = []

            if not isinstance(test_cases, list) or len(test_cases) == 0:
                logger.info(f"Question {question.get('id')} has no test cases, assigning full marks")
                await db.from_("coding_submissions").update({
                    "score": question.get("marks") or 10,
                    "status": "tested"
                }).eq("id", submission.get("id")).execute()
                continue

            # Run compiler sequentially to respect rate limits
            passed_count = 0
            logger.info(
                f"Running test cases for question='{question.get('title')}', "
                f"lang='{submission.get('language')}', count={len(test_cases)}"
            )

            for tc in test_cases:
                try:
                    from .compiler import run_with_judge0
                    result = await run_with_judge0(
                        submission.get("code", ""),
                        submission.get("language", ""),
                        tc.get("input") or ""
                    )
                    actual = (result.get("stdout") or "").strip()
                    expected = (tc.get("expected_output") or "").strip()

                    if actual == expected:
                        passed_count += 1
                except Exception as exec_err:
                    logger.error(f"Test case execution failed: {exec_err}")
                
                await asyncio.sleep(0.3)

            score_percentage = passed_count / len(test_cases)
            final_coding_score = round(score_percentage * (question.get("marks") or 10))

            logger.info(
                f"Submission {submission.get('id')} graded: "
                f"passed={passed_count}/{len(test_cases)}, finalScore={final_coding_score}"
            )

            # Update database submission score
            await db.from_("coding_submissions").update({
                "score": final_coding_score,
                "status": "tested"
            }).eq("id", submission.get("id")).execute()

        # 4. Fetch final updated scores (MCQs + Coding Submissions)
        answers_res = await db.from_("answers").select("marks_obtained").eq("attempt_id", attempt_id).execute()
        subs_res = await db.from_("coding_submissions").select("score").eq("attempt_id", attempt_id).execute()

        answers = answers_res.data or []
        updated_submissions = subs_res.data or []

        mcq_score = sum(a.get("marks_obtained") or 0 for a in answers)
        coding_score = sum(s.get("score") or 0 for s in updated_submissions)
        total_score = mcq_score + coding_score

        # 5. Finalize the attempt overall score
        now_str = datetime.now(timezone.utc).isoformat()
        upd_res = await db.from_("attempts").update({
            "score": total_score,
            "status": "completed",
            "submitted_at": now_str,
        }).eq("id", attempt_id).select().single().execute()

        if upd_res.error or not upd_res.data:
            raise RuntimeError(f"Failed to finalize attempt score in database: {upd_res.error.message if upd_res.error else ''}")

        updated_attempt = upd_res.data
        logger.info(f"Attempt {attempt_id} finalized with score={total_score}")

        # 6. Fetch exam and candidate details for email notification
        exam_res = await db.from_("exams").select("pass_marks, title, total_marks").eq("id", updated_attempt.get("exam_id")).single().execute()
        cand_res = await db.from_("users").select("name, email").eq("id", updated_attempt.get("candidate_id")).single().execute()

        exam_data = exam_res.data
        candidate = cand_res.data

        # Send email (fire-and-forget background task)
        if candidate and candidate.get("email") and exam_data:
            passed = total_score >= (exam_data.get("pass_marks") or 0)
            
            async def notify_candidate_email():
                try:
                    await send_result_published_email(
                        candidate["email"],
                        candidate.get("name") or "Candidate",
                        exam_data.get("title") or "Exam",
                        total_score,
                        exam_data.get("total_marks") or 0,
                        passed,
                        APP_URL
                    )
                except Exception as email_err:
                    logger.error(f"Failed to send result email to {candidate['email']}: {email_err}")

            asyncio.create_task(notify_candidate_email())

        # 7. Trigger auto-shortlisting and AI Interview scheduling logic
        try:
            pass_marks = float(exam_data.get("pass_marks") or 0) if exam_data else 0.0
            passed = total_score >= pass_marks

            if passed and exam_data:
                logger.info(f"Attempt {attempt_id} qualified, running auto-shortlisting")

                # Find the job assignment
                assign_res = await db.from_("exam_assignments").select(
                    "job_id, assigned_by"
                ).eq("exam_id", updated_attempt.get("exam_id")).eq(
                    "candidate_id", updated_attempt.get("candidate_id")
                ).maybeSingle().execute()

                assignment = assign_res.data

                # Update candidate status
                if assignment and assignment.get("job_id"):
                    job_id = assignment["job_id"]
                    candidate_id = updated_attempt["candidate_id"]
                    assigned_by = assignment.get("assigned_by")

                    await db.from_("candidate_status").upsert({
                        "job_id": job_id,
                        "candidate_id": candidate_id,
                        "status": "shortlisted"
                    }, on_conflict="job_id,candidate_id").execute()

                    # Record stage transition in pipeline logs
                    await record_pipeline_stage(
                        candidate_id,
                        job_id,
                        "shortlisted",
                        "Auto-shortlisted after passing exam cutoff score",
                        assigned_by
                    )

                # Create pending AI interview if not exists
                exist_int_res = await db.from_("ai_interviews").select("id").eq(
                    "candidate_id", updated_attempt["candidate_id"]
                ).eq("exam_id", updated_attempt["exam_id"]).maybeSingle().execute()

                if not exist_int_res.data:
                    await db.from_("ai_interviews").insert({
                        "candidate_id": updated_attempt["candidate_id"],
                        "job_id": assignment.get("job_id") if assignment else None,
                        "exam_id": updated_attempt["exam_id"],
                        "status": "pending",
                        "started_at": None,
                    }).execute()
                    logger.info(f"Scheduled pending AI interview for candidate {updated_attempt['candidate_id']}")

                # Notify recruiter
                recruiter_id = assignment.get("assigned_by") if assignment else None
                if recruiter_id:
                    await db.from_("notifications").insert({
                        "user_id": recruiter_id,
                        "title": "AI Interview Scheduling Required",
                        "body": (
                            f"A candidate qualified \"{exam_data.get('title') or 'the exam'}\". "
                            f"Please set the interview start and end time."
                        ),
                    }).execute()
        except Exception as shortlist_err:
            logger.warn(f"Auto-shortlist warning (non-fatal): {shortlist_err}")

        # 8. Trigger the plagiarism checker
        logger.info(f"Triggering plagiarism check for attempt {attempt_id}")
        try:
            from .plagiarism import run_plagiarism_check
            await run_plagiarism_check(attempt_id)
        except Exception as plag_err:
            logger.error(f"Plagiarism check failed for attempt {attempt_id}: {plag_err}")


# Export singleton queue instance
gradingQueue = BackgroundGradingQueue()
