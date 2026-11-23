"use client";

import React, { useState, useEffect, useCallback } from "react";
import { X, UserPlus, QrCode, Copy, Check } from "lucide-react";
import QRCode from "qrcode";
import { Pill } from "@/components/ui/Pill";
import { Label } from "@/components/ui/Label";
import { Modal } from "@/components/ui/Modal";

export interface TicketQrDisplayData {
  fullName: string;
  queueNumber: string;
  ticketUrl: string;
}

interface AddGuestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (fullName: string, email: string) => Promise<any>;
  isLoading: boolean;
  onShowToast?: (toast: { message: string; actionLabel?: string; onAction?: () => void }) => void;
  initialQrData?: TicketQrDisplayData | null;
  onOpenTicketQr?: (data: TicketQrDisplayData) => void;
}

export default function AddGuestModal({
  isOpen,
  onClose,
  onAdd,
  isLoading,
  onShowToast,
  initialQrData,
  onOpenTicketQr,
}: AddGuestModalProps) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  // View state: "form" for entering info, "qr" for displaying ticket QR code
  const [step, setStep] = useState<"form" | "qr">("form");
  const [qrData, setQrData] = useState<TicketQrDisplayData | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  // Stable close handler
  const handleClose = useCallback(() => {
    setStep("form");
    setQrData(null);
    setQrDataUrl(null);
    setError(null);
    setFullName("");
    setEmail("");
    setIsCopied(false);
    onClose();
  }, [onClose]);

  // Sync with initialQrData if provided externally (e.g. from clicking "Show QR" on a toast)
  useEffect(() => {
    if (initialQrData) {
      setQrData(initialQrData);
      setStep("qr");
      QRCode.toDataURL(initialQrData.ticketUrl, { width: 300, margin: 1 })
        .then(setQrDataUrl)
        .catch((err) => console.error("QR generation error:", err));
    } else if (!isOpen) {
      // Reset state on close
      setStep("form");
      setQrData(null);
      setQrDataUrl(null);
      setError(null);
      setFullName("");
      setEmail("");
      setIsCopied(false);
    }
  }, [initialQrData, isOpen]);

  if (!isOpen) return null;

  const handleCopyLink = async () => {
    if (!qrData?.ticketUrl) return;
    try {
      await navigator.clipboard.writeText(qrData.ticketUrl);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy link:", err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = fullName.trim();
    if (!trimmedName) {
      setError("Please enter the guest's name");
      return;
    }

    const trimmedEmail = email.trim();
    if (trimmedEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(trimmedEmail)) {
        setError("Please enter a valid email address");
        return;
      }
    }

    setError(null);
    try {
      const result = await onAdd(trimmedName, trimmedEmail);
      const created = result?.created;
      const rawQueueNum = created?.queueEntry?.queue_number;
      const formattedNum = rawQueueNum ? `#${String(rawQueueNum).padStart(2, "0")}` : "";
      const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
      const token = created?.guest?.guest_token || "";
      const ticketUrl = created?.ticketUrl || (token ? `${baseUrl}/guest?token=${token}` : "");

      const qrDisplay: TicketQrDisplayData = {
        fullName: trimmedName,
        queueNumber: formattedNum,
        ticketUrl,
      };

      if (!trimmedEmail) {
        // Walk-in without email: show queue number + on-screen QR code + copy link
        setQrData(qrDisplay);
        if (ticketUrl) {
          try {
            const dataUrl = await QRCode.toDataURL(ticketUrl, { width: 300, margin: 1 });
            setQrDataUrl(dataUrl);
          } catch (qrErr) {
            console.error("Failed to generate QR code:", qrErr);
          }
        }
        setStep("qr");
      } else {
        // Walk-in with email
        const emailSent = created?.emailSent ?? true;
        handleClose();

        if (emailSent) {
          onShowToast?.({
            message: `Added ${trimmedName} (${formattedNum}) - ticket emailed`,
          });
        } else {
          onShowToast?.({
            message: `Added ${trimmedName} (${formattedNum}) - email failed, show QR instead`,
            actionLabel: "Show QR",
            onAction: () => {
              if (onOpenTicketQr) {
                onOpenTicketQr(qrDisplay);
              }
            },
          });
        }
      }
    } catch (err: any) {
      setError(err?.message || "Failed to add guest to queue");
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      ariaLabel={step === "qr" ? "Ticket QR Code" : "Add Guest"}
      zIndex="z-50"
    >
      <div
        className="relative w-full max-w-md rounded-tile bg-paper p-4 sm:p-6 text-ink shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {step === "qr" && qrData ? (
          /* STEP 2: ON-SCREEN TICKET QR & COPY LINK */
          <div className="flex flex-col items-center text-center">
            <Label tone="accent" className="mb-1">
              Walk-In Ticket Ready
            </Label>
            <h2 className="font-display text-3xl uppercase tracking-tight text-ink mb-1">
              {qrData.queueNumber}
            </h2>
            <p className="font-sans text-sm text-muted font-medium mb-4">
              {qrData.fullName}
            </p>

            {/* QR Display */}
            <div className="my-2 flex items-center justify-center rounded-2xl bg-white p-4 shadow-sm border border-ink/10 aspect-square max-w-[220px] w-full mx-auto">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt={`QR code for ticket ${qrData.queueNumber}`}
                  className="h-full w-full object-contain"
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-muted">
                  <QrCode className="h-8 w-8 animate-pulse mb-2 text-muted" />
                  <span className="font-mono text-xs">Generating QR...</span>
                </div>
              )}
            </div>

            <p className="font-mono text-xs text-muted mt-2 mb-6 leading-relaxed">
              Scan with phone camera to open personal queue ticket.
            </p>

            <div className="flex flex-col w-full gap-2">
              <Pill
                variant={isCopied ? "secondary" : "primary"}
                onClick={handleCopyLink}
                className="w-full justify-center gap-2 min-h-[44px]"
              >
                {isCopied ? (
                  <>
                    <Check className="h-4 w-4 text-success" />
                    <span className="font-mono uppercase text-xs tracking-wider">Copied Link!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    <span className="font-mono uppercase text-xs tracking-wider">Copy Ticket Link</span>
                  </>
                )}
              </Pill>

              <Pill
                variant="secondary"
                onClick={handleClose}
                className="w-full justify-center min-h-[44px] uppercase font-mono text-xs tracking-wider"
              >
                Done
              </Pill>
            </div>

            {/* Close Button at end of DOM order */}
            <Pill
              variant="secondary"
              size="icon"
              onClick={handleClose}
              aria-label="Close modal"
              className="absolute right-4 top-4"
            >
              <X className="h-4 w-4" />
            </Pill>
          </div>
        ) : (
          /* STEP 1: ADD GUEST FORM */
          <>
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
                <UserPlus className="h-5 w-5" />
              </div>
              <div>
                <Label tone="accent">Walk-In Registration</Label>
                <h2 className="font-display text-2xl uppercase tracking-tight text-ink">
                  Add Guest
                </h2>
              </div>
            </div>

            {error && (
              <div className="mb-4 rounded-xl bg-danger/10 p-3 text-xs font-medium text-danger">
                {error}
              </div>
            )}

            {/* Tab Order: Full Name -> Email -> Cancel -> Add to Queue -> Close Button */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label className="mb-1.5 block">Full Name *</Label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Jordan Smith"
                  className="w-full rounded-full border border-ink/15 bg-paper px-4 py-2.5 text-sm font-medium text-ink transition-colors placeholder:text-muted focus:border-ink focus:outline-none"
                  autoFocus
                />
              </div>

              <div>
                <Label className="mb-1.5 block">Email (Optional)</Label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. jordan@example.com"
                  className="w-full rounded-full border border-ink/15 bg-paper px-4 py-2.5 text-sm font-medium text-ink transition-colors placeholder:text-muted focus:border-ink focus:outline-none"
                />
                <p className="mt-1 text-[11px] text-muted">
                  Leave blank for instant on-screen QR code and ticket link.
                </p>
              </div>

              <div className="mt-6 flex items-center justify-end gap-2 pt-2">
                <Pill
                  type="button"
                  variant="secondary"
                  onClick={handleClose}
                  disabled={isLoading}
                >
                  Cancel
                </Pill>
                <Pill
                  type="submit"
                  variant="primary"
                  disabled={isLoading}
                >
                  {isLoading ? "Adding..." : "Add to Queue"}
                </Pill>
              </div>
            </form>

            {/* Close Button in DOM order after form buttons */}
            <Pill
              variant="secondary"
              size="icon"
              onClick={handleClose}
              aria-label="Close modal"
              className="absolute right-4 top-4"
            >
              <X className="h-4 w-4" />
            </Pill>
          </>
        )}
      </div>
    </Modal>
  );
}
