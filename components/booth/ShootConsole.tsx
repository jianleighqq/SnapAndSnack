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
  Sparkles,
  Users,
  Smile,
  Hand,
  Loader2,
  X,
} from "lucide-react";
import { Pill } from "@/components/ui/Pill";
import { Label } from "@/components/ui/Label";
import { Tile } from "@/components/ui/Tile";
import { Hairline } from "@/components/ui/Hairline";
import { StatusPill } from "@/components/ui/StatusPill";
import { hardware } from "@/lib/hardware";
import type { QueueEntryWithGuest } from "@/lib/types";

export type ShootStep = "choose" | "countdown" | "preview" | "output";
export type CaptureType = "Photo" | "GIF" | "Video";

interface PoseOption {
  id: string;
  name: string;
  subtitle: string;
  icon: React.ElementType;
}

const POSES: PoseOption[] = [
  { id: "couple", name: "Classic couple", subtitle: "Close & timeless", icon: Users },
  { id: "group", name: "Group", subtitle: "Squad shoulder-to-shoulder", icon: Users },
  { id: "peace", name: "Peace sign", subtitle: "Retro booth double V", icon: Hand },
  { id: "funny", name: "Funny face", subtitle: "Wild expressions, zero filter", icon: Smile },
];

export default function ShootConsole() {
  const router = useRouter();

  // Active guest & queue data
  const [activeEntry, setActiveEntry] = useState<QueueEntryWithGuest | null>(null);
  const [isLoadingGuest, setIsLoadingGuest] = useState(true);

  // Step state
  const [step, setStep] = useState<ShootStep>("choose");

  // Step 1: Selections
  const [selectedPose, setSelectedPose] = useState<string>("Classic couple");
  const [captureType, setCaptureType] = useState<CaptureType>("Photo");

  // Step 2: Countdown & Capture
  const [countdownNumber, setCountdownNumber] = useState<number | null>(null);
  const [isFlashing, setIsFlashing] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Step 3: Captured Image
  const [capturedImageUrl, setCapturedImageUrl] = useState<string | null>(null);

  // Step 4: Output States
  const [printStatus, setPrintStatus] = useState<"idle" | "working" | "done" | "failed">("idle");
  const [printMessage, setPrintMessage] = useState<string | null>(null);

  const [qrStatus, setQrStatus] = useState<"idle" | "done">("idle");
  const [showQrTile, setShowQrTile] = useState(false);

  const [galleryStatus, setGalleryStatus] = useState<"idle" | "working" | "done" | "failed">("idle");
  const [galleryMessage, setGalleryMessage] = useState<string | null>(null);

  // Cancel shoot modal state
  const [showCancelPrompt, setShowCancelPrompt] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);

  // 1. Fetch current queue on mount and ensure active guest is IN_PROGRESS
  useEffect(() => {
    let isMounted = true;

    async function initQueueSession() {
      try {
        const res = await fetch("/api/queue");
        if (!res.ok) throw new Error("Failed to load queue");
        const data = await res.json();
        const queue: QueueEntryWithGuest[] = data.queue || [];

        // Check if there is an in-progress guest
        const inProgress = queue.find((q) => q.status === "IN_PROGRESS");
        if (inProgress) {
          if (isMounted) {
            setActiveEntry(inProgress);
            setIsLoadingGuest(false);
          }
          return;
        }

        // Otherwise find first waiting/reminded guest and mark them IN_PROGRESS
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

        // Fallback mock entry if queue is empty
        if (isMounted) {
          setActiveEntry({
            id: "q_active_fallback",
            event_id: "evt_active",
            guest_id: "gst_fallback",
            queue_number: 1,
            scheduled_shoot_time: null,
            status: "IN_PROGRESS",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            guest: {
              id: "gst_fallback",
              event_id: "evt_active",
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
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, []);

  // Countdown timer trigger
  const startCountdown = () => {
    setCaptureError(null);
    setStep("countdown");
    setCountdownNumber(3);

    let count = 3;
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);

    countdownIntervalRef.current = setInterval(() => {
      count -= 1;
      if (count > 0) {
        setCountdownNumber(count);
      } else {
        // Stop timer at 0 and trigger shutter
        if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
        setCountdownNumber(null);
        triggerShutterCapture();
      }
    }, 1000);
  };

  // Hardware capture call
  const triggerShutterCapture = async () => {
    // Shutter flash effect
    setIsFlashing(true);
    setTimeout(() => setIsFlashing(false), 200);

    setIsCapturing(true);
    setCaptureError(null);

    try {
      const result = await hardware.capture({
        type: captureType,
        pose: selectedPose,
      });

      if (!result.success || !result.imageUrl) {
        setCaptureError(result.message || "Failed to capture frame from camera. Please retry.");
        setIsCapturing(false);
        return;
      }

      setCapturedImageUrl(result.imageUrl);
      setIsCapturing(false);
      setStep("preview");
    } catch (err: any) {
      setCaptureError(err?.message || "Hardware error during capture. Please check camera and retry.");
      setIsCapturing(false);
    }
  };

  // Step 4: Hardware Print action
  const handlePrint = async () => {
    if (printStatus === "working") return;
    setPrintStatus("working");
    setPrintMessage(null);

    try {
      const result = await hardware.print();
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

  // Step 4: Share by QR action
  const handleShareQr = () => {
    setQrStatus("done");
    setShowQrTile((prev) => !prev);
  };

  // Step 4: Save to Gallery action
  const handleSaveToGallery = async () => {
    if (galleryStatus === "working") return;
    setGalleryStatus("working");
    setGalleryMessage(null);

    // Simulate quick cloud upload
    setTimeout(() => {
      setGalleryStatus("done");
      setGalleryMessage("Saved to event gallery.");
    }, 800);
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

  // Cancel shoot: leaves guest in progress and returns to "/"
  const handleConfirmCancel = () => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }
    router.push("/");
  };

  const guestNumber = activeEntry ? String(activeEntry.queue_number).padStart(2, "0") : "--";
  const guestName = activeEntry?.guest?.full_name || "Guest";
  const guestToken = activeEntry?.guest?.guest_token || "sample_token";

  return (
    <div className="relative flex min-h-screen w-screen select-none flex-col justify-between overflow-x-hidden bg-paper text-ink p-6 lg:p-10">
      {/* FLASH OVERLAY */}
      {isFlashing && (
        <div className="fixed inset-0 z-50 pointer-events-none bg-white transition-opacity duration-200" />
      )}

      {/* TOP BAR: Mono label with guest info, step progress, and cancel button */}
      <header className="relative z-10">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4">
          <div className="flex items-center gap-4">
            <span className="font-display text-2xl uppercase tracking-wider text-ink">
              Snap &amp; Snack
            </span>
            <div className="h-4 w-px bg-ink/20" />
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
              <Label className="text-ink font-semibold">
                GUEST #{guestNumber} &middot; {guestName.toUpperCase()}
              </Label>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Label className="text-muted">
              {step === "choose" && "STEP 1 OF 4 &middot; CHOOSE"}
              {step === "countdown" && "STEP 2 OF 4 &middot; GET READY"}
              {step === "preview" && "STEP 3 OF 4 &middot; PREVIEW"}
              {step === "output" && "STEP 4 OF 4 &middot; COLLECT"}
            </Label>

            {/* Cancel shoot button stays accessible in steps 1 and 2 */}
            {(step === "choose" || step === "countdown") && (
              <button
                type="button"
                onClick={() => setShowCancelPrompt(true)}
                className="inline-flex min-h-[44px] items-center gap-1.5 px-4 text-xs font-mono uppercase tracking-wider text-muted hover:text-ink transition-colors"
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

      {/* MAIN STEP CONTENT */}
      <main className="relative z-10 flex flex-1 flex-col justify-center py-6">
        {/* STEP 1: CHOOSE */}
        {step === "choose" && (
          <div className="mx-auto w-full max-w-5xl space-y-8 animate-fadeIn">
            <div className="text-center space-y-2">
              <Label tone="accent">Step 01</Label>
              <h1 className="font-display text-5xl uppercase tracking-tight sm:text-6xl md:text-7xl leading-none">
                Pick Your <span className="text-accent">Pose</span>
              </h1>
              <p className="font-sans text-sm text-muted">
                Choose an inspiration pose and capture mode before stepping in front of the lens.
              </p>
            </div>

            {/* Pose Tiles */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {POSES.map((pose) => {
                const isSelected = selectedPose === pose.name;
                const IconComponent = pose.icon;
                return (
                  <button
                    key={pose.id}
                    type="button"
                    onClick={() => setSelectedPose(pose.name)}
                    className={`group relative flex flex-col items-center justify-between p-6 text-center transition-all duration-150 rounded-tile min-h-[160px] ${
                      isSelected
                        ? "bg-ink text-paper ring-2 ring-accent"
                        : "bg-surface text-ink hover:bg-surface/80"
                    }`}
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-paper/10 text-accent mb-3">
                      <IconComponent className="h-6 w-6" />
                    </div>
                    <div>
                      <div className="font-display text-lg uppercase tracking-wide">
                        {pose.name}
                      </div>
                      <div
                        className={`text-xs mt-1 ${
                          isSelected ? "text-paper/70" : "text-muted"
                        }`}
                      >
                        {pose.subtitle}
                      </div>
                    </div>
                    {isSelected && (
                      <div className="mt-3 inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-0.5 text-[10px] font-mono font-bold text-white uppercase">
                        <Check className="h-3 w-3" /> Selected
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Capture Type Pill Toggles */}
            <div className="flex flex-col items-center justify-center gap-3 pt-2">
              <Label>Capture Type</Label>
              <div className="inline-flex rounded-full bg-surface p-1">
                {(["Photo", "GIF", "Video"] as CaptureType[]).map((type) => {
                  const isActive = captureType === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setCaptureType(type)}
                      className={`min-h-[44px] px-6 rounded-full text-xs font-mono font-medium uppercase tracking-wider transition-all ${
                        isActive
                          ? "bg-ink text-paper shadow-sm"
                          : "text-muted hover:text-ink"
                      }`}
                    >
                      {type}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Large Pill: Start Countdown */}
            <div className="flex flex-col items-center justify-center gap-4 pt-4">
              <Pill
                variant="primary"
                size="lg"
                onClick={startCountdown}
                className="w-full max-w-md text-xl uppercase tracking-wider font-display h-16 shadow-lg hover:scale-[1.01] transition-transform"
              >
                <span>Start Countdown</span>
                <ArrowRight className="h-5 w-5" />
              </Pill>

              <button
                type="button"
                onClick={() => setShowCancelPrompt(true)}
                className="text-xs font-mono uppercase tracking-wider text-muted hover:text-ink py-2"
              >
                Cancel Shoot
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: COUNTDOWN & LIVE VIEW */}
        {step === "countdown" && (
          <div className="mx-auto w-full max-w-4xl space-y-6 animate-fadeIn">
            {/* Viewfinder Tile */}
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-tile bg-[#181614] text-paper flex flex-col items-center justify-center shadow-2xl border border-ink/10">
              {/* Corner Framing Marks */}
              <div className="pointer-events-none absolute inset-6 flex flex-col justify-between">
                <div className="flex justify-between">
                  <div className="h-6 w-6 border-l-2 border-t-2 border-paper/40" />
                  <div className="h-6 w-6 border-r-2 border-t-2 border-paper/40" />
                </div>
                <div className="flex justify-between">
                  <div className="h-6 w-6 border-l-2 border-b-2 border-paper/40" />
                  <div className="h-6 w-6 border-r-2 border-b-2 border-paper/40" />
                </div>
              </div>

              {/* Viewfinder Metadata */}
              <div className="absolute top-8 left-8 flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-accent animate-ping" />
                <Label className="text-paper/80">LIVE FEED &middot; {captureType.toUpperCase()}</Label>
              </div>

              <div className="absolute top-8 right-8">
                <Label className="text-paper/80">POSE: {selectedPose.toUpperCase()}</Label>
              </div>

              {/* Huge Anton Countdown Display */}
              {countdownNumber !== null && !captureError && (
                <div className="flex flex-col items-center justify-center">
                  <div
                    key={countdownNumber}
                    className="font-display text-[140px] sm:text-[180px] md:text-[220px] leading-none text-accent animate-scaleIn select-none"
                  >
                    {countdownNumber}
                  </div>
                  <Label className="text-paper/60 tracking-[0.2em]">STRIKE YOUR POSE</Label>
                </div>
              )}

              {/* Shutter Processing State */}
              {isCapturing && !captureError && (
                <div className="flex flex-col items-center justify-center gap-3">
                  <Loader2 className="h-14 w-14 animate-spin text-accent" />
                  <Label className="text-paper/90">CAPTURING PHOTO...</Label>
                </div>
              )}

              {/* Error UI: Hardware Capture Failed */}
              {captureError && (
                <div className="flex max-w-md flex-col items-center justify-center p-6 text-center z-20">
                  <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-danger/20 text-danger">
                    <AlertTriangle className="h-7 w-7" />
                  </div>
                  <h3 className="font-display text-2xl uppercase tracking-tight text-paper mb-2">
                    Camera Error
                  </h3>
                  <p className="text-sm text-paper/80 mb-6 font-sans">{captureError}</p>
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <Pill variant="accent" size="md" onClick={triggerShutterCapture}>
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
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => setShowCancelPrompt(true)}
                className="text-xs font-mono uppercase tracking-wider text-muted hover:text-ink py-2"
              >
                Cancel Shoot
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: PREVIEW */}
        {step === "preview" && (
          <div className="mx-auto w-full max-w-3xl space-y-6 animate-fadeIn">
            <div className="text-center space-y-1">
              <Label tone="accent">Step 03 &middot; Preview</Label>
              <h2 className="font-display text-4xl uppercase tracking-tight sm:text-5xl">
                How Does It <span className="text-accent">Look?</span>
              </h2>
            </div>

            {/* Large Image Container */}
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-tile bg-surface p-2 shadow-lg">
              {capturedImageUrl ? (
                <img
                  src={capturedImageUrl}
                  alt="Captured booth shot"
                  className="h-full w-full object-contain rounded-[14px]"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted">
                  No preview available
                </div>
              )}
            </div>

            {/* Action Pills: Retake or Keep */}
            <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
              <Pill
                variant="secondary"
                size="lg"
                onClick={startCountdown}
                className="min-h-[56px] px-8 text-base font-mono uppercase tracking-wider"
              >
                <RotateCcw className="h-4 w-4" />
                <span>Retake</span>
              </Pill>

              <Pill
                variant="primary"
                size="lg"
                onClick={() => setStep("output")}
                className="min-h-[56px] px-10 text-base font-mono uppercase tracking-wider"
              >
                <span>Keep Shot</span>
                <ArrowRight className="h-4 w-4" />
              </Pill>
            </div>
          </div>
        )}

        {/* STEP 4: OUTPUT */}
        {step === "output" && (
          <div className="mx-auto w-full max-w-4xl space-y-8 animate-fadeIn">
            <div className="text-center space-y-2">
              <Label tone="accent">Step 04 &middot; Collect</Label>
              <h2 className="font-display text-5xl uppercase tracking-tight sm:text-6xl">
                Ready For <span className="text-accent">Pickup</span>
              </h2>
              <p className="font-sans text-sm text-muted">
                Print a physical souvenir, share via QR to your phone, or save to your event gallery.
              </p>
            </div>

            {/* Three Action Pills Row */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {/* PRINT ACTION */}
              <Tile
                tone="surface"
                className="flex flex-col items-center justify-between p-6 text-center min-h-[220px]"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-paper text-ink mb-2">
                  <Printer className="h-6 w-6 text-accent" />
                </div>
                <div>
                  <h3 className="font-display text-xl uppercase tracking-wide">Print Photo</h3>
                  <p className="text-xs text-muted mt-1">
                    Canon SELPHY postcard print (takes ~2 seconds).
                  </p>
                </div>

                <div className="w-full mt-4">
                  {printStatus === "idle" && (
                    <Pill
                      variant="primary"
                      size="md"
                      onClick={handlePrint}
                      className="w-full uppercase font-mono text-xs tracking-wider"
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
                      className="w-full uppercase font-mono text-xs tracking-wider"
                    >
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Printing...</span>
                    </Pill>
                  )}

                  {printStatus === "done" && (
                    <div className="space-y-2">
                      <div className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-success uppercase">
                        <Check className="h-4 w-4" /> Printed
                      </div>
                      <Pill
                        variant="secondary"
                        size="md"
                        onClick={handlePrint}
                        className="w-full text-xs font-mono"
                      >
                        Print Another
                      </Pill>
                    </div>
                  )}

                  {printStatus === "failed" && (
                    <div className="space-y-2">
                      <div className="text-xs text-danger font-medium">
                        {printMessage || "Print failed"}
                      </div>
                      <Pill
                        variant="danger"
                        size="md"
                        onClick={handlePrint}
                        className="w-full uppercase font-mono text-xs tracking-wider"
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
                className="flex flex-col items-center justify-between p-6 text-center min-h-[220px]"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-paper text-ink mb-2">
                  <QrCode className="h-6 w-6 text-accent" />
                </div>
                <div>
                  <h3 className="font-display text-xl uppercase tracking-wide">Share By QR</h3>
                  <p className="text-xs text-muted mt-1">
                    Scan with any smartphone camera to open your instant mobile copy.
                  </p>
                </div>

                <div className="w-full mt-4">
                  <Pill
                    variant={showQrTile ? "primary" : "secondary"}
                    size="md"
                    onClick={handleShareQr}
                    className="w-full uppercase font-mono text-xs tracking-wider"
                  >
                    <QrCode className="h-4 w-4" />
                    <span>{showQrTile ? "Hide QR" : "Show QR Code"}</span>
                  </Pill>
                </div>
              </Tile>

              {/* SAVE TO GALLERY ACTION */}
              <Tile
                tone="surface"
                className="flex flex-col items-center justify-between p-6 text-center min-h-[220px]"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-paper text-ink mb-2">
                  <CloudUpload className="h-6 w-6 text-accent" />
                </div>
                <div>
                  <h3 className="font-display text-xl uppercase tracking-wide">Save To Gallery</h3>
                  <p className="text-xs text-muted mt-1">
                    Direct sync with the event online gallery storage.
                  </p>
                </div>

                <div className="w-full mt-4">
                  {galleryStatus === "idle" && (
                    <Pill
                      variant="secondary"
                      size="md"
                      onClick={handleSaveToGallery}
                      className="w-full uppercase font-mono text-xs tracking-wider"
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
                      className="w-full uppercase font-mono text-xs tracking-wider"
                    >
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Saving...</span>
                    </Pill>
                  )}

                  {galleryStatus === "done" && (
                    <div className="inline-flex min-h-[44px] items-center justify-center gap-1.5 w-full text-xs font-mono font-bold text-success uppercase">
                      <Check className="h-4 w-4" /> Saved to Gallery
                    </div>
                  )}

                  {galleryStatus === "failed" && (
                    <div className="space-y-2">
                      <div className="text-xs text-danger font-medium">Save failed</div>
                      <Pill
                        variant="danger"
                        size="md"
                        onClick={handleSaveToGallery}
                        className="w-full uppercase font-mono text-xs tracking-wider"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        <span>Retry Save</span>
                      </Pill>
                    </div>
                  )}
                </div>
              </Tile>
            </div>

            {/* QR Code Reveal Tile */}
            {showQrTile && (
              <Tile
                tone="paper"
                className="mx-auto flex max-w-sm flex-col items-center p-6 text-center border border-ink/15 animate-fadeIn"
              >
                <Label tone="accent" className="mb-2">Scan On Your Phone</Label>
                {/* Crisp SVG QR Code Placeholder */}
                <div className="bg-white p-4 rounded-xl shadow-inner mb-3 border border-ink/10">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 160 160"
                    className="h-40 w-40"
                  >
                    {/* Corner Squares */}
                    <rect x="10" y="10" width="40" height="40" fill="#161513" rx="4" />
                    <rect x="20" y="20" width="20" height="20" fill="#ffffff" />
                    <rect x="25" y="25" width="10" height="10" fill="#161513" />

                    <rect x="110" y="10" width="40" height="40" fill="#161513" rx="4" />
                    <rect x="120" y="20" width="20" height="20" fill="#ffffff" />
                    <rect x="125" y="25" width="10" height="10" fill="#161513" />

                    <rect x="10" y="110" width="40" height="40" fill="#161513" rx="4" />
                    <rect x="20" y="120" width="20" height="20" fill="#ffffff" />
                    <rect x="25" y="125" width="10" height="10" fill="#161513" />

                    {/* QR Matrix Grid Details */}
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
                    <rect x="140" y="110" width="10" height="10" fill="#161513" />
                  </svg>
                </div>
                <div className="font-mono text-[11px] text-muted break-all">
                  https://snapandsnack.com/g/{guestToken}
                </div>
              </Tile>
            )}

            {/* DONE PILL: Marks queue row COMPLETED and returns to "/" */}
            <div className="flex flex-col items-center justify-center pt-6">
              <Pill
                variant="primary"
                size="lg"
                disabled={isFinishing}
                onClick={handleFinishDone}
                className="w-full max-w-md text-xl uppercase tracking-wider font-display h-16 shadow-lg hover:scale-[1.01] transition-transform"
              >
                {isFinishing ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-5 w-5 animate-spin" /> Completing Session...
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-2">
                    <span>Done</span>
                    <Check className="h-6 w-6 text-accent" />
                  </span>
                )}
              </Pill>
              <Label className="text-muted mt-3">Returns to attract screen</Label>
            </div>
          </div>
        )}
      </main>

      {/* FOOTER */}
      <footer className="relative z-10 pt-4">
        <Hairline />
        <div className="flex items-center justify-between pt-3">
          <Label className="text-muted">Snap &amp; Snack Booth Console</Label>
          <Label className="text-muted">Touch-Optimized &middot; 44px Minimum Target</Label>
        </div>
      </footer>

      {/* CANCEL CONFIRMATION MODAL */}
      {showCancelPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-6 backdrop-blur-sm animate-fadeIn">
          <Tile
            tone="paper"
            className="w-full max-w-md p-8 text-center shadow-2xl border border-ink/20"
          >
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-surface text-ink">
              <AlertTriangle className="h-7 w-7 text-accent" />
            </div>
            <h3 className="font-display text-3xl uppercase tracking-tight text-ink mb-2">
              Cancel Shoot?
            </h3>
            <p className="text-sm text-muted mb-8 font-sans">
              Are you sure? You will return to the home attract screen. Your queue spot is kept for when you are ready.
            </p>
            <div className="flex flex-col gap-3">
              <Pill
                variant="danger"
                size="md"
                onClick={handleConfirmCancel}
                className="w-full uppercase font-mono tracking-wider text-xs"
              >
                Yes, Return to Home
              </Pill>
              <Pill
                variant="secondary"
                size="md"
                onClick={() => setShowCancelPrompt(false)}
                className="w-full uppercase font-mono tracking-wider text-xs"
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

