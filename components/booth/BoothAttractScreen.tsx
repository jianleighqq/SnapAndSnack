"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Camera, Lock } from "lucide-react";
import type { Event, QueueEntryWithGuest } from "@/lib/types";
import { Pill } from "@/components/ui/Pill";
import { Label } from "@/components/ui/Label";
import { Tile } from "@/components/ui/Tile";
import { Hairline } from "@/components/ui/Hairline";
import { Ticker } from "@/components/ui/Ticker";

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

  // Trigger navigation directly to shoot screen
  const handleStartShooting = () => {
    router.push("/booth/shoot");
  };

  // Keyboard navigation: Enter or Space starts shooting
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        router.push("/booth/shoot");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [router]);

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
              onClick={(e) => {
                e.stopPropagation();
                handleStartShooting();
              }}
              className="animate-soft-pulse w-full min-h-[60px] justify-center text-lg uppercase tracking-wide gap-2.5 shadow-md"
              aria-label="Start Shooting Photo Booth"
            >
              <Camera className="h-6 w-6 shrink-0" />
              <span>Start Shooting</span>
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
                onClick={(e) => {
                  e.stopPropagation();
                  handleStartShooting();
                }}
                className="animate-soft-pulse min-h-[72px] px-9 text-xl lg:min-h-[88px] lg:px-12 lg:text-2xl"
                aria-label="Start Shooting Photo Booth"
              >
                <Camera className="h-6 w-6 shrink-0 lg:h-7 lg:w-7" />
                <span>Start Shooting</span>
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
    </div>
  );
}
