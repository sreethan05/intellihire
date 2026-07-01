# IntelliHire Analytics & Dashboard Enhancement Proposal

> **Status:** Suggestion / Design Document — No implementation required yet.  
> **Goal:** Turn IntelliHire from a "functional hiring platform" into a "data-driven intelligence platform" for every user role.

---

## 1. What Already Exists (Baseline)

### Candidate
- Basic dashboard: upcoming, completed, avg score, rank
- Exam Analytics page: bar chart of scores, pass rate, completion trend, best/focus area, exam breakdown list
- 6-month performance trend (score by month)
- Score bands (90-100, 75-89, 60-74, Below 60)
- Simple leaderboard (top 10 peers)

### Recruiter
- Dashboard: candidate count, drives, exams, completion rate, pass rate, average score
- Exam Analytics: completion by exam, pass rates, exam breakdown cards
- Candidate performance list (top 6 by average score)
- Drive funnel (registered → assigned → exam taken → passed → shortlisted → offered)
- Branch analytics (candidates, avg CGPA, verified count)
- 6-month exam trend (created vs conducted)
- Recent attempts & recent exams

### Admin
- Exam Activity page: live logs (static), recent submissions table, AI proctor alerts (static), real-time monitoring chart (static data), suspicious activity indicators, attempt counters, timeline

### TPO
- TPO Reports, TPO Activity, TPO Students pages exist

---

## 2. Candidate / Student Analytics — Deep Dive

### 2.1 Skill Gap & Topic Mastery Radar *(New Page)*
**Why:** Students need to know *which topics* they're weak at, not just *which exams*.

| Data Source | `answers` + `questions` + `exam_questions` |
|-------------|------------------------------------------|
| Aggregation | Join `answers` → `questions` via `exam_questions`, group by `questions.topic` or `questions.subtopic` |
| Metrics | Accuracy % per topic, avg time (if you log it), attempts count per topic |
| Visual | Recharts RadarChart or `DashboardKit` bar chart — 6-12 topic spokes |
| Insight Text | "Your strongest topic is **DSA** (85%). Focus next on **DBMS** (42%) — 3 of 5 questions missed were on normalization." |

**Suggested Route:** `GET /api/candidate/topic-mastery`

**SQL Logic Sketch:**
```sql
SELECT q.topic,
       COUNT(*) AS total,
       SUM(CASE WHEN a.is_correct THEN 1 ELSE 0 END) AS correct,
       ROUND(AVG(a.marks_obtained), 2) AS avg_marks
FROM answers a
JOIN questions q ON a.question_id = q.id
JOIN attempts att ON a.attempt_id = att.id
WHERE att.candidate_id = $1 AND att.status = 'completed'
GROUP BY q.topic;
```

---

### 2.2 Coding Performance Analytics *(New Page / Section)*
**Why:** Coding is 50% of the assessment. Students deserve to know language-wise success, test-case pass rates, and problem difficulty progression.

| Data Source | `coding_submissions` + `coding_questions` |
|-------------|------------------------------------------|
| Metrics | Submissions per language, success rate (score > 0), avg score per difficulty, attempts before success |
| Visual | Horizontal bar chart (languages vs success rate), stacked bar (difficulty vs score bands) |
| Insight | "You solve **Easy** problems in 1.2 attempts on average. **Hard** problems take 4+ attempts. Consider more **Graph** practice." |

**Suggested Route:** `GET /api/candidate/coding-analytics`

---

### 2.3 Proctoring Self-Review *(New Card on Dashboard)*
**Why:** Students should see their own proctoring history to self-correct behavior before it becomes a red flag.

| Data Source | `proctoring_snapshots` |
|-------------|------------------------|
| Metrics | Total violations by type (tab switch, face missing, camera offline, voice flag), trend over last 5 exams |
| Visual | Small donut chart or compact list with colored badges |
| Insight | "You had 3 tab-switch warnings in your last exam. Enable full-screen mode before starting." |

**Suggested Route:** `GET /api/candidate/proctoring-summary`

---

### 2.4 AI Interview Score Breakdown *(New Page)*
**Why:** The `ai_interviews` table stores **6 separate scores** (relevance, communication, intro, speaking, pronunciation, technical) — but candidates never see them broken down. This is a huge missed opportunity.

