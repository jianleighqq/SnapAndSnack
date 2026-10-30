"use client";

import React, { useState } from "react";
import {
  Play,
  Bell,
  CheckCircle2,
  XCircle,
  ExternalLink,
  X,
  AlertTriangle,
  Mail,
  Smartphone,
} from "lucide-react";
import type { QueueEntryWithGuest } from "@/lib/types";
import { Pill } from "@/components/ui/Pill";
import { Label } from "@/components/ui/Label";
import { Hairline } from "@/components/ui/Hairline";
import { QueueStatusPill, queueNumberClasses } from "@/components/ui/QueueStatus";
import { cn } from "@/components/ui/cn";

interface QueueCustomerModalProps {
  entry: QueueEntryWithGuest | null;
  onClose: () => void;
  onAction: (action: "start" | "remind" | "finish" | "cancel", queueId: string) => Promise<void>;
  isLoading?: boolean;
}

export default function QueueCustomerModal({
  entry,
  onClose,
  onAction,
  isLoading = false,
}: QueueCustomerModalProps) {
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (!entry) return null;

  const handleActionClick = async (action: "start" | "remind" | "finish" | "cancel") => {
    setActionError(null);
    try {
      await onAction(action, entry.id);
      if (action === "cancel") {
        setShowCancelConfirm(false);
      }
      onClose();
    } catch {
      setActionError("Action failed. Please try again.");
    }
  };

  const isInProgress = entry.status === "IN_PROGRESS";
  const isReminded = entry.status === "REMINDED";
  const isCompleted = entry.status === "COMPLETED";
  const isCancelled = entry.status === "CANCELLED";

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg rounded-tile bg-paper p-6 text-ink shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <Pill
          variant="secondary"
          size="icon"
          onClick={onClose}
          aria-label="Close modal"
          className="absolute right-4 top-4"
        >
          <X className="h-4 w-4" />
        </Pill>

        {/* Header with Queue # and Name */}
        <div className="flex items-start gap-4 pr-10">
          <div
            className={cn(
              "flex h-16 w-16 shrink-0 items-center justify-center rounded-full font-display text-3xl",
              entry.status === "WAITING" ? "bg-surface text-ink" : queueNumberClasses(entry.status)
            )}
          >
            #{entry.queue_number}
          </div>
          <div>
            <div className="mb-1 flex items-center gap-2">
              <QueueStatusPill status={entry.status} />
            </div>
            <h2 className="font-display text-2xl uppercase tracking-tight text-ink">
              {entry.guest.full_name}
            </h2>
            <p className="mt-0.5 flex items-center gap-1.5 font-mono text-xs text-muted">
              <Mail className="h-3.5 w-3.5" />
              {entry.guest.email}
            </p>
          </div>
        </div>

        <Hairline className="my-5" />

        {actionError && (
          <div className="mb-4 rounded-xl bg-danger/10 p-3 font-mono text-xs font-medium text-danger">
            {actionError}
          </div>
        )}

        {/* Cancellation Confirmation View */}
        {showCancelConfirm ? (
          <div className="mb-4 rounded-2xl bg-danger/5 p-5 border border-danger/20">
            <div className="mb-4 flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-danger" />
              <div>
                <h4 className="font-display text-xl uppercase text-danger">
                  Cancel This Booking?
                </h4>
                <p className="mt-1 text-xs font-medium text-ink/80">
                  Are you sure you want to cancel the queue spot for <strong>{entry.guest.full_name}</strong> (#{entry.queue_number})? This action cannot be undone.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <Pill
                variant="secondary"
                disabled={isLoading}
                onClick={() => setShowCancelConfirm(false)}
              >
                Keep Booking
              </Pill>
              <Pill
                variant="danger"
                disabled={isLoading}
                onClick={() => handleActionClick("cancel")}
              >
                {isLoading ? "Cancelling..." : "Yes, Cancel Queue"}
              </Pill>
            </div>
          </div>
        ) : (
          /* Main Action Buttons Grid */
          <div className="space-y-5">
            <div>
              <Label className="mb-3 block">Operator Actions</Label>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {/* START BUTTON */}
                <Pill
                  variant={isInProgress ? "secondary" : "accent"}
                  disabled={isLoading || isInProgress || isCompleted || isCancelled}
                  onClick={() => handleActionClick("start")}
                  className="flex min-h-[52px] flex-col py-2"
                >
                  <Play className="h-4 w-4 fill-current" />
                  <span className="text-xs uppercase tracking-wider">Start</span>
                </Pill>

                {/* REMIND BUTTON */}
                <Pill
                  variant="secondary"
                  disabled={isLoading || isInProgress || isCompleted || isCancelled}
                  onClick={() => handleActionClick("remind")}
                  className={cn(
                    "flex min-h-[52px] flex-col py-2",
                    isReminded && "bg-warn/15 text-warn border-warn/30"
                  )}
                >
                  <Bell className="h-4 w-4" />
                  <span className="text-xs uppercase tracking-wider">Remind</span>
                </Pill>

                {/* FINISH BUTTON */}
                <Pill
                  variant="primary"
                  disabled={isLoading || isCompleted || isCancelled}
                  onClick={() => handleActionClick("finish")}
                  className="flex min-h-[52px] flex-col py-2"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="text-xs uppercase tracking-wider">Finish</span>
                </Pill>
              </div>
            </div>

            {/* Bottom Actions: Cancel & Customer View Link */}
            <div className="flex flex-col items-stretch justify-between gap-3 pt-3 border-t border-ink/10 sm:flex-row sm:items-center">
              {/* Link to Customer's View */}
              <a
                href={`/guest?token=${entry.guest.guest_token}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-1.5 font-mono text-xs font-medium uppercase text-muted hover:text-ink transition-colors py-2"
              >
                <Smartphone className="h-4 w-4" />
                <span>Customer Mobile View</span>
                <ExternalLink className="ml-0.5 h-3.5 w-3.5" />
              </a>

              {/* Cancel Button */}
              {!isCancelled && !isCompleted && (
                <Pill
                  variant="ghost"
                  disabled={isLoading}
                  onClick={() => setShowCancelConfirm(true)}
                  className="text-danger hover:bg-danger/10 hover:text-danger"
                >
                  <XCircle className="h-4 w-4" />
                  <span>Cancel Queue</span>
                </Pill>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
