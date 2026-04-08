"use client";

import { useEffect, useState } from "react";

type ThemeMode = "dark" | "light";

const STORAGE_KEY = "scopio-app-theme";

function SunIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4 sm:h-5 sm:w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v2.2" />
      <path d="M12 19.3v2.2" />
      <path d="M21.5 12h-2.2" />
      <path d="M4.7 12H2.5" />
      <path d="M18.7 5.3l-1.6 1.6" />
      <path d="M6.9 17.1l-1.6 1.6" />
      <path d="M18.7 18.7l-1.6-1.6" />
      <path d="M6.9 6.9L5.3 5.3" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4 sm:h-5 sm:w-5"
      fill="currentColor"
    >
      <path d="M20.2 14.1A8.7 8.7 0 0 1 9.9 3.8a.7.7 0 0 0-.9-.9A10 10 0 1 0 21.1 15a.7.7 0 0 0-.9-.9Z" />
    </svg>
  );
}

export default function AppThemeShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const [theme, setTheme] = useState<ThemeMode>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);

    if (saved === "light" || saved === "dark") {
      setTheme(saved);
    }

    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme, mounted]);

  return (
    <div
      className={[
        "app-theme-scope min-h-screen overflow-x-hidden",
        theme === "dark" ? "theme-dark" : "theme-light",
      ].join(" ")}
      style={{
        backgroundColor: "var(--color-bg)",
        color: "var(--color-text)",
      }}
    >
      <div className="hidden sm:fixed sm:right-24 sm:top-6 sm:z-[1000] sm:block">
        <button
          type="button"
          onClick={() =>
            setTheme((prev) => (prev === "dark" ? "light" : "dark"))
          }
          aria-label={
            theme === "dark" ? "Bytt til lys modus" : "Bytt til mørk modus"
          }
          title={theme === "dark" ? "Lys modus" : "Mørk modus"}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border shadow-sm transition hover:-translate-y-[1px]"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-surface)",
            color: "var(--color-text)",
          }}
        >
          {theme === "dark" ? <SunIcon /> : <MoonIcon />}
        </button>
      </div>

      {children}

      <div className="fixed bottom-4 left-4 z-[1000] sm:hidden">
        <button
          type="button"
          onClick={() =>
            setTheme((prev) => (prev === "dark" ? "light" : "dark"))
          }
          aria-label={
            theme === "dark" ? "Bytt til lys modus" : "Bytt til mørk modus"
          }
          title={theme === "dark" ? "Lys modus" : "Mørk modus"}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border shadow-sm"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-surface)",
            color: "var(--color-text)",
          }}
        >
          {theme === "dark" ? <SunIcon /> : <MoonIcon />}
        </button>
      </div>
    </div>
  );
}