| Data Source | `ai_interviews` + `ai_interview_answers` |
|-------------|------------------------------------------|
| Metrics | Radar chart of 6 dimensions, score trend across multiple interviews, per-question feedback cards |
| Visual | `DashboardKit` RadarChart (or 6 progress bars if Recharts Radar is too complex), accordion of feedback per question |
| Insight | "Your **technical** score improved 12% since your last interview. **Speaking pace** is still below target — practice the mock interview." |

**Suggested Route:** `GET /api/candidate/interview-analytics`

---

### 2.5 Job Pipeline Tracker *(New Card / Page)*
**Why:** `candidate_status` tracks the full funnel: `registered → exam_taken → passed → shortlisted → on_hold → rejected → offered`. Candidates should see exactly where they stand for each drive.

| Data Source | `candidate_status` + `jobs` |
|-------------|------------------------------|
| Metrics | Pipeline stage per applied job, days since last update, next expected action |
| Visual | Vertical stepper / timeline (like Amazon order tracking) — one per drive |
| Insight | "**TCS Digital** — You are shortlisted. AI interview scheduled for July 5." |

**Suggested Route:** `GET /api/candidate/job-pipeline`

---

### 2.6 Study Streak & Consistency *(New Card)*
**Why:** Gamification drives engagement. A streak counter + consistency heatmap motivates daily practice.

| Data Source | `attempts` (started_at) + `coding_submissions` (created_at) |
|-------------|--------------------------------------------------------------|
| Metrics | Current streak (days with at least 1 exam/code submission), longest streak, weekly activity heatmap (Mon-Sun, last 12 weeks) |
| Visual | GitHub-style contribution heatmap (small colored squares), streak counter badge |
| Insight | "🔥 5-day streak! Complete one more exam this week to hit your goal." |

**Suggested Route:** `GET /api/candidate/streak`

---

### 2.7 Peer Comparison Benchmarking *(Enhancement to Existing)*
**Why:** Current leaderboard is just rank + average score. Add percentile and topic-wise comparison.

| Data Source | `attempts` + `answers` |
|-------------|------------------------|
| Metrics | Overall percentile, topic-wise percentile (e.g., "You are in the top 15% for DSA but bottom 40% for Networks") |
| Visual | Small benchmark bars on each topic card — "You vs Top 10%" |
| Insight | "Your **OS** accuracy is better than 78% of peers. Your **SQL** accuracy is below average." |

---

### 2.8 Predicted Readiness Score *(New Card — AI/Heuristic)*
**Why:** Give candidates a single number that tells them if they're ready for placements.

| Data Source | `attempts` + `answers` + `coding_submissions` + `ai_interviews` |
|-------------|----------------------------------------------------------------|
| Formula | Weighted composite: Exam avg (40%) + Coding avg (25%) + Interview score (20%) + Consistency (streak, 10%) + Topic breadth (5%) |
| Visual | Large circular gauge / donut with color zones (red < 50, amber 50-75, green 75+) |
| Insight | "Readiness Score: 72 — You are **approaching placement-ready**. Improve your coding hard-problem success rate to push into the green zone." |

**Suggested Route:** `GET /api/candidate/readiness-score`

---

## 3. Recruiter Analytics — Deep Dive

### 3.1 Candidate Drill-Down Profile *(New Page)*
**Why:** Recruiters need to click a candidate and see *everything* — exams, coding, proctoring, interview, pipeline — in one view.

| Data Source | `attempts` + `answers` + `coding_submissions` + `proctoring_snapshots` + `ai_interviews` + `candidate_status` |
|-------------|----------------------------------------------------------------------------------------------------------------|
| Layout | Left sidebar: candidate info + CGPA + skills + resume. Right: tabs for Exams, Coding, Proctoring, Interview, Pipeline |
| Visual | Mini charts per tab, proctoring timeline, violation severity indicator |

**Suggested Route:** `GET /api/recruiter/candidates/:candidateId/analytics`

---

### 3.2 Topic-Wise Class Performance *(New Page)*
**Why:** A recruiter should know "80% of my candidates failed questions on **Joins** and **Normalization**" — this drives exam design decisions.

| Data Source | `answers` + `questions` + `attempts` |
|-------------|----------------------------------------|
| Metrics | Accuracy % per topic across all candidates for a given exam/drive, most-missed question concepts |
| Visual | Horizontal bar chart — topics sorted by lowest class accuracy, top 5 "focus areas" cards |
| Insight | "Class weakest in **DBMS Joins** (34% accuracy). Consider adding a refresher module before the next exam." |

