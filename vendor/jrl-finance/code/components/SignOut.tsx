"use client";
import { useTransition } from "react";
import { signOut } from "@/app/actions";

export default function SignOut() {
  const [pending, start] = useTransition();
  return (
    <button
      className="toggle glass signout"
      title="Sign out"
      aria-label="Sign out"
      disabled={pending}
      onClick={() => start(async () => { await signOut(); location.href = "/login"; })}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
      </svg>
    </button>
  );
}
