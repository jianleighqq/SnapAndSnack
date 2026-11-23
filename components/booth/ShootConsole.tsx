"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  RotateCcw,
  Check,
  Printer,
  QrCode,
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
import { Modal } from "@/components/ui/Modal";
import { hardware } from "@/lib/hardware";
import { composePrintLayout } from "@/lib/layout";
import { renderTemplateStrip, composeDualPrintSheet } from "@/lib/template-builder";
import { createAnimatedGif } from "@/lib/gif";
import { toBinaryImageBlob } from "@/lib/image-convert";
import type { QueueEntryWithGuest, Event, PhotoTemplate, Pose } from "@/lib/types";
import QRCode from "qrcode";

/**
 * Executes a fetch request with up to maxRetries attempts on 409, 429, or 5xx responses,
 * using exponential backoff with jitter to handle race conditions gracefully.
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3,
  baseDelayMs = 500
): Promise<Response> {
  let attempt = 0;
  while (true) {
    attempt++;
    try {
      const res = await fetch(url, options);
      const shouldRetry =
        (res.status === 409 || res.status === 429 || res.status >= 500) &&
        attempt < maxRetries;
      if (!shouldRetry) {
        return res;
      }
      console.warn(
        `[ShootConsole] Request to ${url} returned ${res.status}. Retrying (${attempt}/${maxRetries})...`
      );
    } catch (networkErr) {
      if (attempt >= maxRetries) throw networkErr;
      console.warn(
        `[ShootConsole] Network error for ${url}. Retrying (${attempt}/${maxRetries})...`,
        networkErr
      );
    }
    const delay = baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 150;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

export type ShootStep = "frame" | "choose" | "countdown" | "preview" | "output";
export type PreviewMode = "single" | "summary";
export type BoothStatus = "loading" | "ready" | "no_guest" | "error";

export const POSE_PREVIEW_PAUSE_MS = 3000;

export const DEFAULT_FALLBACK_POSES: Pose[] = [
  { id: "00000000-0000-0000-0000-000000000001", name: "Classic couple", description: "Close & timeless", is_active: true, sort_order: 1 },
  { id: "00000000-0000-0000-0000-000000000002", name: "Group", description: "Squad shoulder-to-shoulder", is_active: true, sort_order: 2 },
  { id: "00000000-0000-0000-0000-000000000003", name: "Peace sign", description: "Retro booth double V", is_active: true, sort_order: 3 },
  { id: "00000000-0000-0000-0000-000000000004", name: "Funny face", description: "Wild expressions, zero filter", is_active: true, sort_order: 4 },
];

// Backwards-compatibility alias for tests
export const POSES = DEFAULT_FALLBACK_POSES;

export interface CapturedShot {
  image: string;
  poseId: string;
}

export default function ShootConsole() {
  const router = useRouter();

  // Active event & queue data
  const [activeEvent, setActiveEvent] = useState<Event | null>(null);
  const [activeEntry, setActiveEntry] = useState<QueueEntryWithGuest | null>(null);
  const [boothStatus, setBoothStatus] = useState<BoothStatus>("loading");
  const [statusError, setStatusError] = useState<string | null>(null);
  const boothRequestIdRef = useRef<number>(0);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Dynamic active poses from database
  const [availablePoses, setAvailablePoses] = useState<Pose[]>(DEFAULT_FALLBACK_POSES);

  // Step state
  const [step, setStep] = useState<ShootStep>("choose");

  // Guest frame selection state
  const [eligibleTemplates, setEligibleTemplates] = useState<PhotoTemplate[]>([]);
  const [isChangingFrameModalOpen, setIsChangingFrameModalOpen] = useState(false);

  // Step 1: Per-shot pose slot selections
  const totalShots = Math.max(1, Math.min(4, activeEvent?.shots_per_guest || 3));
  const maxRetakesAllowed = activeEvent?.max_retakes ?? 2;

  const [selectedPoses, setSelectedPoses] = useState<(string | null)[]>([null, null, null]);
  const [activeSlotIndex, setActiveSlotIndex] = useState<number>(0);

  // Step 2: Multi-shot & Countdown
  const [currentShotIndex, setCurrentShotIndex] = useState(0);
  const [retakeTargetIndex, setRetakeTargetIndex] = useState<number | null>(null);
  const [capturedShots, setCapturedShots] = useState<CapturedShot[]>([]);
  const shotsRef = useRef<CapturedShot[]>([]);
  const [retakesLeft, setRetakesLeft] = useState<number[]>([2, 2, 2, 2]);

  // Countdown state: intro pose preview (3s) -> numerical 3-2-1
  const [countdownPhase, setCountdownPhase] = useState<"intro" | "counting">("intro");
  const [currentPoseInfo, setCurrentPoseInfo] = useState<Pose>(DEFAULT_FALLBACK_POSES[0]);
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
  const [activeTemplate, setActiveTemplate] = useState<PhotoTemplate | null>(null);
  const [printStatus, setPrintStatus] = useState<"idle" | "working" | "done" | "failed">("idle");
  const [printMessage, setPrintMessage] = useState<string | null>(null);

  const [showQrTile, setShowQrTile] = useState(false);
  const [galleryStatus, setGalleryStatus] = useState<"idle" | "working" | "done" | "failed">("idle");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const [stripMediaAssetId, setStripMediaAssetId] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [saveToastError, setSaveToastError] = useState<string | null>(null);

  // Animated GIF State
  const [gifDataUrl, setGifDataUrl] = useState<string | null>(null);
  const [gifStatus, setGifStatus] = useState<"idle" | "generating" | "done" | "error">("idle");
  const gifDataUrlRef = useRef<string | null>(null);
  const gifStatusRef = useRef<"idle" | "generating" | "done" | "error">("idle");
  const shouldMakeGif = Boolean(activeEvent?.include_gif);

  useEffect(() => {
    gifStatusRef.current = gifStatus;
  }, [gifStatus]);

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

  // 1. Fetch current booth guest & event from public scoped endpoint
  const fetchCurrentBooth = async (isMounted = true, isPoll = false) => {
    const requestId = ++boothRequestIdRef.current;
    if (!isPoll) {
      setBoothStatus((prev) => (prev === "no_guest" ? "no_guest" : "loading"));
    }

    try {
      const res = await fetch("/api/booth/current", { cache: "no-store" });
      if (requestId !== boothRequestIdRef.current || !isMounted) return;

      if (res.status === 409) {
        setActiveEntry(null);
        setBoothStatus("no_guest");
        return;
      }

      if (!res.ok) {
        if (!activeEntry) {
          setBoothStatus("error");
          setStatusError("Can't reach the booth server, retrying...");
        }
        return;
      }

      const data = await res.json().catch(() => ({}));
      if (requestId !== boothRequestIdRef.current || !isMounted) return;

      if (!data?.guest) {
        setActiveEntry(null);
        setBoothStatus("no_guest");
        return;
      }
      if (!isMounted) return;

      if (data.event) {
        setActiveEvent(data.event);
        const limit = data.event.max_retakes ?? 2;
        const count = data.event.shots_per_guest ?? 3;
        setRetakesLeft(new Array(count).fill(limit));
        setSelectedPoses(new Array(count).fill(null));
      }

      if (data.eligibleTemplates) {
        setEligibleTemplates(data.eligibleTemplates);
      }

      if (data.template) {
        setActiveTemplate(data.template);
      }

      if (data.poses && Array.isArray(data.poses) && data.poses.length > 0) {
        setAvailablePoses(data.poses);
      }

      // Check whether guest frame selection step should be displayed
      const canChooseFrame =
        data.event?.template_mode === "GUEST" &&
        (data.eligibleTemplates?.length ?? 0) >= 2;

      setStep((curr) => {
        if (curr === "countdown" || curr === "preview" || curr === "output") {
          return curr;
        }
        return canChooseFrame ? "frame" : "choose";
      });

      if (data.guest) {
        setActiveEntry({
          id: "current-booth-guest",
          event_id: data.event?.id || "",
          guest_id: "current",
          queue_number: data.guest.queue_number,
          scheduled_shoot_time: null,
          status: "IN_PROGRESS",
          guest: {
            id: "current",
            event_id: data.event?.id || "",
            full_name: data.guest.first_name,
            email: "",
            guest_token: "",
          },
        });
      }

      if (data.qrUrl) {
        QRCode.toDataURL(data.qrUrl, { width: 300, margin: 1 })
          .then((url) => {
            if (isMounted) setQrDataUrl(url);
          })
          .catch((err) => console.error("QR Code generation error:", err));
      }

      // Initialize shoot session for this guest
      try {
        const sessionRes = await fetch("/api/booth/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            captureType: "PHOTO",
            templateId: data.template?.id || null,
          }),
        });
        if (sessionRes.ok) {
          const sData = await sessionRes.json();
          if (sData.session?.id && isMounted) {
            sessionIdRef.current = sData.session.id;
            setSessionId(sData.session.id);
          }
        }
      } catch (sErr) {
        console.warn("Could not init booth shoot session:", sErr);
      }

      // Check print status
      try {
        const printRes = await fetch("/api/booth/print", { cache: "no-store" });
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

      setBoothStatus("ready");
    } catch (err) {
      console.error("Error setting up shoot guest:", err);
      if (requestId === boothRequestIdRef.current && isMounted) {
        if (!activeEntry) {
          setBoothStatus("error");
          setStatusError("Can't reach the booth server, retrying...");
        }
      }
    }
  };

  useEffect(() => {
    let isMounted = true;
    fetchCurrentBooth(isMounted);

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

  // Poll /api/booth/current every 3 seconds while on "no_guest" or "error"
  // Pauses when document is hidden; ignores out-of-order responses
  useEffect(() => {
    if (boothStatus !== "no_guest" && boothStatus !== "error") {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      return;
    }

    const poll = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      fetchCurrentBooth(true, true);
    };

    pollTimerRef.current = setInterval(poll, 3000);

    const handleVisibilityChange = () => {
      if (!document.hidden && (boothStatus === "no_guest" || boothStatus === "error")) {
        fetchCurrentBooth(true, true);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [boothStatus]);

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

  // Helper to ensure a shoot session exists before uploading
  const ensureSessionId = async (): Promise<string | null> => {
    let currentId = sessionIdRef.current || sessionId;
    if (currentId) return currentId;

    try {
      const sessionRes = await fetch("/api/booth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ captureType: "PHOTO" }),
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
    return null;
  };

  // Upload individual photo to Supabase storage 'photos' bucket & media_assets as real binary JPEG
  const uploadShotPhoto = async (
    shotIdx: number,
    shot: CapturedShot,
    retakeCnt?: number
  ) => {
    try {
      const resolvedSessionId = await ensureSessionId();
      if (!resolvedSessionId) {
        console.error("[ShootConsole] Cannot upload shot: no sessionId");
        setSaveToastError("Could not start shoot session");
        return;
      }
      const binaryBlob = await toBinaryImageBlob(shot.image, "PHOTO", 800, 600);

      const formData = new FormData();
      formData.append("file", binaryBlob, `shot-${shotIdx + 1}.jpg`);
      formData.append("mediaType", "PHOTO");
      formData.append("shotNumber", String(shotIdx + 1));
      formData.append(
        "retakeCount",
        String(
          retakeCnt ??
            Math.max(
              0,
              maxRetakesAllowed - (retakesLeft[shotIdx] ?? maxRetakesAllowed)
            )
        )
      );
      if (shot.poseId) formData.append("poseId", shot.poseId);
      formData.append("sessionId", resolvedSessionId);

      const res = await fetchWithRetry("/api/booth/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        const specificError = errJson?.error || `Server error (${res.status})`;
        console.error("[ShootConsole] Shot upload failed:", specificError);
        setSaveToastError(`Shot upload failed: ${specificError}`);
      }
    } catch (err: any) {
      console.error("[ShootConsole] Failed to upload shot to storage:", err);
      setSaveToastError(`Shot upload failed: ${err?.message || "Network error"}`);
    }
  };

  // Upload composed strip to Supabase storage 'photos' bucket & media_assets as real binary JPEG
  const uploadComposedStrip = async (imageUrl: string) => {
    try {
      const resolvedSessionId = await ensureSessionId();
      if (!resolvedSessionId) {
        console.error("[ShootConsole] Cannot upload strip: no sessionId");
        setSaveToastError("Could not start shoot session");
        return;
      }
      const binaryBlob = await toBinaryImageBlob(imageUrl, "STRIP", 1200, 1800);

      const formData = new FormData();
      formData.append("file", binaryBlob, "strip.jpg");
      formData.append("mediaType", "STRIP");
      formData.append("sessionId", resolvedSessionId);

      const res = await fetchWithRetry("/api/booth/upload", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        if (data.mediaAssetId) {
          setStripMediaAssetId(data.mediaAssetId);
        }
      } else {
        const errJson = await res.json().catch(() => ({}));
        const specificError = errJson?.error || `Server error (${res.status})`;
        console.error("[ShootConsole] Strip upload failed:", specificError);
        setSaveToastError(`Strip upload failed: ${specificError}`);
      }
    } catch (err: any) {
      console.error("[ShootConsole] Failed to upload composed strip to storage:", err);
      setSaveToastError(`Strip upload failed: ${err?.message || "Network error"}`);
    }
  };

  // Upload animated GIF to Supabase storage 'photos' bucket & media_assets as real binary GIF
  const uploadGif = async (imageUrl: string) => {
    try {
      const resolvedSessionId = await ensureSessionId();
      if (!resolvedSessionId) {
        console.error("[ShootConsole] Cannot upload GIF: no sessionId");
        setGifStatus("error");
        return;
      }
      const binaryBlob = await toBinaryImageBlob(imageUrl, "GIF");

      const formData = new FormData();
      formData.append("file", binaryBlob, "animation.gif");
      formData.append("mediaType", "GIF");
      formData.append("sessionId", resolvedSessionId);

      const res = await fetchWithRetry("/api/booth/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        const specificError = errJson?.error || `Server error (${res.status})`;
        console.error("[ShootConsole] GIF upload failed:", specificError);
        setGifStatus("error");
      }
    } catch (err: any) {
      console.error("[ShootConsole] Failed to upload animated GIF to storage:", err?.message || err);
      setGifStatus("error");
    }
  };

  // Generate looping animated GIF from kept shots in browser
  const generateGuestGif = async () => {
    if (!shouldMakeGif) return;
    if (gifStatus === "generating" || gifStatus === "done") return;
    setGifStatus("generating");

    try {
      const currentList = shotsRef.current.length > 0 ? shotsRef.current : capturedShots;
      const images = currentList.map((s) => s?.image).filter(Boolean);
      if (images.length === 0) {
        setGifStatus("error");
        return;
      }

      const result = await createAnimatedGif(images, {
        width: 480,
        paletteColors: 256,
        frameDelayMs: 700,
        lastFramePauseMs: 500,
        maxBytes: 25 * 1024 * 1024,
      });

      setGifDataUrl(result.dataUrl);
      gifDataUrlRef.current = result.dataUrl;
      setGifStatus("done");
      // Pre-upload the GIF in the background immediately once generated
      uploadGif(result.dataUrl);
    } catch (err: any) {
      console.error("[ShootConsole] GIF generation failed:", err?.message || err);
      setGifStatus("error");
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

  // "Surprise me": Fills all empty slots with random distinct poses from available active poses
  const handleSurpriseMe = () => {
    const pool = availablePoses.length > 0 ? availablePoses : DEFAULT_FALLBACK_POSES;
    if (pool.length === 0) return;

    setSelectedPoses((prev) => {
      // Avoid duplicates if pool has enough distinct poses
      const alreadyChosen = new Set(prev.filter((p): p is string => p !== null));
      const availableRemaining = pool.filter((p) => !alreadyChosen.has(p.id));

      const shuffledRemaining = [...availableRemaining].sort(() => Math.random() - 0.5);
      const shuffledAll = [...pool].sort(() => Math.random() - 0.5);

      let remainIdx = 0;
      let allIdx = 0;

      return prev.map((p) => {
        if (p !== null) return p;
        if (remainIdx < shuffledRemaining.length) {
          return shuffledRemaining[remainIdx++].id;
        }
        return shuffledAll[allIdx++ % shuffledAll.length].id;
      });
    });
  };

  // Are all slots assigned?
  const allPosesSelected =
    selectedPoses.length === totalShots && selectedPoses.every((p) => p !== null);

  // Helper to get pose from id
  const getPoseById = (poseId: string | null): Pose => {
    const pool = availablePoses.length > 0 ? availablePoses : DEFAULT_FALLBACK_POSES;
    if (!poseId) return pool[0];
    return pool.find((p) => p.id === poseId || p.name === poseId) || pool[0];
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
        type: "PHOTO",
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

  // Handle guest frame selection or change
  const handleSelectFrame = async (tpl: PhotoTemplate) => {
    setActiveTemplate(tpl);
    if (sessionIdRef.current) {
      try {
        await fetch("/api/booth/session", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: sessionIdRef.current,
            templateId: tpl.id,
          }),
        });
      } catch (err) {
        console.warn("Could not patch shoot session template:", err);
      }
    }
  };

  const handleChangeFrameOnSummary = async (tpl: PhotoTemplate) => {
    await handleSelectFrame(tpl);
    setIsChangingFrameModalOpen(false);
    const composed = await buildComposedStrip(tpl);
    setComposedImageUrl(composed);
    uploadComposedStrip(composed);
  };

  // Builds the strip: uses custom event template if active, else falls back to default layout
  const buildComposedStrip = async (tplOverride?: PhotoTemplate | null): Promise<string> => {
    const tpl = tplOverride !== undefined ? tplOverride : activeTemplate;
    const currentList = shotsRef.current.length > 0 ? shotsRef.current : capturedShots;
    const shotUrls = currentList.map((s) => s.image);

    if (tpl && tpl.slots && tpl.slots.length > 0) {
      try {
        const customStrip = await renderTemplateStrip({
          canvasWidth: tpl.canvas_width,
          canvasHeight: tpl.canvas_height,
          slots: tpl.slots,
          shots: shotUrls,
          frameUrl: tpl.frame_url,
          backgroundUrl: tpl.background_url,
        });
        return customStrip;
      } catch (err) {
        console.warn("Failed to render custom template strip, falling back to default:", err);
      }
    }

    // Default layout fallback
    return composePrintLayout({
      shots: shotUrls,
      layout: activeEvent?.print_layout || "STRIP",
      eventName: activeEvent?.name || "Snap & Snack Event",
      eventCode: activeEvent?.event_code || "SNAP",
      dateStr: activeEvent?.start_time,
    });
  };

  // Keep & Next / Keep & Finish transition
  const handleKeepAndNext = async () => {
    // Ensure the currently kept shot is stored in Supabase
    const kept = capturedShots[reviewIndex] || shotsRef.current[reviewIndex];
    if (kept) {
      uploadShotPhoto(reviewIndex, kept);
    }

    if (reviewIndex < totalShots - 1) {
      setReviewIndex((prev) => prev + 1);
    } else {
      // After last shot, show the composed summary screen and upload strip
      const composed = await buildComposedStrip();
      setComposedImageUrl(composed);
      uploadComposedStrip(composed);
      setPreviewMode("summary");
      if (shouldMakeGif) {
        generateGuestGif();
      }
    }
  };

  // Step 4: Advance to Output
  const handleLooksGood = async () => {
    let composed = composedImageUrl;
    if (!composed) {
      composed = await buildComposedStrip();
      setComposedImageUrl(composed);
    }
    if (composed) {
      uploadComposedStrip(composed);
    }
    if (shouldMakeGif && gifStatus === "idle") {
      generateGuestGif();
    }
    setStep("output");
  };

  // Trigger background GIF creation as soon as reviewing finishes and output/summary is reached
  useEffect(() => {
    if (
      (step === "output" || (step === "preview" && previewMode === "summary")) &&
      shouldMakeGif &&
      gifStatus === "idle"
    ) {
      generateGuestGif();
    }
  }, [step, previewMode, shouldMakeGif, gifStatus]);

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
      const resolvedSessionId = sessionIdRef.current || sessionId;
      const checkUrl = resolvedSessionId
        ? `/api/booth/print?sessionId=${encodeURIComponent(resolvedSessionId)}`
        : "/api/booth/print";
      const checkRes = await fetch(checkUrl, { cache: "no-store" });
      if (checkRes.ok) {
        const checkData = await checkRes.json();
        if (!checkData.canPrint) {
          setPrintStatus("done");
          setPrintMessage("You have used your print");
          return;
        }
      }

      // 2. Prepare 2-up dual print sheet for 4x6 printing if STRIP layout
      let printSheetUrl = composedImageUrl || undefined;
      if (printSheetUrl && (activeEvent?.print_layout || "STRIP") === "STRIP") {
        try {
          if (!printSheetUrl.startsWith("data:image/svg")) {
            printSheetUrl = await composeDualPrintSheet(printSheetUrl);
          }
        } catch (dualErr) {
          console.warn("Failed to compose dual print sheet, using single strip:", dualErr);
        }
      }

      // Perform print via hardware gateway
      const result = await hardware.print(printSheetUrl);

      if (result.success) {
        // 3. Record successful print job
        const recordRes = await fetchWithRetry("/api/booth/print", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: resolvedSessionId,
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
        await fetchWithRetry("/api/booth/print", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: resolvedSessionId,
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

  // Step 5: Automatically publish session media to gallery
  const handleAutoPublishGallery = async () => {
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

      // 2b. Ensure animated GIF is uploaded if ready
      const currentGif = gifDataUrlRef.current || gifDataUrl;
      if (currentGif) {
        await uploadGif(currentGif);
      }

      // 3. Mark in_gallery = true via backend API
      const currentSessionId = await ensureSessionId();
      if (!currentSessionId) {
        setGalleryStatus("failed");
        setSaveToastError("Gallery sync failed: No active shoot session");
        return;
      }

      const res = await fetchWithRetry("/api/booth/gallery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: currentSessionId,
        }),
      });

      if (!res.ok) {
        const resJson = await res.json().catch(() => ({}));
        const specificError = resJson?.error || `Server error (${res.status})`;
        console.error("[ShootConsole] Auto-publish to gallery error:", specificError);
        setGalleryStatus("failed");
        setSaveToastError(`Gallery sync failed: ${specificError}`);
        return;
      }

      setGalleryStatus("done");
      setSaveToastError(null);
    } catch (err: any) {
      console.error("[ShootConsole] Auto-publish to gallery exception:", err);
      setGalleryStatus("failed");
      setSaveToastError(`Gallery sync failed: ${err?.message || "Network error"}`);
    }
  };

  const handleRetryPublish = () => {
    setGalleryStatus("idle");
    setSaveToastError(null);
  };

  // Trigger automatic gallery publish as soon as Collect screen (step 5) is reached
  useEffect(() => {
    if (step === "output" && galleryStatus === "idle") {
      handleAutoPublishGallery();
    }
  }, [step, galleryStatus]);

  // Step 4: Mark COMPLETED and return to attract screen
  const handleFinishDone = async () => {
    hardware.stopStream?.();
    setIsFinishing(true);
    const resolvedSessionId = sessionIdRef.current || sessionId;
    try {
      await fetchWithRetry("/api/booth/finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: resolvedSessionId,
        }),
      });
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
    setGifDataUrl(null);
    gifDataUrlRef.current = null;
    setGifStatus("idle");
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

  // Check if guest frame selection step should be shown
  const hasFrameStep = Boolean(
    activeEvent?.template_mode === "GUEST" && eligibleTemplates.length >= 2
  );

  // Retake metrics
  const currentRetakesLeft = retakesLeft[reviewIndex] ?? maxRetakesAllowed;
  const canRetakeCurrentShot = currentRetakesLeft > 0;
  const canRetakeAll = retakesLeft.slice(0, totalShots).every((r) => r > 0);

  // 1. Loading state: neutral editorial full-screen loading view, NEVER render step screens
  if (boothStatus === "loading") {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-paper text-ink p-6 select-none animate-fadeIn">
        <div className="flex flex-col items-center space-y-4 text-center max-w-sm">
          <img
            src="/logo.png"
            alt="Snap & Snack logo"
            className="h-12 w-auto object-contain opacity-90 animate-pulse"
          />
          <div className="space-y-1.5">
            <h2 className="font-display text-2xl uppercase tracking-wide">
              Snap &amp; Snack
            </h2>
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
              <p className="font-mono text-xs uppercase tracking-widest text-muted">
                Getting the booth ready...
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 2. No Guest Called state: 409 means "no guest", renders "No guest is being called" card directly
  if (boothStatus === "no_guest" || !activeEntry) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-paper text-ink p-6 animate-fadeIn">
        <Tile tone="surface" className="max-w-md w-full p-8 text-center space-y-4 shadow-xl border border-ink/10">
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
              variant="primary"
              size="lg"
              onClick={() => router.push("/")}
              className="uppercase tracking-wider font-mono text-xs min-h-[44px]"
            >
              Back to Home
            </Pill>
          </div>
        </Tile>
      </div>
    );
  }

  // 3. Network or Server Error state: renders "Can't reach the booth server, retrying..." with auto-retry
  if (boothStatus === "error") {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-paper text-ink p-6 animate-fadeIn">
        <Tile tone="surface" className="max-w-md w-full p-8 text-center space-y-4 shadow-xl border border-ink/10">
          <div className="w-14 h-14 mx-auto rounded-full bg-danger/10 flex items-center justify-center text-danger">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <div>
            <Label tone="danger" className="block mb-1">Connection Error</Label>
            <h2 className="font-display text-3xl uppercase tracking-tight text-ink">
              Booth Server Offline
            </h2>
          </div>
          <p className="text-sm text-muted font-sans">
            {statusError || "Can't reach the booth server, retrying..."}
          </p>
          <div className="pt-2 flex flex-col items-center gap-3">
            <div className="flex items-center gap-2 font-mono text-xs text-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
              <span>Retrying every 3 seconds...</span>
            </div>
            <div className="flex gap-2">
              <Pill
                variant="primary"
                size="md"
                onClick={() => fetchCurrentBooth(true)}
                className="uppercase tracking-wider font-mono text-xs min-h-[44px]"
              >
                Retry Now
              </Pill>
              <Pill
                variant="secondary"
                size="md"
                onClick={() => router.push("/")}
                className="uppercase tracking-wider font-mono text-xs min-h-[44px]"
              >
                Back to Home
              </Pill>
            </div>
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
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2.5 rounded-full bg-danger text-white text-xs font-mono shadow-xl animate-fadeIn">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{saveToastError}</span>
          <button
            type="button"
            onClick={handleRetryPublish}
            className="underline uppercase font-bold hover:opacity-90 tracking-wider text-[11px] px-1"
          >
            Retry
          </button>
          <button
            type="button"
            onClick={() => setSaveToastError(null)}
            className="hover:opacity-80 p-0.5 rounded-full"
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
              {hasFrameStep ? (
                <>
                  {step === "frame" && "STEP 1 OF 5 · CHOOSE FRAME"}
                  {step === "choose" && "STEP 2 OF 5 · CHOOSE POSES"}
                  {step === "countdown" && "STEP 3 OF 5 · GET READY"}
                  {step === "preview" &&
                    (previewMode === "single"
                      ? `STEP 4 OF 5 · REVIEW (${reviewIndex + 1}/${totalShots})`
                      : "STEP 4 OF 5 · REVIEW SUMMARY")}
                  {step === "output" && "STEP 5 OF 5 · COLLECT"}
                </>
              ) : (
                <>
                  {step === "choose" && "STEP 1 OF 4 · CHOOSE POSES"}
                  {step === "countdown" && "STEP 2 OF 4 · GET READY"}
                  {step === "preview" &&
                    (previewMode === "single"
                      ? `STEP 3 OF 4 · REVIEW (${reviewIndex + 1}/${totalShots})`
                      : "STEP 3 OF 4 · REVIEW SUMMARY")}
                  {step === "output" && "STEP 4 OF 4 · COLLECT"}
                </>
              )}
            </Label>

            {/* Cancel shoot button stays accessible in initial setup steps */}
            {(step === "frame" || step === "choose" || step === "countdown") && (
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

      {/* MAIN STEP CONTENT - Fluid responsive layout across tablets, laptops and desktops */}
      <main className="relative z-10 flex flex-1 flex-col justify-center overflow-y-auto no-scrollbar py-2 sm:py-3">
        {/* STEP 1 (GUEST MODE & >=2 ELIGIBLE TEMPLATES): CHOOSE YOUR FRAME */}
        {step === "frame" && (
          <div className="mx-auto flex min-h-0 flex-1 w-full max-w-5xl flex-col justify-center space-y-4 sm:space-y-6 animate-fadeIn">
            {/* Header / Subtitle */}
            <div className="text-center space-y-1">
              <Label tone="accent">Step 01 · Personalize Your Photos</Label>
              <h1 className="font-display text-[clamp(28px,4.5vh,48px)] uppercase tracking-tight leading-tight">
                Choose Your <span className="text-accent">Frame</span>
              </h1>
              <p className="font-sans text-xs sm:text-sm text-muted">
                Pick your favorite style for your photo strip. Your photos will be printed in this design.
              </p>
            </div>

            {/* Grid of Eligible Templates */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4 w-full max-h-[50vh] overflow-y-auto p-1">
              {eligibleTemplates.map((tpl) => {
                const isSelected = activeTemplate?.id === tpl.id;
                const isFrame = Boolean(tpl.frame_url);

                return (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => handleSelectFrame(tpl)}
                    className={`relative flex flex-col items-center justify-between p-3 rounded-tile text-left transition-all overflow-hidden border ${
                      isSelected
                        ? "bg-paper border-accent ring-2 ring-accent shadow-md"
                        : "bg-surface hover:bg-paper/80 border-ink/10 hover:border-ink/30"
                    }`}
                  >
                    <div className="w-full flex items-center justify-between pb-2 text-[11px] font-mono">
                      <span className="font-bold text-ink truncate max-w-[130px]">
                        {tpl.name}
                      </span>
                      {isSelected ? (
                        <span className="inline-flex items-center gap-1 text-[10px] text-accent font-bold uppercase">
                          <Check className="h-3 w-3" /> Selected
                        </span>
                      ) : tpl.is_default ? (
                        <span className="text-[10px] text-muted uppercase">Default</span>
                      ) : null}
                    </div>

                    {/* Preview thumbnail with sample slots */}
                    <div className="relative w-full aspect-[2/3] max-h-[220px] rounded-lg overflow-hidden bg-neutral-900 border border-ink/10 flex items-center justify-center p-1">
                      {tpl.background_url && (
                        <img
                          src={tpl.background_url}
                          alt="Background"
                          className="absolute inset-0 w-full h-full object-cover"
                        />
                      )}
                      {tpl.slots?.map((s, i) => (
                        <div
                          key={i}
                          className="absolute border border-accent/40 bg-accent/20 flex items-center justify-center text-[8px] font-mono text-paper font-bold"
                          style={{
                            left: `${(s.x / tpl.canvas_width) * 100}%`,
                            top: `${(s.y / tpl.canvas_height) * 100}%`,
                            width: `${(s.w / tpl.canvas_width) * 100}%`,
                            height: `${(s.h / tpl.canvas_height) * 100}%`,
                          }}
                        >
                          #{i + 1}
                        </div>
                      ))}
                      {tpl.frame_url && (
                        <img
                          src={tpl.frame_url}
                          alt="Frame"
                          className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                        />
                      )}
                    </div>

                    <div className="w-full pt-2 flex items-center justify-between text-[10px] font-mono text-muted uppercase">
                      <span>{tpl.shots_count} shots</span>
                      <span>{isFrame ? "Frame" : "Background"}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Continue Button */}
            <div className="flex justify-center pt-2">
              <Pill
                variant="primary"
                size="lg"
                onClick={() => setStep("choose")}
                className="min-h-[52px] px-10 text-xs sm:text-sm font-mono uppercase tracking-wider gap-2"
              >
                <span>Continue</span>
                <ArrowRight className="h-4 w-4" />
              </Pill>
            </div>
          </div>
        )}

        {/* STEP 2: CHOOSE PER-SHOT POSES */}
        {step === "choose" && (
          <div className="mx-auto flex min-h-0 flex-1 w-full max-w-5xl flex-col justify-center space-y-3 sm:space-y-4 animate-fadeIn">
            {/* Header / Subtitle */}
            <div className="text-center space-y-1">
              <Label tone="accent">
                {hasFrameStep ? "Step 02 · Plan Your Sequence" : "Step 01 · Plan Your Sequence"}
              </Label>
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
                className={`grid gap-2.5 sm:gap-3 w-full ${totalShots === 1
                  ? "grid-cols-1 max-w-sm mx-auto"
                  : totalShots === 2
                    ? "grid-cols-2"
                    : totalShots === 3
                      ? "grid-cols-3"
                      : "grid-cols-2 sm:grid-cols-4"
                  }`}
              >
                {Array.from({ length: totalShots }).map((_, slotIdx) => {
                  const poseId = selectedPoses[slotIdx];
                  const isFilled = poseId !== null;
                  const isActive = activeSlotIndex === slotIdx;
                  const poseObj = isFilled ? getPoseById(poseId) : null;

                  return (
                    <button
                      key={slotIdx}
                      type="button"
                      onClick={() => setActiveSlotIndex(slotIdx)}
                      data-selected={isActive ? "true" : undefined}
                      className={`relative flex min-h-[58px] sm:min-h-[64px] items-center gap-2.5 p-2.5 sm:p-3 rounded-tile text-left overflow-hidden ${isActive
                        ? "is-selected bg-ink text-paper ring-2 ring-accent"
                        : isFilled
                          ? "interactive-tile bg-surface text-ink border border-ink/10"
                          : "interactive-tile border-2 border-dashed border-ink/20 bg-paper/50 text-muted"
                        }`}
                    >
                      <div
                        className={`flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-full overflow-hidden ${isActive
                          ? "bg-paper/15 text-accent"
                          : isFilled
                            ? "bg-paper text-accent"
                            : "bg-ink/5 text-muted"
                          }`}
                      >
                        {isFilled && poseObj?.image_url ? (
                          <img
                            src={poseObj.image_url}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : isFilled ? (
                          <Camera className="h-4 w-4" />
                        ) : (
                          <Plus className="h-4 w-4" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <span
                            className={`font-mono text-[9px] uppercase tracking-wider ${isActive ? "text-accent font-bold" : "text-muted"
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
              <div className="flex items-center justify-between px-1">
                <Label className="text-muted text-[10px]">
                  Available Poses · Tap to fill Shot {activeSlotIndex + 1}
                </Label>
                {availablePoses.length > 0 && availablePoses.length < totalShots && (
                  <span className="text-[10px] font-mono text-amber-700 bg-amber-500/10 px-2 py-0.5 rounded-full">
                    Fewer poses available than shots. You can repeat poses across shots.
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 max-h-[30vh] sm:max-h-[26vh] overflow-y-auto pr-1">
                {(availablePoses.length > 0 ? availablePoses : DEFAULT_FALLBACK_POSES).map((pose) => {
                  const isCurrentSlotPose = selectedPoses[activeSlotIndex] === pose.id;

                  return (
                    <button
                      key={pose.id}
                      type="button"
                      onClick={() => handleSelectPoseForActiveSlot(pose.id)}
                      data-selected={isCurrentSlotPose ? "true" : undefined}
                      className={`group relative flex flex-col items-center justify-between p-2 sm:p-2.5 text-center rounded-tile min-h-[clamp(90px,14vh,130px)] transition-all overflow-hidden ${
                        isCurrentSlotPose
                          ? "is-selected bg-surface ring-2 ring-accent text-ink"
                          : "interactive-tile bg-surface text-ink border border-ink/5 hover:border-ink/20"
                      }`}
                    >
                      <div className="relative w-full aspect-[4/3] max-h-[70px] rounded-lg overflow-hidden bg-neutral-900 mb-1 flex items-center justify-center border border-ink/10">
                        {pose.image_url ? (
                          <img
                            src={pose.image_url}
                            alt={pose.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex items-center justify-center text-accent/80">
                            <Camera className="h-6 w-6 opacity-75" />
                          </div>
                        )}
                        {isCurrentSlotPose && (
                          <div className="absolute top-1 right-1 bg-accent text-paper rounded-full p-0.5">
                            <Check className="h-2.5 w-2.5" />
                          </div>
                        )}
                      </div>
                      <div className="w-full">
                        <div className="font-display text-xs sm:text-sm uppercase tracking-wide truncate">
                          {pose.name}
                        </div>
                        {pose.description && (
                          <div className="text-[10px] text-muted line-clamp-1 mt-0.5 font-sans">
                            {pose.description}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Start Countdown Button & Validation Label */}
            <div className="flex flex-col items-center justify-center gap-1.5 pt-1 sm:pt-2">
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
          <div className="mx-auto flex min-h-0 flex-1 w-full max-w-4xl flex-col items-center justify-between space-y-3 animate-fadeIn">
            {/* Viewfinder Tile */}
            <div className="relative flex aspect-[4/3] w-full max-h-[46vh] sm:max-h-[54vh] flex-col items-center justify-center overflow-hidden rounded-tile bg-[#181614] text-paper shadow-2xl border border-ink/10">
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

              {/* PHASE 1: 3-SECOND POSE INTRO SCREEN BEFORE COUNTDOWN */}
              {countdownPhase === "intro" && !captureError && (
                <div className="relative z-10 flex flex-col items-center justify-center text-center p-6 space-y-3 animate-scaleIn select-none">
                  {currentPoseInfo.image_url ? (
                    <div className="relative h-20 w-20 sm:h-24 sm:w-24 rounded-2xl overflow-hidden border-2 border-accent/60 shadow-lg mb-1 bg-neutral-900">
                      <img
                        src={currentPoseInfo.image_url}
                        alt={currentPoseInfo.name}
                        className="h-full w-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-full bg-accent/20 text-accent mb-1 border border-accent/40">
                      <Camera className="h-8 w-8 sm:h-10 sm:w-10" />
                    </div>
                  )}
                  <div>
                    <Label tone="accent" className="font-bold tracking-[0.2em] mb-1 block">
                      {retakeTargetIndex !== null
                        ? `SHOT ${retakeTargetIndex + 1} OF ${totalShots} · GET READY`
                        : `SHOT ${currentShotIndex + 1} OF ${totalShots} · GET READY`}
                    </Label>
                    <h2 className="font-display text-[clamp(44px,7.5vh,80px)] uppercase tracking-tight text-paper leading-none">
                      {currentPoseInfo.name}
                    </h2>
                    {currentPoseInfo.description && (
                      <p className="text-xs sm:text-sm text-paper/70 font-sans mt-1">
                        {currentPoseInfo.description}
                      </p>
                    )}
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

              {/* CORNER POSE GUIDE OVERLAY DURING COUNTDOWN */}
              {countdownPhase === "counting" && countdownNumber !== null && !isCapturing && (
                <div className="absolute bottom-4 right-4 sm:bottom-6 sm:right-6 z-20 flex items-center gap-2.5 p-2 rounded-xl bg-black/60 backdrop-blur-md border border-paper/20 shadow-xl pointer-events-none select-none animate-fadeIn">
                  {currentPoseInfo.image_url ? (
                    <img
                      src={currentPoseInfo.image_url}
                      alt=""
                      className="h-12 w-12 sm:h-14 sm:w-14 object-cover rounded-lg shrink-0 border border-paper/10"
                    />
                  ) : (
                    <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-lg bg-paper/10 flex items-center justify-center shrink-0">
                      <Camera className="h-6 w-6 text-accent" />
                    </div>
                  )}
                  <div className="min-w-0 pr-1 text-left">
                    <span className="text-[9px] font-mono uppercase tracking-wider text-accent font-bold block">
                      Target Pose
                    </span>
                    <span className="font-display text-xs sm:text-sm uppercase text-paper tracking-wide block truncate max-w-[120px]">
                      {currentPoseInfo.name}
                    </span>
                  </div>
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
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-mono font-bold min-h-[36px] ${isActive
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
                      className={`h-2 w-2 rounded-full ${isActive ? "bg-accent" : hasShot ? "bg-ink/40" : "bg-ink/10"
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
          <div className="mx-auto flex min-h-0 flex-1 w-full max-w-5xl flex-col items-center justify-between space-y-3 animate-fadeIn">
            <div className="text-center space-y-1">
              <Label tone="accent">Step 03 · Review Summary</Label>
              <h2 className="font-display text-[clamp(24px,4vh,44px)] uppercase tracking-tight leading-tight">
                All Shots <span className="text-accent">Reviewed</span>
              </h2>
              <p className="font-sans text-xs text-muted">
                Tap any thumbnail to inspect or retake that shot, or tap Looks Good to proceed to print and share.
              </p>
            </div>

            {/* Center Area: Composed Strip Preview on Left, Tappable Thumbnails on Right */}
            <div className="grid w-full flex-1 grid-cols-1 md:grid-cols-[auto_1fr] gap-4 sm:gap-6 items-center justify-center max-h-none md:max-h-[50vh] overflow-visible md:overflow-hidden py-1">
              {/* Composed Strip Preview */}
              <div className="flex justify-center h-full max-h-[40vh] sm:max-h-[48vh]">
                <div className="relative aspect-[2/3] h-full max-h-[40vh] sm:max-h-[48vh] overflow-hidden rounded-tile border border-ink/15 shadow-xl bg-white p-1">
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
              <div className="flex flex-col justify-between h-full max-h-none md:max-h-[48vh] space-y-3">
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

            {/* Bottom Buttons: Change Frame, Retake All & Looks Good */}
            <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
              {eligibleTemplates.length >= 2 && (
                <Pill
                  variant="secondary"
                  size="md"
                  onClick={() => setIsChangingFrameModalOpen(true)}
                  className="min-h-[48px] px-6 text-xs font-mono uppercase tracking-wider gap-1.5"
                >
                  <Sparkles className="h-4 w-4 text-accent" />
                  <span>Change Frame</span>
                </Pill>
              )}

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
          <div className="mx-auto flex min-h-0 flex-1 w-full max-w-5xl xl:max-w-6xl 2xl:max-w-7xl flex-col items-center justify-between space-y-3 animate-fadeIn">
            <div className="text-center space-y-1">
              <Label tone="accent">Step 04 · Collect</Label>
              <h2 className="font-display text-[clamp(26px,4.5vh,48px)] uppercase tracking-tight leading-tight">
                Your Print Is <span className="text-accent">Ready</span>
              </h2>
              <p className="font-sans text-xs text-muted">
                Physical 4×6 print, phone QR code, and online gallery all share the composed layout.
              </p>
            </div>

            {/* Center Content: Composed 4x6 Canvas + Action Tiles */}
            <div className="grid w-full flex-1 grid-cols-1 md:grid-cols-[auto_1fr] gap-4 sm:gap-6 items-center justify-center max-h-none md:max-h-[50vh] overflow-visible md:overflow-hidden py-1">
              {/* Previews: Composed Strip + Optional Looping GIF */}
              <div className="flex items-center justify-center gap-2 sm:gap-3 h-full max-h-[38vh] sm:max-h-[46vh] shrink-0">
                {/* Composed 4x6 Layout Preview */}
                <div className="relative aspect-[2/3] h-full max-h-[38vh] sm:max-h-[46vh] overflow-hidden rounded-tile border border-ink/15 shadow-xl bg-white p-1 shrink-0">
                  {composedImageUrl && (
                    <img
                      src={composedImageUrl}
                      alt="Composed 4x6 print layout"
                      className="h-full w-full object-contain rounded-lg"
                    />
                  )}
                </div>

                {/* Looping Animated GIF Preview - Narrower width to leave ample room for action cards */}
                {shouldMakeGif && (
                  <div className="relative flex flex-col items-center justify-center h-full max-h-[38vh] sm:max-h-[46vh] w-32 sm:w-40 md:w-44 max-w-[190px] rounded-tile border border-ink/15 shadow-xl bg-paper p-2 overflow-hidden text-center shrink-0">
                    {gifStatus === "generating" && (
                      <div className="flex flex-col items-center justify-center p-3 space-y-2 text-muted">
                        <Loader2 className="h-6 w-6 animate-spin text-accent" />
                        <span className="font-mono text-[11px] uppercase tracking-wider text-ink font-semibold">
                          Making your GIF...
                        </span>
                      </div>
                    )}

                    {gifStatus === "done" && gifDataUrl && (
                      <div className="relative h-full w-full flex flex-col items-center justify-center">
                        <img
                          src={gifDataUrl}
                          alt="Looping animated GIF"
                          className="h-full w-full object-contain rounded-lg shadow-sm"
                        />
                        <span className="absolute bottom-1 right-1 bg-ink/80 text-paper px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-wider">
                          GIF
                        </span>
                      </div>
                    )}

                    {gifStatus === "error" && (
                      <div className="flex flex-col items-center justify-center p-3 text-muted">
                        <span className="font-mono text-[11px] uppercase tracking-wider text-muted">
                          GIF unavailable
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Output Actions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3 h-full max-h-none md:max-h-[46vh] items-stretch min-w-0">
                {/* PRINT ACTION */}
                <Tile
                  tone="surface"
                  className="flex flex-col items-center justify-between p-3 sm:p-4 text-center rounded-tile border border-ink/5 min-w-0"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-paper text-ink mb-1 shrink-0">
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
                        className="w-full uppercase font-mono text-[11px] sm:text-xs tracking-normal sm:tracking-[0.02em] min-h-[44px] px-2 sm:px-3 whitespace-normal break-words leading-tight"
                      >
                        <Printer className="h-4 w-4 shrink-0" />
                        <span>Print</span>
                      </Pill>
                    )}

                    {printStatus === "working" && (
                      <Pill
                        variant="secondary"
                        size="md"
                        disabled
                        className="w-full uppercase font-mono text-[11px] sm:text-xs tracking-normal sm:tracking-[0.02em] min-h-[44px] px-2 sm:px-3 whitespace-normal break-words leading-tight"
                      >
                        <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                        <span>Printing...</span>
                      </Pill>
                    )}

                    {printStatus === "done" && (
                      <Pill
                        variant="secondary"
                        size="md"
                        disabled
                        className="w-full uppercase font-mono text-[11px] sm:text-xs tracking-normal sm:tracking-[0.02em] min-h-[44px] px-2 sm:px-3 whitespace-normal break-words leading-tight opacity-80 cursor-not-allowed"
                      >
                        <Check className="h-4 w-4 text-success shrink-0" />
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
                          className="w-full uppercase font-mono text-[11px] sm:text-xs tracking-normal sm:tracking-[0.02em] min-h-[44px] px-2 sm:px-3 whitespace-normal break-words leading-tight"
                        >
                          <RotateCcw className="h-3.5 w-3.5 shrink-0" />
                          <span>Retry Print</span>
                        </Pill>
                      </div>
                    )}
                  </div>
                </Tile>

                {/* SHARE BY QR ACTION */}
                <Tile
                  tone="surface"
                  className="flex flex-col items-center justify-between p-3 sm:p-4 text-center rounded-tile border border-ink/5 min-w-0"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-paper text-ink mb-1 shrink-0">
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
                      className="w-full uppercase font-mono text-[11px] sm:text-xs tracking-normal sm:tracking-[0.02em] min-h-[44px] px-2 sm:px-3 whitespace-normal break-words leading-tight"
                    >
                      <QrCode className="h-4 w-4 shrink-0" />
                      <span>{showQrTile ? "Hide QR" : "Show QR"}</span>
                    </Pill>
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
      <Modal
        isOpen={showQrTile}
        onClose={() => setShowQrTile(false)}
        ariaLabel="Scan on your phone"
        zIndex="z-50"
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
      </Modal>

      {/* CONFIRM RETAKE ALL MODAL */}
      <Modal
        isOpen={showRetakeAllPrompt}
        onClose={() => setShowRetakeAllPrompt(false)}
        ariaLabel="Retake all shots"
        zIndex="z-50"
      >
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
      </Modal>

      {/* CANCEL CONFIRMATION MODAL */}
      <Modal
        isOpen={showCancelPrompt}
        onClose={() => setShowCancelPrompt(false)}
        ariaLabel="Cancel shoot"
        zIndex="z-50"
      >
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
      </Modal>

      {/* CHANGE FRAME MODAL ON REVIEW SUMMARY */}
      <Modal
        isOpen={isChangingFrameModalOpen}
        onClose={() => setIsChangingFrameModalOpen(false)}
      >
        <div className="p-6 bg-paper rounded-tile border border-ink/10 space-y-4 max-w-2xl w-full mx-auto max-h-[80vh] flex flex-col">
          <div className="flex items-center justify-between border-b border-ink/10 pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-accent" />
              <h3 className="font-display text-lg uppercase tracking-wide">
                Change Strip Frame
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setIsChangingFrameModalOpen(false)}
              className="text-xs font-mono uppercase text-muted hover:text-ink"
            >
              Cancel
            </button>
          </div>

          <p className="text-xs text-muted">
            Choose a different frame design for your strip. Your existing photos will be re-composed immediately.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 overflow-y-auto flex-1 p-1">
            {eligibleTemplates.map((tpl) => {
              const isSelected = activeTemplate?.id === tpl.id;
              const isFrame = Boolean(tpl.frame_url);

              return (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => handleChangeFrameOnSummary(tpl)}
                  className={`p-3 rounded-tile border text-left flex flex-col justify-between transition-all ${
                    isSelected
                      ? "bg-paper border-accent ring-2 ring-accent"
                      : "bg-surface hover:bg-paper/80 border-ink/10"
                  }`}
                >
                  <div className="w-full flex items-center justify-between pb-1 text-[11px] font-mono">
                    <span className="font-bold text-ink truncate">{tpl.name}</span>
                    {isSelected && (
                      <span className="text-[10px] text-accent font-bold uppercase">
                        Active
                      </span>
                    )}
                  </div>

                  <div className="relative w-full aspect-[2/3] max-h-[160px] rounded-lg overflow-hidden bg-neutral-900 border border-ink/10 flex items-center justify-center p-1 my-1">
                    {tpl.background_url && (
                      <img
                        src={tpl.background_url}
                        alt="Background"
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    )}
                    {tpl.slots?.map((s, i) => (
                      <div
                        key={i}
                        className="absolute border border-accent/40 bg-accent/20 flex items-center justify-center text-[8px] font-mono text-paper font-bold"
                        style={{
                          left: `${(s.x / tpl.canvas_width) * 100}%`,
                          top: `${(s.y / tpl.canvas_height) * 100}%`,
                          width: `${(s.w / tpl.canvas_width) * 100}%`,
                          height: `${(s.h / tpl.canvas_height) * 100}%`,
                        }}
                      >
                        #{i + 1}
                      </div>
                    ))}
                    {tpl.frame_url && (
                      <img
                        src={tpl.frame_url}
                        alt="Frame"
                        className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                      />
                    )}
                  </div>

                  <span className="text-[10px] font-mono text-muted uppercase">
                    {isFrame ? "Frame" : "Background"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </Modal>
    </div>
  );
}
