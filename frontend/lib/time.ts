export type Contest = { id: number; title: string; start_time: string; duration_min: number };

export function contestStatus(c: Contest, now = Date.now()): "upcoming" | "active" | "ended" {
  const start = Date.parse(c.start_time);
  if (now < start) return "upcoming";
  return now <= start + c.duration_min * 60_000 ? "active" : "ended";
}

export function humanDuration(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60_000));
  if (m < 60) return `${m} minute(s)`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} hour(s)` : `${Math.round(h / 24)} day(s)`;
}

export function countdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const hh = String(Math.floor((s % 86400) / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${d ? d + " day(s) " : ""}${hh}:${mm}:${ss}`;
}