**Suggested Route:** `GET /api/recruiter/exams/:examId/topic-performance`

---

### 3.3 Proctoring Analytics Dashboard *(New Page — Replaces Static Admin Page)*
**Why:** The current Admin Exam Activity page has **static mock data**. This should be real, and recruiter-scoped.

| Data Source | `proctoring_snapshots` |
|-------------|------------------------|
| Metrics | Violations by type (pie chart), violations per candidate (bar), time-of-day heatmap, severity trend, webcam offline incidents |
| Visual | Donut chart (violation types), table sorted by violation count, real-time badge count |
| Insight | "Candidate X had 5 tab switches + 2 face-missing events. Flag for review." |
| Action | One-click "Flag for Review" button that updates `candidate_status` to `on_hold` |

**Suggested Route:** `GET /api/recruiter/proctoring-analytics` (existing `proctoring` route can be extended)

---

### 3.4 Plagiarism Analytics *(New Page)*
**Why:** `plagiarism_flags` exists but only has individual-attempt lookup. A recruiter needs a bird's-eye view.

| Data Source | `plagiarism_flags` + `coding_submissions` + `attempts` |
|-------------|----------------------------------------------------------|
| Metrics | Total flags per exam, avg similarity score, top flagged pairs, language-wise plagiarism rate |
| Visual | Table sorted by similarity score > 70%, red/yellow/green severity badges, side-by-side code comparison modal |
| Insight | "Exam Y has 4 plagiarism flags. 2 pairs involve the same question — possible leak." |

**Suggested Route:** `GET /api/recruiter/plagiarism-analytics` (already exists for exam-level, needs aggregation)

---

### 3.5 Interview Funnel Analytics *(New Page)*
**Why:** AI voice interviews are a key feature. Track the funnel from exam → interview → selection.

| Data Source | `ai_interviews` + `candidate_status` + `jobs` |
|-------------|-----------------------------------------------|
| Metrics | Scheduled → Started → Completed → Selected (with drop-off at each stage), avg scores per dimension, top-performing candidates |
| Visual | Funnel chart (sankey-style or simple stacked bars), score distribution histogram |
| Insight | "40% of shortlisted candidates completed the AI interview. 15% were selected. Avg technical score of selected: 82." |

**Suggested Route:** `GET /api/recruiter/interview-funnel`

---

### 3.6 Time-to-Complete Analytics *(New Card)*
**Why:** Understand if candidates are rushing, stuck, or if exam duration is appropriate.

| Data Source | `attempts` (`started_at` − `submitted_at`) |
|-------------|--------------------------------------------|
| Metrics | Avg time per exam, median time, time vs score correlation, candidates who finished > 90% duration vs < 50% |
| Visual | Scatter plot (time vs score), box plot per exam |
| Insight | "Candidates who finish in < 40% of allotted time average 45% scores. Consider adding a 'minimum time' lock." |

---

### 3.7 Coding Language Preference Analytics *(New Card)*
**Why:** Understand what languages your candidate pool uses. Useful for setting company tech stack expectations.

| Data Source | `coding_submissions` |
|-------------|------------------------|
| Metrics | Language distribution (Python, Java, C++, JS), success rate per language, trend over time |
| Visual | Pie chart or donut |
| Insight | "68% of candidates use Python. Java success rate is 15% higher." |

---

### 3.8 Predictive Shortlisting *(New Card — AI/Heuristic)*
**Why:** Help recruiters prioritize which candidates to interview first.

| Data Source | `attempts` + `coding_submissions` + `ai_interviews` + `candidate_profiles` |
|-------------|----------------------------------------------------------------------------|
| Formula | Composite score: Exam (30%) + Coding (25%) + CGPA (15%) + Interview (20%) + Proctoring clean score (10%) |
| Visual | Sortable table with "Predicted Rank" column, color-coded (green = top 20%, red = bottom 20%) |
| Insight | "Top 10 predicted candidates based on combined performance. 7 of them also have the highest interview scores." |

---

## 4. TPO Analytics — Deep Dive

*(Currently TPO has basic reports. These are the gaps.)*

### 4.1 Placement Statistics by Branch & Year
**Why:** TPOs need to report to college management: "How many CSE students got offers? How many ECE are still unplaced?"

