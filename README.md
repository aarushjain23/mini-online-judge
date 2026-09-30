# Mini Online Judge

Next.js (React, TS) frontend + Express (TS) backend + SQLite (SQL) — CodeChef/Codeforces style.

## Run
Terminal 1: `cd backend && npm run dev`   (API on :4000, creates judge.db and seeds 3 problems)
Terminal 2: `cd frontend && npm run dev`  (UI on :3000)

## How judging works
POST /api/submit stores the code, then judge.ts writes it to a temp dir, compiles (C++ via g++),
runs each testcase with a time limit and compares trimmed output.
Verdicts: Accepted, Wrong Answer, Time Limit Exceeded, Runtime Error, Compilation Error.
Requires `node`, `g++`, `python` on PATH for the respective languages.

## Note
Code runs directly on your machine with no sandbox. Fine for local use; for public hosting run it in Docker.

## Docker sandbox (recommended for anything beyond your own machine)
```
docker build -t mini-judge-runner backend/runner
cd backend
$env:JUDGE_MODE="docker"; npm run dev      # PowerShell   (bash: JUDGE_MODE=docker npm run dev)
```
Each run gets: no network, 256 MB RAM (`JUDGE_MEMORY_MB`), 1 CPU, 64 processes max,
read-only filesystem, all capabilities dropped. Adds a new verdict: Memory Limit Exceeded.
Without `JUDGE_MODE=docker` the judge runs code directly on the host.

## Contest standings
`GET /api/contests/:id/standings` — ranked by points, then penalty
(minutes from contest start to first Accepted + 10 per earlier wrong attempt; Compilation Errors are not counted).
