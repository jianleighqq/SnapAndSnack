"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "./cn";

// Module-level reference tracking for nested modals to prevent premature body scroll restoration
let openModalsCount = 0;
let originalBodyOverflow = "";
let originalBodyPaddingRight = "";

function lockBodyScroll() {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  if (openModalsCount === 0) {
    // Measure scrollbar width before locking to avoid layout jump
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    originalBodyOverflow = document.body.style.overflow;
    originalBodyPaddingRight = document.body.style.paddingRight;

    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
  }
  openModalsCount++;
}

function unlockBodyScroll() {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  openModalsCount = Math.max(0, openModalsCount - 1);
  if (openModalsCount === 0) {
    document.body.style.overflow = originalBodyOverflow;
    document.body.style.paddingRight = originalBodyPaddingRight;
  }
}

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
  className?: string; // Backdrop styling override
  closeOnEsc?: boolean;
  closeOnBackdropClick?: boolean;
  zIndex?: string; // Tailwind z-index class, defaults to "z-50"
}

export function Modal({
  isOpen,
  onClose,
  children,
  ariaLabel,
  ariaLabelledBy,
  ariaDescribedBy,
  className,
  closeOnEsc = true,
  closeOnBackdropClick = true,
  zIndex = "z-50",
}: ModalProps) {
  const [mounted, setMounted] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerElementRef = useRef<HTMLElement | null>(null);

  // Stable ref for onClose so re-renders of parent during typing don't trigger focus/listener effects
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Track previous isOpen state so focus logic ONLY runs on the false -> true transition
  const prevIsOpenRef = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Body scroll locking
  useEffect(() => {
    if (!isOpen) return;

    lockBodyScroll();
    return () => {
      unlockBodyScroll();
    };
  }, [isOpen]);

  // Focus management: runs ONCE when isOpen transitions false -> true, and restores on true -> false
  useEffect(() => {
    if (!isOpen) {
      if (prevIsOpenRef.current) {
        // Modal was closed: restore focus to opening trigger element
        if (triggerElementRef.current && typeof triggerElementRef.current.focus === "function") {
          triggerElementRef.current.focus();
        }
      }
      prevIsOpenRef.current = false;
      return;
    }

    // Modal is opening (only execute if it was previously not open)
    if (!prevIsOpenRef.current) {
      prevIsOpenRef.current = true;
      // Capture the trigger element before focus moves into the modal
      triggerElementRef.current = document.activeElement as HTMLElement | null;

      const focusTimer = setTimeout(() => {
        if (!dialogRef.current) return;

        // 1. Prioritize element with autofocus / data-autofocus attribute
        const autoFocusEl = dialogRef.current.querySelector<HTMLElement>(
          "[autofocus], [data-autofocus]"
        );
        if (autoFocusEl && typeof autoFocusEl.focus === "function") {
          autoFocusEl.focus();
          return;
        }

        // 2. Otherwise focus the first focusable element
        const focusableSelectors =
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
        const focusables = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(focusableSelectors)
        ).filter(
          (el) => !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true"
        );

        if (focusables.length > 0) {
          focusables[0].focus();
        } else {
          dialogRef.current.focus();
        }
      }, 30);

      return () => {
        clearTimeout(focusTimer);
      };
    }
  }, [isOpen]);

  // Keyboard navigation & Tab trapping inside dialog
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Esc to close
      if (e.key === "Escape" && closeOnEsc) {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }

      // Tab trapping inside dialog
      if (e.key === "Tab" && dialogRef.current) {
        const focusableSelectors =
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
        const focusables = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(focusableSelectors)
        ).filter(
          (el) => !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true"
        );

        if (focusables.length === 0) {
          e.preventDefault();
          return;
        }

        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first || document.activeElement === dialogRef.current) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, closeOnEsc]);

  if (!isOpen || !mounted || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-describedby={ariaDescribedBy}
      tabIndex={-1}
      className={cn(
        "fixed inset-0 min-h-[100dvh] h-[100dvh] w-screen flex items-center justify-center p-3 sm:p-4 bg-ink/40 backdrop-blur-sm overflow-y-auto outline-none transition-opacity duration-150",
        zIndex,
        className
      )}
      onClick={(e) => {
        // Only trigger close when clicking the backdrop itself
        if (e.target === e.currentTarget && closeOnBackdropClick) {
          onCloseRef.current();
        }
      }}
    >
      {children}
    </div>,
    document.body
  );
}

export default Modal;
