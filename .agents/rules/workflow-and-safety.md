---
trigger: always_on
---

# Workflow and safety

- Before building a feature, give a short plan (files to create or change, then steps) and wait for approval.
- Build one screen or one phase at a time. Do not start the next one unprompted.
- After each task, run the app or the tests and report what passed or failed. Do not say something works without running it.
- Keep a README with setup steps and a list of what is mocked and what is real. Update it when that changes.
- Environment variables go in .env.local, which must be in .gitignore. Provide a .env.example with empty values.
- Suggest a git commit message after each finished task. Do not push unless asked.
- Do not edit files outside this project folder.