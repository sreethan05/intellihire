# 🚀 IntelliHire Free Cloud Deployment Guide

This guide walks you through deploying **IntelliHire** to the cloud **100% free of charge**, with zero server costs, automated database migrations, and production SSL/HTTPS.

---

## 🌟 Architecture of the Free Stack

| Component | Free Provider | Plan | Cost |
| :--- | :--- | :--- | :--- |
| **Full Stack App (Frontend + Backend)** | [Render](https://render.com) | Free Web Service (Docker) | **$0 / month** |
| **PostgreSQL Database** | [Neon.tech](https://neon.tech) | Serverless Free Tier (0.5 GB) | **$0 / month (Free Forever)** |
| **AI Question & Interview Engine** | [Groq Cloud](https://console.groq.com) | Free Tier (Llama 3.3 70B) | **$0 / month** |
| **Continuous Integration (CI)** | GitHub Actions | 2,000 min/mo (Private) / Unlimited (Public) | **$0 / month** |

---

## ⚡ Option 1: 1-Click Deployment via Render + Neon (Recommended)

### Step 1: Create a Free PostgreSQL Database on Neon (1 minute)

1. Go to **[Neon.tech](https://neon.tech)** and sign up for free (using GitHub or Google).
2. Click **Create Project**, name it `intellihire`, and click **Create**.
3. Under **Connection Details**, select **PostgreSQL** and copy the connection string. It looks like:
   ```text
   postgresql://<user>:<password>@<endpoint>.neon.tech/intellihire?sslmode=require
   ```

---

### Step 2: Deploy to Render via Blueprint

IntelliHire includes a pre-configured [`render.yaml`](./render.yaml) file for automated zero-config deployment.

1. Sign up for free at **[Render.com](https://render.com)** using your GitHub account.
2. In the Render Dashboard, click **New +** in the top-right corner and select **Blueprint**.
3. Connect your **`intellihire`** GitHub repository.
4. Render will automatically read [`render.yaml`](./render.yaml) and configure:
   * **Service Type**: Docker Web Service
   * **Instance Type**: Free
   * **Health Check**: `/api/health`
   * **Environment Variables**:
     * `NODE_ENV`: `production`
     * `PYTHONPATH`: `server_py`
     * `JWT_SECRET`: *(Automatically generated secure 32-character key)*
5. Under `DATABASE_URL`, paste the connection string you copied from Neon in Step 1.
6. *(Optional)* Under `GROQ_API_KEY`, enter your free API key from [console.groq.com](https://console.groq.com) if you want AI interview generation enabled.
7. Click **Apply**.

Render will now build the Docker image (compiling the React Vite SPA and setting up the Python FastAPI backend) and start the service.

---

### Step 3: Automated Database Migrations & Verification

When the container boots up, IntelliHire's built-in migration runner (`server_py/app/migration_runner.py`) automatically runs all 21 modular SQL schema files on your Neon database:
* Core tables (users, colleges, questions, exams, attempts, proctoring)
* Pre-seeded default test accounts
* 780+ aptitude and technical MCQs
* Bulk student import conflict tables

Once Render shows **`Live`**, click your assigned URL (e.g., `https://intellihire-xxxx.onrender.com`).

---

## 🔑 Default Login Credentials

Once deployed, you can immediately log into the live platform using any of the standard test accounts:

| Role | Email | Password | Target Dashboard |
| :--- | :--- | :--- | :--- |
| **Super Admin** | `admin@intellihire.com` | `admin123` | `/admin/overview` |
| **College TPO** | `tpo@intellihire.com` | `admin123` | `/tpo/overview` |
| **Lead Recruiter** | `recruiter@intellihire.com` | `admin123` | `/recruiter/overview` |
| **Candidate** | `candidate@intellihire.com` | `admin123` | `/candidate/overview` |

---

## 🌐 Option 2: Alternative Free Cloud Hosts

If you prefer an alternative to Render:

### Deploying to Koyeb (Free Nano Instance)
1. Sign up at **[Koyeb.com](https://www.koyeb.com)**.
2. Click **Create App** ➔ **GitHub**.
3. Select the `intellihire` repository.
4. Set **Builder** to **Dockerfile**.
5. Under **Environment Variables**, add:
   * `DATABASE_URL`: *(Your Neon PostgreSQL connection string)*
   * `JWT_SECRET`: *(A random 32+ character string)*
   * `NODE_ENV`: `production`
   * `PYTHONPATH`: `server_py`
6. Click **Deploy**.

---

## 🔍 Diagnostics & Health Check

You can verify the health of your deployed instance at any time by visiting:
```text
https://<your-app-url>/api/health
```

Expected JSON response:
```json
{
  "status": "ok",
  "timestamp": "2026-09-06T12:00:00.000000Z",
  "environment": "production",
  "services": {
    "postgres": true,
    "groq": true,
    "judge0": { "endpoint": "https://judge0-ce.p.rapidapi.com", "isPrivate": false },
    "email": false,
    "sentry": false,
    "pipeline": {
      "totalMcq": 780,
      "totalCoding": 24,
      "healthy": true
    }
  }
}
```

---

## 💡 Free Tier Tips & Best Practices

1. **Render Free Tier Spin-Down**:
   * Render free web services go to sleep after 15 minutes of inactivity.
   * When a new request arrives, it wakes back up in ~30 seconds.
   * *Tip*: You can keep it warm using a free uptime monitor like [UptimeRobot](https://uptimerobot.com) pinging `/api/health` every 10 minutes.
2. **Neon Free PostgreSQL**:
   * Neon does not delete your database or expire after 30/90 days (unlike Render's free DB).
   * It pauses storage when inactive and wakes instantly (sub-second cold start).
