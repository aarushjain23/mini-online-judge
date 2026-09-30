import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { db } from "./db.js";

export const LANGUAGES = ["javascript", "cpp", "python"] as const;
export type Language = (typeof LANGUAGES)[number];

type Result = { verdict: string; timeMs: number; detail: string; results: string[] };

// JUDGE_MODE=docker runs every submission inside a locked-down container (see backend/runner/Dockerfile).
// Default "local" runs directly on the host, which is only OK for your own machine.
const DOCKER = process.env.JUDGE_MODE === "docker";
const IMAGE = process.env.JUDGE_IMAGE ?? "mini-judge-runner";
const MEMORY_MB = Number(process.env.JUDGE_MEMORY_MB ?? 256);
const DOCKER_STARTUP_MS = 1500; // container start-up is not the user's time; give it extra room before killing

const FILES: Record<Language, string> = { javascript: "main.js", python: "main.py", cpp: "main.cpp" };

function dockerArgs(name: string | null, dir: string, writable: boolean, memoryMb: number, cmd: string[]) {
  return [
    "run", "--rm", ...(name ? ["-i", "--name", name] : []),
    "--network", "none",
    "--memory", `${memoryMb}m`, "--memory-swap", `${memoryMb}m`,
    "--cpus", "1", "--pids-limit", "64",
    "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
    ...(writable ? [] : ["--read-only"]),
    "-v", `${dir}:/work${writable ? "" : ":ro"}`, "-w", "/work",
    IMAGE, ...cmd,
  ];
}

function localCommand(language: Language, dir: string): { cmd: string; args: string[] } {
  if (language === "javascript") return { cmd: "node", args: ["main.js"] };
  if (language === "python") return { cmd: "python", args: ["main.py"] };
  return { cmd: join(dir, "main.exe"), args: [] };
}

function run(language: Language, input: string, limitMs: number, dir: string) {
  return new Promise<{ stdout: string; stderr: string; code: number | null; timedOut: boolean; ms: number }>((resolve) => {
    const start = Date.now();
    let cmd: string;
    let args: string[];
    let name: string | null = null;
    if (DOCKER) {
      name = `judge-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const inner = language === "javascript" ? ["node", "main.js"] : language === "python" ? ["python3", "main.py"] : ["./main.exe"];
      cmd = "docker";
      args = dockerArgs(name, dir, false, MEMORY_MB, inner);
    } else {
      ({ cmd, args } = localCommand(language, dir));
    }
    const p = spawn(cmd, args, { cwd: dir });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      if (name) spawn("docker", ["rm", "-f", name]); // killing the docker CLI alone would leave the container running
      p.kill("SIGKILL");
    }, limitMs + (DOCKER ? DOCKER_STARTUP_MS : 0));
    p.stdout.on("data", (d) => {
      if (stdout.length < 1e6) stdout += d;
    });
    p.stderr.on("data", (d) => {
      if (stderr.length < 1e5) stderr += d;
    });
    p.on("error", (e) => {
      stderr += e.message;
    });
    p.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code, timedOut, ms: Date.now() - start });
    });
    p.stdin.on("error", () => {});
    p.stdin.end(input);
  });
}

const norm = (s: string) =>
  s
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trimEnd())
    .join("\n")
    .trim();

function compileCpp(dir: string) {
  const [cmd, args] = DOCKER
    ? ["docker", dockerArgs(null, dir, true, 512, ["g++", "-O2", "-std=c++17", "main.cpp", "-o", "main.exe"])]
    : ["g++", ["-O2", "-std=c++17", "main.cpp", "-o", "main.exe"]];
  return spawnSync(cmd as string, args as string[], { cwd: dir, encoding: "utf8", timeout: 60000 });
}

async function judge(language: Language, code: string, problemId: number): Promise<Result> {
  const problem = db.prepare("SELECT time_limit_ms FROM problems WHERE id = ?").get(problemId) as { time_limit_ms: number };
  const cases = db.prepare("SELECT input, expected FROM testcases WHERE problem_id = ? ORDER BY id").all(problemId) as {
    input: string;
    expected: string;
  }[];
  const dir = mkdtempSync(join(tmpdir(), "judge-"));
  try {
    writeFileSync(join(dir, FILES[language]), code);
    if (language === "cpp") {
      const c = compileCpp(dir);
      if (c.error || c.status !== 0)
        return { verdict: "Compilation Error", timeMs: 0, detail: (c.stderr || String(c.error)).slice(0, 2000), results: cases.map(() => "Compilation Error") };
    }
    let maxMs = 0;
    let firstFail = "";
    let detail = "";
    const results: string[] = [];
    for (let i = 0; i < cases.length; i++) {
      const r = await run(language, cases[i].input, problem.time_limit_ms, dir);
      maxMs = Math.max(maxMs, r.ms);
      let v = "Accepted";
      if (r.timedOut) v = "Time Limit Exceeded";
      else if (DOCKER && r.code === 137) v = "Memory Limit Exceeded"; // SIGKILL not caused by our timer = OOM killer
      else if (r.code !== 0) v = "Runtime Error";
      else if (norm(r.stdout) !== norm(cases[i].expected)) v = "Wrong Answer";
      results.push(v);
      if (v !== "Accepted" && !firstFail) {
        firstFail = v;
        detail = `Failed on test ${i + 1} of ${cases.length}` + (v === "Runtime Error" ? "\n" + r.stderr.slice(0, 1000) : "");
      }
    }
    if (firstFail) return { verdict: firstFail, timeMs: maxMs, detail, results };
    return { verdict: "Accepted", timeMs: maxMs, detail: `Passed ${cases.length}/${cases.length} tests`, results };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export async function judgeSubmission(id: number) {
  const s = db.prepare("SELECT language, code, problem_id FROM submissions WHERE id = ?").get(id) as {
    language: Language;
    code: string;
    problem_id: number;
  };
  db.prepare("UPDATE submissions SET verdict = 'Running' WHERE id = ?").run(id);
  let r: Result;
  try {
    r = await judge(s.language, s.code, s.problem_id);
  } catch (e) {
    r = { verdict: "Internal Error", timeMs: 0, detail: String(e), results: [] };
  }
  db.prepare("UPDATE submissions SET verdict = ?, time_ms = ?, detail = ?, tests_passed = ?, tests_total = ?, results = ? WHERE id = ?").run(
    r.verdict,
    r.timeMs,
    r.detail,
    r.results.filter((v) => v === "Accepted").length,
    r.results.length,
    JSON.stringify(r.results),
    id,
  );
}
