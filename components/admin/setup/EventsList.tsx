"use client";

import React from "react";
import {
  Calendar,
  Cake,
  GraduationCap,
  Briefcase,
  Heart,
  School,
  CheckCircle2,
  Clock,
  Lock,
  Plus,
} from "lucide-react";
import type { Event, EventType, EventStatus } from "@/lib/types";
import { Tile } from "@/components/ui/Tile";
import { Label } from "@/components/ui/Label";
import { Pill } from "@/components/ui/Pill";
import { StatusPill } from "@/components/ui/StatusPill";
import { cn } from "@/components/ui/cn";

interface EventsListProps {
  events: Event[];
  selectedEventId: string | null;
  onSelectEvent: (eventId: string) => void;
  onOpenAddModal: () => void;
}

export function getEventTypeIcon(type?: EventType) {
  switch (type) {
    case "Birthday":
      return Cake;
    case "Graduation":
      return GraduationCap;
    case "Corporate":
      return Briefcase;
    case "Wedding":
      return Heart;
    case "School":
      return School;
    case "Other":
    default:
      return Calendar;
  }
}

export function formatEventDate(isoDate: string): string {
  try {
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return "Upcoming";
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "Upcoming";
  }
}

export function StatusBadge({ status }: { status: EventStatus }) {
  if (status === "ACTIVE") {
    return (
      <StatusPill tone="ok" icon={CheckCircle2}>
        Active
      </StatusPill>
    );
  }

  if (status === "CLOSED") {
    return (
      <StatusPill tone="neutral" icon={Lock}>
        Closed
      </StatusPill>
    );
  }

  return (
    <StatusPill tone="info" icon={Clock}>
      Scheduled
    </StatusPill>
  );
}

export default function EventsList({
  events,
  selectedEventId,
  onSelectEvent,
  onOpenAddModal,
}: EventsListProps) {
  return (
    <Tile tone="surface" className="flex flex-col h-full overflow-hidden">
      {/* Column Title */}
      <div className="flex items-center justify-between p-4 border-b border-ink/10">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-accent" />
          <h2 className="font-display text-xl uppercase tracking-tight text-ink">
            Events
          </h2>
        </div>
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink text-xs font-mono font-bold text-paper">
          {events.length}
        </span>
      </div>

      {/* Scrollable list container */}
      <div className="flex-1 overflow-y-auto divide-y divide-ink/10 min-h-[220px]">
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center my-4">
            <Calendar className="h-8 w-8 mb-2 text-muted opacity-50" />
            <p className="text-sm font-semibold text-ink">No events yet.</p>
            <p className="text-xs text-muted mt-0.5">Add your first event to get started.</p>
          </div>
        ) : (
          events.map((evt) => {
            const isSelected = evt.id === selectedEventId;
            const TypeIcon = getEventTypeIcon(evt.event_type);

            return (
              <div
                key={evt.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelectEvent(evt.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectEvent(evt.id);
                  }
                }}
                className={cn(
                  "w-full text-left p-4 transition-all cursor-pointer select-none focus:outline-none",
                  isSelected
                    ? "bg-paper shadow-sm"
                    : "hover:bg-paper/50"
                )}
                aria-pressed={isSelected}
                aria-label={`Select event ${evt.name}`}
              >
                <div className="flex items-start gap-3">
                  {/* Type Icon Badge */}
                  <div
                    className={cn(
                      "p-2.5 shrink-0 rounded-full",
                      isSelected
                        ? "bg-accent text-white"
                        : "bg-ink/5 text-ink"
                    )}
                  >
                    <TypeIcon className="h-4 w-4" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <h3 className="font-display text-base uppercase tracking-tight text-ink truncate">
                        {evt.name}
                      </h3>
                      <StatusBadge status={evt.status} />
                    </div>

                    <div className="flex items-center justify-between text-xs text-muted">
                      <span>{formatEventDate(evt.start_time)}</span>
                      <span className="font-mono text-[11px] font-bold text-ink bg-ink/5 px-2 py-0.5 rounded-full">
                        {evt.event_code}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 mt-2 pt-2 border-t border-ink/5 text-[10px] font-mono text-muted">
                      <span className="text-ink font-semibold">{evt.shots_per_guest || 3} {(evt.shots_per_guest || 3) === 1 ? "SHOT" : "SHOTS"}</span>
                      <span>·</span>
                      <span>MAX {evt.max_retakes ?? 2} RETAKES</span>
                      <span>·</span>
                      <span className="uppercase">{evt.print_layout || "STRIP"}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pinned Bottom Button */}
      <div className="p-3 border-t border-ink/10 bg-surface">
        <Pill
          variant="secondary"
          onClick={onOpenAddModal}
          className="w-full gap-2 border-dashed hover:border-solid"
        >
          <Plus className="h-4 w-4" />
          <span>Add Event</span>
        </Pill>
      </div>
    </Tile>
  );
}
