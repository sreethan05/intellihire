import os
import warnings
# Suppress Starlette's deprecation warning regarding TestClient and httpx
warnings.filterwarnings("ignore", message="Using httpx with starlette.testclient is deprecated")

from dotenv import load_dotenv

# Load environment variables from the project's root or server_py directory
load_dotenv()

# Fallback fake URL for unit testing environments to bypass database initialization check
if not os.environ.get("DATABASE_URL"):
    os.environ["DATABASE_URL"] = "postgresql://postgres:postgres@localhost:5432/postgres"
