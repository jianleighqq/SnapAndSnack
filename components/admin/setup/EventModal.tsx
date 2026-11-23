"use client";

import React, { useState, useEffect } from "react";
import { X } from "lucide-react";
import type { Event, EventType, PrintLayout } from "@/lib/types";
import { validateEventInput, generateEventCode, extractDateTimeParts } from "@/lib/events";
import { Pill } from "@/components/ui/Pill";
import { Label } from "@/components/ui/Label";
import { Hairline } from "@/components/ui/Hairline";
import { cn } from "@/components/ui/cn";
import { Modal } from "@/components/ui/Modal";

interface EventModalProps {
  isOpen: boolean;
  eventToEdit?: Event | null;
  onClose: () => void;
  onSave: (eventData: any) => Promise<void>;
}

const EVENT_TYPES: EventType[] = [
  "Wedding",
  "Birthday",
  "Graduation",
  "Corporate",
  "School",
  "Other",
];

const PRINT_LAYOUTS: { id: PrintLayout; label: string; desc: string }[] = [
  { id: "SINGLE", label: "Single", desc: "1 large framed portrait" },
  { id: "STRIP", label: "Strip", desc: "Dual vertical strips on 4x6" },
  { id: "GRID", label: "2x2 Grid", desc: "Quad photo collage" },
];

