import { z } from "zod";

/**
 * Common Zod validation primitives
 */
export const uuidSchema = z.string().uuid({ message: "Invalid UUID format" });

export const tokenSchema = z
  .string()
  .min(16, { message: "Token too short" })
  .max(128, { message: "Token too long" })
  .regex(/^[A-Za-z0-9_-]+$/, { message: "Invalid token characters" });

/**
 * Event creation and update schemas
 */
export const eventTypeSchema = z.enum([
  "Wedding",
  "Birthday",
  "Graduation",
  "Corporate",
  "School",
  "Other",
]);

export const printLayoutSchema = z.enum(["SINGLE", "STRIP", "GRID"]);
export const templateModeSchema = z.enum(["OPERATOR", "GUEST"]);
export const eventStatusSchema = z.enum(["SCHEDULED", "ACTIVE", "CLOSED"]);

export const eventInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  event_type: eventTypeSchema,
  event_code: z
    .string()
    .trim()
    .min(3)
    .max(20)
    .regex(/^[A-Z0-9]+$/, { message: "Event code must be uppercase alphanumeric" }),
  start_time: z.string().datetime({ offset: true }),
  end_time: z.string().datetime({ offset: true }),
  avg_shoot_minutes: z.number().int().min(1).max(60).default(3),
  shots_per_guest: z.number().int().min(1).max(4).default(3),
  max_retakes: z.number().int().min(0).max(5).default(2),
  print_layout: printLayoutSchema.default("STRIP"),
  max_prints_per_guest: z.number().int().min(1).max(5).default(1),
  include_gif: z.boolean().optional().default(false),
  template_mode: templateModeSchema.optional().default("OPERATOR"),
  status: eventStatusSchema.optional().default("SCHEDULED"),
});

/**
 * Queue actions schema
 */
export const queueActionSchema = z.object({
  action: z.enum(["addGuest", "start", "remind", "finish", "cancel", "callNext"]),
  queueId: z.string().trim().optional(),
  guestToken: z.string().trim().optional(),
  fullName: z.string().trim().min(1).max(100).optional(),
  email: z.string().trim().email().max(120).optional().or(z.literal("")),
});

/**
 * Intake registration payload schema
 */
export const intakePayloadSchema = z.object({
  full_name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(120),
  event_code: z.string().trim().max(20).optional().nullable(),
});

/**
 * Template slot schema
 */
export const templateSlotSchema = z.object({
  x: z.number().min(0).max(10000),
  y: z.number().min(0).max(10000),
  w: z.number().min(1).max(10000),
  h: z.number().min(1).max(10000),
});

/**
 * Pose schemas
 */
export const poseInputSchema = z.object({
  name: z.string().trim().min(1).max(40),
  description: z.string().trim().max(80).optional().nullable(),
});

export const poseReorderSchema = z.object({
  orderedIds: z.array(z.string().uuid()),
});
