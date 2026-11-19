"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Camera, Lock, Loader2 } from "lucide-react";
import type { Event, QueueEntryWithGuest } from "@/lib/types";
import { Pill } from "@/components/ui/Pill";
import { Label } from "@/components/ui/Label";
import { Tile } from "@/components/ui/Tile";
import { Hairline } from "@/components/ui/Hairline";
import { Ticker } from "@/components/ui/Ticker";
import { Modal } from "@/components/ui/Modal";

interface BoothAttractScreenProps {
  event: Event | null;
  activeGuest?: QueueEntryWithGuest | null;
}

// Headline size scales with the screen so the layout never scrolls on landscape booth displays
const headlineSize = { "--hl": "min(16vh, 12vw)" } as React.CSSProperties;

export default function BoothAttractScreen({
  event,
}: BoothAttractScreenProps) {
  const router = useRouter();
  const [currentEvent] = useState<Event | null>(event);
  const [isChecking, setIsChecking] = useState(false);
  const [showNoGuestModal, setShowNoGuestModal] = useState(false);

  // Request counter to ignore out-of-order responses
  const checkRequestIdRef = useRef<number>(0);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Check if a guest is currently in progress before navigating to the shoot console
  const handleStartShooting = useCallback(async () => {
    if (isChecking) return;
    setIsChecking(true);

    const requestId = ++checkRequestIdRef.current;

    try {
      const res = await fetch("/api/booth/current", { cache: "no-store" });
      if (requestId !== checkRequestIdRef.current) return;

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data?.guest) {
          router.push("/booth/shoot");
          return;
        }
      }

      // 409 or no guest: Show waiting modal directly on attract screen without flashing step screens
      setShowNoGuestModal(true);
    } catch (err) {
      console.warn("Could not check current booth guest:", err);
      // On network failure, also show waiting state
      setShowNoGuestModal(true);
    } finally {
      if (requestId === checkRequestIdRef.current) {
        setIsChecking(false);
      }
    }
  }, [isChecking, router]);

  // While "No guest" modal is open, poll /api/booth/current every 3 seconds
  // Stop polling when page is hidden; ignore out-of-order responses
  useEffect(() => {
    if (!showNoGuestModal) {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      return;
    }

    const pollCurrentGuest = async () => {
      if (typeof document !== "undefined" && document.hidden) return;

      const requestId = ++checkRequestIdRef.current;
      try {
        const res = await fetch("/api/booth/current", { cache: "no-store" });
        if (requestId !== checkRequestIdRef.current) return;

        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          if (data?.guest) {
            setShowNoGuestModal(false);
            router.push("/booth/shoot");
          }
        }
      } catch (err) {
        console.warn("Poll check error:", err);
      }
    };

    pollTimerRef.current = setInterval(pollCurrentGuest, 3000);

    const handleVisibilityChange = () => {
      if (!document.hidden && showNoGuestModal) {
        pollCurrentGuest();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [showNoGuestModal, router]);

  // Keyboard navigation: Enter or Space starts shooting
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showNoGuestModal) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleStartShooting();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleStartShooting, showNoGuestModal]);

  const eventTitle = currentEvent?.name?.trim() || "Snap & Snack Event";

  return (
    <div
      onClick={handleStartShooting}
      className="relative flex min-h-screen w-full max-w-full cursor-pointer select-none flex-col justify-between overflow-x-hidden bg-paper text-ink"
    >
      {/* TOP BAR: brand mark + quiet Config Settings pill */}
      <header className="flex w-full max-w-full items-center justify-between gap-3 px-4 pt-4 sm:px-8 sm:pt-6 lg:px-12 lg:pt-8 shrink-0">
        <div className="flex items-center gap-2.5 sm:gap-3.5 shrink-0">
          <img
            src="/logo.png"
            alt="Snap & Snack logo"
            className="h-8 sm:h-10 w-auto object-contain shrink-0"
          />
          <span className="font-display text-xl sm:text-2xl uppercase tracking-wide whitespace-nowrap">
            Snap &amp; Snack
          </span>
        </div>

        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          <div className="hidden sm:flex items-center gap-2 lg:gap-4">
            <Label>Config</Label>
            <Hairline strong className="w-8 sm:w-10 lg:w-16" />
          </div>
          <Pill
            variant="secondary"
            size="lg"
            onClick={(e) => {
              e.stopPropagation();
              router.push("/login?from=/admin/queue");
            }}
            className="min-h-[44px] px-3 sm:px-6 text-xs sm:text-sm shrink-0"
            aria-label="Open Operator Config Settings"
          >
            <Lock className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Config Settings</span>
          </Pill>
        </div>
      </header>

      {/* CENTER: Responsive presentation */}
      <main className="flex flex-1 items-center justify-center px-4 sm:px-8 lg:px-12 py-4">
        {/* Mobile & Small Screen Vertical Stack (< md) */}
        <div className="flex md:hidden flex-col items-center justify-center text-center w-full max-w-sm mx-auto space-y-6 animate-fadeIn">
          {/* Headline */}
          <h1 className="font-display text-[clamp(3.25rem,14vw,5rem)] uppercase leading-[0.88] tracking-tight text-center">
            <span className="block">Smile</span>
            <span className="block text-accent">&amp; Pose</span>
          </h1>

          {/* Event tile */}
          <Tile tone="sun" className="w-full px-5 py-4 sm:px-6 sm:py-5 text-center shadow-xs rounded-tile">
            <Label tone="inherit" className="opacity-70">
              Now hosting
            </Label>
            <p className="mt-1.5 line-clamp-2 font-display text-2xl uppercase leading-none">
              {eventTitle}
            </p>
          </Tile>

          {/* Start Shooting Button */}
          <div className="w-full pt-1 flex flex-col items-center space-y-3">
            <Pill
              variant="primary"
              size="lg"
              disabled={isChecking}
              onClick={(e) => {
                e.stopPropagation();
                handleStartShooting();
              }}
              className="animate-soft-pulse w-full min-h-[60px] justify-center text-lg uppercase tracking-wide gap-2.5 shadow-md"
              aria-label="Start Shooting Photo Booth"
            >
              {isChecking ? (
                <>
                  <Loader2 className="h-6 w-6 animate-spin shrink-0" />
                  <span>Checking Booth...</span>
                </>
              ) : (
                <>
                  <Camera className="h-6 w-6 shrink-0" />
                  <span>Start Shooting</span>
                </>
              )}
            </Pill>
            <Label className="text-muted text-[11px]">Tap anywhere to begin</Label>
          </div>
        </div>

        {/* Tablet Landscape & Desktop 3-Column Rail Grid (md:) */}
        <div
          className="hidden md:grid w-full grid-cols-[1fr_auto_1fr] items-start gap-x-6 lg:gap-x-8"
          style={headlineSize}
        >
          {/* Left rail */}
          <div className="flex min-w-0 flex-col">
            <div className="flex h-[calc(var(--hl)*0.9)] items-center justify-end gap-4">
              <Label tone="ink">What&apos;s next</Label>
              <Hairline strong className="w-16 lg:w-24" />
            </div>
            <div className="flex h-[calc(var(--hl)*0.9)] items-center">
              <Hairline strong className="-ml-8 min-w-6 flex-1 lg:-ml-12" />
              <Pill
                variant="primary"
                size="lg"
                disabled={isChecking}
                onClick={(e) => {
                  e.stopPropagation();
                  handleStartShooting();
                }}
                className="animate-soft-pulse min-h-[72px] px-9 text-xl lg:min-h-[88px] lg:px-12 lg:text-2xl"
                aria-label="Start Shooting Photo Booth"
              >
                {isChecking ? (
                  <>
                    <Loader2 className="h-6 w-6 animate-spin shrink-0 lg:h-7 lg:w-7" />
                    <span>Checking...</span>
                  </>
                ) : (
                  <>
                    <Camera className="h-6 w-6 shrink-0 lg:h-7 lg:w-7" />
                    <span>Start Shooting</span>
                  </>
                )}
              </Pill>
              <Hairline strong className="w-6 shrink-0 lg:w-10" />
            </div>
          </div>

          {/* Headline + event tile */}
          <div className="flex flex-col items-center">
            <h1 className="text-center font-display text-[length:var(--hl)] uppercase leading-[0.9] tracking-tight">
              <span className="block">Smile</span>
              <span className="block text-accent">&amp; Pose</span>
            </h1>

            <Tile tone="sun" className="mt-6 w-full max-w-[min(42vw,640px)] px-8 py-6 text-center lg:mt-8">
              <Label tone="inherit" className="opacity-70">
                Now hosting
              </Label>
              <p className="mt-2 line-clamp-2 font-display text-[clamp(1.75rem,4.5vh,3.25rem)] uppercase leading-none">
                {eventTitle}
              </p>
            </Tile>
          </div>

          {/* Right rail */}
          <div className="flex min-w-0 flex-col">
            <div className="flex h-[calc(var(--hl)*0.9)] items-center gap-4">
              <Hairline strong className="w-10 shrink-0 lg:w-16" />
              <Label tone="ink" className="shrink-0">
                Photo booth
              </Label>
              <Hairline strong className="-mr-8 min-w-6 flex-1 lg:-mr-12" />
            </div>
            <div className="flex h-[calc(var(--hl)*0.9)] items-center">
              <Label>Tap anywhere to begin</Label>
            </div>
          </div>
        </div>
      </main>

      {/* BOTTOM: static mono ticker */}
      <footer className="w-full max-w-full pb-4 sm:pb-5 overflow-hidden shrink-0">
        <Hairline />
        <div className="w-full max-w-full overflow-hidden">
          <Ticker className="pt-3 sm:pt-4" items={["Snap", "Smile", "Snack", "Repeat"]} />
        </div>
      </footer>

      {/* NO GUEST IS BEING CALLED MODAL */}
      <Modal
        isOpen={showNoGuestModal}
        onClose={() => setShowNoGuestModal(false)}
        ariaLabel="Booth waiting for guest"
        zIndex="z-50"
      >
        <Tile
          tone="surface"
          className="max-w-md w-full p-6 sm:p-8 text-center space-y-4 shadow-2xl border border-ink/10"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-14 h-14 mx-auto rounded-full bg-paper flex items-center justify-center text-accent">
            <Camera className="w-7 h-7" />
          </div>
          <div>
            <Label className="block mb-1">Booth Waiting</Label>
            <h2 className="font-display text-3xl uppercase tracking-tight text-ink">
              No guest is being called
            </h2>
          </div>
          <p className="text-sm text-muted">
            The operator has not called a guest to the booth yet. Use Call Next on the Queue Board to begin a session.
          </p>
          <div className="pt-2 flex flex-col items-center gap-3">
            <div className="flex items-center gap-2 font-mono text-xs text-muted">
              <span className="h-2 w-2 rounded-full bg-accent animate-ping" />
              <span>Waiting for operator... will start automatically</span>
            </div>
            <Pill
              variant="secondary"
              size="md"
              onClick={() => setShowNoGuestModal(false)}
              className="uppercase tracking-wider font-mono text-xs min-h-[44px]"
            >
              Back to Home
            </Pill>
          </div>
        </Tile>
      </Modal>
    </div>
  );
}
