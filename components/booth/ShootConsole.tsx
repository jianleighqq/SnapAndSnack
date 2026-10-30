"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  RotateCcw,
  Check,
  Printer,
  QrCode,
  CloudUpload,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  Heart,
  Users,
  Smile,
  Hand,
  Loader2,
  X,
  Sparkles,
  Shuffle,
  Plus,
} from "lucide-react";
import { Pill } from "@/components/ui/Pill";
import { Label } from "@/components/ui/Label";
import { Tile } from "@/components/ui/Tile";
import { Hairline } from "@/components/ui/Hairline";
import { hardware } from "@/lib/hardware";
import { composePrintLayout } from "@/lib/layout";
import type { QueueEntryWithGuest, Event } from "@/lib/types";

export type ShootStep = "choose" | "countdown" | "preview" | "output";
export type CaptureType = "Photo" | "GIF" | "Video";
export type PreviewMode = "single" | "summary";

export const POSE_PREVIEW_PAUSE_MS = 3000;

export interface PoseOption {
  id: string;
  name: string;
  subtitle: string;
  icon: React.ElementType;
}

export const POSES: PoseOption[] = [
  { id: "couple", name: "Classic couple", subtitle: "Close & timeless", icon: Heart },
  { id: "group", name: "Group", subtitle: "Squad shoulder-to-shoulder", icon: Users },
  { id: "peace", name: "Peace sign", subtitle: "Retro booth double V", icon: Hand },
  { id: "funny", name: "Funny face", subtitle: "Wild expressions, zero filter", icon: Smile },
];

export interface CapturedShot {
  image: string;
  poseId: string;
}

