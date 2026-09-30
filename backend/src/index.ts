import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { db } from "./db.js";
import { judgeSubmission, LANGUAGES, type Language } from "./judge.js";

const SECRET = process.env.JWT_SECRET ?? "dev-secret-change-me";
const app = express();
app.use(cors());
app.use(express.json({ limit: "200kb" }));

type AuthReq = Request & { userId?: number };

const hash = (pw: string) => {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(pw, salt, 64).toString("hex")}`;
};
const verify = (pw: string, stored: string) => {
  const [salt, h] = stored.split(":");
  return timingSafeEqual(Buffer.from(h, "hex"), scryptSync(pw, salt, 64));
};

function auth(req: AuthReq, res: Response, next: NextFunction) {
  try {
    const token = (req.headers.authorization ?? "").replace("Bearer ", "");
    req.userId = (jwt.verify(token, SECRET) as { id: number }).id;
    next();
  } catch {
    res.status(401).json({ error: "Login required" });
  }
}

function authHandler(register: boolean) {
  return (req: Request, res: Response) => {
    const { username, password } = req.body ?? {};
    if (typeof username !== "string" || typeof password !== "string" || username.length < 3 || password.length < 4)
      return res.status(400).json({ error: "Username (3+) and password (4+) required" });
    let id: number;
    if (register) {
      try {
        id = Number(db.prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)").run(username, hash(password)).lastInsertRowid);
      } catch {
        return res.status(409).json({ error: "Username taken" });
      }
    } else {
      const u = db.prepare("SELECT id, password_hash FROM users WHERE username = ?").get(username) as
        | { id: number; password_hash: string }
        | undefined;
      if (!u || !verify(password, u.password_hash)) return res.status(401).json({ error: "Invalid credentials" });
      id = u.id;
    }
    res.json({ token: jwt.sign({ id }, SECRET, { expiresIn: "7d" }), username });
  };
}
app.post("/api/register", authHandler(true));
app.post("/api/login", authHandler(false));

const POINTS = "CASE p.difficulty WHEN 'Easy' THEN 100 WHEN 'Medium' THEN 200 ELSE 300 END";

// Token is optional on public routes; used to show "your status".
function optionalUserId(req: Request): number | null {
  try {
    const token = (req.headers.authorization ?? "").replace("Bearer ", "");
    return (jwt.verify(token, SECRET) as { id: number }).id;
  } catch {
    return null;
  }
}

app.get("/api/problems", (_req, res) => {
  res.json(
    db
      .prepare(
        `SELECT p.id, p.title, p.difficulty, COUNT(s.id) AS submissions
         FROM problems p LEFT JOIN submissions s ON s.problem_id = p.id
         GROUP BY p.id ORDER BY submissions DESC, p.id`,
      )
      .all(),
  );
});

app.get("/api/problems/:id", (req, res) => {
  const p = db.prepare("SELECT id, title, statement, difficulty, time_limit_ms FROM problems WHERE id = ?").get(Number(req.params.id));
  if (!p) return res.status(404).json({ error: "Not found" });
  const samples = db.prepare("SELECT input, expected FROM testcases WHERE problem_id = ? AND is_sample = 1").all(Number(req.params.id));
  res.json({ ...p, samples });
});

app.get("/api/contests", (_req, res) => {
  res.json(db.prepare("SELECT id, title, start_time, duration_min FROM contests ORDER BY start_time DESC").all());
});

app.get("/api/contests/:id", (req, res) => {
  const cid = Number(req.params.id);
  const contest = db.prepare("SELECT id, title, start_time, duration_min FROM contests WHERE id = ?").get(cid);
  if (!contest) return res.status(404).json({ error: "Not found" });
  const uid = optionalUserId(req);
  const problems = db
    .prepare(
      `SELECT p.id, p.title, p.difficulty,
         (SELECT COUNT(DISTINCT s.user_id) FROM submissions s
            WHERE s.problem_id = p.id AND s.contest_id = cp.contest_id AND s.verdict = 'Accepted') AS solved,
         (SELECT COUNT(*) FROM submissions s WHERE s.problem_id = p.id AND s.contest_id = cp.contest_id AND s.user_id = ?) AS attempted,
         (SELECT COUNT(*) FROM submissions s WHERE s.problem_id = p.id AND s.contest_id = cp.contest_id AND s.user_id = ? AND s.verdict = 'Accepted') AS accepted
       FROM contest_problems cp JOIN problems p ON p.id = cp.problem_id
       WHERE cp.contest_id = ? ORDER BY p.id`,
    )
    .all(uid ?? -1, uid ?? -1, cid) as { attempted: number; accepted: number }[];
  const pts = db
    .prepare(
      `SELECT COALESCE(SUM(pts), 0) AS points FROM (
         SELECT DISTINCT s.problem_id, ${POINTS} AS pts
         FROM submissions s JOIN problems p ON p.id = s.problem_id
         WHERE s.contest_id = ? AND s.user_id = ? AND s.verdict = 'Accepted')`,
    )
    .get(cid, uid ?? -1) as { points: number };
  res.json({
    ...contest,
    points: pts.points,
    problems: problems.map((p) => ({ ...p, status: p.accepted ? "solved" : p.attempted ? "attempted" : "none" })),
  });
});

// Contest ranking: more points first, then lower penalty.
// Penalty per solved problem = minutes from contest start to first Accepted + 10 per earlier wrong attempt.
// Compilation Errors and still-judging submissions don't count as attempts.
const WRONG_ATTEMPT_PENALTY_MIN = 10;

app.get("/api/contests/:id/standings", (req, res) => {
  const cid = Number(req.params.id);
  const c = db.prepare("SELECT start_time, duration_min FROM contests WHERE id = ?").get(cid) as
    | { start_time: string; duration_min: number }
    | undefined;
  if (!c) return res.status(404).json({ error: "Not found" });
  const startMs = Date.parse(c.start_time);
  const rows = db
    .prepare(
      `SELECT u.username, s.problem_id, s.verdict, s.created_at, ${POINTS} AS pts
       FROM submissions s JOIN users u ON u.id = s.user_id JOIN problems p ON p.id = s.problem_id
       WHERE s.contest_id = ? AND s.verdict NOT IN ('Pending', 'Running', 'Compilation Error', 'Internal Error')
       ORDER BY s.id`,
    )
    .all(cid) as { username: string; problem_id: number; verdict: string; created_at: string; pts: number }[];

  type Cell = { accepted: boolean; wrong: number; minutes: number | null };
  const users = new Map<string, { points: number; penalty: number; cells: Record<number, Cell> }>();
  for (const r of rows) {
    const u = users.get(r.username) ?? { points: 0, penalty: 0, cells: {} };
    users.set(r.username, u);
    const cell = (u.cells[r.problem_id] ??= { accepted: false, wrong: 0, minutes: null });
    if (cell.accepted) continue; // only the first Accepted matters
    if (r.verdict === "Accepted") {
      cell.accepted = true;
      cell.minutes = Math.max(0, Math.floor((Date.parse(r.created_at.replace(" ", "T") + "Z") - startMs) / 60_000));
      u.points += r.pts;
      u.penalty += cell.minutes + cell.wrong * WRONG_ATTEMPT_PENALTY_MIN;
    } else {
      cell.wrong++;
    }
  }
  const standings = [...users.entries()]
    .map(([username, u]) => ({ username, ...u }))
    .sort((a, b) => b.points - a.points || a.penalty - b.penalty || a.username.localeCompare(b.username));
  res.json(standings);
});

app.get("/api/standings", (_req, res) => {
  res.json(
    db
      .prepare(
        `SELECT u.username, COALESCE(SUM(x.pts), 0) AS points
         FROM users u LEFT JOIN (
           SELECT DISTINCT s.user_id, s.problem_id, ${POINTS} AS pts
           FROM submissions s JOIN problems p ON p.id = s.problem_id WHERE s.verdict = 'Accepted'
         ) x ON x.user_id = u.id
         GROUP BY u.id ORDER BY points DESC, u.username LIMIT 100`,
      )
      .all(),
  );
});

app.post("/api/submit", auth, (req: AuthReq, res) => {
  const { problemId, language, code, contestId } = req.body ?? {};
  if (!LANGUAGES.includes(language) || typeof code !== "string" || !code.trim())
    return res.status(400).json({ error: "Invalid language or empty code" });
  if (!db.prepare("SELECT 1 FROM problems WHERE id = ?").get(problemId)) return res.status(404).json({ error: "No such problem" });
  if (contestId != null) {
    const c = db.prepare("SELECT start_time, duration_min FROM contests WHERE id = ?").get(contestId) as
      | { start_time: string; duration_min: number }
      | undefined;
    const inContest = db.prepare("SELECT 1 FROM contest_problems WHERE contest_id = ? AND problem_id = ?").get(contestId, problemId);
    if (!c || !inContest) return res.status(400).json({ error: "Problem is not part of this contest" });
    const startMs = Date.parse(c.start_time);
    const now = Date.now();
    if (now < startMs || now > startMs + c.duration_min * 60_000) return res.status(403).json({ error: "Contest is not running" });
  }
  const id = Number(
    db
      .prepare("INSERT INTO submissions (user_id, problem_id, contest_id, language, code) VALUES (?, ?, ?, ?, ?)")
      .run(req.userId!, problemId, contestId ?? null, language as Language, code).lastInsertRowid,
  );
  judgeSubmission(id); // runs in background; client polls
  res.json({ id });
});

app.get("/api/submissions", auth, (req: AuthReq, res) => {
  const problemId = req.query.problemId ? Number(req.query.problemId) : null;
  res.json(
    db
      .prepare(
        `SELECT s.id, s.problem_id, p.title, s.language, s.verdict, s.time_ms, s.tests_passed, s.tests_total, s.created_at
         FROM submissions s JOIN problems p ON p.id = s.problem_id
         WHERE s.user_id = ? AND (? IS NULL OR s.problem_id = ?) ORDER BY s.id DESC LIMIT 100`,
      )
      .all(req.userId!, problemId, problemId),
  );
});

app.get("/api/submissions/:id", auth, (req: AuthReq, res) => {
  const s = db
    .prepare(
      "SELECT id, problem_id, language, code, verdict, time_ms, detail, tests_passed, tests_total, results, created_at FROM submissions WHERE id = ? AND user_id = ?",
    )
    .get(Number(req.params.id), req.userId!) as { results: string | null } | undefined;
  s ? res.json({ ...s, results: s.results ? JSON.parse(s.results) : [] }) : res.status(404).json({ error: "Not found" });
});

app.listen(4000, () => console.log("Judge API on http://localhost:4000"));
