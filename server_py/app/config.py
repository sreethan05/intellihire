import os
from dotenv import load_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field

# Load env file from the project root
base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
env_path = os.path.join(base_dir, ".env")
load_dotenv(env_path)

class Settings(BaseSettings):
    DATABASE_URL: str = Field("postgresql://postgres:postgres@localhost:5432/intellihire", validation_alias="DATABASE_URL")
    JWT_SECRET: str = Field("jwt_secret_placeholder", validation_alias="JWT_SECRET")
    GROQ_API_KEY: str = Field("", validation_alias="GROQ_API_KEY")
    GROQ_MODEL: str = Field("llama-3.3-70b-versatile", validation_alias="GROQ_MODEL")
    REDIS_URL: str = Field("redis://localhost:6379", validation_alias="REDIS_URL")
    APP_URL: str = Field("http://localhost:5173", validation_alias="APP_URL")
    PORT: int = Field(5000, validation_alias="PORT")
    AWS_ACCESS_KEY_ID: str = Field("", validation_alias="AWS_ACCESS_KEY_ID")
    AWS_SECRET_ACCESS_KEY: str = Field("", validation_alias="AWS_SECRET_ACCESS_KEY")
    AWS_REGION: str = Field("us-east-1", validation_alias="AWS_REGION")
    S3_BUCKET_NAME: str = Field("", validation_alias="S3_BUCKET_NAME")
    INTERNAL_API_SECRET: str = Field("", validation_alias="INTERNAL_API_SECRET")
    NODE_ENV: str = Field("development", validation_alias="NODE_ENV")

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
