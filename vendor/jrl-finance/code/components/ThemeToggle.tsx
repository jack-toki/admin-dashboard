"use client";
import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [dark, setDark] = useState<boolean | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("jrl-theme");
    if (stored === "dark" || stored === "light") {
      document.documentElement.setAttribute("data-theme", stored);
      setDark(stored === "dark");
    } else {
      setDark(matchMedia("(prefers-color-scheme:dark)").matches);
    }
  }, []);

  const flip = () => {
    const next = !dark;
    document.documentElement.setAttribute("data-theme", next ? "dark" : "light");
    try { localStorage.setItem("jrl-theme", next ? "dark" : "light"); } catch {}
    setDark(next);
    window.dispatchEvent(new Event("jrl-theme"));
  };

  return (
    <button className="toggle glass" onClick={flip} aria-label="Toggle theme">
      {dark ? "☀" : "☾"}
    </button>
  );
}
