import { DatabaseSync } from "node:sqlite";

export const db = new DatabaseSync("judge.db");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS problems (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  statement TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  time_limit_ms INTEGER NOT NULL DEFAULT 2000
);
CREATE TABLE IF NOT EXISTS testcases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  problem_id INTEGER NOT NULL REFERENCES problems(id),
  input TEXT NOT NULL,
  expected TEXT NOT NULL,
  is_sample INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS contests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  start_time TEXT NOT NULL,
  duration_min INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS contest_problems (
  contest_id INTEGER NOT NULL REFERENCES contests(id),
  problem_id INTEGER NOT NULL REFERENCES problems(id),
  PRIMARY KEY (contest_id, problem_id)
);
CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  problem_id INTEGER NOT NULL REFERENCES problems(id),
  contest_id INTEGER REFERENCES contests(id),
  language TEXT NOT NULL,
  code TEXT NOT NULL,
  verdict TEXT NOT NULL DEFAULT 'Pending',
  time_ms INTEGER,
  detail TEXT,
  tests_passed INTEGER NOT NULL DEFAULT 0,
  tests_total INTEGER NOT NULL DEFAULT 0,
  results TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

const seed: { title: string; difficulty: string; statement: string; cases: [string, string][] }[] = [
  {
    title: "Sum of Two Numbers",
    difficulty: "Easy",
    statement:
      "Given two integers A and B on one line, print A + B.\n\nInput: two integers A and B (|A|,|B| <= 10^9).\nOutput: a single integer, the sum.",
    cases: [["1 2\n", "3"], ["-5 5\n", "0"], ["1000000000 1000000000\n", "2000000000"], ["0 0\n", "0"]],
  },
  {
    title: "Even or Odd",
    difficulty: "Easy",
    statement: 'Given an integer N, print "Even" if it is even, otherwise print "Odd".\n\nInput: a single integer N.\nOutput: Even or Odd.',
    cases: [["4\n", "Even"], ["7\n", "Odd"], ["0\n", "Even"], ["-3\n", "Odd"]],
  },
  {
    title: "Maximum of Array",
    difficulty: "Medium",
    statement:
      "Given N followed by N integers, print the maximum.\n\nInput: first line N, second line N space-separated integers.\nOutput: the maximum value.",
    cases: [["3\n1 5 2\n", "5"], ["1\n-7\n", "-7"], ["5\n-1 -2 -3 -4 -5\n", "-1"], ["4\n10 10 9 8\n", "10"]],
  },
];

if ((db.prepare("SELECT COUNT(*) AS c FROM problems").get() as { c: number }).c === 0) {
  const addP = db.prepare("INSERT INTO problems (title, statement, difficulty) VALUES (?, ?, ?)");
  const addT = db.prepare("INSERT INTO testcases (problem_id, input, expected, is_sample) VALUES (?, ?, ?, ?)");
  for (const p of seed) {
    const id = Number(addP.run(p.title, p.statement, p.difficulty).lastInsertRowid);
    p.cases.forEach(([i, o], idx) => addT.run(id, i, o, idx === 0 ? 1 : 0));
  }
}

if ((db.prepare("SELECT COUNT(*) AS c FROM contests").get() as { c: number }).c === 0) {
  const H = 3600_000;
  const at = (hoursFromNow: number) => new Date(Date.now() + hoursFromNow * H).toISOString();
  const addC = db.prepare("INSERT INTO contests (title, start_time, duration_min) VALUES (?, ?, ?)");
  const link = db.prepare("INSERT INTO contest_problems (contest_id, problem_id) VALUES (?, ?)");
  const contests: [string, string, number, number[]][] = [
    ["First contest", at(-1), 48 * 60, [1, 2, 3]],
    ["Second test contest", at(14), 72 * 60, [2, 3]],
    ["Warmup contest", at(-100), 2 * 60, [1, 2]],
  ];
  for (const [title, start, dur, pids] of contests) {
    const cid = Number(addC.run(title, start, dur).lastInsertRowid);
    pids.forEach((pid) => link.run(cid, pid));
  }
}
