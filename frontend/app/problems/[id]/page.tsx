"use client";
import Editor from "@monaco-editor/react";
import { use, useEffect, useState } from "react";
import { api, getToken } from "@/lib/api";

type Problem = {
  id: number; title: string; statement: string; difficulty: string; time_limit_ms: number;
  samples: { input: string; expected: string }[];
};
type Submission = {
  id: number; verdict: string; time_ms: number | null; detail: string | null;
  tests_passed: number; tests_total: number; results: string[];
};
type Row = { id: number; verdict: string; language: string; time_ms: number | null; tests_passed: number; tests_total: number; created_at: string };

const TEMPLATES: Record<string, string> = {
  javascript: 'const lines = require("fs").readFileSync(0, "utf8").split("\\n");\n// solve here\nconsole.log(lines[0]);\n',
  cpp: "#include <bits/stdc++.h>\nusing namespace std;\nint main() {\n  // solve here\n  return 0;\n}\n",
  python: "# solve here\nprint(input())\n",
};
const MONACO_LANG: Record<string, string> = { javascript: "javascript", cpp: "cpp", python: "python" };
const pending = (v: string) => v === "Pending" || v === "Running";

export default function ProblemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [contestId, setContestId] = useState<number | null>(null);
  const [tab, setTab] = useState<"submit" | "submissions">("submit");
  const [language, setLanguage] = useState("javascript");
  const [code, setCode] = useState(TEMPLATES.javascript);
  const [result, setResult] = useState<Submission | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const c = new URLSearchParams(location.search).get("contestId");
    setContestId(c ? Number(c) : null);
    api<Problem>(`/api/problems/${id}`).then(setProblem).catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    if (tab === "submissions" && getToken()) api<Row[]>(`/api/submissions?problemId=${id}`).then(setRows).catch((e) => setError(e.message));
  }, [tab, id]);

  function changeLanguage(l: string) {
    setLanguage(l);
    setCode(TEMPLATES[l]);
  }

  async function submit() {
    if (!getToken()) return (location.href = "/login");
    setBusy(true);
    setError("");
    setResult({ id: 0, verdict: "Pending", time_ms: null, detail: null, tests_passed: 0, tests_total: 0, results: [] });
    try {
      const { id: sid } = await api<{ id: number }>("/api/submit", { body: { problemId: Number(id), language, code, contestId } });
      for (;;) {
        const s = await api<Submission>(`/api/submissions/${sid}`);
        setResult(s);
        if (!pending(s.verdict)) break;
        await new Promise((r) => setTimeout(r, 700));
      }
    } catch (e) {
      setError((e as Error).message);
      setResult(null);
    } finally {
      setBusy(false);
    }
  }

  if (!problem) return <p className={error ? "err" : ""}>{error || "Loading..."}</p>;
  return (
    <div className="problem-layout">
      <section>
        <h1>{problem.title} <span className={`tag ${problem.difficulty}`}>{problem.difficulty}</span></h1>
        <p style={{ whiteSpace: "pre-wrap" }}>{problem.statement}</p>
        <p className="muted">Time limit: {problem.time_limit_ms} ms</p>
        {problem.samples.map((s, i) => (
          <div key={i}>
            <h4>For example, Input</h4><pre className="dark">{s.input}</pre>
            <h4>Output</h4><pre className="dark">{s.expected}</pre>
          </div>
        ))}
      </section>
      <section>
        <div className="tabs">
          <button className={tab === "submit" ? "on" : ""} onClick={() => setTab("submit")}>Submit</button>
          <button className={tab === "submissions" ? "on" : ""} onClick={() => setTab("submissions")}>Submissions</button>
        </div>
        {contestId && <p className="muted">Submitting in contest #{contestId}</p>}
        {tab === "submit" ? (
          <>
            <label>Language</label>
            <select value={language} onChange={(e) => changeLanguage(e.target.value)} style={{ width: "100%", margin: "6px 0 12px" }}>
              <option value="javascript">JavaScript (Node)</option>
              <option value="cpp">C++17</option>
              <option value="python">Python 3</option>
            </select>
            <Editor
              height="380px"
              theme="vs-dark"
              language={MONACO_LANG[language]}
              value={code}
              onChange={(v) => setCode(v ?? "")}
              options={{ minimap: { enabled: false }, fontSize: 14, scrollBeyondLastLine: false }}
            />
            <div className="row">
              <button onClick={submit} disabled={busy}>{busy ? "Judging..." : "Submit"}</button>
              {result && (
                <span>
                  <span className={`v ${result.verdict.split(" ")[0]}`}>{result.verdict}</span>
                  {result.time_ms != null && !pending(result.verdict) && ` · ${result.time_ms} ms`}
                </span>
              )}
            </div>
            {error && <p className="err">{error}</p>}
            {result && result.results.length > 0 && (
              <div className="tests">
                {result.results.map((v, i) => (
                  <div key={i} className="test">
                    <div>Test #{i + 1}</div>
                    <span className={v === "Accepted" ? "ok" : "bad"} title={v}>{v === "Accepted" ? "✓" : "✗"}</span>
                  </div>
                ))}
              </div>
            )}
            {result?.detail && result.verdict !== "Accepted" && <pre>{result.detail}</pre>}
          </>
        ) : !getToken() ? (
          <p className="err">Please login to see your submissions.</p>
        ) : (
          <table>
            <thead><tr><th>Submission ID</th><th>Result</th><th>Tests Passed</th><th>Time</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>#{r.id}</td>
                  <td className={r.verdict === "Accepted" ? "ok" : "bad"}>{r.verdict === "Accepted" ? "✓" : "✗"}</td>
                  <td>{r.tests_passed}/{r.tests_total}</td>
                  <td>{r.time_ms != null ? (r.time_ms / 1000).toFixed(3) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
