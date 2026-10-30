"use client";

import React, { useEffect } from "react";
import { AlertTriangle, AlertCircle, CheckCircle2, X } from "lucide-react";
import { Pill } from "@/components/ui/Pill";
import { Label } from "@/components/ui/Label";
import { Hairline } from "@/components/ui/Hairline";

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  warningNote?: string | null;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "primary";
  onClose: () => void;
  onConfirm: () => void;
  isLoading?: boolean;
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  warningNote,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "primary",
  onClose,
  onConfirm,
  isLoading = false,
}: ConfirmModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isLoading) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isLoading, onClose]);

  if (!isOpen) return null;

  const pillVariant = variant === "danger" ? "danger" : variant === "warning" ? "accent" : "primary";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/30 backdrop-blur-sm"
      onClick={() => {
        if (!isLoading) onClose();
      }}
    >
      <div
        className="w-full max-w-md rounded-tile bg-paper p-6 text-ink relative shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between pb-3">
          <div className="flex items-center gap-2">
            {variant === "danger" ? (
              <AlertTriangle className="h-5 w-5 text-danger shrink-0" />
            ) : variant === "warning" ? (
              <AlertCircle className="h-5 w-5 text-warn shrink-0" />
            ) : (
              <CheckCircle2 className="h-5 w-5 text-accent shrink-0" />
            )}
            <h2 id="confirm-modal-title" className="font-display text-2xl uppercase tracking-tight text-ink">
              {title}
            </h2>
          </div>
          <Pill
            variant="secondary"
            size="icon"
            onClick={onClose}
            disabled={isLoading}
            aria-label="Close confirmation dialog"
          >
            <X className="h-4 w-4" />
          </Pill>
        </div>

        <Hairline className="my-3" />

        <p className="text-sm text-ink/80 mb-4 leading-relaxed font-normal">
          {message}
        </p>

        {warningNote && (
          <div className="mb-4 p-3.5 bg-warn/10 rounded-xl text-warn text-xs font-medium flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{warningNote}</span>
          </div>
        )}

        <div className="pt-3 border-t border-ink/10 flex items-center justify-end gap-3">
          <Pill
            variant="secondary"
            onClick={onClose}
            disabled={isLoading}
          >
            {cancelLabel}
          </Pill>
          <Pill
            variant={pillVariant}
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? "Processing..." : confirmLabel}
          </Pill>
        </div>
      </div>
    </div>
  );
}
