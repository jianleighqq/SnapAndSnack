import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import crypto from "crypto";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Creates short-lived signed URLs (1 hour) for private template storage paths.
 */
async function attachSignedUrls(template: any) {
  let frame_url: string | null = null;
  let background_url: string | null = null;

  if (template.frame_path) {
    const { data: signedFrame } = await supabaseServer.storage
      .from("templates")
      .createSignedUrl(template.frame_path, 3600);
    frame_url = signedFrame?.signedUrl || null;
  }

  if (template.background_path) {
    const { data: signedBg } = await supabaseServer.storage
      .from("templates")
      .createSignedUrl(template.background_path, 3600);
    background_url = signedBg?.signedUrl || null;
  }

  return {
    ...template,
    frame_url,
    background_url,
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get("eventId");
    const activeOnly = searchParams.get("active") === "true";

    if (!eventId) {
      return NextResponse.json(
        { error: "eventId query parameter is required" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    if (activeOnly) {
      const { data: template, error } = await supabaseServer
        .from("templates")
        .select("*")
        .eq("event_id", eventId)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error("[Templates API] Failed to fetch active template:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      if (!template) {
        return NextResponse.json({ template: null }, { headers: { "Cache-Control": "no-store" } });
      }

      const withUrls = await attachSignedUrls(template);
      return NextResponse.json(
        { template: withUrls },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    const { data: templates, error } = await supabaseServer
      .from("templates")
      .select("*")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[Templates API] Failed to list templates:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const withUrls = await Promise.all((templates || []).map(attachSignedUrls));
    return NextResponse.json(
      { templates: withUrls },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err: any) {
    console.error("[Templates API] GET exception:", err);
    return NextResponse.json(
      { error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") || "";

    // 1. JSON Actions (set_active, delete, update_slots)
    if (contentType.includes("application/json")) {
      const body = await request.json();
      const { action, templateId, eventId, slots } = body;

      if (action === "set_active") {
        if (!templateId || !eventId) {
          return NextResponse.json({ error: "templateId and eventId are required" }, { status: 400 });
        }

        // Deactivate all templates for this event first
        const { error: deactErr } = await supabaseServer
          .from("templates")
          .update({ is_active: false })
          .eq("event_id", eventId);

        if (deactErr) {
          return NextResponse.json({ error: deactErr.message }, { status: 500 });
        }

        // Activate the selected template
        const { data: updated, error: actErr } = await supabaseServer
          .from("templates")
          .update({ is_active: true })
          .eq("id", templateId)
          .select()
          .single();

        if (actErr) {
          return NextResponse.json({ error: actErr.message }, { status: 500 });
        }

        const withUrls = await attachSignedUrls(updated);
        return NextResponse.json({ success: true, template: withUrls });
      }

      if (action === "delete") {
        if (!templateId) {
          return NextResponse.json({ error: "templateId is required" }, { status: 400 });
        }

        // Find template to get file paths
        const { data: existing } = await supabaseServer
          .from("templates")
          .select("frame_path, background_path, event_id")
          .eq("id", templateId)
          .maybeSingle();

        if (existing) {
          const filesToRemove = [existing.frame_path, existing.background_path].filter(Boolean) as string[];
          if (filesToRemove.length > 0) {
            await supabaseServer.storage.from("templates").remove(filesToRemove);
          }
        }

        const { error: delErr } = await supabaseServer
          .from("templates")
          .delete()
          .eq("id", templateId);

        if (delErr) {
          return NextResponse.json({ error: delErr.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
      }

      if (action === "update_slots") {
        if (!templateId || !Array.isArray(slots)) {
          return NextResponse.json({ error: "templateId and slots array are required" }, { status: 400 });
        }

        const { data: updated, error: upErr } = await supabaseServer
          .from("templates")
          .update({ slots })
          .eq("id", templateId)
          .select()
          .single();

        if (upErr) {
          return NextResponse.json({ error: upErr.message }, { status: 500 });
        }

        const withUrls = await attachSignedUrls(updated);
        return NextResponse.json({ success: true, template: withUrls });
      }

      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    // 2. Multipart Form Data (Upload / Create Template)
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const eventId = formData.get("eventId") as string;
      const name = formData.get("name") as string;
      const shotsCountStr = formData.get("shotsCount") as string;
      const canvasWidthStr = formData.get("canvasWidth") as string;
      const canvasHeightStr = formData.get("canvasHeight") as string;
      const slotsJson = formData.get("slots") as string;
      const setActiveStr = formData.get("setActive") as string;

      const frameFile = formData.get("frame") as File | null;
      const backgroundFile = formData.get("background") as File | null;

      if (!eventId || !name) {
        return NextResponse.json(
          { error: "eventId and template name are required" },
          { status: 400 }
        );
      }

      const hasFrame = frameFile && frameFile.size > 0;
      const hasBackground = backgroundFile && backgroundFile.size > 0;

      if (!hasFrame && !hasBackground) {
        return NextResponse.json(
          { error: "At least one image (Frame overlay or Background) is required" },
          { status: 400 }
        );
      }

      // Validate file size and type
      const allowedTypes = ["image/png", "image/jpeg", "image/jpg"];

      if (hasFrame) {
        if (frameFile.size > MAX_BYTES) {
          return NextResponse.json(
            { error: `Frame image exceeds 5 MB limit (${(frameFile.size / 1024 / 1024).toFixed(1)} MB)` },
            { status: 400 }
          );
        }
        if (!allowedTypes.includes(frameFile.type)) {
          return NextResponse.json(
            { error: "Frame image must be a PNG or JPG file" },
            { status: 400 }
          );
        }
      }

      if (hasBackground) {
        if (backgroundFile.size > MAX_BYTES) {
          return NextResponse.json(
            { error: `Background image exceeds 5 MB limit (${(backgroundFile.size / 1024 / 1024).toFixed(1)} MB)` },
            { status: 400 }
          );
        }
        if (!allowedTypes.includes(backgroundFile.type)) {
          return NextResponse.json(
            { error: "Background image must be a PNG or JPG file" },
            { status: 400 }
          );
        }
      }

      const templateId = crypto.randomUUID();
      let framePath: string | null = null;
      let backgroundPath: string | null = null;

      // Upload Frame
      if (hasFrame) {
        const frameExt = frameFile.type === "image/png" ? "png" : "jpg";
        framePath = `${eventId}/${templateId}/frame.${frameExt}`;
        const frameBuffer = Buffer.from(await frameFile.arrayBuffer());

        const { error: fErr } = await supabaseServer.storage
          .from("templates")
          .upload(framePath, frameBuffer, {
            contentType: frameFile.type,
            upsert: true,
          });

        if (fErr) {
          console.error("[Templates API] Frame upload failed:", fErr);
          return NextResponse.json({ error: "Failed to upload frame: " + fErr.message }, { status: 500 });
        }
      }

      // Upload Background
      if (hasBackground) {
        const bgExt = backgroundFile.type === "image/png" ? "png" : "jpg";
        backgroundPath = `${eventId}/${templateId}/background.${bgExt}`;
        const bgBuffer = Buffer.from(await backgroundFile.arrayBuffer());

        const { error: bgErr } = await supabaseServer.storage
          .from("templates")
          .upload(backgroundPath, bgBuffer, {
            contentType: backgroundFile.type,
            upsert: true,
          });

        if (bgErr) {
          console.error("[Templates API] Background upload failed:", bgErr);
          return NextResponse.json({ error: "Failed to upload background: " + bgErr.message }, { status: 500 });
        }
      }

      const shotsCount = parseInt(shotsCountStr, 10) || 3;
      const canvasWidth = parseInt(canvasWidthStr, 10) || 600;
      const canvasHeight = parseInt(canvasHeightStr, 10) || 1800;
      let slots = [];
      try {
        if (slotsJson) slots = JSON.parse(slotsJson);
      } catch {
        slots = [];
      }

      const shouldSetActive = setActiveStr === "true";

      if (shouldSetActive) {
        await supabaseServer
          .from("templates")
          .update({ is_active: false })
          .eq("event_id", eventId);
      }

      const { data: newRow, error: insertErr } = await supabaseServer
        .from("templates")
        .insert({
          id: templateId,
          event_id: eventId,
          name: name.trim(),
          layout: "STRIP",
          shots_count: shotsCount,
          canvas_width: canvasWidth,
          canvas_height: canvasHeight,
          slots,
          frame_path: framePath,
          background_path: backgroundPath,
          is_active: shouldSetActive,
        })
        .select()
        .single();

      if (insertErr) {
        console.error("[Templates API] Insert template failed:", insertErr);
        return NextResponse.json({ error: insertErr.message }, { status: 500 });
      }

      const withUrls = await attachSignedUrls(newRow);
      return NextResponse.json({ success: true, template: withUrls });
    }

    return NextResponse.json({ error: "Unsupported Content-Type" }, { status: 400 });
  } catch (err: any) {
    console.error("[Templates API] POST exception:", err);
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}

