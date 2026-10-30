"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Lock, X, AlertCircle } from "lucide-react";
import { Pill } from "@/components/ui/Pill";
import { Label } from "@/components/ui/Label";
import { Hairline } from "@/components/ui/Hairline";

interface PinModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function PinModal({ isOpen, onClose }: PinModalProps) {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Expected PIN from environment variable with fallback
  const expectedPin = process.env.NEXT_PUBLIC_BOOTH_PIN || "1234";

  useEffect(() => {
    if (isOpen) {
      setPin("");
      setError(null);
      // Small timeout ensures the modal is fully mounted before focusing
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (pin.trim() === expectedPin) {
      router.push("/admin/queue");
      onClose();
    } else {
      setError("Incorrect PIN. Please try again.");
      setPin("");
      inputRef.current?.focus();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pin-modal-title"
      className="fixed inset-0 z-50 flex cursor-default items-center justify-center bg-ink/30 p-4 backdrop-blur-sm"
      onClick={(e) => {
        // Prevent background clicks inside the modal from bubbling to the screen
        e.stopPropagation();
      }}
    >
      <div
        className="relative w-full max-w-md rounded-tile bg-paper p-8 text-ink"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <Label className="flex items-center gap-2">
              <Lock className="h-3.5 w-3.5 text-accent" />
              Operator only
            </Label>
            <h2 id="pin-modal-title" className="mt-2 font-display text-4xl uppercase leading-none">
              Operator <span className="text-accent">Access</span>
            </h2>
          </div>
          <Pill
            variant="secondary"
            size="icon-lg"
            onClick={onClose}
            aria-label="Close PIN dialog"
          >
            <X className="h-5 w-5" />
          </Pill>
        </div>

        <Hairline className="my-6" />

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <Label as="label" htmlFor="operator-pin" className="mb-2 block">
              Enter 4-digit security PIN
            </Label>
            <input
              ref={inputRef}
              id="operator-pin"
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={8}
              value={pin}
              onChange={(e) => {
                setPin(e.target.value);
                if (error) setError(null);
              }}
              placeholder="••••"
              className="input-field min-h-[64px] rounded-2xl text-center font-mono text-3xl tracking-[0.5em]"
              autoComplete="off"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-2xl bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 pt-1">
            <Pill variant="secondary" size="lg" onClick={onClose} className="text-base">
              Cancel
            </Pill>
            <Pill type="submit" variant="primary" size="lg" className="text-base">
              Verify PIN
            </Pill>
          </div>
        </form>
      </div>
    </div>
  );
}