| Data Source | `candidate_profiles` + `candidate_status` + `jobs` |
|-------------|--------------------------------------------------|
| Metrics | Offers by branch, offers by graduation year, placement %, avg salary, top recruiting companies |
| Visual | Stacked bar chart (branch × status), table with sortable columns |
| Insight | "CSE 2025: 78% placed, avg package ₹8.2L. ECE 2025: 45% placed — needs more drives." |

**Suggested Route:** `GET /api/tpo/placement-stats`

---

### 4.2 Student Readiness Heatmap *(New Page)*
**Why:** TPOs should see which students are *not* ready so they can push them to practice.

| Data Source | `attempts` + `answers` + `coding_submissions` (re-use the candidate readiness formula) |
|-------------|----------------------------------------------------------------------------------------|
| Metrics | Readiness score per student, color-coded (red = < 50, yellow = 50-75, green = 75+) |
| Visual | Table with heatmap-style background colors, filterable by branch/year |
| Action | One-click "Send Reminder" email to red-zone students |

---

### 4.3 Company-Wise Drive Performance *(New Page)*
**Why:** TPOs need to track which companies gave the most offers, which had low conversion, etc.

| Data Source | `jobs` + `candidate_status` |
|-------------|-----------------------------|
| Metrics | Registered → Offered conversion per company, avg exam score of offered candidates, drive acceptance rate |
| Visual | Table with sparklines, company logo placeholder |

---

### 4.4 Bulk Upload Success Tracking *(New Card)*
**Why:** `tpo_uploads` table tracks rows_total, rows_created, rows_failed. TPOs should see this over time.

| Data Source | `tpo_uploads` |
|-------------|---------------|
| Metrics | Upload success rate trend, common failure reasons, total students onboarded |
| Visual | Line chart (uploads over time), success/failure stacked bar |

---

## 5. Admin / Platform Analytics — Deep Dive

*(Currently minimal. The static Exam Activity page should be replaced with real data.)*

### 5.1 Platform Growth Metrics *(New Page)*
**Why:** Admin needs to know if the platform is growing.

| Data Source | `users` + `exams` + `attempts` + `jobs` |
|-------------|------------------------------------------|
| Metrics | New users per week, active exams, completed attempts, drives created, interviews conducted |
| Visual | Multi-line chart (users, exams, attempts over time) |

**Suggested Route:** `GET /api/admin/platform-growth`

---

### 5.2 System Health Dashboard *(New Page)*
**Why:** Monitor background job queue, grading failures, API key status, DB connection health.

| Data Source | `gradingQueue` (in-memory, can be persisted) + Pino logs + external API status checks |
|-------------|----------------------------------------------------------------------------------------|
| Metrics | Pending grading jobs, avg grading time, Judge0 API health, Gemini API health, error rate |
| Visual | Status cards (green/amber/red), sparkline for error rate |

---

### 5.3 Real Exam Activity (Replace Static Page)
**Why:** The current Admin Exam Activity page uses hardcoded arrays. Replace with live data.

| Data Source | `attempts` + `proctoring_snapshots` + `coding_submissions` |
|-------------|------------------------------------------------------------|
| Metrics | Live attempts in progress (WebSocket), recent submissions in real-time, proctoring alerts as they happen |
| Visual | Auto-refreshing table, WebSocket-powered counters, real-time area chart |
| Implementation | Use existing Socket.IO (`useProctorSocket`) to broadcast events to the admin room too |

---

## 6. Data Schema Additions (Minimal)

Most analytics can be built from existing tables. Only a few additions are recommended:

### 6.1 `time_spent_seconds` on `answers` *(Optional)*
```sql
ALTER TABLE answers ADD COLUMN IF NOT EXISTS time_spent_seconds INTEGER DEFAULT 0;
```
**Why:** Enables time-per-question analytics, rushing detection, and difficulty calibration. Front-end can capture `questionStartTime` and send delta on answer submission.

### 6.2 `graded_at` on `attempts` *(Optional)*
```sql
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS graded_at TIMESTAMPTZ;
```
**Why:** Track grading queue latency for system health monitoring.

### 6.3 `grading_duration_ms` on `attempts` *(Optional)*
```sql
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS grading_duration_ms INTEGER;
```
**Why:** Understand how long background grading takes per attempt.

### 6.4 `violation_severity` on `proctoring_snapshots` *(Optional)*
```sql
ALTER TABLE proctoring_snapshots ADD COLUMN IF NOT EXISTS violation_severity TEXT DEFAULT 'low';
```
**Why:** Not all violations are equal. A single tab switch is low; 5 tab switches + voice flag is high. Enables severity-weighted scoring.