export default function ShootConsole() {
  const router = useRouter();

  // Active event & queue data
  const [activeEvent, setActiveEvent] = useState<Event | null>(null);
  const [activeEntry, setActiveEntry] = useState<QueueEntryWithGuest | null>(null);
  const [isLoadingGuest, setIsLoadingGuest] = useState(true);

  // Step state
  const [step, setStep] = useState<ShootStep>("choose");

  // Step 1: Per-shot pose slot selections
  const totalShots = Math.max(1, Math.min(4, activeEvent?.shots_per_guest || 3));
  const maxRetakesAllowed = activeEvent?.max_retakes ?? 2;

  const [selectedPoses, setSelectedPoses] = useState<(string | null)[]>([null, null, null]);
  const [activeSlotIndex, setActiveSlotIndex] = useState<number>(0);
  const [captureType, setCaptureType] = useState<CaptureType>("Photo");

  // Step 2: Multi-shot & Countdown
  const [currentShotIndex, setCurrentShotIndex] = useState(0);
  const [retakeTargetIndex, setRetakeTargetIndex] = useState<number | null>(null);
  const [capturedShots, setCapturedShots] = useState<CapturedShot[]>([]);
  const shotsRef = useRef<CapturedShot[]>([]);
  const [retakesLeft, setRetakesLeft] = useState<number[]>([2, 2, 2, 2]);

  // Countdown state: intro pose preview (3s) -> numerical 3-2-1
  const [countdownPhase, setCountdownPhase] = useState<"intro" | "counting">("intro");
  const [currentPoseInfo, setCurrentPoseInfo] = useState<PoseOption>(POSES[0]);
  const [countdownNumber, setCountdownNumber] = useState<number | null>(null);
  const [isFlashing, setIsFlashing] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const poseIntroTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Step 3: Single Review & Summary Mode
  const [previewMode, setPreviewMode] = useState<PreviewMode>("single");
  const [reviewIndex, setReviewIndex] = useState(0);

  // Step 4: Composed Print Layout & Output States
  const [composedImageUrl, setComposedImageUrl] = useState<string | null>(null);
  const [printStatus, setPrintStatus] = useState<"idle" | "working" | "done" | "failed">("idle");
  const [printMessage, setPrintMessage] = useState<string | null>(null);

  const [showQrTile, setShowQrTile] = useState(false);
  const [galleryStatus, setGalleryStatus] = useState<"idle" | "working" | "done" | "failed">("idle");

  // Confirmation Modals
  const [showCancelPrompt, setShowCancelPrompt] = useState(false);
  const [showRetakeAllPrompt, setShowRetakeAllPrompt] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);

  // Keep selectedPoses length synchronized with event shots_per_guest
  useEffect(() => {
    setSelectedPoses((prev) => {
      if (prev.length === totalShots) return prev;
      const next = new Array(totalShots).fill(null);
      for (let i = 0; i < Math.min(prev.length, totalShots); i++) {
        next[i] = prev[i];
      }
      return next;
    });
    setRetakesLeft(new Array(totalShots).fill(maxRetakesAllowed));
  }, [totalShots, maxRetakesAllowed]);

  // 1. Fetch current queue & active event on mount
  useEffect(() => {
    let isMounted = true;

    async function initQueueSession() {
      try {
        const res = await fetch("/api/queue");
        if (!res.ok) throw new Error("Failed to load queue");
        const data = await res.json();
        const queue: QueueEntryWithGuest[] = data.queue || [];
        if (data.event) {
          setActiveEvent(data.event);
          const limit = data.event.max_retakes ?? 2;
          const count = data.event.shots_per_guest ?? 3;
          setRetakesLeft(new Array(count).fill(limit));
          setSelectedPoses(new Array(count).fill(null));
        }

        const inProgress = queue.find((q) => q.status === "IN_PROGRESS");
        if (inProgress) {
          if (isMounted) {
            setActiveEntry(inProgress);
            setIsLoadingGuest(false);
          }
          return;
        }

        const nextWaiting = queue.find((q) => q.status === "WAITING" || q.status === "REMINDED");
        if (nextWaiting) {
          const startRes = await fetch("/api/queue", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "start", queueId: nextWaiting.id }),
          });
          const startData = await startRes.json();
          if (isMounted && startData.started) {
            setActiveEntry(startData.started);
            setIsLoadingGuest(false);
            return;
          }
        }

        if (isMounted) {
          setActiveEntry({
            id: "q_active_fallback",
            event_id: data.event?.id || "evt_active",
            guest_id: "gst_fallback",
            queue_number: 1,
            scheduled_shoot_time: null,
            status: "IN_PROGRESS",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            guest: {
              id: "gst_fallback",
              event_id: data.event?.id || "evt_active",
              full_name: "Walk-in Guest",
              email: "guest@example.com",
              guest_token: "tok_walkin",
              created_at: new Date().toISOString(),
            },
          });
          setIsLoadingGuest(false);
        }
      } catch (err) {
        console.error("Error setting up shoot guest:", err);
        if (isMounted) {
          setIsLoadingGuest(false);
        }
      }
    }

    initQueueSession();

    return () => {
      isMounted = false;
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      if (poseIntroTimeoutRef.current) clearTimeout(poseIntroTimeoutRef.current);
    };
  }, []);

  // Tapping a pose tile fills the active slot and advances to the next empty slot
  const handleSelectPoseForActiveSlot = (poseId: string) => {
    setSelectedPoses((prev) => {
      const next = [...prev];
      next[activeSlotIndex] = poseId;

      // Find next empty slot
      const nextEmpty = next.findIndex((p, idx) => idx > activeSlotIndex && p === null);
      if (nextEmpty !== -1) {
        setActiveSlotIndex(nextEmpty);
      } else {
        const anyEmpty = next.findIndex((p) => p === null);
        if (anyEmpty !== -1) {
          setActiveSlotIndex(anyEmpty);
        }
      }
      return next;
    });
  };

  // "Surprise me": Fills all empty slots with random poses
  const handleSurpriseMe = () => {
    setSelectedPoses((prev) => {
      return prev.map((p) => {
        if (p !== null) return p;
        const random = POSES[Math.floor(Math.random() * POSES.length)];
        return random.id;
      });
    });
  };

  // Are all slots assigned?
  const allPosesSelected =
    selectedPoses.length === totalShots && selectedPoses.every((p) => p !== null);

  // Helper to get pose option from id
  const getPoseById = (poseId: string | null): PoseOption => {
    if (!poseId) return POSES[0];
    return POSES.find((p) => p.id === poseId || p.name === poseId) || POSES[0];
  };

  // Start fresh sequence from Shot 1
  const handleStartSequence = () => {
    if (!allPosesSelected) return;
    shotsRef.current = [];
    setCapturedShots([]);
    setCurrentShotIndex(0);
    setRetakeTargetIndex(null);
    setReviewIndex(0);
    setPreviewMode("single");
    startPoseIntroAndCountdown(0, null);
  };

  // Start retake of a single shot
  const handleRetakeSingleShot = (shotIdx: number) => {
    if ((retakesLeft[shotIdx] ?? 0) <= 0) return;
    setRetakeTargetIndex(shotIdx);
    setCurrentShotIndex(shotIdx);
    startPoseIntroAndCountdown(shotIdx, shotIdx);
  };

  // Confirm and run Retake All
  const handleConfirmRetakeAll = () => {
    setShowRetakeAllPrompt(false);
    setRetakesLeft((prev) => prev.map((r) => Math.max(0, r - 1)));
    handleStartSequence();
  };

  // 3-second pose preview, followed by 3-2-1 numerical countdown
  const startPoseIntroAndCountdown = (shotIdx: number, retakeIdx: number | null) => {
    setCaptureError(null);
    setStep("countdown");

    // Determine pose for this shot
    const poseId =
      retakeIdx !== null
        ? shotsRef.current[retakeIdx]?.poseId || selectedPoses[retakeIdx]
        : selectedPoses[shotIdx];
    const poseOption = getPoseById(poseId);
    setCurrentPoseInfo(poseOption);

    // Phase 1: 3-second pose intro pause
    setCountdownPhase("intro");
    setCountdownNumber(null);

    if (poseIntroTimeoutRef.current) clearTimeout(poseIntroTimeoutRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);

    poseIntroTimeoutRef.current = setTimeout(() => {
      // Phase 2: Numerical countdown 3, 2, 1
      setCountdownPhase("counting");
      setCountdownNumber(3);

      let count = 3;
      countdownIntervalRef.current = setInterval(() => {
        count -= 1;
        if (count > 0) {
          setCountdownNumber(count);
        } else {
          if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
          setCountdownNumber(null);
          triggerShutterCapture(shotIdx, retakeIdx, poseOption.id);
        }
      }, 1000);
    }, POSE_PREVIEW_PAUSE_MS);
  };

  // Shutter capture call
  const triggerShutterCapture = async (
    shotIdx: number,
    retakeIdx: number | null,
    poseId: string
  ) => {
    setIsFlashing(true);
    setTimeout(() => setIsFlashing(false), 200);

    setIsCapturing(true);
    setCaptureError(null);

    try {
      const poseOption = getPoseById(poseId);
      const result = await hardware.capture({
        type: captureType,
        pose: poseOption.name,
      });

      if (!result.success || !result.imageUrl) {
        setCaptureError(result.message || "Failed to capture frame from camera. Please retry.");
        setIsCapturing(false);
        return;
      }

      setIsCapturing(false);

      if (retakeIdx !== null) {
        // Retake a specific shot in-place, keeping original poseId
        shotsRef.current[retakeIdx] = { image: result.imageUrl!, poseId };
        const updated = [...shotsRef.current];
        setCapturedShots(updated);

        // Decrement retakes for this shot
        setRetakesLeft((prev) => {
          const next = [...prev];
          next[retakeIdx] = Math.max(0, (next[retakeIdx] ?? 1) - 1);
          return next;
        });

        // Re-compose layout
        setComposedImageUrl(
          composePrintLayout({
            shots: updated.map((s) => s.image),
            layout: activeEvent?.print_layout || "STRIP",
            eventName: activeEvent?.name || "Snap & Snack Event",
            eventCode: activeEvent?.event_code || "SNAP",
            dateStr: activeEvent?.start_time,
          })
        );

        setRetakeTargetIndex(null);
        setReviewIndex(retakeIdx);
        setPreviewMode("single");
        setStep("preview");
      } else {
        // Multi-shot sequence
        shotsRef.current[shotIdx] = { image: result.imageUrl!, poseId };
        const updated = [...shotsRef.current];
        setCapturedShots(updated);

        if (shotIdx + 1 < totalShots) {
          const nextIndex = shotIdx + 1;
          setCurrentShotIndex(nextIndex);
          startPoseIntroAndCountdown(nextIndex, null);
        } else {
          // All shots captured -> start Step 3 single-shot review at Shot 1
          setReviewIndex(0);
          setPreviewMode("single");
          setStep("preview");
        }
      }
    } catch (err: any) {
      setCaptureError(err?.message || "Hardware error during capture. Please check camera and retry.");
      setIsCapturing(false);
    }
  };

  // Keep & Next / Keep & Finish transition
  const handleKeepAndNext = () => {
    if (reviewIndex < totalShots - 1) {
      setReviewIndex((prev) => prev + 1);
    } else {
      // After last shot, show the composed summary screen
      const currentList = shotsRef.current.length > 0 ? shotsRef.current : capturedShots;
      const composed = composePrintLayout({
        shots: currentList.map((s) => s.image),
        layout: activeEvent?.print_layout || "STRIP",
        eventName: activeEvent?.name || "Snap & Snack Event",
        eventCode: activeEvent?.event_code || "SNAP",
        dateStr: activeEvent?.start_time,
      });
      setComposedImageUrl(composed);
      setPreviewMode("summary");
    }
  };

  // Step 4: Advance to Output
  const handleLooksGood = () => {
    if (!composedImageUrl) {
      const currentList = shotsRef.current.length > 0 ? shotsRef.current : capturedShots;
      const composed = composePrintLayout({
        shots: currentList.map((s) => s.image),
        layout: activeEvent?.print_layout || "STRIP",
        eventName: activeEvent?.name || "Snap & Snack Event",
        eventCode: activeEvent?.event_code || "SNAP",
        dateStr: activeEvent?.start_time,
      });
      setComposedImageUrl(composed);
    }
    setStep("output");
  };

  // Step 4: Hardware Print action
  const handlePrint = async () => {
    if (printStatus === "working") return;
    setPrintStatus("working");
    setPrintMessage(null);

    try {
      const result = await hardware.print(composedImageUrl || undefined);
      if (result.success) {
        setPrintStatus("done");
        setPrintMessage(`Printed successfully (${result.paperLoaded} sheets remaining)`);
      } else {
        setPrintStatus("failed");
        setPrintMessage(result.message);
      }
    } catch (err: any) {
      setPrintStatus("failed");
      setPrintMessage("Printer communication error. Ask the operator.");
    }
  };

  // Step 4: Save to Gallery action
  const handleSaveToGallery = async () => {
    if (galleryStatus === "working") return;
    setGalleryStatus("working");

    setTimeout(() => {
      setGalleryStatus("done");
    }, 700);
  };

  // Step 4: Mark COMPLETED and return to attract screen
  const handleFinishDone = async () => {
    setIsFinishing(true);
    try {
      if (activeEntry?.id) {
        await fetch("/api/queue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "finish",
            queueId: activeEntry.id,
          }),
        });
      }
    } catch (err) {
      console.warn("Could not mark completed in API:", err);
    } finally {
      router.push("/");
    }
  };

  // Cancel shoot: clears all state and slots, returns to attract screen "/"
  const handleConfirmCancel = () => {
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    if (poseIntroTimeoutRef.current) clearTimeout(poseIntroTimeoutRef.current);

    shotsRef.current = [];
    setCapturedShots([]);
    setSelectedPoses(new Array(totalShots).fill(null));
    setActiveSlotIndex(0);
    setCurrentShotIndex(0);
    setRetakeTargetIndex(null);
    setReviewIndex(0);
    setPreviewMode("single");
    setCountdownNumber(null);
    setCountdownPhase("intro");
    setIsCapturing(false);
    setCaptureError(null);
    setShowCancelPrompt(false);
    setShowRetakeAllPrompt(false);
    setComposedImageUrl(null);
    setPrintStatus("idle");
    setGalleryStatus("idle");
    setShowQrTile(false);
    setRetakesLeft(new Array(totalShots).fill(maxRetakesAllowed));
    router.push("/");
  };

  const guestNumber = activeEntry ? String(activeEntry.queue_number).padStart(2, "0") : "--";
  const guestName = activeEntry?.guest?.full_name || "Guest";
  const guestToken = activeEntry?.guest?.guest_token || "sample_token";
  const layoutLabel = activeEvent?.print_layout || "STRIP";

  // Retake metrics
  const currentRetakesLeft = retakesLeft[reviewIndex] ?? maxRetakesAllowed;
  const canRetakeCurrentShot = currentRetakesLeft > 0;
  const canRetakeAll = retakesLeft.slice(0, totalShots).every((r) => r > 0);

  const CurrentPoseIcon = currentPoseInfo.icon;

  return (
    <div className="relative flex h-screen max-h-screen w-full max-w-full select-none flex-col justify-between overflow-hidden bg-paper text-ink p-4 sm:p-6 lg:p-8">
      {/* FLASH OVERLAY */}
      {isFlashing && (
        <div className="fixed inset-0 z-50 pointer-events-none bg-white transition-opacity duration-200" />
      )}

      {/* TOP BAR: Mono label with guest info, step progress, and cancel button */}
      <header className="relative z-10 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
          <div className="flex items-center gap-3">
            <span className="font-display text-xl uppercase tracking-wider text-ink">
              Snap &amp; Snack
            </span>
            <div className="h-4 w-px bg-ink/20" />
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
              <Label className="text-ink font-semibold">
                GUEST #{guestNumber} · {guestName.toUpperCase()}
              </Label>
            </div>
            <span className="hidden sm:inline-block font-mono text-[10px] bg-ink/5 px-2 py-0.5 rounded-full text-muted uppercase">
              {totalShots} {totalShots === 1 ? "SHOT" : "SHOTS"} · {layoutLabel}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Label className="text-muted">
              {step === "choose" && "STEP 1 OF 4 · CHOOSE POSES"}
              {step === "countdown" && "STEP 2 OF 4 · GET READY"}
              {step === "preview" &&
                (previewMode === "single"
                  ? `STEP 3 OF 4 · REVIEW (${reviewIndex + 1}/${totalShots})`
                  : "STEP 3 OF 4 · REVIEW SUMMARY")}
              {step === "output" && "STEP 4 OF 4 · COLLECT"}
            </Label>

            {/* Cancel shoot button stays accessible in steps 1 and 2 */}
            {(step === "choose" || step === "countdown") && (
              <button
                type="button"
                onClick={() => setShowCancelPrompt(true)}
                className="interactive-secondary inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-ink/20 px-3.5 text-xs font-mono uppercase tracking-wider text-muted transition-all"
                aria-label="Cancel Shoot"
              >
                <X className="h-3.5 w-3.5" />
                <span>Cancel Shoot</span>
              </button>
            )}
          </div>
        </div>
        <Hairline />
      </header>

      {/* MAIN STEP CONTENT - Viewport constrained with zero scroll on 1920x1080 and 1470x956 */}
      <main className="relative z-10 flex flex-1 flex-col justify-center overflow-hidden py-2 sm:py-3">
        {/* STEP 1: CHOOSE PER-SHOT POSES */}
        {step === "choose" && (
          <div className="mx-auto flex h-full max-h-[calc(100vh-140px)] w-full max-w-5xl flex-col justify-between animate-fadeIn">
            {/* Header / Subtitle */}
            <div className="text-center space-y-1">
              <Label tone="accent">Step 01 · Plan Your Sequence</Label>
              <h1 className="font-display text-[clamp(28px,4.5vh,48px)] uppercase tracking-tight leading-tight">
                Pick Your <span className="text-accent">Poses</span>
              </h1>
              <p className="font-sans text-xs sm:text-sm text-muted">
                Choose a pose for each of your {totalShots} photos. Tap any slot to assign or reassign.
              </p>
            </div>

            {/* N POSE SLOTS ROW (Always fits 1 row: 2 to 4 slots) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between px-1">
                <Label className="text-ink font-semibold">Your Shot Sequence</Label>
                <button
                  type="button"
                  onClick={handleSurpriseMe}
                  className="interactive-secondary inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-ink/20 bg-paper px-3 text-[11px] font-mono uppercase tracking-wider text-ink transition-all"
                >
                  <Shuffle className="h-3.5 w-3.5 text-accent" />
                  <span>Surprise me</span>
                </button>
              </div>

              <div
                className={`grid gap-2.5 sm:gap-3 w-full ${
                  totalShots === 1
                    ? "grid-cols-1 max-w-sm mx-auto"
                    : totalShots === 2
                    ? "grid-cols-2"
                    : totalShots === 3
                    ? "grid-cols-3"
                    : "grid-cols-4"
                }`}
              >
                {Array.from({ length: totalShots }).map((_, slotIdx) => {
                  const poseId = selectedPoses[slotIdx];
                  const isFilled = poseId !== null;
                  const isActive = activeSlotIndex === slotIdx;
                  const poseObj = isFilled ? getPoseById(poseId) : null;
                  const IconComp = poseObj ? poseObj.icon : Plus;

                  return (
                    <button
                      key={slotIdx}
                      type="button"
                      onClick={() => setActiveSlotIndex(slotIdx)}
                      data-selected={isActive ? "true" : undefined}
                      className={`relative flex min-h-[58px] sm:min-h-[64px] items-center gap-2.5 p-2.5 sm:p-3 rounded-tile text-left overflow-hidden ${
                        isActive
                          ? "is-selected bg-ink text-paper ring-2 ring-accent"
                          : isFilled
                          ? "interactive-tile bg-surface text-ink border border-ink/10"
                          : "interactive-tile border-2 border-dashed border-ink/20 bg-paper/50 text-muted"
                      }`}
                    >
                      <div
                        className={`flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-full ${
                          isActive
                            ? "bg-paper/15 text-accent"
                            : isFilled
                            ? "bg-paper text-accent"
                            : "bg-ink/5 text-muted"
                        }`}
                      >
                        <IconComp className="h-4 w-4" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <span
                            className={`font-mono text-[9px] uppercase tracking-wider ${
                              isActive ? "text-accent font-bold" : "text-muted"
                            }`}
                          >
                            SHOT {slotIdx + 1}
                          </span>
                          {isActive && (
                            <span className="h-1.5 w-1.5 rounded-full bg-accent animate-ping" />
                          )}
                        </div>
                        <div className="font-display text-xs sm:text-sm uppercase tracking-wide truncate">
                          {isFilled ? poseObj?.name : "Select pose"}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* POSE CATALOG TILES */}
            <div className="space-y-1.5">
              <Label className="text-muted text-[10px]">
                Available Poses · Tap to fill Shot {activeSlotIndex + 1}
              </Label>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 max-h-[22vh]">
                {POSES.map((pose) => {
                  const IconComponent = pose.icon;
                  const isCurrentSlotPose = selectedPoses[activeSlotIndex] === pose.id;

                  return (
                    <button
                      key={pose.id}
                      type="button"
                      onClick={() => handleSelectPoseForActiveSlot(pose.id)}
                      data-selected={isCurrentSlotPose ? "true" : undefined}
                      className={`group relative flex flex-col items-center justify-between p-2.5 sm:p-3 text-center rounded-tile min-h-[clamp(85px,13vh,120px)] ${
                        isCurrentSlotPose
                          ? "is-selected bg-surface ring-2 ring-accent text-ink cursor-default"
                          : "interactive-tile bg-surface text-ink border border-transparent"
                      }`}
                    >
                      <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full bg-paper text-accent mb-1 tile-icon-badge">
                        <IconComponent className="h-4 w-4 sm:h-5 sm:w-5" />
                      </div>
                      <div>
                        <div className="font-display text-xs sm:text-sm uppercase tracking-wide">
                          {pose.name}
                        </div>
                        <div className="text-[10px] text-muted line-clamp-1 mt-0.5">
                          {pose.subtitle}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Capture Type Pill Toggles */}
            <div className="flex flex-col items-center justify-center gap-1.5 pt-1">
              <Label>Capture Type</Label>
              <div className="inline-flex rounded-full bg-surface p-1">
                {(["Photo", "GIF", "Video"] as CaptureType[]).map((type) => {
                  const isActive = captureType === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setCaptureType(type)}
                      data-selected={isActive ? "true" : undefined}
                      className={`min-h-[44px] px-5 sm:px-7 rounded-full text-xs font-mono font-medium uppercase tracking-wider ${
                        isActive
                          ? "is-selected bg-ink text-paper"
                          : "interactive-secondary text-muted hover:text-ink bg-transparent border border-transparent"
                      }`}
                    >
                      {type}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Start Countdown Button & Validation Label */}
            <div className="flex flex-col items-center justify-center gap-1.5 pt-1">
              {!allPosesSelected && (
                <Label tone="accent" className="font-bold text-[10px] tracking-[0.2em]">
                  PICK A POSE FOR EVERY SHOT
                </Label>
              )}

              <Pill
                variant="primary"
                size="lg"
                disabled={!allPosesSelected}
                onClick={handleStartSequence}
                className="w-full max-w-md text-base sm:text-lg uppercase tracking-wider font-display min-h-[52px]"
              >
                <span>Start Countdown</span>
                <ArrowRight className="h-5 w-5" />
              </Pill>

              <button
                type="button"
                onClick={() => setShowCancelPrompt(true)}
                className="text-xs font-mono uppercase tracking-wider text-muted hover:text-ink py-1 min-h-[36px]"
              >
                Cancel Shoot
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: COUNTDOWN & INTRO POSE PREVIEW */}
        {step === "countdown" && (
          <div className="mx-auto flex h-full max-h-[calc(100vh-140px)] w-full max-w-4xl flex-col items-center justify-between animate-fadeIn">
            {/* Viewfinder Tile */}
            <div className="relative flex aspect-[4/3] w-full max-h-[54vh] flex-col items-center justify-center overflow-hidden rounded-tile bg-[#181614] text-paper shadow-2xl border border-ink/10">
              {/* Corner Framing Marks */}
              <div className="pointer-events-none absolute inset-4 sm:inset-6 flex flex-col justify-between">
                <div className="flex justify-between">
                  <div className="h-5 w-5 sm:h-6 sm:w-6 border-l-2 border-t-2 border-paper/40" />
                  <div className="h-5 w-5 sm:h-6 sm:w-6 border-r-2 border-t-2 border-paper/40" />
                </div>
                <div className="flex justify-between">
                  <div className="h-5 w-5 sm:h-6 sm:w-6 border-l-2 border-b-2 border-paper/40" />
                  <div className="h-5 w-5 sm:h-6 sm:w-6 border-r-2 border-b-2 border-paper/40" />
                </div>
              </div>

              {/* Viewfinder Header Metadata */}
              <div className="absolute top-4 sm:top-6 left-4 sm:left-6 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-accent animate-ping" />
                <Label className="text-paper/80 font-bold">
                  {retakeTargetIndex !== null
                    ? `RETAKING SHOT ${retakeTargetIndex + 1} OF ${totalShots}`
                    : `SHOT ${currentShotIndex + 1} OF ${totalShots}`}
                </Label>
              </div>

              <div className="absolute top-4 sm:top-6 right-4 sm:right-6">
                <Label className="text-paper/80">MODE: {captureType.toUpperCase()}</Label>
              </div>

              {/* PHASE 1: 3-SECOND POSE INTRO SCREEN BEFORE COUNTDOWN */}
              {countdownPhase === "intro" && !captureError && (
                <div className="flex flex-col items-center justify-center text-center p-6 space-y-3 animate-scaleIn select-none">
                  <div className="flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-full bg-accent/20 text-accent mb-1 border border-accent/40">
                    <CurrentPoseIcon className="h-8 w-8 sm:h-10 sm:w-10" />
                  </div>
                  <div>
                    <Label tone="accent" className="font-bold tracking-[0.2em] mb-1 block">
                      {retakeTargetIndex !== null
                        ? `SHOT ${retakeTargetIndex + 1} OF ${totalShots} · GET READY`
                        : `SHOT ${currentShotIndex + 1} OF ${totalShots} · GET READY`}
                    </Label>
                    <h2 className="font-display text-[clamp(44px,7.5vh,80px)] uppercase tracking-tight text-paper leading-none">
                      {currentPoseInfo.name}
                    </h2>
                    <p className="text-xs sm:text-sm text-paper/70 font-sans mt-1">
                      {currentPoseInfo.subtitle}
                    </p>
                  </div>
                  <div className="pt-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-paper/10 px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-paper/80">
                      <Sparkles className="h-3 w-3 text-accent animate-spin" />
                      Strike pose · Countdown starting...
                    </span>
                  </div>
                </div>
              )}

              {/* PHASE 2: HUGE ANTON NUMERICAL COUNTDOWN (3, 2, 1) */}
              {countdownPhase === "counting" && countdownNumber !== null && !captureError && (
                <div className="flex flex-col items-center justify-center">
                  <div
                    key={countdownNumber}
                    className="font-display text-[clamp(90px,18vh,160px)] leading-none text-accent animate-scaleIn select-none"
                  >
                    {countdownNumber}
                  </div>
                  <Label className="text-paper/70 tracking-[0.2em] mt-2 font-bold uppercase">
                    {currentPoseInfo.name} · HOLD IT
                  </Label>
                </div>
              )}

              {/* Shutter Processing State */}
              {isCapturing && !captureError && (
                <div className="flex flex-col items-center justify-center gap-3">
                  <Loader2 className="h-12 w-12 animate-spin text-accent" />
                  <Label className="text-paper/90 font-bold">CAPTURING FRAME...</Label>
                </div>
              )}

              {/* Error UI: Hardware Capture Failed */}
              {captureError && (
                <div className="flex max-w-md flex-col items-center justify-center p-6 text-center z-20">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-danger/20 text-danger">
                    <AlertTriangle className="h-6 w-6" />
                  </div>
                  <h3 className="font-display text-xl uppercase tracking-tight text-paper mb-1">
                    Camera Error
                  </h3>
                  <p className="text-xs sm:text-sm text-paper/80 mb-5 font-sans">{captureError}</p>
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <Pill
                      variant="accent"
                      size="md"
                      onClick={() =>
                        triggerShutterCapture(
                          currentShotIndex,
                          retakeTargetIndex,
                          currentPoseInfo.id
                        )
                      }
                    >
                      <RotateCcw className="h-4 w-4" />
                      <span>Retry Capture</span>
                    </Pill>
                    <Pill
                      variant="secondary"
                      size="md"
                      onClick={() => setStep("choose")}
                      className="border-paper/40 text-paper hover:bg-paper hover:text-ink"
                    >
                      Back to Choose
                    </Pill>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom cancel shoot link during countdown */}
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={() => setShowCancelPrompt(true)}
                className="text-xs font-mono uppercase tracking-wider text-muted hover:text-ink py-1 min-h-[44px]"
              >
                Cancel Shoot
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: PREVIEW - SUB-FLOW: SINGLE SHOT REVIEW */}
        {step === "preview" && previewMode === "single" && (
          <div className="mx-auto flex h-full max-h-[calc(100vh-140px)] w-full max-w-3xl flex-col items-center justify-between animate-fadeIn">
            {/* Review Title & Label with Pose Name */}
            <div className="text-center space-y-1">
              <div className="flex items-center justify-center gap-2">
                <Label tone="accent" className="font-bold">
                  SHOT {reviewIndex + 1} OF {totalShots}
                </Label>
                {capturedShots[reviewIndex] && (
                  <>
                    <span className="text-muted text-xs">·</span>
                    <span className="font-mono text-[11px] uppercase text-muted font-semibold">
                      {getPoseById(capturedShots[reviewIndex].poseId).name}
                    </span>
                  </>
                )}
              </div>
              <h2 className="font-display text-[clamp(26px,4vh,44px)] uppercase tracking-tight leading-tight">
                Review Your <span className="text-accent">Shot</span>
              </h2>
            </div>

            {/* Large Single Shot Container with Safeguard */}
            <div className="relative flex aspect-[4/3] w-full max-h-[48vh] items-center justify-center overflow-hidden rounded-tile bg-surface p-2 shadow-lg border border-ink/10">
              {capturedShots[reviewIndex]?.image ? (
                <img
                  src={capturedShots[reviewIndex].image}
                  alt={`Shot ${reviewIndex + 1}`}
                  className="h-full w-full object-contain rounded-[14px]"
                />
              ) : (
                <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-accent">
                    <Camera className="h-6 w-6" />
                  </div>
                  <div>
                    <h4 className="font-display text-lg uppercase tracking-wide text-ink">
                      Shot {reviewIndex + 1} Not Captured
                    </h4>
                    <p className="text-xs text-muted mt-0.5 max-w-xs">
                      This photo is missing or was not recorded yet.
                    </p>
                  </div>
                  <Pill
                    variant="accent"
                    size="md"
                    onClick={() => handleRetakeSingleShot(reviewIndex)}
                    className="min-h-[44px] px-6 text-xs font-mono uppercase tracking-wider"
                  >
                    <RotateCcw className="h-4 w-4" />
                    <span>Retake this shot</span>
                  </Pill>
                </div>
              )}
            </div>

            {/* Step Dots / Thumbnails Progress Row */}
            <div className="flex items-center justify-center gap-2 pt-1">
              {Array.from({ length: totalShots }).map((_, idx) => {
                const isActive = reviewIndex === idx;
                const hasShot = !!capturedShots[idx]?.image;
                const shotPose = capturedShots[idx]?.poseId
                  ? getPoseById(capturedShots[idx].poseId)
                  : null;

                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setReviewIndex(idx)}
                    data-selected={isActive ? "true" : undefined}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-mono font-bold min-h-[36px] ${
                      isActive
                        ? "is-selected bg-ink text-paper ring-2 ring-accent"
                        : "interactive-secondary bg-surface text-ink border border-transparent"
                    }`}
                  >
                    <span>SHOT {idx + 1}</span>
                    {shotPose && (
                      <span className="text-[10px] text-muted hidden sm:inline">
                        ({shotPose.name.split(" ")[0]})
                      </span>
                    )}
                    <span
                      className={`h-2 w-2 rounded-full ${
                        isActive ? "bg-accent" : hasShot ? "bg-ink/40" : "bg-ink/10"
                      }`}
                    />
                  </button>
                );
              })}
            </div>

            {/* Action Buttons: Back, Retake, Keep & Next / Keep & Finish */}
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              {reviewIndex > 0 && (
                <Pill
                  variant="secondary"
                  size="md"
                  onClick={() => setReviewIndex((prev) => prev - 1)}
                  className="min-h-[44px] px-5 text-xs font-mono uppercase tracking-wider"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>Back</span>
                </Pill>
              )}

              {canRetakeCurrentShot ? (
                <Pill
                  variant="secondary"
                  size="md"
                  onClick={() => handleRetakeSingleShot(reviewIndex)}
                  className="min-h-[44px] px-5 text-xs font-mono uppercase tracking-wider"
                >
                  <RotateCcw className="h-4 w-4" />
                  <span>Retake ({currentRetakesLeft} left)</span>
                </Pill>
              ) : (
                <div className="inline-flex min-h-[44px] items-center gap-1.5 px-4 rounded-full bg-ink/5 text-muted font-mono text-xs uppercase font-bold tracking-wider">
                  <X className="h-3.5 w-3.5" />
                  <span>No retakes left</span>
                </div>
              )}

              <Pill
                variant="primary"
                size="md"
                onClick={handleKeepAndNext}
                className="min-h-[44px] px-7 text-xs sm:text-sm font-mono uppercase tracking-wider"
              >
                <span>{reviewIndex === totalShots - 1 ? "Keep & Finish" : "Keep & Next"}</span>
                <ArrowRight className="h-4 w-4" />
              </Pill>
            </div>
          </div>
        )}

        {/* STEP 3: PREVIEW - SUB-FLOW: ALL SHOTS SUMMARY SCREEN */}
        {step === "preview" && previewMode === "summary" && (
          <div className="mx-auto flex h-full max-h-[calc(100vh-140px)] w-full max-w-5xl flex-col items-center justify-between animate-fadeIn">
            <div className="text-center space-y-1">
              <Label tone="accent">Step 03 · Review Summary</Label>
              <h2 className="font-display text-[clamp(26px,4vh,44px)] uppercase tracking-tight leading-tight">
                All Shots <span className="text-accent">Reviewed</span>
              </h2>
              <p className="font-sans text-xs text-muted">
                Tap any thumbnail to inspect or retake that shot, or tap Looks Good to proceed to print and share.
              </p>
            </div>

            {/* Center Area: Composed Strip Preview on Left, Tappable Thumbnails on Right */}
            <div className="grid w-full flex-1 grid-cols-1 md:grid-cols-[auto_1fr] gap-4 sm:gap-6 items-center justify-center max-h-[50vh] overflow-hidden py-1">
              {/* Composed Strip Preview */}
              <div className="flex justify-center h-full max-h-[48vh]">
                <div className="relative aspect-[2/3] h-full max-h-[48vh] overflow-hidden rounded-tile border border-ink/15 shadow-xl bg-white p-1">
                  {composedImageUrl && (
                    <img
                      src={composedImageUrl}
                      alt="Composed photo strip"
                      className="h-full w-full object-contain rounded-lg"
                    />
                  )}
                </div>
              </div>

              {/* Tappable Thumbnails Grid */}
              <div className="flex flex-col justify-between h-full max-h-[48vh] space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-2 gap-3 flex-1 overflow-hidden">
                  {Array.from({ length: totalShots }).map((_, idx) => {
                    const shot = capturedShots[idx];
                    const remaining = retakesLeft[idx] ?? 0;
                    const poseObj = shot?.poseId ? getPoseById(shot.poseId) : null;

                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setReviewIndex(idx);
                          setPreviewMode("single");
                        }}
                        className="interactive-tile group relative flex flex-col items-center justify-between p-2 rounded-tile bg-surface border border-ink/10 text-left overflow-hidden min-h-[110px]"
                      >
                        <div className="flex w-full items-center justify-between text-[11px] font-mono pb-1">
                          <span className="font-bold text-ink">
                            SHOT {idx + 1} {poseObj && `· ${poseObj.name.split(" ")[0]}`}
                          </span>
                          <span
                            className={
                              remaining > 0 ? "text-accent font-semibold" : "text-muted font-normal"
                            }
                          >
                            {remaining > 0 ? `${remaining} retakes left` : "No retakes"}
                          </span>
                        </div>
                        <div className="relative w-full flex-1 overflow-hidden rounded-lg bg-ink/5 flex items-center justify-center">
                          {shot?.image ? (
                            <img
                              src={shot.image}
                              alt={`Thumbnail ${idx + 1}`}
                              className="h-full w-full object-contain"
                            />
                          ) : (
                            <span className="text-[10px] font-mono text-muted">Tap to shoot</span>
                          )}
                        </div>
                        <span className="text-[10px] text-muted group-hover:text-ink font-mono uppercase mt-1">
                          Tap to review ↗
                        </span>
                      </button>
                    );
                  })}
                </div>

                {!canRetakeAll && (
                  <div className="text-[11px] font-mono text-muted text-center">
                    Note: Retake All is disabled because at least one shot has reached its retake limit.
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Buttons: Retake All & Looks Good */}
            <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
              <Pill
                variant="secondary"
                size="md"
                disabled={!canRetakeAll}
                onClick={() => setShowRetakeAllPrompt(true)}
                className="min-h-[48px] px-6 text-xs font-mono uppercase tracking-wider"
              >
                <RotateCcw className="h-4 w-4" />
                <span>Retake All</span>
              </Pill>

              <Pill
                variant="primary"
                size="md"
                onClick={handleLooksGood}
                className="min-h-[48px] px-8 text-xs sm:text-sm font-mono uppercase tracking-wider"
              >
                <span>Looks Good</span>
                <ArrowRight className="h-4 w-4" />
              </Pill>
            </div>
          </div>
        )}

        {/* STEP 4: OUTPUT */}
        {step === "output" && (
          <div className="mx-auto flex h-full max-h-[calc(100vh-140px)] w-full max-w-5xl flex-col items-center justify-between animate-fadeIn">
            <div className="text-center space-y-1">
              <Label tone="accent">Step 04 · Collect</Label>
              <h2 className="font-display text-[clamp(28px,4.5vh,48px)] uppercase tracking-tight leading-tight">
                Your Print Is <span className="text-accent">Ready</span>
              </h2>
              <p className="font-sans text-xs text-muted">
                Physical 4×6 print, phone QR code, and online gallery all share the composed layout.
              </p>
            </div>

            {/* Center Content: Composed 4x6 Canvas + Action Tiles */}
            <div className="grid w-full flex-1 grid-cols-1 md:grid-cols-[auto_1fr] gap-4 sm:gap-6 items-center justify-center max-h-[50vh] overflow-hidden py-1">
              {/* Composed 4x6 Layout Preview */}
              <div className="flex justify-center h-full max-h-[46vh]">
                <div className="relative aspect-[2/3] h-full max-h-[46vh] overflow-hidden rounded-tile border border-ink/15 shadow-xl bg-white p-1">
                  {composedImageUrl && (
                    <img
                      src={composedImageUrl}
                      alt="Composed 4x6 print layout"
                      className="h-full w-full object-contain rounded-lg"
                    />
                  )}
                </div>
              </div>

              {/* Three Output Actions */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 h-full max-h-[46vh] items-stretch">
                {/* PRINT ACTION */}
                <Tile
                  tone="surface"
                  className="flex flex-col items-center justify-between p-4 text-center rounded-tile border border-ink/5"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-paper text-ink mb-1">
                    <Printer className="h-5 w-5 text-accent" />
                  </div>
                  <div>
                    <h3 className="font-display text-base uppercase tracking-wide">Print 4×6</h3>
                    <p className="text-[11px] text-muted mt-0.5">Dye-sub postcard print (2s).</p>
                  </div>

                  <div className="w-full mt-2">
                    {printStatus === "idle" && (
                      <Pill
                        variant="primary"
                        size="md"
                        onClick={handlePrint}
                        className="w-full uppercase font-mono text-xs tracking-wider min-h-[44px]"
                      >
                        <Printer className="h-4 w-4" />
                        <span>Print</span>
                      </Pill>
                    )}

                    {printStatus === "working" && (
                      <Pill
                        variant="secondary"
                        size="md"
                        disabled
                        className="w-full uppercase font-mono text-xs tracking-wider min-h-[44px]"
                      >
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Printing...</span>
                      </Pill>
                    )}

                    {printStatus === "done" && (
                      <div className="space-y-1">
                        <div className="inline-flex items-center gap-1 text-[11px] font-mono font-bold text-success uppercase">
                          <Check className="h-3.5 w-3.5" /> Printed
                        </div>
                        <Pill
                          variant="secondary"
                          size="md"
                          onClick={handlePrint}
                          className="w-full text-xs font-mono min-h-[38px]"
                        >
                          Print Another
                        </Pill>
                      </div>
                    )}

                    {printStatus === "failed" && (
                      <div className="space-y-1">
                        <div className="text-[11px] text-danger font-medium leading-tight">
                          {printMessage || "Print failed"}
                        </div>
                        <Pill
                          variant="danger"
                          size="md"
                          onClick={handlePrint}
                          className="w-full uppercase font-mono text-xs tracking-wider min-h-[44px]"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          <span>Retry Print</span>
                        </Pill>
                      </div>
                    )}
                  </div>
                </Tile>

                {/* SHARE BY QR ACTION */}
                <Tile
                  tone="surface"
                  className="flex flex-col items-center justify-between p-4 text-center rounded-tile border border-ink/5"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-paper text-ink mb-1">
                    <QrCode className="h-5 w-5 text-accent" />
                  </div>
                  <div>
                    <h3 className="font-display text-base uppercase tracking-wide">Share by QR</h3>
                    <p className="text-[11px] text-muted mt-0.5">Instant mobile digital copy.</p>
                  </div>

                  <div className="w-full mt-2">
                    <Pill
                      variant={showQrTile ? "primary" : "secondary"}
                      size="md"
                      onClick={() => setShowQrTile((prev) => !prev)}
                      className="w-full uppercase font-mono text-xs tracking-wider min-h-[44px]"
                    >
                      <QrCode className="h-4 w-4" />
                      <span>{showQrTile ? "Hide QR" : "Show QR"}</span>
                    </Pill>
                  </div>
                </Tile>

                {/* SAVE TO GALLERY ACTION */}
                <Tile
                  tone="surface"
                  className="flex flex-col items-center justify-between p-4 text-center rounded-tile border border-ink/5"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-paper text-ink mb-1">
                    <CloudUpload className="h-5 w-5 text-accent" />
                  </div>
                  <div>
                    <h3 className="font-display text-base uppercase tracking-wide">Event Gallery</h3>
                    <p className="text-[11px] text-muted mt-0.5">Cloud photo gallery sync.</p>
                  </div>

                  <div className="w-full mt-2">
                    {galleryStatus === "idle" && (
                      <Pill
                        variant="secondary"
                        size="md"
                        onClick={handleSaveToGallery}
                        className="w-full uppercase font-mono text-xs tracking-wider min-h-[44px]"
                      >
                        <CloudUpload className="h-4 w-4" />
                        <span>Save to Gallery</span>
                      </Pill>
                    )}

                    {galleryStatus === "working" && (
                      <Pill
                        variant="secondary"
                        size="md"
                        disabled
                        className="w-full uppercase font-mono text-xs tracking-wider min-h-[44px]"
                      >
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Saving...</span>
                      </Pill>
                    )}

                    {galleryStatus === "done" && (
                      <div className="inline-flex min-h-[44px] items-center justify-center gap-1.5 w-full text-xs font-mono font-bold text-success uppercase">
                        <Check className="h-4 w-4" /> Saved
                      </div>
                    )}
                  </div>
                </Tile>
              </div>
            </div>

            {/* DONE PILL: Marks queue row COMPLETED and returns to "/" */}
            <div className="flex flex-col items-center justify-center pt-2 shrink-0">
              <Pill
                variant="primary"
                size="lg"
                disabled={isFinishing}
                onClick={handleFinishDone}
                className="w-full max-w-sm text-lg uppercase tracking-wider font-display min-h-[52px]"
              >
                {isFinishing ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-5 w-5 animate-spin" /> Completing...
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-2">
                    <span>Done</span>
                    <Check className="h-5 w-5 text-accent" />
                  </span>
                )}
              </Pill>
              <Label className="text-muted mt-1 text-[10px]">Returns to attract screen</Label>
            </div>
          </div>
        )}
      </main>

      {/* FOOTER */}
      <footer className="relative z-10 shrink-0 pt-2">
        <Hairline />
        <div className="flex items-center justify-between pt-2">
          <Label className="text-muted text-[10px]">Snap &amp; Snack Booth Console</Label>
          <Label className="text-muted text-[10px]">Touch-Optimized · 44px Minimum Target</Label>
        </div>
      </footer>

      {/* QR MODAL */}
      {showQrTile && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm animate-fadeIn"
          onClick={() => setShowQrTile(false)}
        >
          <Tile
            tone="paper"
            className="w-full max-w-xs p-6 text-center shadow-2xl border border-ink/20"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2">
              <Label tone="accent">Scan On Your Phone</Label>
              <button
                type="button"
                onClick={() => setShowQrTile(false)}
                className="text-muted hover:text-ink min-h-[32px] min-w-[32px] flex items-center justify-center"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="bg-white p-3 rounded-xl shadow-inner mb-2 border border-ink/10 flex justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" className="h-44 w-44">
                <rect x="10" y="10" width="40" height="40" fill="#161513" rx="4" />
                <rect x="20" y="20" width="20" height="20" fill="#ffffff" />
                <rect x="25" y="25" width="10" height="10" fill="#161513" />

                <rect x="110" y="10" width="40" height="40" fill="#161513" rx="4" />
                <rect x="120" y="20" width="20" height="20" fill="#ffffff" />
                <rect x="125" y="25" width="10" height="10" fill="#161513" />

                <rect x="10" y="110" width="40" height="40" fill="#161513" rx="4" />
                <rect x="20" y="120" width="20" height="20" fill="#ffffff" />
                <rect x="25" y="125" width="10" height="10" fill="#161513" />

                <rect x="60" y="20" width="10" height="10" fill="#161513" />
                <rect x="80" y="20" width="10" height="20" fill="#161513" />
                <rect x="60" y="40" width="20" height="10" fill="#161513" />
                <rect x="90" y="40" width="10" height="10" fill="#161513" />

                <rect x="20" y="60" width="20" height="10" fill="#161513" />
                <rect x="50" y="60" width="10" height="10" fill="#161513" />
                <rect x="70" y="60" width="20" height="20" fill="#e8541e" />
                <rect x="100" y="60" width="20" height="10" fill="#161513" />
                <rect x="130" y="60" width="10" height="20" fill="#161513" />

                <rect x="30" y="80" width="10" height="20" fill="#161513" />
                <rect x="60" y="90" width="10" height="10" fill="#161513" />
                <rect x="100" y="80" width="20" height="20" fill="#161513" />

                <rect x="60" y="120" width="20" height="10" fill="#161513" />
                <rect x="90" y="110" width="10" height="20" fill="#161513" />
                <rect x="110" y="120" width="20" height="20" fill="#161513" />
                <rect x="140" y="110" width="10" height="20" fill="#161513" />
              </svg>
            </div>
            <div className="font-mono text-[10px] text-muted break-all">
              https://snapandsnack.com/g/{guestToken}
            </div>
          </Tile>
        </div>
      )}

      {/* CONFIRM RETAKE ALL MODAL */}
      {showRetakeAllPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm animate-fadeIn">
          <Tile tone="paper" className="w-full max-w-sm p-6 text-center shadow-2xl border border-ink/20">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-surface text-ink">
              <RotateCcw className="h-6 w-6 text-accent" />
            </div>
            <h3 className="font-display text-2xl uppercase tracking-tight text-ink mb-1">
              Retake All Shots?
            </h3>
            <p className="text-xs text-muted mb-6 font-sans">
              Are you sure? This will start the photo sequence over and use 1 retake for each of your shots.
            </p>
            <div className="flex flex-col gap-2">
              <Pill
                variant="accent"
                size="md"
                onClick={handleConfirmRetakeAll}
                className="w-full uppercase font-mono tracking-wider text-xs min-h-[44px]"
              >
                Yes, Retake All
              </Pill>
              <Pill
                variant="secondary"
                size="md"
                onClick={() => setShowRetakeAllPrompt(false)}
                className="w-full uppercase font-mono tracking-wider text-xs min-h-[44px]"
              >
                Cancel
              </Pill>
            </div>
          </Tile>
        </div>
      )}

      {/* CANCEL CONFIRMATION MODAL */}
      {showCancelPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm animate-fadeIn">
          <Tile tone="paper" className="w-full max-w-sm p-6 text-center shadow-2xl border border-ink/20">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-surface text-ink">
              <AlertTriangle className="h-6 w-6 text-accent" />
            </div>
            <h3 className="font-display text-2xl uppercase tracking-tight text-ink mb-1">
              Cancel Shoot?
            </h3>
            <p className="text-xs text-muted mb-6 font-sans">
              Are you sure? You will return to the home attract screen. Your pose slots and queue spot will reset for when you are ready.
            </p>
            <div className="flex flex-col gap-2">
              <Pill
                variant="danger"
                size="md"
                onClick={handleConfirmCancel}
                className="w-full uppercase font-mono tracking-wider text-xs min-h-[44px]"
              >
                Yes, Return to Home
              </Pill>
              <Pill
                variant="secondary"
                size="md"
                onClick={() => setShowCancelPrompt(false)}
                className="w-full uppercase font-mono tracking-wider text-xs min-h-[44px]"
              >
                Keep Shooting
              </Pill>
            </div>
          </Tile>
        </div>
      )}
    </div>
  );
}
