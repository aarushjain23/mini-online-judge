"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function Nav() {
  const [user, setUser] = useState<string | null>(null);
  useEffect(() => setUser(localStorage.getItem("username")), []);
  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("username");
    location.href = "/";
  };
  return (
    <nav>
      <Link href="/" className="brand">&lt;&gt; Mini Judge</Link>
      <span className="links">
        <Link href="/">Contests</Link>
        <Link href="/problems">Problems</Link>
        <Link href="/standings">Standings</Link>
      </span>
      {user ? (
        <span className="right">
          <span>{user}</span>
          <button onClick={logout}>Logout</button>
        </span>
      ) : (
        <Link href="/login" className="right">Login</Link>
      )}
    </nav>
  );
}