---

## 7. Implementation Roadmap (Phased)

### Phase 1: Quick Wins (No schema changes)
| Feature | Effort | Impact |
|---------|--------|--------|
| Candidate Topic Mastery | Medium | Very High |
| Candidate Coding Analytics | Medium | High |
| Candidate Job Pipeline Tracker | Low | Very High |
| Candidate AI Interview Breakdown | Low | Very High (data exists!) |
| Recruiter Topic-Wise Class Performance | Medium | High |
| Recruiter Plagiarism Analytics | Low | Medium |
| Admin Platform Growth Metrics | Low | Medium |
| Admin Real Exam Activity (replace static) | Medium | High |

### Phase 2: Medium Investment (Possible schema additions)
| Feature | Effort | Impact |
|---------|--------|--------|
| Candidate Proctoring Self-Review | Low | Medium |
| Candidate Study Streak & Heatmap | Medium | Medium (engagement) |
| Candidate Predicted Readiness Score | Medium | Very High |
| Recruiter Proctoring Analytics | Medium | High |
| Recruiter Interview Funnel | Medium | High |
| Recruiter Time-to-Complete | Medium | Medium |
| Recruiter Predictive Shortlisting | Medium | Very High |
| TPO Placement Stats | Medium | Very High |
| TPO Student Readiness Heatmap | Medium | High |

### Phase 3: Advanced (Schema changes + possibly caching)
| Feature | Effort | Impact |
|---------|--------|--------|
| Candidate Peer Comparison Benchmarking | Medium | High |
| Recruiter Candidate Drill-Down Profile | Medium | Very High |
| TPO Company-Wise Drive Performance | Low | Medium |
| Admin System Health Dashboard | Medium | Medium |
| Real-time admin monitoring (WebSocket) | Medium | High |
| Caching layer for heavy analytics (Redis) | High | Medium (performance) |

---

## 8. Technical Notes

### 8.1 Query Performance
Many analytics queries are aggregation-heavy. For a platform with < 10,000 candidates, PostgreSQL can handle this directly. Beyond that:
- Add indexes on `answers(attempt_id)`, `answers(question_id)`, `attempts(candidate_id)`, `attempts(exam_id)`, `proctoring_snapshots(exam_id, candidate_id)` (some already exist)
- Consider materialized views for slow queries (e.g., topic mastery per candidate refreshed every 15 minutes)
- Use `pg_trgm` for similarity if you want fuzzy text matching on coding plagiarism

### 8.2 Front-End Chart Components
You already have excellent `DashboardKit` primitives. The additions needed:
- **RadarChart** — use Recharts `<RadarChart>` for topic mastery, interview dimensions, readiness score
- **Heatmap** — GitHub-style grid for streaks (can be a custom CSS grid, no library needed)
- **Funnel / Stepper** — shadcn `Stepper` or custom vertical timeline for job pipeline
- **Gauge** — SVG circular progress for readiness score (can be custom with Tailwind)

### 8.3 API Design Pattern
Follow the existing pattern: analytics endpoints return a flat JSON object with typed arrays. Example:
```ts
// GET /api/candidate/topic-mastery
{
  topics: [
    { topic: "DSA", accuracy: 85, total: 20, correct: 17, avgTimeSec: 45 },
    { topic: "DBMS", accuracy: 42, total: 12, correct: 5, avgTimeSec: 62 },
  ],
  strongest: "DSA",
  weakest: "DBMS",
  peerAverage: { /* ... */ }
}
```

---

## 9. Summary

| Role | # of New Features | Biggest Impact |
|------|-------------------|----------------|
| **Candidate** | 8 | Topic mastery + AI interview breakdown + readiness score |
| **Recruiter** | 8 | Candidate drill-down + predictive shortlisting + proctoring analytics |
| **TPO** | 4 | Placement stats + readiness heatmap |
| **Admin** | 3 | Real-time activity + platform growth |

**My recommendation:** Start with **Phase 1** — particularly the Candidate AI Interview Breakdown, Candidate Topic Mastery, and Recruiter Topic-Wise Class Performance. These require no schema changes, use existing data, and deliver the highest visual "wow" factor for your project demo/viva.

---

*Document generated for IntelliHire v1.0.0*  
*Focus: Analytics expansion without breaking existing architecture.*
