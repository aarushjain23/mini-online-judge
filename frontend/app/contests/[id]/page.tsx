"use client";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { type Contest, contestStatus, countdown } from "@/lib/time";

type Detail = Contest & {
  points: number;
  problems: { id: number; title: string; difficulty: string; solved: number; status: "solved" | "attempted" | "none" }[];
};

type Standing = {
  username: string; points: number; penalty: number;
  cells: Record<number, { accepted: boolean; wrong: number; minutes: number | null }>;
};

export default function ContestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [c, setC] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const [tab, setTab] = useState<"problems" | "standings">("problems");
  const [standings, setStandings] = useState<Standing[]>([]);
  useEffect(() => {
    if (tab !== "standings") return;
    const load = () => api<Standing[]>(`/api/contests/${id}/standings`).then(setStandings).catch((e) => setError(e.message));
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [tab, id]);
  useEffect(() => {
    api<Detail>(`/api/contests/${id}`).then(setC).catch((e) => setError(e.message));
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [id]);

  if (!c) return <p className={error ? "err" : ""}>{error || "Loading..."}</p>;
  const status = contestStatus(c, now);
  const start = Date.parse(c.start_time);
  const end = start + c.duration_min * 60_000;
  const timer = status === "upcoming" ? `Starts in ${countdown(start - now)}` : status === "active" ? `${countdown(end - now)} left` : "Contest ended";
  return (
    <>
      <h1>{c.id}. {c.title}</h1>
      <div className="tabs">
        <button className={tab === "problems" ? "on" : ""} onClick={() => setTab("problems")}>Problems</button>
        <button className={tab === "standings" ? "on" : ""} onClick={() => setTab("standings")}>Standings</button>
      </div>
      {tab === "standings" ? (
        <>
          {error && <p className="err">{error}</p>}
          <p className="muted">Ranked by points, then penalty (minutes to solve + 10 per wrong attempt). Refreshes every 10s.</p>
          <table>
            <thead>
              <tr>
                <th>Rank</th><th>User</th><th>Points</th><th>Penalty</th>
                {c.problems.map((p, i) => <th key={p.id} title={p.title}>{String.fromCharCode(65 + i)}</th>)}
              </tr>
            </thead>
            <tbody>
              {standings.length === 0 && <tr><td colSpan={4 + c.problems.length} className="muted">No submissions yet.</td></tr>}
              {standings.map((u, i) => (
                <tr key={u.username}>
                  <td>{i + 1}</td><td>{u.username}</td><td>{u.points}</td><td>{u.penalty}</td>
                  {c.problems.map((p) => {
                    const cell = u.cells[p.id];
                    if (!cell) return <td key={p.id}>-</td>;
                    return cell.accepted ? (
                      <td key={p.id} className="ok">✓ {cell.minutes}m{cell.wrong ? <small> (+{cell.wrong})</small> : null}</td>
                    ) : (
                      <td key={p.id} className="bad">-{cell.wrong}</td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
      <div className="contest-layout">
        <table>
          <thead><tr><th>Problem</th><th>Difficulty</th><th>Solved</th><th>Your status</th><th>Solve</th></tr></thead>
          <tbody>
            {status === "upcoming" ? (
              <tr><td colSpan={5} className="muted">Problems are visible once the contest starts.</td></tr>
            ) : (
              c.problems.map((p) => (
                <tr key={p.id}>
                  <td><b>{p.title}</b></td>
                  <td>{p.difficulty.toUpperCase()}</td>
                  <td>{p.solved}</td>
                  <td>{p.status === "solved" ? <span className="ok">✓</span> : p.status === "attempted" ? <span className="bad">✗</span> : "-"}</td>
                  <td>
                    <Link href={`/problems/${p.id}${status === "active" ? `?contestId=${c.id}` : ""}`}>
                      <button style={{ width: "100%" }}>Solve</button>
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <div>
          <div className="card center">{timer}</div>
          <div className="card center">{c.points} points</div>
        </div>
      </div>
      )}
    </>
  );
}
