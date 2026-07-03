from locust import HttpUser, task, between
import random
import uuid
import json

class IntelliHirePerformanceUser(HttpUser):
    """
    Locust load testing scenario to simulate candidates and recruiters 
    interacting with the IntelliHire Node.js backend endpoints.
    """
    wait_time = between(1, 3)

    def on_start(self):
        """Pre-authenticates a test user session on startup."""
        self.auth_token = None
        self.csrf_token = None
        self.user_role = random.choice(["candidate", "recruiter"])
        self.test_email = f"loadtest_{uuid.uuid4().hex[:8]}@example.com"
        self.test_password = "SecurePassword123!"
        self.login_user()

    def login_user(self):
        """Simulates authenticating to the platform."""
        login_payload = {
            "email": "candidate@example.com" if self.user_role == "candidate" else "recruiter@example.com",
            "password": "Password123!"
        }
        
        response = self.client.post("/api/auth/login", json=login_payload)
        if response.status_code == 200:
            data = response.json()
            self.csrf_token = data.get("csrfToken")
            # Headers configuration for subsequent state mutating requests
            self.client.headers.update({
                "x-csrf-token": self.csrf_token or ""
            })

    @task(3)
    def fetch_dashboard(self):
        """Access the user-specific dashboard analytical payload."""
        endpoint = "/api/candidate/dashboard" if self.user_role == "candidate" else "/api/recruiter/dashboard"
        self.client.get(endpoint)

    @task(2)
    def read_profile_details(self):
        """Simulate profile view endpoints."""
        if self.user_role == "candidate":
            self.client.get("/api/candidate/profile")
            self.client.get("/api/assets/certificates")
        else:
            self.client.get("/api/recruiter/colleges")
            self.client.get("/api/recruiter/drives")

    @task(1)
    def submit_mock_evaluations(self):
        """Simulates exams interactions and answer submissions."""
        if self.user_role == "candidate" and self.csrf_token:
            attempt_id = str(uuid.uuid4())
            question_id = str(uuid.uuid4())
            
            # Simulate posting an MCQ answer
            self.client.post("/api/result/submit-mcq", json={
                "attempt_id": attempt_id,
                "question_id": question_id,
                "selected_option": random.choice(["A", "B", "C", "D"])
            })

            # Simulate sending a proctoring snapshot event
            self.client.post("/api/proctoring/events", json={
                "attempt_id": attempt_id,
                "exam_id": str(uuid.uuid4()),
                "event_type": "snapshot",
                "message": "Candidate frame webcam analysis capture",
                "snapshot_data": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD..."
            })

        elif self.user_role == "recruiter" and self.csrf_token:
            # Recruiter posts a dummy drive creation criteria
            self.client.post("/api/recruiter/drives", json={
                "title": f"Software Engineer Drive {random.randint(100, 999)}",
                "company_name": "Acme LoadTest Corp",
                "college_id": str(uuid.uuid4()),
                "min_cgpa": 7.5,
                "allowed_branches": ["CSE", "IT", "ECE"],
                "required_skills": ["react", "node", "postgresql"]
            })

    @task(1)
    def trigger_health_diagnostics(self):
        """Regular health check endpoints queries."""
        self.client.get("/api/health")
