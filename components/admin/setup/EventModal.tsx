"use client";

import React, { useState, useEffect } from "react";
import { X } from "lucide-react";
import type { Event, EventType } from "@/lib/types";
import { validateEventInput, generateEventCode } from "@/lib/events";
import { Pill } from "@/components/ui/Pill";
import { Label } from "@/components/ui/Label";
import { Hairline } from "@/components/ui/Hairline";
import { cn } from "@/components/ui/cn";

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
        setDate(start.toISOString().split("T")[0]);
        setStartTime(start.toTimeString().slice(0, 5));
      }
      if (!isNaN(end.getTime())) {
        setEndTime(end.toTimeString().slice(0, 5));
      }

      setAvgMinutes(eventToEdit.avg_shoot_minutes || 5);
      setEventCode(eventToEdit.event_code);
      setCodeManuallyEdited(true);
    } else {
      // Defaults for new event
      setName("");
      setEventType("Corporate");
      const today = new Date();
      today.setDate(today.getDate() + 7); // Default 1 week ahead
      const dateString = today.toISOString().split("T")[0];
      setDate(dateString);
      setStartTime("18:00");
      setEndTime("23:00");
      setAvgMinutes(5);
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

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const startIso = `${date}T${startTime}:00Z`;
    const endIso = `${date}T${endTime}:00Z`;

    const inputData = {
      name: name.trim(),
      event_type: eventType,
      event_code: eventCode.trim().toUpperCase(),
      start_time: startIso,
      end_time: endIso,
      avg_shoot_minutes: Number(avgMinutes),
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
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="event-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/30 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-tile bg-paper p-6 text-ink relative max-h-[90vh] overflow-y-auto shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3">
          <div>
            <Label>{isEditing ? "Edit event" : "New event"}</Label>
            <h2 id="event-modal-title" className="font-display text-3xl uppercase tracking-tight text-ink mt-1">
              {isEditing ? "Edit Event" : "Create New Event"}
            </h2>
          </div>
          <Pill
            variant="secondary"
            size="icon"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
          </Pill>
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

          {/* Event Code */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label as="label" htmlFor="event-code">
                Event Code <span className="text-danger">*</span>
              </Label>
              <span className="text-[11px] text-muted">Used for QR &amp; Guest links</span>
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
      </div>
    </div>
  );
}
