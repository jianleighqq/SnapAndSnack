import type { Event, EventType, EventStatus, PrintLayout } from "./types";

export interface EventFormInput {
  name: string;
  event_type: EventType;
  event_code: string;
  start_time: string;
  end_time: string;
  avg_shoot_minutes: number;
  shots_per_guest?: number;
  max_retakes?: number;
  print_layout?: PrintLayout;
}

export interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}

/**
 * Validates event creation and edit inputs.
 * Ensures data integrity before writing to the store.
 */
export function validateEventInput(input: Partial<EventFormInput>): ValidationResult {
  const errors: Record<string, string> = {};

  if (!input.name || !input.name.trim()) {
    errors.name = "Event name is required";
  }

  if (!input.event_type) {
    errors.event_type = "Event type is required";
  }

  if (!input.event_code || !input.event_code.trim()) {
    errors.event_code = "Event code is required";
  } else if (!/^[A-Z0-9_-]{3,12}$/i.test(input.event_code.trim())) {
    errors.event_code = "Event code must be 3-12 alphanumeric characters";
  }

  if (!input.start_time) {
    errors.start_time = "Start time is required";
  }

  if (!input.end_time) {
    errors.end_time = "End time is required";
  }

  if (input.start_time && input.end_time) {
    const startDate = new Date(input.start_time);
    const endDate = new Date(input.end_time);

    if (isNaN(startDate.getTime())) {
      errors.start_time = "Invalid start time";
    }
    if (isNaN(endDate.getTime())) {
      errors.end_time = "Invalid end time";
    }

    if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
      if (endDate <= startDate) {
        errors.end_time = "End time must be after start time";
      }
    }
  }

  const avgMinutes = Number(input.avg_shoot_minutes);
  if (isNaN(avgMinutes) || avgMinutes < 1 || avgMinutes > 60) {
    errors.avg_shoot_minutes = "Average shoot time must be between 1 and 60 minutes";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Generates an event code from the event title and year.
 * Example: "Sam's 30th Birthday" -> "SAM30" or "Class of 2026" -> "CLAS26"
 */
export function generateEventCode(name: string, dateStr?: string): string {
  const cleanName = name.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  const prefix = (cleanName.slice(0, 4) || "SNAP").padEnd(4, "X");

  let suffix = "";
  if (dateStr) {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      suffix = String(d.getFullYear()).slice(-2);
    }
  }
  if (!suffix) {
    suffix = String(new Date().getFullYear()).slice(-2);
  }

  return `${prefix}${suffix}`;
}

/**
 * Ensures only ONE event is ACTIVE at any given time.
 * If target event is marked ACTIVE, any previously active event returns to SCHEDULED.
 */
export function setActiveEventPure(events: Event[], targetEventId: string): Event[] {
  return events.map((evt) => {
    if (evt.id === targetEventId) {
      return { ...evt, status: "ACTIVE" as EventStatus };
    }
    if (evt.status === "ACTIVE") {
      return { ...evt, status: "SCHEDULED" as EventStatus };
    }
    return evt;
  });
}

/**
 * Marks a specific event as CLOSED.
 */
export function closeEventPure(events: Event[], targetEventId: string): Event[] {
  return events.map((evt) => {
    if (evt.id === targetEventId) {
      return { ...evt, status: "CLOSED" as EventStatus };
    }
    return evt;
  });
}

/**
 * Removes an event from the list.
 */
export function deleteEventPure(events: Event[], targetEventId: string): Event[] {
  return events.filter((evt) => evt.id !== targetEventId);
}
