"use client";
import { useState } from "react";
import { api } from "@/lib/api";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function submit(mode: "login" | "register") {
    setError("");
    try {
      const r = await api<{ token: string; username: string }>(`/api/${mode}`, { body: { username, password } });
      localStorage.setItem("token", r.token);
      localStorage.setItem("username", r.username);
      location.href = "/";
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="card" style={{ maxWidth: 380 }}>
      <h1>Login</h1>
      <div className="row"><input placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} /></div>
      <div className="row"><input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
      {error && <p className="err">{error}</p>}
      <div className="row">
        <button onClick={() => submit("login")}>Login</button>
        <button onClick={() => submit("register")}>Register</button>
      </div>
    </div>
  );
}
