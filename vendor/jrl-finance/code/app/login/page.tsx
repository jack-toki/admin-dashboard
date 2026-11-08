"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const signIn = async () => {
    if (!email || !password || busy) return;
    setBusy(true);
    setError("");
    const { error: err } = await supabaseBrowser().auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (err) {
      setError(
        err.message.toLowerCase().includes("invalid")
          ? "That email and password don't match."
          : err.message
      );
      setBusy(false);
      return;
    }
    router.push("/");
    router.refresh();
  };

  return (
    <>
      <div className="aura" aria-hidden />
      <div className="login-wrap">
        <div className="panel glass login-card">
          <div className="logo" aria-label="JRL">
            <svg viewBox="0 0 100 100" role="img">
              <path d="M18 0H100V82L82 100H0V18Z" fill="var(--ink)" />
              <g fill="var(--knock)">
                <path d="M26 28H36V62Q36 72 26 72H18V63H24Q26 63 26 61Z" />
                <path fillRule="evenodd" d="M40 28H51A11 11 0 0 1 51 50H50V72H40ZM50 35V43H51A4 4 0 0 0 51 35Z" />
                <path d="M49 50H59L63 72H53Z" />
                <path d="M66 28H76V62H82V72H66Z" />
              </g>
            </svg>
          </div>

          <h2>Sign in</h2>
          <p className="sub">Your money, behind a password.</p>
          <div className="entry-input login-input">
            <input
              type="email"
              autoComplete="username"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="entry-input login-input">
            <input
              type="password"
              autoComplete="current-password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && signIn()}
            />
          </div>
          <button className="btn" onClick={signIn} disabled={!email || !password || busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
          {error && <p className="entry-err">{error}</p>}
        </div>
      </div>
    </>
  );
}
