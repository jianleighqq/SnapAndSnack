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
import QRCode from "qrcode";

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
  const [sessionId, setSessionId] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const [stripMediaAssetId, setStripMediaAssetId] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [saveToastError, setSaveToastError] = useState<string | null>(null);

  // Confirmation Modals
  const [showCancelPrompt, setShowCancelPrompt] = useState(false);
  const [showRetakeAllPrompt, setShowRetakeAllPrompt] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);

  // Live Camera / Webcam State
  const [cameraErrorBanner, setCameraErrorBanner] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

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
        const res = await fetch("/api/queue", { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to load queue");
        const data = await res.json();
        const queue: QueueEntryWithGuest[] = data.queue || [];
        if (data.event) {
          setActiveEvent(data.event);
          const limit = data.event.max_retakes ?? 2;
          const count = data.event.shots_per_guest ?? 3;
          setRetakesLeft(new Array(count).fill(limit));
          setSelectedPoses(new Array(count).fill(null));
        } else {
          setActiveEvent(null);
        }

        const inProgress = queue.find((q) => q.status === "IN_PROGRESS");
        if (inProgress) {
          if (isMounted) {
            setActiveEntry(inProgress);
            setIsLoadingGuest(false);
          }

          // 1. Get or create shoot session row for this queue entry
          try {
            const sessionRes = await fetch("/api/session", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                queueId: inProgress.id,
                captureType: "Photo",
              }),
            });
            if (sessionRes.ok) {
              const sessionData = await sessionRes.json();
              if (sessionData.session?.id && isMounted) {
                sessionIdRef.current = sessionData.session.id;
                setSessionId(sessionData.session.id);
              }
            }
          } catch (sErr) {
            console.warn("Could not init shoot session:", sErr);
          }

          // 2. Enforce print limit state on mount / refresh (persisted on server)
          if (inProgress.guest?.id) {
            try {
              const printRes = await fetch(`/api/print?guestId=${inProgress.guest.id}`, {
                cache: "no-store",
              });
              if (printRes.ok) {
                const printData = await printRes.json();
                if (!printData.canPrint && isMounted) {
                  setPrintStatus("done");
                  setPrintMessage("Printed");
                }
              }
            } catch (pErr) {
              console.warn("Could not check print limit:", pErr);
            }
          }

          return;
        }

        // If no guest is IN_PROGRESS, set activeEntry to null
        if (isMounted) {
          setActiveEntry(null);
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

    // Ask for camera permission once when the console opens (if webcam mode is active)
    if (hardware.initCamera) {
      hardware.initCamera()
        .then((status) => {
          if (!isMounted) return;
          if (status.status === "ERROR") {
            const res = status.resolution?.toLowerCase() || "";
            const mod = status.model?.toLowerCase() || "";
            if (res.includes("permission denied") || mod.includes("permission denied")) {
              setCameraErrorBanner("Camera permission denied. Please allow camera access in your browser settings to take photos.");
            } else if (mod.includes("no camera")) {
              setCameraErrorBanner("No camera found. Please connect a webcam.");
            } else {
              setCameraErrorBanner(`Camera error: ${status.model}`);
            }
          }
        })
        .catch((err) => {
          if (isMounted) {
            setCameraErrorBanner("Camera access error: " + (err?.message || String(err)));
          }
        });
    }

    return () => {
      isMounted = false;
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      if (poseIntroTimeoutRef.current) clearTimeout(poseIntroTimeoutRef.current);
      // Stop the camera stream when leaving the console so the camera light turns off
      hardware.stopStream?.();
    };
  }, []);

  // Connect live camera stream to the viewfinder video element during countdown
  useEffect(() => {
    let active = true;
    if (step === "countdown" && videoRef.current && hardware.startStream) {
      hardware.startStream(videoRef.current).catch((err) => {
        if (active) {
          console.warn("Unable to start live stream preview:", err);
        }
      });
    }
    return () => {
      active = false;
    };
  }, [step]);

  // Generate real QR code when QR modal is requested
  useEffect(() => {
    if (showQrTile && activeEntry?.guest?.guest_token) {
      const baseUrl =
        process.env.NEXT_PUBLIC_APP_URL ||
        (typeof window !== "undefined" ? window.location.origin : "");
      const galleryUrl = `${baseUrl}/gallery?token=${activeEntry.guest.guest_token}`;
      QRCode.toDataURL(galleryUrl, { width: 300, margin: 1 })
        .then((url) => setQrDataUrl(url))
        .catch((err) => console.error("QR Code generation error:", err));
    }
  }, [showQrTile, activeEntry]);

  // Helper to ensure a shoot session exists before uploading
  const ensureSessionId = async (): Promise<string | null> => {
    let currentId = sessionIdRef.current || sessionId;
    if (currentId) return currentId;

    if (activeEntry?.id) {
      try {
        const sessionRes = await fetch("/api/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            queueId: activeEntry.id,
            captureType: "Photo",
          }),
        });
        if (sessionRes.ok) {
          const sData = await sessionRes.json();
          currentId = sData.session?.id || null;
          sessionIdRef.current = currentId;
          setSessionId(currentId);
          return currentId;
        }
      } catch (err) {
        console.error("[ShootConsole] Could not ensure session ID:", err);
      }
    }
    return null;
  };

  // Upload individual photo to Supabase storage 'photos' bucket & media_assets
  const uploadShotPhoto = async (
    shotIdx: number,
    shot: CapturedShot,
    retakeCnt?: number
  ) => {
    if (!activeEntry?.event_id || !activeEntry?.guest?.id) return;
    try {
      const resolvedSessionId = await ensureSessionId();

      const res = await fetch("/api/media/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: shot.image,
          eventId: activeEntry.event_id,
          guestId: activeEntry.guest.id,
          sessionId: resolvedSessionId,
          queueId: activeEntry.id,
          mediaType: "PHOTO",
          shotNumber: shotIdx + 1,
          retakeCount:
            retakeCnt ??
            Math.max(
              0,
              maxRetakesAllowed - (retakesLeft[shotIdx] ?? maxRetakesAllowed)
            ),
          poseId: shot.poseId,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        console.error("[ShootConsole] Shot upload failed:", errJson);
        setSaveToastError("Could not save your photos, please try again");
      }
    } catch (err) {
      console.error("[ShootConsole] Failed to upload shot to storage:", err);
      setSaveToastError("Could not save your photos, please try again");
    }
  };

  // Upload composed strip to Supabase storage 'photos' bucket & media_assets
  const uploadComposedStrip = async (imageUrl: string) => {
    if (!activeEntry?.event_id || !activeEntry?.guest?.id) return;
    try {
      const resolvedSessionId = await ensureSessionId();

      const res = await fetch("/api/media/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: imageUrl,
          eventId: activeEntry.event_id,
          guestId: activeEntry.guest.id,
          sessionId: resolvedSessionId,
          queueId: activeEntry.id,
          mediaType: "STRIP",
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.mediaAssetId) {
          setStripMediaAssetId(data.mediaAssetId);
        }
      } else {
        const errJson = await res.json().catch(() => ({}));
        console.error("[ShootConsole] Strip upload failed:", errJson);
        setSaveToastError("Could not save your photos, please try again");
      }
    } catch (err) {
      console.error("[ShootConsole] Failed to upload composed strip to storage:", err);
      setSaveToastError("Could not save your photos, please try again");
    }
  };

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

        // Upload kept retake to Supabase storage 'photos' bucket & media_assets
        uploadShotPhoto(retakeIdx, { image: result.imageUrl!, poseId });

        // Decrement retakes for this shot
        setRetakesLeft((prev) => {
          const next = [...prev];
          next[retakeIdx] = Math.max(0, (next[retakeIdx] ?? 1) - 1);
          return next;
        });

        // Re-compose layout
        const composed = composePrintLayout({
          shots: updated.map((s) => s.image),
          layout: activeEvent?.print_layout || "STRIP",
          eventName: activeEvent?.name || "Snap & Snack Event",
          eventCode: activeEvent?.event_code || "SNAP",
          dateStr: activeEvent?.start_time,
        });
        setComposedImageUrl(composed);
        uploadComposedStrip(composed);

        setRetakeTargetIndex(null);
        setReviewIndex(retakeIdx);
        setPreviewMode("single");
        setStep("preview");
      } else {
        // Multi-shot sequence
        shotsRef.current[shotIdx] = { image: result.imageUrl!, poseId };
        const updated = [...shotsRef.current];
        setCapturedShots(updated);

        // Upload shot to Supabase storage 'photos' bucket & media_assets
        uploadShotPhoto(shotIdx, { image: result.imageUrl!, poseId });

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
    // Ensure the currently kept shot is stored in Supabase
    const kept = capturedShots[reviewIndex] || shotsRef.current[reviewIndex];
    if (kept) {
      uploadShotPhoto(reviewIndex, kept);
    }

    if (reviewIndex < totalShots - 1) {
      setReviewIndex((prev) => prev + 1);
    } else {
      // After last shot, show the composed summary screen and upload strip
      const currentList = shotsRef.current.length > 0 ? shotsRef.current : capturedShots;
      const composed = composePrintLayout({
        shots: currentList.map((s) => s.image),
        layout: activeEvent?.print_layout || "STRIP",
        eventName: activeEvent?.name || "Snap & Snack Event",
        eventCode: activeEvent?.event_code || "SNAP",
        dateStr: activeEvent?.start_time,
      });
      setComposedImageUrl(composed);
      uploadComposedStrip(composed);
      setPreviewMode("summary");
    }
  };

  // Step 4: Advance to Output
  const handleLooksGood = () => {
    let composed = composedImageUrl;
    if (!composed) {
      const currentList = shotsRef.current.length > 0 ? shotsRef.current : capturedShots;
      composed = composePrintLayout({
        shots: currentList.map((s) => s.image),
        layout: activeEvent?.print_layout || "STRIP",
        eventName: activeEvent?.name || "Snap & Snack Event",
        eventCode: activeEvent?.event_code || "SNAP",
        dateStr: activeEvent?.start_time,
      });
      setComposedImageUrl(composed);
    }
    if (composed) {
      uploadComposedStrip(composed);
    }
    setStep("output");
  };

  // Step 4: Hardware Print action
  const handlePrint = async () => {
    if (printStatus === "working" || printStatus === "done") return;

    if (!activeEntry?.guest?.id) {
      setPrintStatus("failed");
      setPrintMessage("No active guest associated with this session.");
      return;
    }

    setPrintStatus("working");
    setPrintMessage(null);

    try {
      // 1. Verify print limit on the server before hardware print
      const checkRes = await fetch(`/api/print?guestId=${activeEntry.guest.id}`, {
        cache: "no-store",
      });
      if (checkRes.ok) {
        const checkData = await checkRes.json();
        if (!checkData.canPrint) {
          setPrintStatus("done");
          setPrintMessage("You have used your print");
          return;
        }
      }

      // 2. Perform print via hardware gateway
      const result = await hardware.print(composedImageUrl || undefined);

      if (result.success) {
        // 3. Record successful print job
        const recordRes = await fetch("/api/print", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            guestId: activeEntry.guest.id,
            eventId: activeEntry.event_id,
            mediaId: stripMediaAssetId || undefined,
            status: "PRINTED",
          }),
        });

        if (!recordRes.ok && recordRes.status === 409) {
          setPrintStatus("done");
          setPrintMessage("You have used your print");
          return;
        }

        setPrintStatus("done");
        setPrintMessage("Printed");
      } else {
        // 4. Record FAILED print job (does NOT count toward limit)
        await fetch("/api/print", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            guestId: activeEntry.guest.id,
            eventId: activeEntry.event_id,
            mediaId: stripMediaAssetId || undefined,
            status: "FAILED",
          }),
        });

        setPrintStatus("failed");
        setPrintMessage(result.message || "Print failed");
      }
    } catch (err: any) {
      setPrintStatus("failed");
      setPrintMessage("Printer communication error. Ask the operator.");
    }
  };

  // Step 4: Save to Gallery action
  const handleSaveToGallery = async () => {
    if (galleryStatus === "working" || galleryStatus === "done") return;
    setGalleryStatus("working");
    setSaveToastError(null);

    try {
      // 1. Ensure all captured shots are uploaded
      const currentList = shotsRef.current.length > 0 ? shotsRef.current : capturedShots;
      for (let i = 0; i < currentList.length; i++) {
        const shot = currentList[i];
        if (shot?.image) {
          await uploadShotPhoto(i, shot);
        }
      }

      // 2. Ensure composed strip is generated and uploaded
      let currentStrip = composedImageUrl;
      if (!currentStrip && currentList.length > 0) {
        currentStrip = composePrintLayout({
          shots: currentList.map((s) => s.image),
          layout: activeEvent?.print_layout || "STRIP",
          eventName: activeEvent?.name || "Snap & Snack Event",
          eventCode: activeEvent?.event_code || "SNAP",
          dateStr: activeEvent?.start_time,
        });
        setComposedImageUrl(currentStrip);
      }

      if (currentStrip) {
        await uploadComposedStrip(currentStrip);
      }

      // 3. Mark in_gallery = true via backend API
      const currentSessionId = await ensureSessionId();
      const res = await fetch("/api/gallery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: currentSessionId,
          guestId: activeEntry?.guest?.id,
          eventId: activeEntry?.event_id,
        }),
      });

      const resJson = await res.json().catch(() => ({}));

      if (!res.ok || resJson.count === 0) {
        console.error("[ShootConsole] Save to gallery returned error or 0 count:", resJson);
        setGalleryStatus("failed");
        setSaveToastError("Could not save your photos, please try again");
        return;
      }

      setGalleryStatus("done");
      setSaveToastError(null);
    } catch (err: any) {
      console.error("[ShootConsole] Save to gallery exception:", err);
      setGalleryStatus("failed");
      setSaveToastError("Could not save your photos, please try again");
    }
  };

  // Step 4: Mark COMPLETED and return to attract screen
  const handleFinishDone = async () => {
    hardware.stopStream?.();
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
    hardware.stopStream?.();
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
  const guestToken = activeEntry?.guest?.guest_token || "";
  const layoutLabel = activeEvent?.print_layout || "STRIP";

  // Retake metrics
  const currentRetakesLeft = retakesLeft[reviewIndex] ?? maxRetakesAllowed;
  const canRetakeCurrentShot = currentRetakesLeft > 0;
  const canRetakeAll = retakesLeft.slice(0, totalShots).every((r) => r > 0);

  const CurrentPoseIcon = currentPoseInfo.icon;

  if (!isLoadingGuest && !activeEntry) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-paper text-ink p-6">
        <Tile tone="surface" className="max-w-md w-full p-8 text-center space-y-4">
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
          <div className="pt-2 flex justify-center">
            <Pill
              variant="primary"
              size="lg"
              onClick={() => router.push("/")}
              className="uppercase tracking-wider font-mono text-xs"
            >
              Back to Home
            </Pill>
          </div>
        </Tile>
      </div>
    );
  }

  return (
    <div className="relative flex h-screen max-h-screen w-full max-w-full select-none flex-col justify-between overflow-hidden bg-paper text-ink p-4 sm:p-6 lg:p-8">
      {/* FLASH OVERLAY */}
      {isFlashing && (
        <div className="fixed inset-0 z-50 pointer-events-none bg-white transition-opacity duration-200" />
      )}

      {/* SAVE / UPLOAD ERROR FLOATING TOAST */}
      {saveToastError && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-full bg-danger text-white text-xs font-mono shadow-xl animate-fadeIn">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{saveToastError}</span>
          <button
            type="button"
            onClick={() => setSaveToastError(null)}
            className="ml-2 hover:opacity-80 p-0.5 rounded-full"
            aria-label="Dismiss error"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
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

            {/* Camera Permission / Device Error Banner */}
            {cameraErrorBanner && (
              <div className="w-full max-w-xl mx-auto flex items-center justify-between gap-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-xs text-danger font-sans">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-danger" />
                  <span>{cameraErrorBanner}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCameraErrorBanner(null);
                    hardware.initCamera?.().then((st) => {
                      if (st.status === "ERROR") {
                        setCameraErrorBanner("Camera permission still denied. Please check your browser address bar settings.");
                      }
                    });
                  }}
                  className="interactive-secondary underline font-mono text-[10px] uppercase tracking-wider text-danger shrink-0"
                >
                  Retry
                </button>
              </div>
            )}

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
              {/* LIVE CAMERA VIDEO (Mirrored preview only for natural mirror reflection) */}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="absolute inset-0 h-full w-full object-cover -scale-x-100 z-0 pointer-events-none"
              />
              <div className="pointer-events-none absolute inset-0 bg-black/35 z-[1]" />

              {/* Corner Framing Marks */}
              <div className="pointer-events-none absolute inset-4 sm:inset-6 flex flex-col justify-between z-10">
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
              <div className="absolute top-4 sm:top-6 left-4 sm:left-6 flex items-center gap-2 z-10">
                <span className="h-2 w-2 rounded-full bg-accent animate-ping" />
                <Label className="text-paper/80 font-bold">
                  {retakeTargetIndex !== null
                    ? `RETAKING SHOT ${retakeTargetIndex + 1} OF ${totalShots}`
                    : `SHOT ${currentShotIndex + 1} OF ${totalShots}`}
                </Label>
              </div>

              <div className="absolute top-4 sm:top-6 right-4 sm:right-6 z-10">
                <Label className="text-paper/80">MODE: {captureType.toUpperCase()}</Label>
              </div>

              {/* PHASE 1: 3-SECOND POSE INTRO SCREEN BEFORE COUNTDOWN */}
              {countdownPhase === "intro" && !captureError && (
                <div className="relative z-10 flex flex-col items-center justify-center text-center p-6 space-y-3 animate-scaleIn select-none">
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
                <div className="relative z-10 flex flex-col items-center justify-center">
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
                <div className="relative z-10 flex flex-col items-center justify-center gap-3">
                  <Loader2 className="h-12 w-12 animate-spin text-accent" />
                  <Label className="text-paper/90 font-bold">CAPTURING FRAME...</Label>
                </div>
              )}

              {/* Error UI: Hardware Capture Failed */}
              {captureError && (
                <div className="relative z-20 flex max-w-md flex-col items-center justify-center p-6 text-center">
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
                      <Pill
                        variant="secondary"
                        size="md"
                        disabled
                        className="w-full uppercase font-mono text-xs tracking-wider min-h-[44px] opacity-80 cursor-not-allowed"
                      >
                        <Check className="h-4 w-4 text-success" />
                        <span>Printed</span>
                      </Pill>
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

                    {galleryStatus === "failed" && (
                      <div className="flex flex-col items-center gap-1.5 w-full">
                        <div className="inline-flex items-center justify-center gap-1.5 w-full text-xs font-mono font-bold text-danger uppercase">
                          <AlertTriangle className="h-4 w-4" /> Save Failed
                        </div>
                        <Pill
                          variant="secondary"
                          size="md"
                          onClick={handleSaveToGallery}
                          className="w-full uppercase font-mono text-xs tracking-wider min-h-[44px] text-danger border-danger/30 hover:bg-danger/10"
                        >
                          <CloudUpload className="h-4 w-4" />
                          <span>Retry Save</span>
                        </Pill>
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
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt="Gallery QR code"
                  className="h-44 w-44 object-contain"
                />
              ) : (
                <div className="h-44 w-44 flex items-center justify-center font-mono text-xs text-muted">
                  Generating QR...
                </div>
              )}
            </div>
            <div className="font-mono text-[10px] text-muted break-all">
              {`${process.env.NEXT_PUBLIC_APP_URL || (typeof window !== "undefined" ? window.location.origin : "")}/gallery?token=${guestToken}`}
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
