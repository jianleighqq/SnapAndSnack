import React from "react";
import { Bell, CheckCircle2, Clock, Play, XCircle } from "lucide-react";
import type { QueueStatus } from "@/lib/types";
import { StatusPill, type StatusTone } from "./StatusPill";

// Presentation-only mapping from queue status to color + icon.
const statusStyle: Record<QueueStatus, { tone: StatusTone; icon: typeof Clock; label: string }> = {
  IN_PROGRESS: { tone: "accent", icon: Play, label: "In progress" },
  REMINDED: { tone: "warn", icon: Bell, label: "Reminded" },
  WAITING: { tone: "info", icon: Clock, label: "Waiting" },
  COMPLETED: { tone: "ok", icon: CheckCircle2, label: "Completed" },
  CANCELLED: { tone: "neutral", icon: XCircle, label: "Cancelled" },
};

export function QueueStatusPill({ status, className }: { status: QueueStatus; className?: string }) {
  const style = statusStyle[status];
  return (
    <StatusPill tone={style.tone} icon={style.icon} className={className}>
      {style.label}
    </StatusPill>
  );
}

/** Background/text classes for the round queue-number badge. */
export function queueNumberClasses(status: QueueStatus): string {
  switch (status) {
    case "IN_PROGRESS":
      return "bg-accent text-white";
    case "REMINDED":
      return "bg-sun text-[#161513]";
    case "COMPLETED":
      return "bg-ok text-white";
    case "CANCELLED":
      return "bg-ink/5 text-muted line-through";
    default:
      return "bg-paper text-ink";
  }
}
