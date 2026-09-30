"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { type Contest, contestStatus, countdown, humanDuration } from "@/lib/time";

function ContestCard({ c, now }: { c: Contest; now: number }) {
  const status = contestStatus(c, now);
  const start = Date.parse(c.start_time);
  return (
    <div className="card contest">
      <div className="split">
        <h3>{c.id}. {c.title}</h3>
        {status === "active" && <span className="active">Active</span>}
        {status === "ended" && <span className="muted">Ended</span>}
      </div>
      <div className="split">
        <div>
          <div className="muted">{status === "upcoming" ? "Starts in" : "Started"}</div>
          <div>{status === "upcoming" ? countdown(start - now) : `${humanDuration(now - start)} ago`}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="muted">Duration</div>
          <div>{humanDuration(c.duration_min * 60_000)}</div>
        </div>
      </div>
      <Link href={`/contests/${c.id}`}><button>{status === "active" ? "Participate" : "View Contest"}</button></Link>
    </div>
  );
}

export default function Contests() {
  const [contests, setContests] = useState<Contest[]>([]);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    api<Contest[]>("/api/contests").then(setContests).catch((e) => setError(e.message));
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const upcoming = contests.filter((c) => contestStatus(c, now) !== "ended");
  const previous = contests.filter((c) => contestStatus(c, now) === "ended");
  return (
    <>
      {error && <p className="err">{error} (is the backend running on :4000?)</p>}
      <h1>Upcoming Contests</h1>
      <p className="muted">Check out the upcoming programming contests.</p>
      <div className="grid">{upcoming.map((c) => <ContestCard key={c.id} c={c} now={now} />)}</div>
      <h1 style={{ marginTop: 40 }}>Previous Contests</h1>
      <p className="muted">Check out the previous programming contests.</p>
      <div className="grid">{previous.map((c) => <ContestCard key={c.id} c={c} now={now} />)}</div>
    </>
  );
}
