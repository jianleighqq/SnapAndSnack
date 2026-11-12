import { NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseServer } from "@/lib/supabase-server";
import { refreshStatuses } from "@/lib/queue";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();

    const timestampHeader = request.headers.get("x-timestamp");
    const signatureHeader = request.headers.get("x-signature");

    const secret = process.env.INTAKE_WEBHOOK_SECRET;
    if (!secret) {
      console.error("INTAKE_WEBHOOK_SECRET is not configured on server.");
      return NextResponse.json(
        { error: "Webhook secret not configured on server" },
        { status: 500 }
      );
    }

    // 1. Signature Verification & Replay Protection (5-minute window)
    if (!timestampHeader || !signatureHeader) {
      return NextResponse.json(
        { error: "Missing authentication headers" },
        { status: 401 }
      );
    }

    const timestamp = parseInt(timestampHeader, 10);
    const nowSeconds = Math.floor(Date.now() / 1000);

    if (isNaN(timestamp) || Math.abs(nowSeconds - timestamp) > 300) {
      return NextResponse.json(
        { error: "Timestamp expired or invalid" },
        { status: 401 }
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
        { status: 401 }
      );
    }

    // 2. Body Validation (never log the secret)
    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { error: "Malformed JSON payload" },
        { status: 400 }
      );
    }

    const { event_code, full_name, email } = body || {};

    const trimmedName = typeof full_name === "string" ? full_name.trim() : "";
    if (!trimmedName || trimmedName.length < 1 || trimmedName.length > 100) {
      return NextResponse.json(
        { error: "full_name must be between 1 and 100 characters" },
        { status: 400 }
      );
    }

    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return NextResponse.json(
        { error: "A valid email address is required" },
        { status: 400 }
      );
    }

    // 3. Resolve target event: either via explicit event_code or via the currently ACTIVE event
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
          { status: 404 }
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
          { status: 409 }
        );
      }
      event = activeEvent;
    }

    if (event.status === "CLOSED") {
      return NextResponse.json(
        { error: "Registration closed" },
        { status: 409 }
      );
    }

    // 4. Idempotency Check: if guest already exists with this email for this event
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
        { status: 200 }
      );
    }

    // 5. Insert into guests (database generates uuid id and guest_token)
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
      console.error("Supabase insert guest error:", guestErr);
      return NextResponse.json(
        { error: "Failed to create guest record" },
        { status: 500 }
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
        console.error("Supabase insert queue entry error:", entryErr);
        return NextResponse.json(
          { error: "Failed to create queue entry" },
          { status: 500 }
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
        const nowIso = new Date().toISOString();
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

    // 6. Send notification email via Resend if configured
    const resendApiKey = process.env.RESEND_API_KEY;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const guestLink = `${appUrl}/guest?token=${newGuest.guest_token}`;

    if (resendApiKey) {
      try {
        const emailFrom = process.env.EMAIL_FROM || "Snap & Snack <onboarding@resend.dev>";
        const emailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: emailFrom,
            to: normalizedEmail,
            subject: `You're in line for ${event.name}! (#${createdEntry.queue_number})`,
            html: `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; color: #161513; background-color: #f6f4f1;">
                <h1 style="text-transform: uppercase; font-size: 22px; letter-spacing: 2px; margin-bottom: 8px;">Snap &amp; Snack</h1>
                <p style="font-size: 14px; color: #73706b; margin-top: 0;">You have joined the photo booth queue for <strong>${event.name}</strong>.</p>
                <div style="background: #ffffff; border-radius: 16px; padding: 24px; text-align: center; margin: 24px 0; border: 1px solid rgba(22,21,19,0.1);">
                  <span style="font-size: 11px; text-transform: uppercase; color: #73706b; font-weight: 700; letter-spacing: 1.5px;">Queue Spot</span>
                  <div style="font-size: 54px; font-weight: 900; color: #161513; margin: 8px 0; font-family: monospace;">#${String(createdEntry.queue_number).padStart(2, "0")}</div>
                  <p style="font-size: 13px; color: #73706b; margin: 0;">Status: <strong>WAITING</strong></p>
                </div>
                <p style="font-size: 14px; margin-bottom: 24px; line-height: 1.5;">Track your spot in line and view your photo session status using your personal link:</p>
                <a href="${guestLink}" style="display: block; background: #161513; color: #f6f4f1; text-align: center; padding: 14px 24px; border-radius: 9999px; text-decoration: none; font-weight: 700; font-size: 13px; text-transform: uppercase; letter-spacing: 1.5px;">
                  View Live Status
                </a>
                <p style="font-size: 11px; color: #73706b; margin-top: 28px; word-break: break-all;">
                  Personal link: <a href="${guestLink}" style="color: #e8541e;">${guestLink}</a>
                </p>
              </div>
            `,
          }),
        });

        if (!emailRes.ok) {
          const errText = await emailRes.text();
          console.error("Resend delivery failed with status:", emailRes.status, errText);
        } else {
          console.log(`Confirmation email sent via Resend to ${normalizedEmail}`);
        }
      } catch (emailErr) {
        // Email failing must NOT fail the registration: return 200 anyway
        console.error("Resend email dispatch error:", emailErr);
      }
    } else {
      console.log("email skipped (no RESEND_API_KEY)");
    }

    // 7. Response
    return NextResponse.json(
      {
        queue_number: createdEntry.queue_number,
        guest_token: newGuest.guest_token,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Intake route error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

