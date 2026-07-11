from typing import Any, Dict, List, Optional
from pydantic import BaseModel, EmailStr, Field, model_validator


class LoginSchema(BaseModel):
    email: str = Field(..., min_length=1, max_length=255)
    password: str = Field(..., min_length=1, max_length=128)


class CreateUserSchema(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    email: EmailStr = Field(..., max_length=255)
    password: str = Field(..., min_length=8, max_length=128)
    role: str = Field(...)  # enum: admin, tpo, recruiter, candidate


class CreateRecruiterSchema(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    email: EmailStr = Field(..., max_length=255)
    password: str = Field(..., min_length=8, max_length=128)


class CreateTpoSchema(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    email: EmailStr = Field(..., max_length=255)
    password: str = Field(..., min_length=8, max_length=128)
    college_name: str = Field(..., min_length=1, max_length=200)
    college_code: str = Field(..., min_length=1, max_length=50)
    location: Optional[str] = Field(None, max_length=200)


class CreateCandidateSchema(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    email: EmailStr = Field(..., max_length=255)
    password: str = Field(..., min_length=8, max_length=128)
    roll_number: Optional[str] = Field(None, max_length=50)
    college_id: Optional[str] = None


class CreateExamSchema(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=2000)
    duration: int = Field(..., ge=5)
    total_marks: int = Field(..., gt=0)
    pass_marks: int = Field(..., ge=0)
    available_from: Optional[str] = None
    available_until: Optional[str] = None

    @model_validator(mode="after")
    def validate_pass_marks(self) -> 'CreateExamSchema':
        if self.pass_marks > self.total_marks:
            raise ValueError("Pass marks cannot be greater than total marks")
        return self


class PaginationSchema(BaseModel):
    page: Optional[str] = None
    limit: Optional[str] = None


class CreateJobSchema(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    company_name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=5000)
    location: Optional[str] = Field(None, max_length=200)
    salary_range: Optional[str] = Field(None, max_length=100)
    job_type: str = "full_time"  # enum: full_time, internship, contract
    college_id: Optional[str] = None
    exam_id: Optional[str] = None


class AiGenerateSchema(BaseModel):
    topic: str = Field(..., min_length=1, max_length=100)
    difficulty: str = "medium"  # enum: easy, medium, hard, very_hard
    count: int = 10
    type: str = "mcq"  # enum: mcq, coding


class InterviewAnswerSchema(BaseModel):
    interview_id: str
    question_index: int = Field(..., ge=0)
    answer_text: Optional[str] = Field(None, max_length=5000)
    audio_url: Optional[str] = None


class ProctoringEventSchema(BaseModel):
    attempt_id: str
    event_type: str  # enum: face_missing, multiple_faces, tab_switch, copy_paste, suspicious_movement
    severity: str = "medium"  # enum: low, medium, high
    details: Optional[str] = Field(None, max_length=1000)


class StartExamSchema(BaseModel):
    exam_id: str


class ScheduleInterviewSchema(BaseModel):
    scheduled_start: Optional[str] = None
    scheduled_end: Optional[str] = None


class InterviewAnswerBodySchema(BaseModel):
    question: str = Field(..., min_length=1, max_length=2000)
    answer: Optional[str] = Field(None, max_length=10000)
    stage: Optional[int] = Field(None, ge=1, le=20)


class SubmitMcqSchema(BaseModel):
    attempt_id: str
    question_id: str
    selected_option: str = Field(..., min_length=1, max_length=1)


class SubmitCodeSchema(BaseModel):
    attempt_id: str
    coding_question_id: str
    code: str = Field(..., max_length=50000)
    language: str = Field(..., min_length=1, max_length=50)


class SubmitExamSchema(BaseModel):
    attempt_id: str


class UpdateCodeScoreSchema(BaseModel):
    attempt_id: str
    coding_question_id: str
    score: int = Field(..., ge=0, le=100)
    code: Optional[str] = Field(None, max_length=50000)
    language: Optional[str] = Field(None, max_length=50)


class UpdateProfileSchema(BaseModel):
    phone: Optional[str] = Field(None, max_length=20)
    skills: Optional[List[str]] = None
    domain_preference: Optional[str] = Field(None, max_length=100)
    github_url: Optional[str] = Field(None, max_length=500)
    linkedin_url: Optional[str] = Field(None, max_length=500)
    portfolio_url: Optional[str] = Field(None, max_length=500)
    bio: Optional[str] = Field(None, max_length=2000)
    photo_url: Optional[str] = Field(None, max_length=500)
    projects: Optional[List[Dict[str, Any]]] = None
    semester_grades: Optional[List[Dict[str, Any]]] = None


class OnboardingSchema(BaseModel):
    password: str = Field(..., min_length=8, max_length=128)
    phone: str = Field(..., min_length=1, max_length=20)
    skills: List[str] = Field(...)
    domain_preference: str = Field(..., min_length=1, max_length=100)
    marksheet_url: Optional[str] = Field("", max_length=500)
    resume_url: Optional[str] = Field("", max_length=500)


class ProctoringLogEventSchema(BaseModel):
    attempt_id: str
    exam_id: str
    event_type: str  # enum: camera_check, snapshot, violation, submission
    violation_count: Optional[int] = Field(None, ge=0)
    message: Optional[str] = Field(None, max_length=2000)
    snapshot_data: Optional[str] = Field(None, max_length=10000000)


class RespondOfferSchema(BaseModel):
    response: str  # enum: accept, decline, negotiate
    notes: Optional[str] = Field("", max_length=5000)


class LinkBankMcqSchema(BaseModel):
    exam_id: str
    question_ids: List[str]


class LinkBankCodingSchema(BaseModel):
    exam_id: str
    coding_question_ids: List[str]


class QuestionItemSchema(BaseModel):
    question_text: str = Field(..., min_length=1, max_length=10000)
    option_a: str = Field(..., min_length=1, max_length=5000)
    option_b: str = Field(..., min_length=1, max_length=5000)
    option_c: str = Field(..., min_length=1, max_length=5000)
    option_d: str = Field(..., min_length=1, max_length=5000)
    correct_option: str = Field(...)  # enum: a, b, c, d, A, B, C, D
    marks: int = Field(..., ge=1)


class AddQuestionsSchema(BaseModel):
    exam_id: str
    questions: List[QuestionItemSchema]


class TestCaseItemSchema(BaseModel):
    input: str = Field(..., max_length=10000)
    expected_output: str = Field(..., max_length=10000)


class CodingQuestionItemSchema(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: str = Field(..., min_length=1, max_length=20000)
    difficulty: str  # enum: easy, medium, hard
    starter_code: str = Field(..., max_length=50000)
    test_cases: List[TestCaseItemSchema]
    marks: int = Field(..., ge=1)


class AddCodingQuestionsSchema(BaseModel):
    exam_id: str
    coding_questions: List[CodingQuestionItemSchema]


class AssignExamSchema(BaseModel):
    exam_id: str
    candidate_ids: List[str]


class StudentRowSchema(BaseModel):
    roll_number: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=100)
    branch: str = Field(..., min_length=1, max_length=100)
    cgpa: float = Field(..., ge=0, le=10)
    graduation_year: int = Field(..., ge=1900, le=2100)
    email: Optional[str] = Field("", max_length=100)


class UploadStudentsSchema(BaseModel):
    rows: List[StudentRowSchema]


class FileItemSchema(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    mimeType: str = Field(..., min_length=1, max_length=100)
    data: str


class ScanMarksheetsSchema(BaseModel):
    files: List[FileItemSchema]


class StudentVerificationSchema(BaseModel):
    documents_verified: bool


class VerifyStudentBatchSchema(BaseModel):
    studentIds: List[str]
    documents_verified: bool


class AssignDriveExamSchema(BaseModel):
    exam_id: str


class SaveDriveAiConfigSchema(BaseModel):
    aiConfig: Dict[str, Any]


class TestDriveAiConfigSchema(BaseModel):
    question: str = Field(..., min_length=1, max_length=5000)
    answer: str = Field(..., min_length=1, max_length=20000)
    aiConfig: Dict[str, Any]


class AiShortlistSchema(BaseModel):
    criteria: str = Field(..., min_length=1, max_length=5000)


class ResumeParseSchema(BaseModel):
    resume_text: str = Field(..., min_length=1, max_length=1000000)
    job_skills: Optional[List[str]] = None


class GenerateMcqSchema(BaseModel):
    topic: str = Field(..., min_length=1, max_length=500)
    difficulty: str  # enum: easy, medium, hard
    count: int = Field(..., ge=1, le=50)


class GenerateCodingSchema(BaseModel):
    topic: str = Field(..., min_length=1, max_length=500)
    difficulty: str  # enum: easy, medium, hard
    count: Optional[int] = Field(None, ge=1, le=50)


class ImprovementReportSchema(BaseModel):
    attempt_id: str


class RunCodeSchema(BaseModel):
    code: str = Field(..., max_length=50000)
    language: str = Field(..., min_length=1, max_length=50)
    stdin: Optional[str] = Field("", max_length=10000)


class SubmitCompilerSchema(BaseModel):
    code: str = Field(..., max_length=50000)
    language: str = Field(..., min_length=1, max_length=50)
    test_cases: List[TestCaseItemSchema]


class SnapshotOverrideSchema(BaseModel):
    violation_severity: str  # enum: low, medium, high, critical


class BankQuestionItemSchema(BaseModel):
    question_text: str = Field(..., min_length=1, max_length=10000)
    option_a: str = Field(..., min_length=1, max_length=5000)
    option_b: str = Field(..., min_length=1, max_length=5000)
    option_c: str = Field(..., min_length=1, max_length=5000)
    option_d: str = Field(..., min_length=1, max_length=5000)
    correct_option: str = Field(...)  # enum: a, b, c, d, A, B, C, D
    marks: Optional[int] = Field(None, ge=1)


class AddBankQuestionsSchema(BaseModel):
    questions: List[BankQuestionItemSchema]


class BankCodingQuestionSchema(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: str = Field(..., min_length=1, max_length=20000)
    difficulty: Optional[str] = None  # enum: easy, medium, hard
    starter_code: Optional[str] = Field(None, max_length=50000)
    test_cases: Optional[List[TestCaseItemSchema]] = None
    marks: Optional[int] = Field(None, ge=1)


class AddBankCodingSchema(BaseModel):
    question: BankCodingQuestionSchema