export default function EventModal({
  isOpen,
  eventToEdit,
  onClose,
  onSave,
}: EventModalProps) {
  const isEditing = !!eventToEdit;

  const [name, setName] = useState("");
  const [eventType, setEventType] = useState<EventType>("Corporate");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("18:00");
  const [endTime, setEndTime] = useState("23:00");
  const [avgMinutes, setAvgMinutes] = useState(5);
  const [shotsPerGuest, setShotsPerGuest] = useState<number>(3);
  const [maxRetakes, setMaxRetakes] = useState<number>(2);
  const [printLayout, setPrintLayout] = useState<PrintLayout>("STRIP");
  const [maxPrintsPerGuest, setMaxPrintsPerGuest] = useState<number>(1);
  const [includeGif, setIncludeGif] = useState<boolean>(false);
  const [eventCode, setEventCode] = useState("");
  const [codeManuallyEdited, setCodeManuallyEdited] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize form when opened or editing target changes
  useEffect(() => {
    if (eventToEdit) {
      setName(eventToEdit.name);
      setEventType(eventToEdit.event_type || "Corporate");
      const start = new Date(eventToEdit.start_time);
      const end = new Date(eventToEdit.end_time);

      if (!isNaN(start.getTime())) {
        const parts = extractDateTimeParts(eventToEdit.start_time);
        setDate(parts.date);
        setStartTime(parts.time);
      }
      if (!isNaN(end.getTime())) {
        const parts = extractDateTimeParts(eventToEdit.end_time);
        setEndTime(parts.time);
      }

      setAvgMinutes(eventToEdit.avg_shoot_minutes || 5);
      setShotsPerGuest(eventToEdit.shots_per_guest || 3);
      setMaxRetakes(eventToEdit.max_retakes ?? 2);
      setPrintLayout(eventToEdit.print_layout || "STRIP");
      setMaxPrintsPerGuest(eventToEdit.max_prints_per_guest ?? 1);
      setIncludeGif(eventToEdit.include_gif ?? false);
      setEventCode(eventToEdit.event_code);
      setCodeManuallyEdited(true);
    } else {
      // Defaults for new event
      setName("");
      setEventType("Corporate");
      const today = new Date();
      today.setDate(today.getDate() + 7); // Default 1 week ahead
      const defaultParts = extractDateTimeParts(today.toISOString());
      setDate(defaultParts.date);
      setStartTime("18:00");
      setEndTime("23:00");
      setAvgMinutes(5);
      setShotsPerGuest(3);
      setMaxRetakes(2);
      setPrintLayout("STRIP");
      setMaxPrintsPerGuest(1);
      setIncludeGif(false);
      setEventCode("SNAP26");
      setCodeManuallyEdited(false);
    }
    setErrors({});
  }, [eventToEdit, isOpen]);

  // Handle auto-generation of event code when name or date changes unless manually edited
  const handleNameChange = (val: string) => {
    setName(val);
    if (!codeManuallyEdited) {
      setEventCode(generateEventCode(val, date));
    }
  };

  const handleDateChange = (val: string) => {
    setDate(val);
    if (!codeManuallyEdited) {
      setEventCode(generateEventCode(name, val));
    }
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const startIso = `${date}T${startTime}:00+08:00`;
    const endIso = `${date}T${endTime}:00+08:00`;

    const inputData = {
      name: name.trim(),
      event_type: eventType,
      event_code: eventCode.trim().toUpperCase(),
      start_time: startIso,
      end_time: endIso,
      avg_shoot_minutes: Number(avgMinutes),
      shots_per_guest: Number(shotsPerGuest),
      max_retakes: Number(maxRetakes),
      print_layout: printLayout,
      max_prints_per_guest: Number(maxPrintsPerGuest || 1),
      include_gif: includeGif,
    };

    const validation = validateEventInput(inputData);
    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    setErrors({});
    setIsSubmitting(true);
    try {
      await onSave(inputData);
      onClose();
    } catch (err: any) {
      setErrors({ form: err?.message || "Failed to save event" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      ariaLabelledBy="event-modal-title"
      zIndex="z-50"
    >
      <div
        className="w-full max-w-lg rounded-tile bg-paper p-4 sm:p-6 text-ink relative max-h-[90vh] overflow-y-auto shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 pr-10">
          <div>
            <Label>{isEditing ? "Edit event" : "New event"}</Label>
            <h2 id="event-modal-title" className="font-display text-3xl uppercase tracking-tight text-ink mt-1">
              {isEditing ? "Edit Event" : "Create New Event"}
            </h2>
          </div>
        </div>

        <Hairline className="my-4" />

        {/* Global form error */}
        {errors.form && (
          <div className="mb-4 p-3 bg-danger/10 text-danger text-xs font-semibold rounded-xl">
            {errors.form}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Event Name */}
          <div>
            <Label as="label" htmlFor="event-name" className="block mb-1.5">
              Event Name <span className="text-danger">*</span>
            </Label>
            <input
              id="event-name"
              type="text"
              required
              autoFocus
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. Sam's 30th Birthday"
              className={cn(
                "input-field",
                errors.name && "border-danger focus:ring-danger/30"
              )}
            />
            {errors.name && <p className="text-xs text-danger font-semibold mt-1">{errors.name}</p>}
          </div>

          {/* Event Type & Avg Shoot Minutes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label as="label" htmlFor="event-type" className="block mb-1.5">
                Event Type <span className="text-danger">*</span>
              </Label>
              <select
                id="event-type"
                value={eventType}
                onChange={(e) => setEventType(e.target.value as EventType)}
                className="input-field"
              >
                {EVENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label as="label" htmlFor="avg-minutes" className="block mb-1.5">
                Avg. Mins / Shoot
              </Label>
              <input
                id="avg-minutes"
                type="number"
                min="1"
                max="60"
                value={avgMinutes}
                onChange={(e) => setAvgMinutes(Number(e.target.value))}
                className="input-field"
              />
              {errors.avg_shoot_minutes && (
                <p className="text-xs text-danger font-semibold mt-1">{errors.avg_shoot_minutes}</p>
              )}
            </div>
          </div>

          {/* Date, Start Time & End Time */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label as="label" htmlFor="event-date" className="block mb-1.5">
                Date <span className="text-danger">*</span>
              </Label>
              <input
                id="event-date"
                type="date"
                required
                value={date}
                onChange={(e) => handleDateChange(e.target.value)}
                className={cn(
                  "input-field",
                  errors.start_time && "border-danger focus:ring-danger/30"
                )}
              />
            </div>

            <div>
              <Label as="label" htmlFor="start-time" className="block mb-1.5">
                Start Time <span className="text-danger">*</span>
              </Label>
              <input
                id="start-time"
                type="time"
                required
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="input-field"
              />
            </div>

            <div>
              <Label as="label" htmlFor="end-time" className="block mb-1.5">
                End Time <span className="text-danger">*</span>
              </Label>
              <input
                id="end-time"
                type="time"
                required
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className={cn(
                  "input-field",
                  errors.end_time && "border-danger focus:ring-danger/30"
                )}
              />
            </div>
          </div>
          {errors.end_time && (
            <p className="text-xs text-danger font-semibold">{errors.end_time}</p>
          )}

          {/* Photos per guest & Print Layout & Max Retakes */}
          <div className="space-y-4 p-4 rounded-tile bg-surface">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label as="label" className="block mb-2 text-ink">
                  Photos per guest
                </Label>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setShotsPerGuest(num)}
                      data-selected={shotsPerGuest === num ? "true" : undefined}
                      className={cn(
                        "flex-1 min-h-[44px] rounded-full text-xs font-mono font-bold",
                        shotsPerGuest === num
                          ? "is-selected bg-ink text-paper"
                          : "interactive-secondary bg-paper text-ink border border-ink/15"
                      )}
                    >
                      {num}
                    </button>
                  ))}
                </div>
                <span className="block mt-1 text-[11px] text-muted">
                  {shotsPerGuest === 3 ? "3 photos (default)" : `${shotsPerGuest} ${shotsPerGuest === 1 ? "photo" : "photos"}`}
                </span>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label as="label" className="text-ink">
                    Max retakes per shot
                  </Label>
                  <span className="text-[10px] font-mono text-accent font-semibold uppercase">Rec: 2</span>
                </div>
                <div className="flex items-center gap-2">
                  {[0, 1, 2, 3, 4].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setMaxRetakes(num)}
                      data-selected={maxRetakes === num ? "true" : undefined}
                      className={cn(
                        "flex-1 min-h-[44px] rounded-full text-xs font-mono font-bold",
                        maxRetakes === num
                          ? "is-selected bg-ink text-paper"
                          : "interactive-secondary bg-paper text-ink border border-ink/15"
                      )}
                    >
                      {num}
                    </button>
                  ))}
                </div>
                <span className="block mt-1 text-[11px] text-muted">
                  {maxRetakes === 0 ? "No retakes allowed" : `Up to ${maxRetakes} retakes per shot`}
                </span>
              </div>
            </div>

            <div className="pt-2 border-t border-ink/10">
              <Label as="label" className="block mb-2 text-ink">
                Print layout
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {PRINT_LAYOUTS.map((layout) => (
                  <button
                    key={layout.id}
                    type="button"
                    onClick={() => setPrintLayout(layout.id)}
                    data-selected={printLayout === layout.id ? "true" : undefined}
                    className={cn(
                      "flex flex-col items-center justify-center p-2.5 rounded-tile text-xs min-h-[44px] text-center",
                      printLayout === layout.id
                        ? "is-selected bg-ink text-paper font-semibold"
                        : "interactive-secondary bg-paper text-ink border border-ink/15"
                    )}
                  >
                    <span className="font-mono uppercase text-xs">{layout.label}</span>
                    <span className={cn("text-[10px] mt-0.5", printLayout === layout.id ? "text-paper/70" : "text-muted")}>
                      {layout.id === "STRIP" ? `Dual ${shotsPerGuest}-strip` : layout.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-2 border-t border-ink/10">
              <div className="flex items-center justify-between mb-2">
                <Label as="label" className="text-ink">
                  Prints per guest
                </Label>
                <span className="text-[10px] font-mono text-accent font-semibold uppercase">Rec: 1</span>
              </div>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setMaxPrintsPerGuest(num)}
                    data-selected={maxPrintsPerGuest === num ? "true" : undefined}
                    className={cn(
                      "flex-1 min-h-[44px] rounded-full text-xs font-mono font-bold",
                      maxPrintsPerGuest === num
                        ? "is-selected bg-ink text-paper"
                        : "interactive-secondary bg-paper text-ink border border-ink/15"
                    )}
                  >
                    {num}
                  </button>
                ))}
              </div>
              <span className="block mt-1 text-[11px] text-muted">
                {maxPrintsPerGuest === 1 ? "1 print per session (default)" : `${maxPrintsPerGuest} prints allowed per guest`}
              </span>
            </div>

            {/* Animated GIF Slideshow Toggle */}
            <div className="pt-2 border-t border-ink/10">
              <div className="flex items-center justify-between">
                <div>
                  <Label as="label" className="text-ink block">
                    Include animated GIF
                  </Label>
                  <span className="text-[11px] text-muted block mt-0.5">
                    Generate a looping slideshow GIF from kept shots
                  </span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={includeGif}
                  onClick={() => setIncludeGif(!includeGif)}
                  className={cn(
                    "relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                    includeGif ? "bg-accent" : "bg-ink/20"
                  )}
                >
                  <span
                    className={cn(
                      "pointer-events-none inline-block h-6 w-6 transform rounded-full bg-paper shadow-md transition duration-200 ease-in-out",
                      includeGif ? "translate-x-5" : "translate-x-0"
                    )}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Event Code */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label as="label" htmlFor="event-code">
                Event Code <span className="text-danger">*</span>
              </Label>
              <span className="text-[11px] text-muted">Used for QR & Guest links</span>
            </div>
            <input
              id="event-code"
              type="text"
              required
              value={eventCode}
              onChange={(e) => {
                setCodeManuallyEdited(true);
                setEventCode(e.target.value.toUpperCase());
              }}
              placeholder="e.g. SNAP26"
              className={cn(
                "input-field font-mono font-bold uppercase",
                errors.event_code && "border-danger focus:ring-danger/30"
              )}
            />
            {errors.event_code && (
              <p className="text-xs text-danger font-semibold mt-1">{errors.event_code}</p>
            )}
          </div>

          {/* Actions */}
          <div className="pt-4 flex items-center justify-end gap-3 border-t border-ink/10">
            <Pill
              variant="secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Pill>
            <Pill
              type="submit"
              variant="primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Saving..." : isEditing ? "Save Changes" : "Create Event"}
            </Pill>
          </div>
        </form>

        {/* Close Button: tab order is after submit, visually top-right */}
        <Pill
          variant="secondary"
          size="icon"
          onClick={onClose}
          aria-label="Close dialog"
          className="absolute right-4 top-4 sm:right-6 sm:top-6"
        >
          <X className="h-4 w-4" />
        </Pill>
      </div>
    </Modal>
  );
}
