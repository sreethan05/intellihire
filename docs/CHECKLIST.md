P0 — Mandatory blockers before production
These are the items that must be completed first.
1. Identity, authentication, and account security
Implement:
MFA for administrators, recruiters, and TPOs;
password reset with one-time, short-lived tokens;
email verification;
forced password change support;
session listing and individual session revocation;
revoke-all-sessions after password change;
account lockout or progressive login delays;
credential-stuffing detection;
generic login failure messages;
secure password policy;
Argon2id password hashing or another modern algorithm;
signing-key rotation with key IDs;
audit logs for login, logout, password changes, MFA, resets, and role changes;
re-authentication before sensitive actions;
administrator recovery procedure that does not depend on database edits.
Acceptance criteria:
No password, JWT, refresh token, or CSRF token appears in logs.
All authentication tests pass for expired, revoked, forged, reused, and rotated tokens.
Administrators cannot operate without MFA.
A compromised refresh token can be revoked immediately.
2. Complete authorization model
Create a formal authorization matrix for:
candidate;
recruiter;
TPO;
administrator;
organization;
college;
hiring drive;
exam;
attempt;
resume;
offer letter;
interview;
proctoring snapshot;
certificate;
analytics report.
Every endpoint must verify:
authentication;
role;
organization scope;
ownership or assignment;
resource state;
action permission.
Fix and test:
recruiter resume access;
recruiter candidate analytics;
recruiter exam results;
TPO student access;
cross-college access;
cross-drive access;
admin-only operations;
candidate access to their own results only;
signed URL ownership and revocation;
WebSocket authorization;
export authorization.
Acceptance criteria:
Every endpoint has positive and negative authorization tests.
A user cannot access another organization’s resource even if they know its UUID.
Unauthorized resources do not leak through response differences, error messages, counts, or timing.
3. Secure file and object storage
Move private files to private object storage.
Protect:
resumes;
offer letters;
marksheets;
interview audio;
proctoring images;
generated reports;
certificates.
Implement:
private S3-compatible buckets;
server-generated filenames;
file ownership metadata;
antivirus scanning;
PDF/image magic-byte validation;
MIME validation;
upload quotas;
per-user and per-organization storage limits;
signed URLs bound to user and resource;
short URL expiry;
revocation;
download audit logs;
malware quarantine;
archive-bomb protection;
safe content disposition;
X-Content-Type-Options: nosniff;
no public upload directory;
no filesystem access using user-controlled paths.
Acceptance criteria:
A candidate cannot access another candidate’s file.
A recruiter cannot access files outside their drives.
Malicious PDFs and polyglot files are rejected or quarantined.
Large uploads are rejected before memory exhaustion.
Deleted or revoked files become inaccessible immediately.
4. Secure code execution
Use a private Judge0 instance or a hardened internal execution platform in production.
Implement:
no public shared execution endpoint;
network disabled by default;
CPU quota;
memory quota;
wall-clock timeout;
process/thread quota;
file-size quota;
output-size quota;
per-user concurrency limit;
per-organization concurrency limit;
global queue;
backpressure;
job cancellation;
retry policy;
isolated containers;
read-only filesystem;
dropped Linux capabilities;
no host mounts;
no privileged containers;
hidden test protection;
code-retention policy;
compiler-output sanitization;
execution audit records.
Test against:
infinite loops;
fork bombs;
memory exhaustion;
huge output;
filesystem traversal;
network access;
process spawning;
binary execution;
malicious compiler flags;
hidden test leakage;
concurrent abuse.
5. Database and migration safety
Replace or isolate the custom query-builder surface.
Long-term:
use SQLAlchemy 2 async or explicit repository SQL;
type repository methods;
centralize transaction management;
remove duplicate data-access patterns;
add query timeouts;
add connection-pool monitoring;
add slow-query logging;
add database-level constraints;
use advisory locking for migrations;
separate migrations, seeds, test fixtures, and cleanup scripts;
checksum applied migrations;
never modify historical migrations;
run migrations as a deployment job, not in every web worker;
support schema compatibility checks;
test upgrade and rollback procedures.
Add constraints for:
valid roles;
valid workflow states;
score ranges;
marks ranges;
ownership relationships;
unique emails;
unique roll numbers;
unique exam assignments;
valid foreign keys;
valid timestamps;
valid candidate/job relationships.
P1 — Product-grade functionality
6. Candidate experience
Add:
reliable onboarding;
profile completion progress;
resume upload and replacement;
academic-document verification;
exam instructions and system checks;
camera/microphone permission checks;
network-quality check;
exam autosave;
resume-after-disconnect behavior;
explicit submission confirmation;
automatic submission on timeout;
candidate answer review;
score breakdown;
certificate verification;
appeal and correction request;
accessibility mode;
keyboard-only exam operation;
mobile-responsive candidate portal;
multilingual instructions;
clear privacy consent.
Exam requirements:
server-authoritative timer;
server-side attempt state;
idempotent answer saves;
duplicate-submission protection;
immutable final submissions;
hidden test cases never sent to the browser;
correct negative-marking behavior;
randomized questions with reproducible attempt seeds;
proper handling of browser refresh and reconnect.
7. Recruiter experience
Add:
organization and team management;
recruiter invitations;
recruiter permission levels;
hiring-drive templates;
question-bank governance;
exam versioning;
candidate pipeline;
interview scheduling;
offer workflow;
candidate comparison;
structured evaluation forms;
recruiter notes with access controls;
audit history;
bulk candidate import;
CSV validation preview;
duplicate detection;
rollback of bulk imports;
export approval and audit;
configurable scorecards;
recruiter activity dashboard.
Do not let recruiters silently override scores or proctoring results. Every override must record:
actor;
timestamp;
original value;
new value;
reason;
request ID;
affected resource.
8. TPO and college management
Add:
college tenancy;
TPO invitation and verification;
student batch import;
duplicate roll-number detection;
academic document workflow;
student verification status;
placement readiness dashboard;
branch and graduation-year filters;
college-level analytics;
access restrictions by college;
data export limited to the college;
import preview and rollback;
activity history.
9. Proctoring with human review
The current heuristic approach must not be treated as final truth.
Implement:
explicit candidate consent;
privacy notice;
camera/microphone fallback;
network fallback;
human-review queue;
evidence timeline;
reviewer comments;
appeal process;
evidence retention policy;
snapshot encryption;
audit trail;
manual override with reason;
reviewer separation of duties;
no automatic disqualification from a single heuristic;
confidence and uncertainty display;
candidate notification before adverse action.
Evaluate across:
skin tones;
lighting;
camera quality;
glasses;
head coverings;
disabilities;
low bandwidth;
shared environments;
multiple monitors;
printed photos;
prerecorded video;
camera disconnection.
10. AI governance
For resume parsing, ranking, interview evaluation, question generation, and proctoring:
version every model;
version every prompt;
record provider and model version;
record input/output hashes;
protect candidate data;
prevent prompt injection;
define provider retention behavior;
redact unnecessary personal data;
show confidence;
show explanations;
support human review;
support candidate correction;
support appeal;
measure bias and error rates;
prevent protected-attribute use;
maintain evaluation datasets;
add regression tests;
add prompt-injection tests;
add hallucination tests;
add model fallback behavior;
disable experimental models by default in production.
AI output must be advisory unless a qualified human reviews the decision.
P1 — Reliability and operations
11. Background jobs
Move heavy tasks into a durable queue:
email;
resume parsing;
OCR;
AI evaluation;
report generation;
bulk import;
code execution;
certificate generation;
data retention;
analytics aggregation.
Each job needs:
unique ID;
status;
progress;
retry policy;
timeout;
dead-letter queue;
idempotency;
cancellation;
error classification;
audit record.
12. Email and notifications
Implement real delivery with:
SMTP or transactional provider;
TLS;
retry handling;
delivery status;
bounce handling;
duplicate prevention;
notification preferences;
queue-based sending;
plain-text and HTML versions;
template escaping;
rate limiting;
unsubscribe behavior where applicable.
Never log message bodies or sensitive candidate data.
13. Observability
Add:
structured JSON logs;
request IDs;
trace IDs;
user and organization IDs in safe context;
latency metrics;
database metrics;
queue metrics;
compiler metrics;
AI provider metrics;
email metrics;
upload/download metrics;
login failure metrics;
rate-limit metrics;
storage usage metrics;
dashboards;
alert rules;
incident runbooks.
Track service-level objectives such as:
API availability;
p95 latency;
exam submission success rate;
code-execution success rate;
email delivery rate;
queue delay;
database error rate;
authentication failure spikes.
14. Disaster recovery
Implement and test:
automated database backups;
encrypted backups;
point-in-time recovery;
object-storage versioning;
cross-region backup where appropriate;
restore scripts;
recovery time objective;
recovery point objective;
disaster-recovery runbook;
quarterly restore drill;
database corruption recovery;
accidental deletion recovery;
secret rotation after compromise.
A backup is not valid until restoration has been tested.
P1 — Frontend quality
15. Frontend reliability
Ensure:
no sensitive data in localStorage;
cookie session is the source of truth;
every response is schema-validated;
expired sessions refresh safely;
refresh requests are deduplicated;
requests can be cancelled;
stale requests cannot overwrite current state;
all pages have loading, empty, error, retry, and success states;
forms prevent duplicate submits;
optimistic updates roll back correctly;
long lists are paginated or virtualized;
offline behavior is explicit;
errors do not expose stack traces or provider details.
16. Accessibility
Target WCAG 2.2 AA.
Test:
keyboard navigation;
screen readers;
focus handling;
dialogs;
menus;
forms;
tables;
charts;
exam timer;
editor;
proctoring notifications;
color contrast;
reduced motion;
zoom up to 200%;
mobile layout;
camera/microphone permission flows.
Run axe tests in CI and complete manual accessibility review.
17. Performance
Define supported capacity, for example:
1,000 concurrent candidates;
100 concurrent code executions;
500 active proctoring sessions;
100 recruiter dashboard users;
10,000 candidates per drive.
Test:
login spikes;
simultaneous exam start;
autosave storms;
proctoring snapshot bursts;
simultaneous final submissions;
large recruiter analytics;
bulk imports;
report exports;
database pool exhaustion;
Redis outage;
Judge0 outage.
Set performance budgets for:
initial JavaScript bundle;
route load time;
API p95 latency;
submission completion;
dashboard rendering.
P2 — Security and release engineering
18. CI/CD gates
CI should run:
TypeScript check;
ESLint;
unit tests;
backend pytest;
coverage thresholds;
API contract drift check;
E2E tests;
accessibility tests;
migration tests;
Bandit;
pip-audit;
npm audit;
secret scanning;
dependency review;
container scanning;
SBOM generation;
license checks;
formatting checks;
performance smoke tests.
Use:
Bash
npm ci
npm ci --prefix client
Never use mutable dependency installation in release pipelines.
19. Container hardening
Use:
pinned base-image versions;
image digests;
no latest tags;
non-root runtime;
read-only filesystem;
dropped Linux capabilities;
resource limits;
internal Docker networks;
no exposed database or Redis ports in production;
secret manager integration;
container vulnerability scanning;
SBOM;
signed images;
deployment provenance;
health and readiness checks;
graceful shutdown;
rolling deployment;
separate staging and production configuration.
20. API hardening
Add:
API versioning;
consistent RFC 7807 errors;
pagination;
maximum page sizes;
idempotency keys;
optimistic concurrency;
request body limits;
response limits;
strict validation;
rate limits;
CORS tests;
CSRF tests;
OpenAPI contract tests;
safe error messages;
no sensitive data in URLs;
export limits;
audit records.
21. Security testing
Run:
SAST;
dependency scanning;
secret scanning;
DAST;
OWASP ZAP;
API fuzzing;
authorization fuzzing;
path traversal tests;
SQL injection tests;
XSS tests;
CSRF tests;
SSRF tests;
IDOR tests;
privilege escalation tests;
WebSocket authentication tests;
rate-limit bypass tests;
upload malware tests;
session fixation tests;
refresh-token reuse tests.
Before calling it 10/10, obtain an independent penetration test.
P2 — Privacy, governance, and compliance
22. Privacy controls
Add:
privacy policy;
terms of use;
candidate consent;
data classification;
retention schedules;
deletion workflows;
export-my-data workflow;
correction workflow;
access logs;
data-minimization rules;
processor/vendor register;
breach-response process;
regional storage policy;
encryption policy;
data-subject request tracking.
Define retention separately for:
resumes;
marksheets;
proctoring images;
interview audio;
code submissions;
audit logs;
certificates;
rejected candidates;
deleted accounts.
23. Hiring fairness
Implement:
human review for adverse decisions;
candidate appeal;
score explanation;
model confidence;
fairness reports;
bias testing;
protected-attribute exclusion;
structured evaluation forms;
equal treatment across colleges;
no opaque automatic rejection;
audit trail for ranking changes;
model rollback;
prompt/model version history.
24. Testing definition of done
Unit tests
Cover:
validation;
scoring;
negative marking;
timer logic;
ranking;
proctoring severity;
token rotation;
signed URLs;
upload validation;
CSV parsing;
sanitization;
date handling.
Integration tests
Cover:
database repositories;
transactions;
rollback;
authentication;
authorization;
uploads;
SMTP failures;
Redis failures;
Judge0 failures;
AI provider failures;
storage failures;
migrations.
E2E tests
Cover:
candidate onboarding;
exam start;
MCQ submission;
coding submission;
exam timeout;
refresh/reconnect;
recruiter review;
TPO import;
offer workflow;
certificate verification;
session expiry;
camera denial;
network failure;
mobile layout.
Load tests
Cover all high-volume operations and define pass thresholds.
Final 10/10 acceptance gate
IntelliHire should only be called 10/10 when all of the following are true:
 No high or critical security findings remain.
 Full authorization matrix passes.
 MFA and account recovery work.
 Production files are private and scanned.
 Code execution is isolated and private.
 Proctoring has consent, retention, encryption, and human review.
 AI features are explainable, versioned, audited, and fair-tested.
 Database migrations are deterministic and recoverable.
 Email and background jobs are reliable.
 Backend tests pass with the required coverage.
 Frontend type-check, lint, unit tests, and build pass.
 E2E tests pass in CI.
 Accessibility tests pass.
 Load tests pass at the declared capacity.
 CI includes security, dependency, secret, container, and contract scanning.
 Backups have been restored successfully in a drill.
 Logs and metrics contain no sensitive information.
 Privacy, deletion, export, and retention workflows exist.
 Production deployment uses managed secrets and isolated networks.
 Independent penetration testing is complete.
 Staging has passed a complete release checklist.
 Documentation matches the actual deployed behavior.