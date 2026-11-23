"use client";

import React from "react";
import { AlertTriangle, AlertCircle, CheckCircle2, X } from "lucide-react";
import { Pill } from "@/components/ui/Pill";
import { Hairline } from "@/components/ui/Hairline";
import { Modal } from "@/components/ui/Modal";

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
  const pillVariant = variant === "danger" ? "danger" : variant === "warning" ? "accent" : "primary";

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!isLoading) onClose();
      }}
      ariaLabelledBy="confirm-modal-title"
      zIndex="z-50"
    >
      <div
        className="w-full max-w-md rounded-tile bg-paper p-4 sm:p-6 text-ink relative shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between pb-3 pr-10">
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
            autoFocus
          >
            {isLoading ? "Processing..." : confirmLabel}
          </Pill>
        </div>

        {/* Close Button in DOM order after action buttons */}
        <Pill
          variant="secondary"
          size="icon"
          onClick={onClose}
          disabled={isLoading}
          aria-label="Close confirmation dialog"
          className="absolute right-4 top-4"
        >
          <X className="h-4 w-4" />
        </Pill>
      </div>
    </Modal>
  );
}
