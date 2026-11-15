"use client";

import React, { useState } from "react";
import { X, UserPlus } from "lucide-react";
import { Pill } from "@/components/ui/Pill";
import { Label } from "@/components/ui/Label";

interface AddGuestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (fullName: string, email: string) => Promise<void>;
  isLoading: boolean;
}

export default function AddGuestModal({
  isOpen,
  onClose,
  onAdd,
  isLoading,
}: AddGuestModalProps) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

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
      await onAdd(trimmedName, trimmedEmail);
      setFullName("");
      setEmail("");
      onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to add guest to queue");
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-3 sm:p-4 backdrop-blur-sm overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-tile bg-paper p-4 sm:p-6 text-ink shadow-xl max-h-[90vh] overflow-y-auto"
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

        {/* Modal Header */}
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

        {/* Form */}
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
              Used to send their queue ticket and personal status link.
            </p>
          </div>

          <div className="mt-6 flex items-center justify-end gap-2 pt-2">
            <Pill
              type="button"
              variant="secondary"
              onClick={onClose}
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
      </div>
    </div>
  );
}

