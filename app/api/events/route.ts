import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { validateEventInput } from "@/lib/events";
import { requireOperatorSession } from "@/lib/auth-server";
import { eventInputSchema } from "@/lib/validations";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  // Enforce server-side operator session authorization
  const isAuthorized = await requireOperatorSession(request);
  if (!isAuthorized) {
    return NextResponse.json(
      { error: "Unauthorized. Operator session required." },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const [events, activeEvent] = await Promise.all([
      db.getEvents(),
      db.getActiveEvent(),
    ]);
    return NextResponse.json(
      { events, activeEvent },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error: any) {
    console.error("[Events API] GET error:", error?.message || error);
    return NextResponse.json(
      { error: "Failed to fetch events" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

export async function POST(request: Request) {
  // Enforce server-side operator authorization
  const isAuthorized = await requireOperatorSession(request);
  if (!isAuthorized) {
    return NextResponse.json(
      { error: "Unauthorized. Operator session required." },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const body = await request.json();
    const { action, eventId, eventData } = body;

    if (!action) {
      return NextResponse.json({ error: "Action is required" }, { status: 400 });
    }

    switch (action) {
      case "create": {
        // Run both Zod schema validation and business logic validation
        const zodResult = eventInputSchema.safeParse(eventData);
        if (!zodResult.success) {
          const formatted = zodResult.error.flatten().fieldErrors;
          return NextResponse.json(
            { error: "Validation failed", errors: formatted },
            { status: 400 }
          );
        }
        const validation = validateEventInput(eventData);
        if (!validation.isValid) {
          return NextResponse.json(
            { error: "Validation failed", errors: validation.errors },
            { status: 400 }
          );
        }
        const created = await db.createEvent({
          ...eventData,
          status: eventData.status || "SCHEDULED",
        });
        const events = await db.getEvents();
        const activeEvent = await db.getActiveEvent();
        return NextResponse.json({ success: true, created, events, activeEvent });
      }

      case "update": {
        if (!eventId) return NextResponse.json({ error: "eventId is required" }, { status: 400 });
        const validation = validateEventInput(eventData);
        if (!validation.isValid) {
          return NextResponse.json(
            { error: "Validation failed", errors: validation.errors },
            { status: 400 }
          );
        }
        const updated = await db.updateEvent(eventId, eventData);
        const events = await db.getEvents();
        const activeEvent = await db.getActiveEvent();
        return NextResponse.json({ success: true, updated, events, activeEvent });
      }

      case "setActive": {
        if (!eventId) return NextResponse.json({ error: "eventId is required" }, { status: 400 });
        const events = await db.setActiveEvent(eventId);
        const activeEvent = await db.getActiveEvent();
        return NextResponse.json({ success: true, events, activeEvent });
      }

      case "close": {
        if (!eventId) return NextResponse.json({ error: "eventId is required" }, { status: 400 });
        const events = await db.closeEvent(eventId);
        const activeEvent = await db.getActiveEvent();
        return NextResponse.json({ success: true, events, activeEvent });
      }

      case "delete": {
        if (!eventId) return NextResponse.json({ error: "eventId is required" }, { status: 400 });
        const events = await db.deleteEvent(eventId);
        const activeEvent = await db.getCurrentEvent();
        return NextResponse.json({ success: true, events, activeEvent });
      }

      case "checkQueue": {
        if (!eventId) return NextResponse.json({ error: "eventId is required" }, { status: 400 });
        const hasActiveQueue = await db.hasActiveQueueForEvent(eventId);
        return NextResponse.json({ hasActiveQueue });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error: any) {
    console.error("Events API POST Error:", error);
    return NextResponse.json(
      { error: "Failed to process event action" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
