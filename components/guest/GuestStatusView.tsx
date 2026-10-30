"use client";

import React, { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import {
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Camera,
  Bell,
  RefreshCw,
} from "lucide-react";
import type { Guest, QueueEntryWithGuest } from "@/lib/types";
import { Tile } from "@/components/ui/Tile";
import { Pill } from "@/components/ui/Pill";
import { Label } from "@/components/ui/Label";
import { Hairline } from "@/components/ui/Hairline";
import { queueNumberClasses } from "@/components/ui/QueueStatus";
import { cn } from "@/components/ui/cn";

interface GuestData {
  guest: Guest;
  queueEntry: QueueEntryWithGuest | null;
  positionInLine: number | null;
  isSample?: boolean;
}

export default function GuestStatusView() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [data, setData] = useState<GuestData | null>(null);
  const [allEntries, setAllEntries] = useState<QueueEntryWithGuest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelSuccess, setCancelSuccess] = useState(false);

  // Fetch guest data
  const fetchGuestData = async (activeToken?: string | null) => {
    try {
      const url = activeToken ? `/api/guest?token=${activeToken}` : "/api/guest";
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error("Guest or queue spot not found");
      }
      const json: GuestData = await res.json();
      setData(json);

      // Also fetch full queue to allow quick switching in dev mode
      const qRes = await fetch("/api/queue");
      if (qRes.ok) {
        const qData = await qRes.json();
        setAllEntries(qData.queue || []);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load your queue status");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGuestData(token);
  }, [token]);

  const handleCancelQueue = async () => {
    if (!data?.guest) return;
    setCancelling(true);
    try {
      const res = await fetch("/api/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "cancel",
          guestToken: data.guest.guest_token,
          queueId: data.queueEntry?.id,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to cancel queue");
      }

      setShowCancelModal(false);
      setCancelSuccess(true);
      // Re-fetch updated status
      await fetchGuestData(data.guest.guest_token);
    } catch (err: any) {
      alert("Could not cancel booking: " + err.message);
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 font-mono text-sm">
        <RefreshCw className="h-6 w-6 text-accent animate-spin mb-4" />
        <p className="text-ink font-medium">Loading your queue status...</p>
      </div>
    );
  }

  if (error || !data || !data.queueEntry) {
    return (
      <Tile tone="surface" className="max-w-md mx-auto p-8 text-center my-8">
        <XCircle className="w-12 h-12 text-danger mx-auto mb-3" />
        <h2 className="font-display text-2xl uppercase tracking-tight text-ink mb-2">
          Queue Spot Not Found
        </h2>
        <p className="text-xs text-muted mb-6">
          {error || "We couldn't locate an active booking for this link."}
        </p>
        <Pill
          variant="primary"
          onClick={() => fetchGuestData(null)}
        >
          View Demo Guest
        </Pill>
      </Tile>
    );
  }

  const { guest, queueEntry, positionInLine } = data;
  const status = queueEntry.status;

  const isInProgress = status === "IN_PROGRESS";
  const isReminded = status === "REMINDED";
  const isWaiting = status === "WAITING";
  const isCompleted = status === "COMPLETED";
  const isCancelled = status === "CANCELLED";

  return (
    <div className="max-w-md mx-auto space-y-6 pb-12">
      {/* Dev Mode Switcher */}
      {allEntries.length > 0 && (
        <Tile tone="surface" className="p-3 text-xs">
          <div className="flex items-center justify-between mb-1.5">
            <Label tone="muted">Demo Switcher (View as):</Label>
            <span className="font-mono text-[10px] bg-accent text-white px-2 py-0.5 rounded-full">
              Customer View
            </span>
          </div>
          <select
            value={guest.guest_token}
            onChange={(e) => {
              const selectedToken = e.target.value;
              window.history.pushState(null, "", `/guest?token=${selectedToken}`);
              fetchGuestData(selectedToken);
            }}
            className="input-field min-h-[38px] text-xs font-mono"
          >
            {allEntries.map((e) => (
              <option key={e.id} value={e.guest.guest_token}>
                #{e.queue_number} - {e.guest.full_name} ({e.status})
              </option>
            ))}
          </select>
        </Tile>
      )}

      {/* Main Ticket Card */}
      <Tile tone="surface" className="overflow-hidden shadow-sm">
        {/* Ticket Header */}
        <div className="p-6 text-center border-b border-ink/10">
          <Label tone="accent">Snap &amp; Snack</Label>
          <h1 className="font-display text-3xl uppercase tracking-tight text-ink mt-1">
            Queue Ticket
          </h1>
        </div>

        {/* Ticket Body */}
        <div className="p-6 text-center space-y-6">
          <div>
            <Label className="block mb-2">Your Queue Number</Label>
            <div
              className={cn(
                "inline-flex items-center justify-center w-24 h-24 font-display text-5xl rounded-full",
                status === "WAITING" ? "bg-paper text-ink" : queueNumberClasses(status)
              )}
            >
              #{queueEntry.queue_number}
            </div>
          </div>

          <div>
            <h2 className="font-display text-2xl uppercase tracking-tight text-ink">
              {guest.full_name}
            </h2>
            <p className="font-mono text-xs text-muted mt-0.5">{guest.email}</p>
          </div>

          {/* Status Alert Banner */}
          <div
            className={cn(
              "p-4 rounded-2xl text-left",
              isInProgress && "bg-accent/15 text-accent",
              isReminded && "bg-sun/20 text-ink",
              isWaiting && "bg-paper text-ink",
              isCompleted && "bg-ok/15 text-ok",
              isCancelled && "bg-ink/5 text-muted"
            )}
          >
            <div className="flex items-start gap-3">
              {isInProgress ? (
                <Camera className="w-5 h-5 shrink-0 mt-0.5" />
              ) : isReminded ? (
                <Bell className="w-5 h-5 shrink-0 mt-0.5 text-warn" />
              ) : isCompleted ? (
                <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
              ) : isCancelled ? (
                <XCircle className="w-5 h-5 shrink-0 mt-0.5" />
              ) : (
                <Clock className="w-5 h-5 shrink-0 mt-0.5 text-ink" />
              )}

              <div>
                <Label className="block mb-0.5">Status: {status}</Label>
                <p className="font-semibold text-sm leading-snug">
                  {isInProgress && "You're up! Please proceed to the booth now."}
                  {isReminded && "Almost your turn! Head over to the booth area (approx. 5 mins)."}
                  {isWaiting && (
                    positionInLine === 1
                      ? "You're the next party up! Get ready."
                      : `You have ${positionInLine ? positionInLine - 1 : "several"} parties ahead of you.`
                  )}
                  {isCompleted && "Shoot finished! Thank you for snapping with us."}
                  {isCancelled && "Your queue reservation has been cancelled."}
                </p>
              </div>
            </div>
          </div>

          {/* Additional details for waiting guests */}
          {(isWaiting || isReminded) && (
            <div className="grid grid-cols-2 gap-3 pt-1 text-left">
              <div className="p-3.5 bg-paper rounded-2xl">
                <Label className="block mb-0.5">Line Position</Label>
                <span className="font-display text-xl text-ink">
                  {positionInLine ? `${positionInLine} in line` : "Up next"}
                </span>
              </div>

              <div className="p-3.5 bg-paper rounded-2xl">
                <Label className="block mb-0.5">Estimated Wait</Label>
                <span className="font-display text-xl text-ink">
                  {positionInLine ? `~${positionInLine * 3} mins` : "~2 mins"}
                </span>
              </div>
            </div>
          )}

          {/* Cancel Queue Action Button */}
          {!isCancelled && !isCompleted && (
            <div className="pt-4 border-t border-ink/10">
              <Pill
                variant="ghost"
                onClick={() => setShowCancelModal(true)}
                className="w-full text-danger hover:bg-danger/10 hover:text-danger"
              >
                <XCircle className="h-4 w-4" />
                <span>Cancel My Queue Spot</span>
              </Pill>
              <p className="text-[11px] text-muted mt-2">
                Need to leave early? Free up your spot for others.
              </p>
            </div>
          )}
        </div>
      </Tile>

      {/* Confirmation Modal for Guest */}
      {showCancelModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/30 backdrop-blur-sm"
          onClick={() => setShowCancelModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-tile bg-paper p-6 relative shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-4">
              <div className="p-2.5 bg-danger/10 text-danger rounded-full shrink-0">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-display text-xl uppercase tracking-tight text-ink">
                  Cancel Your Spot?
                </h3>
                <p className="text-xs text-muted font-medium mt-1">
                  Are you sure you want to give up your spot #{queueEntry.queue_number}? This cannot be undone.
                </p>
              </div>
            </div>

            <div className="space-y-2 mt-6">
              <Pill
                variant="danger"
                disabled={cancelling}
                onClick={handleCancelQueue}
                className="w-full"
              >
                {cancelling ? "Cancelling..." : "Yes, Cancel My Spot"}
              </Pill>

              <Pill
                variant="secondary"
                disabled={cancelling}
                onClick={() => setShowCancelModal(false)}
                className="w-full"
              >
                No, Keep My Spot
              </Pill>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
