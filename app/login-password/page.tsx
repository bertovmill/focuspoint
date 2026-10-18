"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      router.push("/");
      router.refresh();
    } else {
      setError("Incorrect password.");
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100dvh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "var(--background)",
      padding: "24px",
    }}>
      <div style={{
        width: "100%",
        maxWidth: "360px",
        display: "flex",
        flexDirection: "column",
        gap: "32px",
      }}>
        {/* Header */}
        <div style={{ textAlign: "center" }}>
          <div style={{
            width: "48px",
            height: "48px",
            borderRadius: "50%",
            background: "hsl(var(--primary))",
            margin: "0 auto 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <h1 style={{
            fontSize: "22px",
            fontWeight: "600",
            color: "hsl(var(--foreground))",
            margin: "0 0 6px",
            letterSpacing: "-0.02em",
          }}>
            Welcome back
          </h1>
          <p style={{
            fontSize: "14px",
            color: "hsl(var(--muted-foreground))",
            margin: 0,
          }}>
            Enter your password to continue to Cael
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{
              fontSize: "13px",
              fontWeight: "500",
              color: "hsl(var(--foreground))",
            }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoFocus
              required
              style={{
                width: "100%",
                padding: "10px 14px",
                fontSize: "15px",
                borderRadius: "8px",
                border: error
                  ? "1px solid hsl(var(--destructive))"
                  : "1px solid hsl(var(--border))",
                background: "hsl(var(--background))",
                color: "hsl(var(--foreground))",
                outline: "none",
                boxSizing: "border-box",
                transition: "border-color 0.15s",
              }}
              onFocus={(e) => {
                if (!error) e.currentTarget.style.borderColor = "hsl(var(--primary))";
              }}
              onBlur={(e) => {
                if (!error) e.currentTarget.style.borderColor = "hsl(var(--border))";
              }}
            />
            {error && (
              <p style={{ fontSize: "13px", color: "hsl(var(--destructive))", margin: 0 }}>
                {error}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || !password}
            style={{
              width: "100%",
              padding: "10px",
              fontSize: "14px",
              fontWeight: "500",
              borderRadius: "8px",
              border: "none",
              background: loading || !password ? "hsl(var(--muted))" : "hsl(var(--primary))",
              color: loading || !password ? "hsl(var(--muted-foreground))" : "hsl(var(--primary-foreground))",
              cursor: loading || !password ? "not-allowed" : "pointer",
              transition: "background 0.15s, color 0.15s",
            }}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
