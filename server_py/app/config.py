import os
from dotenv import load_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, field_validator

# Load env file from the project root
base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
env_path = os.path.join(base_dir, ".env")
load_dotenv(env_path)

class Settings(BaseSettings):
    DATABASE_URL: str = Field("postgresql://postgres:postgres@localhost:5432/intellihire", validation_alias="DATABASE_URL")
    JWT_SECRET: str = Field(validation_alias="JWT_SECRET")
    GROQ_API_KEY: str = Field("", validation_alias="GROQ_API_KEY")
    GROQ_MODEL: str = Field("llama-3.3-70b-versatile", validation_alias="GROQ_MODEL")
    REDIS_URL: str = Field("redis://localhost:6379", validation_alias="REDIS_URL")
    APP_URL: str = Field("http://localhost:5173", validation_alias="APP_URL")
    PORT: int = Field(5000, validation_alias="PORT")
    AWS_ACCESS_KEY_ID: str = Field("", validation_alias="AWS_ACCESS_KEY_ID")
    AWS_SECRET_ACCESS_KEY: str = Field("", validation_alias="AWS_SECRET_ACCESS_KEY")
    AWS_REGION: str = Field("us-east-1", validation_alias="AWS_REGION")
    S3_BUCKET_NAME: str = Field("intellihire-uploads", validation_alias="S3_BUCKET_NAME")
    INTERNAL_API_SECRET: str = Field("", validation_alias="INTERNAL_API_SECRET")
    NODE_ENV: str = Field("development", validation_alias="NODE_ENV")

    # Additional environment variables from other files
    JUDGE0_API_KEY: str = Field("", validation_alias="JUDGE0_API_KEY")
    JUDGE0_API_URL: str = Field("https://ce.judge0.com", validation_alias="JUDGE0_API_URL")
    SMTP_HOST: str = Field("", validation_alias="SMTP_HOST")
    SMTP_USER: str = Field("", validation_alias="SMTP_USER")
    SMTP_PASS: str = Field("", validation_alias="SMTP_PASS")
    SMTP_FROM: str = Field("IntelliHire <noreply@intellihire.com>", validation_alias="SMTP_FROM")
    SMTP_PORT: int = Field(587, validation_alias="SMTP_PORT")
    LOG_LEVEL: str = Field("INFO", validation_alias="LOG_LEVEL")
    SENTRY_DSN: str = Field("", validation_alias="SENTRY_DSN")
    FILE_STORAGE_DIR: str = Field("uploads", validation_alias="FILE_STORAGE_DIR")
    S3_ENDPOINT: str = Field("http://localhost:9000", validation_alias="S3_ENDPOINT")
    S3_REGION: str = Field("us-east-1", validation_alias="S3_REGION")
    S3_ACCESS_KEY_ID: str = Field("minioadmin", validation_alias="S3_ACCESS_KEY_ID")
    S3_SECRET_ACCESS_KEY: str = Field("minioadminpass", validation_alias="S3_SECRET_ACCESS_KEY")
    CORS_ALLOWED_ORIGINS: str = Field("", validation_alias="CORS_ALLOWED_ORIGINS")

    @field_validator("JWT_SECRET")
    @classmethod
    def validate_jwt(cls, v):
        if not v or len(v) < 32:
            raise ValueError("JWT_SECRET must be at least 32 characters")
        return v

    model_config = SettingsConfigDict(env_file=env_path, extra="ignore")

settings = Settings()

# Export uppercase variables for backward-compatibility with other modules
DATABASE_URL = settings.DATABASE_URL
JWT_SECRET = settings.JWT_SECRET
GROQ_API_KEY = settings.GROQ_API_KEY
GROQ_MODEL = settings.GROQ_MODEL
REDIS_URL = settings.REDIS_URL
APP_URL = settings.APP_URL
PORT = settings.PORT
AWS_ACCESS_KEY_ID = settings.AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY = settings.AWS_SECRET_ACCESS_KEY
AWS_REGION = settings.AWS_REGION
S3_BUCKET_NAME = settings.S3_BUCKET_NAME
INTERNAL_API_SECRET = settings.INTERNAL_API_SECRET
NODE_ENV = settings.NODE_ENV

JUDGE0_API_KEY = settings.JUDGE0_API_KEY
JUDGE0_API_URL = settings.JUDGE0_API_URL
SMTP_HOST = settings.SMTP_HOST
SMTP_USER = settings.SMTP_USER
SMTP_PASS = settings.SMTP_PASS
SMTP_FROM = settings.SMTP_FROM
SMTP_PORT = settings.SMTP_PORT
LOG_LEVEL = settings.LOG_LEVEL
SENTRY_DSN = settings.SENTRY_DSN
FILE_STORAGE_DIR = settings.FILE_STORAGE_DIR
S3_ENDPOINT = settings.S3_ENDPOINT
S3_REGION = settings.S3_REGION
S3_ACCESS_KEY_ID = settings.S3_ACCESS_KEY_ID
S3_SECRET_ACCESS_KEY = settings.S3_SECRET_ACCESS_KEY
CORS_ALLOWED_ORIGINS = settings.CORS_ALLOWED_ORIGINS
