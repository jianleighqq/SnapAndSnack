"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Camera, Lock } from "lucide-react";
import PinModal from "./PinModal";
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

// Headline size scales with the screen so the layout never scrolls (laptop to 1080p booth).
const headlineSize = { "--hl": "min(18vh, 13vw)" } as React.CSSProperties;

export default function BoothAttractScreen({
  event,
}: BoothAttractScreenProps) {
  const router = useRouter();
  const [currentEvent, setCurrentEvent] = useState<Event | null>(event);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);

  // Sync with latest active event from API on mount/navigation
  useEffect(() => {
    fetch("/api/events")
      .then((res) => res.json())
      .then((data) => {
        if (data.activeEvent) {
          setCurrentEvent(data.activeEvent);
        }
      })
      .catch(() => {});
  }, []);

  // Trigger navigation to shoot screen
  const handleStartShooting = () => {
    if (!isPinModalOpen) {
      router.push("/booth/shoot");
    }
  };

  // Keyboard navigation: Enter or Space starts shooting unless modal is open
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isPinModalOpen) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        router.push("/booth/shoot");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPinModalOpen, router]);

  const eventTitle = currentEvent?.name?.trim() || "Snap & Snack Event";

  return (
    <div
      onClick={handleStartShooting}
      className="relative flex h-screen w-screen cursor-pointer select-none flex-col overflow-hidden bg-paper text-ink"
    >
      {/* TOP BAR: brand mark + quiet Config Settings pill */}
      <header className="flex items-center justify-between gap-6 px-8 pt-6 lg:px-12 lg:pt-8">
        <div className="flex items-center gap-3.5">
          <img
            src="/logo.png"
            alt="Snap & Snack logo"
            className="h-10 w-auto object-contain"
          />
          <span className="font-display text-2xl uppercase tracking-wide">Snap &amp; Snack</span>
        </div>

        <div className="flex items-center gap-4">
          <Label>Config</Label>
          <Hairline strong className="w-10 lg:w-16" />
          <Pill
            variant="secondary"
            size="lg"
            onClick={(e) => {
              e.stopPropagation();
              setIsPinModalOpen(true);
            }}
            className="px-6 text-sm"
            aria-label="Open Operator Config Settings"
          >
            <Lock className="h-4 w-4" />
            <span>Config Settings</span>
          </Pill>
        </div>
      </header>

      {/* CENTER: rails + stacked headline. Rail rows match the headline line height. */}
      <main className="flex flex-1 items-center px-8 lg:px-12" style={headlineSize}>
        <div className="grid w-full grid-cols-[1fr_auto_1fr] items-start gap-x-6 lg:gap-x-8">
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
      <footer className="pb-5">
        <Hairline />
        <Ticker className="pt-4" items={["Snap", "Smile", "Snack", "Repeat"]} />
      </footer>

      {/* PIN Verification Modal */}
      <PinModal
        isOpen={isPinModalOpen}
        onClose={() => setIsPinModalOpen(false)}
      />
    </div>
  );
}
