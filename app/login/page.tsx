"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, ArrowRight, AlertTriangle, Loader2, Eye, EyeOff } from "lucide-react";
import { Pill } from "@/components/ui/Pill";
import { Label } from "@/components/ui/Label";
import { Tile } from "@/components/ui/Tile";
import { Hairline } from "@/components/ui/Hairline";
import { getSafeRedirectTarget } from "@/lib/auth";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from") || "/admin/queue";

  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin.trim()) return;

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pin.trim() }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setErrorMessage(data.error || "Incorrect PIN. Please try again.");
        setPin("");
        inputRef.current?.focus();
        return;
      }

      // Safe redirect: ensure `from` is a relative path starting with "/"
      const safeTarget = getSafeRedirectTarget(from, "/admin/queue");
      router.push(safeTarget);
      router.refresh();
    } catch {
      setErrorMessage("Network error connecting to authentication server");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center bg-paper text-ink p-4 sm:p-6">
      {/* Brand Header */}
      <div className="flex flex-col items-center mb-6 space-y-2 text-center">
        <div className="flex items-center gap-3">
          <img
            src="/logo.png"
            alt="Snap & Snack logo"
            className="h-10 w-auto object-contain"
          />
          <span className="font-display text-2xl sm:text-3xl uppercase tracking-wider text-ink">
            Snap &amp; Snack
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Label tone="accent" className="font-mono text-xs tracking-widest font-bold">
            RESTRICTED ACCESS
          </Label>
        </div>
      </div>

      {/* Main Login Tile */}
      <Tile
        tone="surface"
        className="w-full max-w-md p-6 sm:p-8 rounded-tile border border-ink/5 shadow-xs space-y-6 animate-fadeIn"
      >
        <div className="text-center space-y-1.5">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-paper text-ink mb-2">
            <Lock className="h-5 w-5 text-accent" />
          </div>
          <h1 className="font-display text-2xl uppercase tracking-wide text-ink">
            Operator Login
          </h1>
          <p className="text-xs text-muted font-sans">
            Enter your secure operator PIN to access booth controls and event management.
          </p>
        </div>

        <Hairline />

        {/* Error Notification */}
        {errorMessage && (
          <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-danger/10 border border-danger/20 text-danger text-xs font-mono animate-fadeIn">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="flex-1">{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">Security PIN</Label>
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="text-[11px] font-mono text-muted hover:text-ink flex items-center gap-1"
              >
                {showPin ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                <span>{showPin ? "Hide" : "Show"}</span>
              </button>
            </div>

            <input
              ref={inputRef}
              type={showPin ? "text" : "password"}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="••••"
              autoComplete="current-password"
              className="w-full rounded-xl border border-ink/20 bg-paper px-4 py-3 text-center font-mono text-xl tracking-[0.3em] text-ink placeholder:tracking-normal placeholder:text-muted focus:border-ink focus:outline-none"
              required
            />
          </div>

          <Pill
            variant="primary"
            size="lg"
            type="submit"
            disabled={isLoading || !pin.trim()}
            className="w-full min-h-[48px] uppercase tracking-wider font-mono text-xs gap-2"
          >
            {isLoading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Verifying...
              </span>
            ) : (
              <span className="inline-flex items-center gap-2">
                <span>Unlock Console</span>
                <ArrowRight className="h-4 w-4 text-accent" />
              </span>
            )}
          </Pill>
        </form>

        <div className="pt-2 text-center">
          <button
            type="button"
            onClick={() => router.push("/")}
            className="text-xs font-mono text-muted hover:text-ink underline uppercase tracking-wider"
          >
            Return to Attract Screen
          </button>
        </div>
      </Tile>

      {/* Footer */}
      <footer className="mt-8 text-center text-muted font-mono text-[10px] tracking-wider uppercase">
        Protected by Server-Side HMAC Authentication · 12H Session Expiry
      </footer>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-paper font-mono text-xs">
          <Loader2 className="h-6 w-6 text-accent animate-spin mr-2" />
          <span>Loading...</span>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}

