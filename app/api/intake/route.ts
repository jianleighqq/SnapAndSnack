import { NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseServer } from "@/lib/supabase-server";
import { refreshStatuses } from "@/lib/queue";
import { sendRegistrationEmail } from "@/lib/email";
import { extractFirstName } from "@/lib/booth";
import { checkIntakeRateLimit, getClientIp } from "@/lib/rate-limit";
import { intakePayloadSchema } from "@/lib/validations";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Maximum payload size for intake webhook: 64 KB
const MAX_PAYLOAD_BYTES = 64 * 1024;

export async function POST(request: Request) {
  // 1. Rate limiting (max 30 requests per minute per client IP)
  const clientIp = getClientIp(request);
  const rateLimit = checkIntakeRateLimit(clientIp);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again in a minute." },
      { status: 429, headers: { "Retry-After": "60", "Cache-Control": "no-store" } }
    );
  }

  try {
    // 2. Cap incoming request body size
    const contentLength = parseInt(request.headers.get("content-length") || "0", 10);
    if (contentLength > MAX_PAYLOAD_BYTES) {
      return NextResponse.json(
        { error: "Payload too large. Maximum 64 KB allowed." },
        { status: 413, headers: { "Cache-Control": "no-store" } }
      );
    }

    const rawBody = await request.text();
    if (rawBody.length > MAX_PAYLOAD_BYTES) {
      return NextResponse.json(
        { error: "Payload too large. Maximum 64 KB allowed." },
        { status: 413, headers: { "Cache-Control": "no-store" } }
      );
    }

    const timestampHeader = request.headers.get("x-timestamp");
    const signatureHeader = request.headers.get("x-signature");

    const secret = process.env.INTAKE_WEBHOOK_SECRET;
    if (!secret) {
      console.error("INTAKE_WEBHOOK_SECRET is not configured on server.");
      return NextResponse.json(
        { error: "Webhook secret not configured on server" },
        { status: 500, headers: { "Cache-Control": "no-store" } }
      );
    }

    // 3. Signature Verification & Replay Protection (5-minute window)
    if (!timestampHeader || !signatureHeader) {
      return NextResponse.json(
        { error: "Missing authentication headers" },
        { status: 401, headers: { "Cache-Control": "no-store" } }
      );
    }

    const timestamp = parseInt(timestampHeader, 10);
    const nowSeconds = Math.floor(Date.now() / 1000);

    if (isNaN(timestamp) || Math.abs(nowSeconds - timestamp) > 300) {
      return NextResponse.json(
        { error: "Timestamp expired or invalid" },
        { status: 401, headers: { "Cache-Control": "no-store" } }
      );
    }

    const message = `${timestampHeader}.${rawBody}`;
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(message)
      .digest("hex");

    const providedBuffer = Buffer.from(signatureHeader, "hex");
    const expectedBuffer = Buffer.from(expectedSignature, "hex");

    if (
      providedBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(providedBuffer, expectedBuffer)
    ) {
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 401, headers: { "Cache-Control": "no-store" } }
      );
    }

    // 4. Body JSON Validation via Zod
    let rawJson: any;
    try {
      rawJson = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { error: "Malformed JSON payload" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const parsed = intakePayloadSchema.safeParse(rawJson);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid payload" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const { full_name: trimmedName, email: normalizedEmail, event_code } = parsed.data;

    // 5. Resolve target event: either via explicit event_code or via the currently ACTIVE event
    let event: any = null;
    const cleanEventCode = typeof event_code === "string" ? event_code.trim().toUpperCase() : "";

    if (cleanEventCode) {
      // Look up event by event_code
      const { data, error: eventErr } = await supabaseServer
        .from("events")
        .select("*")
        .eq("event_code", cleanEventCode)
        .maybeSingle();

      if (eventErr || !data) {
        return NextResponse.json(
          { error: "Event not found" },
          { status: 404, headers: { "Cache-Control": "no-store" } }
        );
      }
      event = data;
    } else {
      // No event_code supplied: use the single event with status = 'ACTIVE'
      const { data: activeEvent, error: activeErr } = await supabaseServer
        .from("events")
        .select("*")
        .eq("status", "ACTIVE")
        .maybeSingle();

      if (activeErr || !activeEvent) {
        return NextResponse.json(
          { error: "Registration is not open" },
          { status: 409, headers: { "Cache-Control": "no-store" } }
        );
      }
      event = activeEvent;
    }

    if (event.status === "CLOSED") {
      return NextResponse.json(
        { error: "Registration closed" },
        { status: 409, headers: { "Cache-Control": "no-store" } }
      );
    }

    // 6. Idempotency Check: if guest already exists with this email for this event
    const { data: existingGuest } = await supabaseServer
      .from("guests")
      .select("*")
      .eq("event_id", event.id)
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (existingGuest) {
      const { data: existingQueue } = await supabaseServer
        .from("queue_entries")
        .select("*")
        .eq("guest_id", existingGuest.id)
        .maybeSingle();

      return NextResponse.json(
        {
          queue_number: existingQueue?.queue_number ?? null,
          guest_token: existingGuest.guest_token,
        },
        { status: 200, headers: { "Cache-Control": "no-store" } }
      );
    }

    // 7. Insert into guests (database generates uuid id and guest_token)
    const { data: newGuest, error: guestErr } = await supabaseServer
      .from("guests")
      .insert({
        event_id: event.id,
        full_name: trimmedName,
        email: normalizedEmail,
      })
      .select()
      .single();

    if (guestErr || !newGuest) {
      console.error("Supabase insert guest error:", guestErr?.message || guestErr);
      return NextResponse.json(
        { error: "Failed to create guest record" },
        { status: 500, headers: { "Cache-Control": "no-store" } }
      );
    }

    // Calculate queue number and retry once on unique collision
    let createdEntry: any = null;
    let attempts = 0;

    while (attempts < 2 && !createdEntry) {
      attempts++;

      const { data: maxRows } = await supabaseServer
        .from("queue_entries")
        .select("queue_number")
        .eq("event_id", event.id)
        .order("queue_number", { ascending: false })
        .limit(1);

      const nextQueueNumber = (maxRows?.[0]?.queue_number || 0) + 1;

      // Estimate scheduled shoot time based on active guests ahead * avg_shoot_minutes
      const { count: activeCount } = await supabaseServer
        .from("queue_entries")
        .select("id", { count: "exact", head: true })
        .eq("event_id", event.id)
        .in("status", ["WAITING", "REMINDED", "IN_PROGRESS"]);

      const avgMinutes = event.avg_shoot_minutes || 5;
      const scheduledTime = new Date(
        Date.now() + (activeCount || 0) * avgMinutes * 60000
      ).toISOString();

      const { data: entry, error: entryErr } = await supabaseServer
        .from("queue_entries")
        .insert({
          event_id: event.id,
          guest_id: newGuest.id,
          queue_number: nextQueueNumber,
          status: "WAITING",
          scheduled_shoot_time: scheduledTime,
        })
        .select()
        .single();

      if (!entryErr && entry) {
        createdEntry = entry;
      } else if (entryErr?.code === "23505" && attempts < 2) {
        // Unique constraint violation on (event_id, queue_number), retry once
        continue;
      } else {
        console.error("Supabase insert queue entry error:", entryErr?.message || entryErr);
        return NextResponse.json(
          { error: "Failed to create queue entry" },
          { status: 500, headers: { "Cache-Control": "no-store" } }
        );
      }
    }

    // Run refreshStatuses to ensure queue status consistency
    try {
      const { data: allEntries } = await supabaseServer
        .from("queue_entries")
        .select("*")
        .eq("event_id", event.id)
        .order("queue_number", { ascending: true });

      if (allEntries && allEntries.length > 0) {
        const refreshed = refreshStatuses(allEntries as any);
        for (const item of refreshed) {
          const original = allEntries.find((e) => e.id === item.id);
          if (original && original.status !== item.status) {
            await supabaseServer
              .from("queue_entries")
              .update({ status: item.status })
              .eq("id", item.id);
          }
        }
      }
    } catch (refreshErr) {
      console.warn("refreshStatuses error during intake:", refreshErr);
    }

    // 8. Send notification email via Gmail SMTP (or Resend fallback)
    try {
      const firstName = extractFirstName(newGuest.full_name);
      await sendRegistrationEmail({
        to: normalizedEmail,
        firstName,
        queueNumber: createdEntry.queue_number,
        eventName: event.name,
        guestToken: newGuest.guest_token,
      });
    } catch (emailErr) {
      // Email failing must never fail registration: still return 200
      console.error("Intake email dispatch error:", emailErr);
    }

    // 9. Response
    return NextResponse.json(
      {
        queue_number: createdEntry.queue_number,
        guest_token: newGuest.guest_token,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error: any) {
    console.error("Intake route error:", error?.message || error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

