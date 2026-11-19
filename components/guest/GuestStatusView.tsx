"use client";

import React, { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Camera,
  Bell,
  RefreshCw,
  ImageIcon,
  WifiOff,
  ArrowRight,
} from "lucide-react";
import { Tile } from "@/components/ui/Tile";
import { Pill, PillLink } from "@/components/ui/Pill";
import { Label } from "@/components/ui/Label";
import { Hairline } from "@/components/ui/Hairline";
import { cn } from "@/components/ui/cn";
import { Modal } from "@/components/ui/Modal";

export interface GuestStatusData {
  first_name: string;
  queue_number: number;
  status: "WAITING" | "REMINDED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  guests_ahead: number;
  estimated_time: string | null;
  event_name: string;
  has_gallery: boolean;
}

export default function GuestStatusView() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [statusData, setStatusData] = useState<GuestStatusData | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isNotFound, setIsNotFound] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);

  // Cancellation modal state
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  // Polling management: request counter prevents out-of-order responses from overwriting newer data
  const latestRequestIdRef = useRef<number>(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef<boolean>(true);

  const fetchStatus = async () => {
    if (!token.trim()) {
      setIsNotFound(true);
      setIsInitialLoading(false);
      return;
    }

    const currentRequestId = ++latestRequestIdRef.current;

    try {
      const res = await fetch(`/api/guest?token=${encodeURIComponent(token.trim())}`, {
        cache: "no-store",
      });

      // Ignore stale responses arriving out of order
      if (currentRequestId !== latestRequestIdRef.current) return;

      if (res.status === 404) {
        setIsNotFound(true);
        setStatusData(null);
        setIsReconnecting(false);
        setIsInitialLoading(false);
        return;
      }

      if (!res.ok) {
        // Keep last good data on server/network hiccup
        if (statusData) {
          setIsReconnecting(true);
        }
        setIsInitialLoading(false);
        return;
      }

      const json: GuestStatusData = await res.json();
      if (currentRequestId === latestRequestIdRef.current && isMountedRef.current) {
        setStatusData(json);
        setIsNotFound(false);
        setIsReconnecting(false);
        setIsInitialLoading(false);
      }
    } catch {
      // Keep last good data on fetch failure and show reconnecting indicator
      if (currentRequestId === latestRequestIdRef.current && isMountedRef.current) {
        if (statusData) {
          setIsReconnecting(true);
        }
        setIsInitialLoading(false);
      }
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    setIsInitialLoading(true);

    // Initial fetch
    fetchStatus();

    // 5-second polling interval
    const interval = setInterval(() => {
      fetchStatus();
    }, 5000);
    timerRef.current = interval;

    return () => {
      isMountedRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [token]);

  // Handle guest cancellation
  const handleConfirmCancel = async () => {
    if (!token) return;
    setIsCancelling(true);
    setCancelError(null);

    try {
      const res = await fetch("/api/guest/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      const resJson = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 409) {
          setCancelError(resJson.error || "Cannot cancel booking once shooting has started.");
        } else {
          setCancelError(resJson.error || "Unable to cancel booking. Please try again.");
        }
        return;
      }

      // Optimistically update local status to CANCELLED
      setStatusData((prev) => (prev ? { ...prev, status: "CANCELLED" } : null));
      setShowCancelModal(false);
      // Immediately refresh from server
      fetchStatus();
    } catch (err: any) {
      setCancelError(err?.message || "Network error. Please try again.");
    } finally {
      setIsCancelling(false);
    }
  };

  // State: Loading
  if (isInitialLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
        <RefreshCw className="h-8 w-8 text-accent animate-spin mb-3" />
        <Label tone="accent" className="font-mono text-xs">Snap &amp; Snack</Label>
        <h2 className="font-display text-2xl uppercase tracking-tight text-ink mt-1">
          Loading Your Status
        </h2>
      </div>
    );
  }

  // State: Link not found / Invalid token (404)
  if (isNotFound || !statusData) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center max-w-sm mx-auto">
        <Tile tone="surface" className="w-full p-8 text-center rounded-tile shadow-sm border border-ink/5">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-danger/10 text-danger">
            <XCircle className="h-7 w-7" />
          </div>
          <Label tone="muted" className="block mb-1">Queue Ticket</Label>
          <h2 className="font-display text-2xl uppercase tracking-tight text-ink mb-2">
            Link Not Found
          </h2>
          <p className="text-xs text-muted mb-6 leading-relaxed font-sans">
            We couldn’t find an active booking for this link. If you recently registered, please ensure you used the link sent to your phone or ask the booth operator.
          </p>
          <PillLink
            href="/"
            variant="secondary"
            className="w-full text-xs font-mono uppercase tracking-wider"
          >
            Go to Booth Home
          </PillLink>
        </Tile>
      </div>
    );
  }

  const {
    first_name,
    queue_number,
    status,
    guests_ahead,
    estimated_time,
    event_name,
    has_gallery,
  } = statusData;

  const isWaiting = status === "WAITING";
  const isReminded = status === "REMINDED";
  const isInProgress = status === "IN_PROGRESS";
  const isCompleted = status === "COMPLETED";
  const isCancelled = status === "CANCELLED";

  const canCancel = isWaiting || isReminded;

  return (
    <div className="min-h-screen max-w-md mx-auto flex flex-col justify-between p-4 sm:p-6 select-none animate-fadeIn">
      {/* Top Header */}
      <header className="pt-2 pb-4 text-center">
        <div className="flex items-center justify-between pb-2">
          <span className="font-display text-lg uppercase tracking-wide text-ink">
            Snap &amp; Snack
          </span>
          {isReconnecting && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-warn/15 text-warn font-mono text-[10px] uppercase font-bold animate-pulse">
              <WifiOff className="h-3 w-3" /> Reconnecting
            </span>
          )}
        </div>
        <Hairline />
        <p className="font-mono text-[11px] uppercase tracking-wider text-muted pt-2">
          {event_name}
        </p>
      </header>

      {/* Main Status Body */}
      <main className="flex-1 flex flex-col justify-center py-4 space-y-4">
        {/* Ticket Surface */}
        <Tile
          tone="surface"
          className={cn(
            "p-6 sm:p-8 text-center rounded-tile border transition-all duration-300 shadow-sm",
            isInProgress && "border-accent/40 ring-2 ring-accent/30 bg-white",
            isReminded && "border-warn/40 ring-2 ring-warn/30 bg-white",
            isCompleted && "border-ok/30 bg-white",
            isCancelled && "border-ink/10 opacity-80",
            isWaiting && "border-ink/10 bg-white"
          )}
        >
          {/* Greeting */}
          <div className="mb-4">
            <Label tone="accent" className="font-mono text-[11px]">
              Hello, {first_name}
            </Label>
            <h1 className="font-display text-2xl uppercase tracking-tight text-ink mt-0.5">
              {isWaiting && "You're In Line"}
              {isReminded && "Get Ready!"}
              {isInProgress && "You're Up!"}
              {isCompleted && "All Done!"}
              {isCancelled && "Booking Cancelled"}
            </h1>
          </div>

          {/* Big Queue Number */}
          <div className="my-6">
            <Label className="block mb-2 text-muted text-[10px]">Your Queue Number</Label>
            <div
              className={cn(
                "mx-auto flex h-32 w-32 items-center justify-center rounded-full font-display text-6xl tracking-tight transition-transform",
                isInProgress && "bg-accent text-white scale-105 shadow-lg",
                isReminded && "bg-sun text-ink scale-105 shadow-md",
                isCompleted && "bg-ok/15 text-ok",
                isCancelled && "bg-ink/10 text-muted line-through",
                isWaiting && "bg-paper text-ink shadow-inner border border-ink/10"
              )}
            >
              #{queue_number}
            </div>
          </div>

          {/* Status Message Tile */}
          <div
            className={cn(
              "p-4 rounded-2xl text-left my-4 text-xs font-sans",
              isInProgress && "bg-accent/15 text-accent border border-accent/20",
              isReminded && "bg-sun/20 text-ink border border-sun/30",
              isCompleted && "bg-ok/15 text-ok border border-ok/20",
              isCancelled && "bg-ink/5 text-muted border border-ink/10",
              isWaiting && "bg-paper text-ink border border-ink/10"
            )}
          >
            <div className="flex items-start gap-3">
              {isInProgress && <Camera className="h-5 w-5 shrink-0 mt-0.5 text-accent animate-pulse" />}
              {isReminded && <Bell className="h-5 w-5 shrink-0 mt-0.5 text-warn animate-bounce" />}
              {isCompleted && <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5 text-ok" />}
              {isCancelled && <XCircle className="h-5 w-5 shrink-0 mt-0.5 text-muted" />}
              {isWaiting && <Clock className="h-5 w-5 shrink-0 mt-0.5 text-ink" />}

              <div>
                <Label className="block mb-0.5 font-bold uppercase">
                  {isInProgress && "It's Your Turn"}
                  {isReminded && "You're Next"}
                  {isCompleted && "Photos Ready"}
                  {isCancelled && "Cancelled"}
                  {isWaiting && "Waiting In Line"}
                </Label>
                <p className="font-medium text-sm leading-snug">
                  {isInProgress && "It's your turn, please go to the booth."}
                  {isReminded && "Get ready, you're next. Please head towards the booth area."}
                  {isCompleted && "Shoot finished! Your memories are ready in your gallery."}
                  {isCancelled && "Your booking was cancelled."}
                  {isWaiting &&
                    (guests_ahead === 0
                      ? "The booth is finishing up with the current guest. You're up next!"
                      : `${guests_ahead} ${guests_ahead === 1 ? "guest" : "guests"} ahead of you.`)}
                </p>
              </div>
            </div>
          </div>

          {/* Metrics for WAITING state */}
          {isWaiting && (
            <div className="grid grid-cols-2 gap-3 pt-2 text-left">
              <div className="p-3.5 bg-paper rounded-2xl border border-ink/5">
                <Label className="block mb-0.5 text-muted">Guests Ahead</Label>
                <span className="font-display text-2xl text-ink">
                  {guests_ahead}
                </span>
              </div>
              <div className="p-3.5 bg-paper rounded-2xl border border-ink/5">
                <Label className="block mb-0.5 text-muted">Estimated Wait</Label>
                <span className="font-display text-2xl text-ink">
                  {estimated_time || "~5 mins"}
                </span>
              </div>
            </div>
          )}

          {/* Action button for COMPLETED state: Open Gallery */}
          {isCompleted && (
            <div className="pt-4">
              <PillLink
                href={`/gallery?token=${encodeURIComponent(token)}`}
                variant="primary"
                size="lg"
                className="w-full min-h-[50px] uppercase font-mono text-xs tracking-wider gap-2"
              >
                <ImageIcon className="h-4 w-4 text-accent" />
                <span>Open My Gallery</span>
                <ArrowRight className="h-4 w-4" />
              </PillLink>
            </div>
          )}

          {/* Optional link to gallery if guest is waiting but photos exist */}
          {!isCompleted && has_gallery && (
            <div className="pt-3">
              <PillLink
                href={`/gallery?token=${encodeURIComponent(token)}`}
                variant="secondary"
                size="md"
                className="w-full text-xs font-mono uppercase tracking-wider"
              >
                <ImageIcon className="h-3.5 w-3.5" />
                <span>View My Gallery</span>
              </PillLink>
            </div>
          )}
        </Tile>

        {/* Cancel Booking Action (WAITING and REMINDED only) */}
        {canCancel && (
          <div className="text-center pt-2">
            <button
              type="button"
              onClick={() => {
                setCancelError(null);
                setShowCancelModal(true);
              }}
              className="interactive-secondary inline-flex min-h-[44px] items-center gap-1.5 px-5 rounded-full border border-danger/30 text-danger text-xs font-mono uppercase tracking-wider hover:bg-danger/10 transition-colors"
            >
              <XCircle className="h-4 w-4" />
              <span>Cancel My Booking</span>
            </button>
            <p className="text-[11px] text-muted font-sans mt-2">
              Need to leave? Free up your spot for the next guest.
            </p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="py-4 text-center text-muted font-mono text-[10px]">
        Auto-refreshes every 5 seconds · Touch anywhere to interact
      </footer>

      {/* Confirmation Modal */}
      <Modal
        isOpen={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        ariaLabel="Cancel booking"
        zIndex="z-50"
      >
        <Tile
          tone="paper"
          className="w-full max-w-sm p-6 text-center shadow-2xl border border-ink/20"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-danger">
            <AlertTriangle className="h-6 w-6" />
          </div>

          <h3 className="font-display text-2xl uppercase tracking-tight text-ink mb-1">
            Cancel Booking?
          </h3>
          <p className="text-xs text-muted mb-4 font-sans">
            Are you sure you want to cancel your queue spot #{queue_number}? This cannot be undone.
          </p>

          {cancelError && (
            <div className="p-3 mb-4 rounded-xl bg-danger/10 text-danger text-xs text-left font-medium">
              {cancelError}
            </div>
          )}

          <div className="space-y-2">
            <Pill
              variant="danger"
              size="md"
              disabled={isCancelling}
              onClick={handleConfirmCancel}
              className="w-full min-h-[44px] uppercase font-mono text-xs tracking-wider"
            >
              {isCancelling ? "Cancelling..." : "Yes, Cancel Booking"}
            </Pill>

            <Pill
              variant="secondary"
              size="md"
              disabled={isCancelling}
              onClick={() => setShowCancelModal(false)}
              className="w-full min-h-[44px] uppercase font-mono text-xs tracking-wider"
            >
              Keep My Spot
            </Pill>
          </div>
        </Tile>
      </Modal>
    </div>
  );
}
