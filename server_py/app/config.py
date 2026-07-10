import os
from dotenv import load_dotenv

# Load env file from the project root
base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
env_path = os.path.join(base_dir, ".env")
load_dotenv(env_path)

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/intellihire")
JWT_SECRET = os.environ.get("JWT_SECRET", "jwt_secret_placeholder")
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
GROQ_MODEL = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")
REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")
APP_URL = os.environ.get("APP_URL", "http://localhost:5173")
PORT = int(os.environ.get("PORT", "5000"))
AWS_ACCESS_KEY_ID = os.environ.get("AWS_ACCESS_KEY_ID", "")
AWS_SECRET_ACCESS_KEY = os.environ.get("AWS_SECRET_ACCESS_KEY", "")
AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")
S3_BUCKET_NAME = os.environ.get("S3_BUCKET_NAME", "")
