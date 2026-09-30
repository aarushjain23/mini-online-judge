"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Problem = { id: number; title: string; difficulty: string; submissions: number };

export default function Problems() {
  const [problems, setProblems] = useState<Problem[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    api<Problem[]>("/api/problems").then(setProblems).catch((e) => setError(e.message));
  }, []);
  return (
    <>
      <h1>Popular Problems</h1>
      <p className="muted">Check out the most popular programming problems.</p>
      {error && <p className="err">{error}</p>}
      <div className="grid">
        {problems.map((p) => (
          <div className="card" key={p.id}>
            <h3>{p.title}</h3>
            <div className="split">
              <div><div className="muted">Difficulty</div><span className={`tag ${p.difficulty}`}>{p.difficulty.toUpperCase()}</span></div>
              <div style={{ textAlign: "right" }}><div className="muted">Submissions</div>{p.submissions}</div>
            </div>
            <Link href={`/problems/${p.id}`}><button>View Problem</button></Link>
          </div>
        ))}
      </div>
    </>
  );
}
