"use client";

import React, { useState, useEffect } from "react";
import {
  Play,
  Bell,
  BellOff,
  CheckCircle2,
  XCircle,
  ExternalLink,
  X,
  AlertTriangle,
  Mail,
  QrCode,
  Copy,
  Check,
} from "lucide-react";
import QRCode from "qrcode";
import type { QueueEntryWithGuest } from "@/lib/types";
import { Pill } from "@/components/ui/Pill";
import { Label } from "@/components/ui/Label";
import { Hairline } from "@/components/ui/Hairline";
import { QueueStatusPill, queueNumberClasses } from "@/components/ui/QueueStatus";
import { cn } from "@/components/ui/cn";
import { Modal } from "@/components/ui/Modal";

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

  // Ticket link & QR states
  const [ticketUrl, setTicketUrl] = useState<string | null>(null);
  const [isFetchingTicket, setIsFetchingTicket] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [ticketError, setTicketError] = useState<string | null>(null);
  const [hasAlerts, setHasAlerts] = useState<boolean | null>(entry?.has_alerts ?? null);

  // Reset state whenever the active entry changes
  useEffect(() => {
    setTicketUrl(null);
    setQrDataUrl(null);
    setShowQrModal(false);
    setIsCopied(false);
    setTicketError(null);
    setShowCancelConfirm(false);
    setActionError(null);
    setHasAlerts(entry?.has_alerts ?? null);

    if (entry?.id) {
      // Proactively check ticket and alerts status
      fetchTicketUrl();
    }
  }, [entry?.id, entry?.has_alerts]);

  if (!entry) return null;

  const fetchTicketUrl = async (): Promise<string | null> => {
    if (ticketUrl) return ticketUrl;
    setIsFetchingTicket(true);
    setTicketError(null);
    try {
      const res = await fetch(
        `/api/admin/queue/ticket?queueId=${encodeURIComponent(entry.id)}`,
        { cache: "no-store" }
      );
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to load ticket link");
      }
      const data = await res.json();
      setTicketUrl(data.ticketUrl);
      if (typeof data.hasAlerts === "boolean") {
        setHasAlerts(data.hasAlerts);
      }
      return data.ticketUrl;
    } catch (err: any) {
      const msg = err?.message || "Could not fetch ticket link";
      setTicketError(msg);
      return null;
    } finally {
      setIsFetchingTicket(false);
    }
  };

  const handleCopyTicketLink = async () => {
    const url = await fetchTicketUrl();
    if (!url) return;

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = url;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2500);
    } catch {
      setTicketError("Failed to copy link to clipboard");
    }
  };

  const handleShowQr = async () => {
    setShowQrModal(true);
    const url = await fetchTicketUrl();
    if (!url) return;

    try {
      const dataUrl = await QRCode.toDataURL(url, { width: 300, margin: 1 });
      setQrDataUrl(dataUrl);
    } catch (err) {
      console.error("QR generation error:", err);
      setTicketError("Failed to generate QR code");
    }
  };

  const handleActionClick = async (action: "start" | "remind" | "finish" | "cancel") => {
    setActionError(null);
    try {
      await onAction(action, entry.id);
      if (action === "cancel") {
        setShowCancelConfirm(false);
      }
      onClose();
    } catch (err: any) {
      setActionError(err?.message || "Action failed. Please try again.");
    }
  };

  const isInProgress = entry.status === "IN_PROGRESS";
  const isReminded = entry.status === "REMINDED";
  const isCompleted = entry.status === "COMPLETED";
  const isCancelled = entry.status === "CANCELLED";

  return (
    <>
      <Modal
        isOpen={Boolean(entry)}
        onClose={onClose}
        ariaLabel={`Manage guest #${entry.queue_number}`}
        zIndex="z-50"
      >
        <div
          className="relative w-full max-w-lg rounded-tile bg-paper p-4 sm:p-6 text-ink shadow-xl max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
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
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <QueueStatusPill status={entry.status} />
                {hasAlerts === true ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase text-emerald-600">
                    <Bell className="h-3 w-3" /> Alerts on
                  </span>
                ) : hasAlerts === false ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 font-mono text-[10px] font-medium uppercase text-muted">
                    <BellOff className="h-3 w-3" /> No alerts
                  </span>
                ) : null}
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
            /* Main Content */
            <div className="space-y-5">
              {/* Operator Action Buttons */}
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

              {/* Guest Ticket Link & Phone Pass */}
              <div className="rounded-2xl bg-surface/60 p-4 border border-ink/5">
                <div className="mb-2.5 flex items-center justify-between">
                  <Label className="block">Guest Ticket & Phone Pass</Label>
                  <span className="font-mono text-[11px] text-muted">PIN Protected</span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Copy Ticket Link */}
                  <Pill
                    variant={isCopied ? "secondary" : "primary"}
                    disabled={isFetchingTicket}
                    onClick={handleCopyTicketLink}
                    className={cn(
                      "gap-1.5 transition-all",
                      isCopied && "border-ok/40 bg-ok/10 text-ok"
                    )}
                  >
                    {isCopied ? (
                      <>
                        <Check className="h-4 w-4 text-ok" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" />
                        <span>{isFetchingTicket ? "Getting link..." : "Copy ticket link"}</span>
                      </>
                    )}
                  </Pill>

                  {/* Show QR */}
                  <Pill
                    variant="secondary"
                    disabled={isFetchingTicket}
                    onClick={handleShowQr}
                    className="gap-1.5"
                  >
                    <QrCode className="h-4 w-4" />
                    <span>Show QR</span>
                  </Pill>

                  {/* Open Ticket link if already resolved */}
                  {ticketUrl && (
                    <a
                      href={ticketUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-auto inline-flex items-center gap-1 font-mono text-xs text-muted hover:text-ink transition-colors py-1 px-2"
                    >
                      <span>Open ticket</span>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>

                {ticketError && (
                  <p className="mt-2 font-mono text-xs text-danger">{ticketError}</p>
                )}
              </div>

              {/* Bottom Actions: Cancel Button */}
              {!isCancelled && !isCompleted && (
                <div className="flex justify-end pt-2 border-t border-ink/10">
                  <Pill
                    variant="ghost"
                    disabled={isLoading}
                    onClick={() => setShowCancelConfirm(true)}
                    className="text-danger hover:bg-danger/10 hover:text-danger"
                  >
                    <XCircle className="h-4 w-4" />
                    <span>Cancel Queue Spot</span>
                  </Pill>
                </div>
              )}
            </div>
          )}

          {/* Close Button in DOM order after actions */}
          <Pill
            variant="secondary"
            size="icon"
            onClick={onClose}
            aria-label="Close modal"
            className="absolute right-4 top-4"
          >
            <X className="h-4 w-4" />
          </Pill>
        </div>
      </Modal>

      {/* QR Code Modal Overlay */}
      <Modal
        isOpen={showQrModal}
        onClose={() => setShowQrModal(false)}
        ariaLabel={`Guest ticket QR code for #${entry.queue_number}`}
        zIndex="z-[60]"
      >
        <div
          className="relative w-full max-w-xs rounded-tile bg-paper p-5 sm:p-6 text-ink shadow-2xl text-center max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-2">
            <Label className="block mb-1">Guest Ticket QR</Label>
            <h3 className="font-display text-xl uppercase tracking-tight text-ink">
              #{entry.queue_number} {entry.guest.full_name}
            </h3>
          </div>

          <div className="my-4 flex items-center justify-center rounded-2xl bg-white p-4 shadow-sm border border-ink/10 aspect-square max-w-[220px] mx-auto">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt={`QR code for ticket #${entry.queue_number}`}
                className="h-full w-full object-contain"
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-muted">
                <QrCode className="h-8 w-8 animate-pulse mb-2 text-muted" />
                <span className="font-mono text-xs">Generating QR...</span>
              </div>
            )}
          </div>

          <p className="font-mono text-xs text-muted mb-4 leading-relaxed">
            Scan with phone camera to open personal queue ticket.
          </p>

          <Pill
            variant={isCopied ? "secondary" : "primary"}
            onClick={handleCopyTicketLink}
            className={cn(
              "w-full justify-center gap-1.5 mb-2",
              isCopied && "border-ok/40 bg-ok/10 text-ok"
            )}
          >
            {isCopied ? (
              <>
                <Check className="h-4 w-4 text-ok" />
                <span>Copied!</span>
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                <span>Copy Ticket Link</span>
              </>
            )}
          </Pill>

          <Pill
            variant="secondary"
            size="icon"
            onClick={() => setShowQrModal(false)}
            aria-label="Close QR code"
            className="absolute right-4 top-4"
          >
            <X className="h-4 w-4" />
          </Pill>
        </div>
      </Modal>
    </>
  );
}
