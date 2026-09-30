"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export default function Standings() {
  const [rows, setRows] = useState<{ username: string; points: number }[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    api<typeof rows>("/api/standings").then(setRows).catch((e) => setError(e.message));
  }, []);
  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      <h1>Leaderboard</h1>
      <p className="muted">Points: Easy 100, Medium 200, Hard 300 per problem solved.</p>
      {error && <p className="err">{error}</p>}
      <table>
        <thead><tr><th>Rank</th><th>User</th><th>Points</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.username}><td>{i + 1}</td><td>{r.username}</td><td>{r.points}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
