# Antigravity Workspace Rules

## Environment Secrets Protection
- Under no circumstances should the agent print, read, log, output, or expose any actual secret values from the `.env` file in the chat workspace or output transcript.
- When referencing environment credentials or keys (such as `JWT_SECRET`, `GEMINI_API_KEY`, `GROQ_API_KEY`, or `SMTP_PASS`), always replace them with generic placeholder text (e.g. `xxxx` or `YOUR_KEY`).
- Ensure `.env` is always ignored in version control.
