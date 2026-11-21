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

      if (action === "set_default") {
        if (!templateId || !eventId) {
          return NextResponse.json({ error: "templateId and eventId are required" }, { status: 400 });
        }

        // Unset is_default on all templates for this event
        const { error: resetErr } = await supabaseServer
          .from("templates")
          .update({ is_default: false })
          .eq("event_id", eventId);

        if (resetErr) {
          return NextResponse.json({ error: resetErr.message }, { status: 500 });
        }

        // Set target template as default and ensure it is available (is_active: true)
        const { data: updated, error: setErr } = await supabaseServer
          .from("templates")
          .update({ is_default: true, is_active: true })
          .eq("id", templateId)
          .select()
          .single();

        if (setErr) {
          return NextResponse.json({ error: setErr.message }, { status: 500 });
        }

        const withUrls = await attachSignedUrls(updated);
        return NextResponse.json({ success: true, template: withUrls });
      }

      if (action === "toggle_active") {
        const { isActive } = body;
        if (!templateId || typeof isActive !== "boolean") {
          return NextResponse.json({ error: "templateId and boolean isActive are required" }, { status: 400 });
        }

        // Check if template is currently default
        const { data: existing } = await supabaseServer
          .from("templates")
          .select("is_default")
          .eq("id", templateId)
          .maybeSingle();

        if (existing?.is_default && !isActive) {
          return NextResponse.json(
            { error: "Deactivating the default template is not allowed. Choose another default first." },
            { status: 400 }
          );
        }

        const { data: updated, error: tErr } = await supabaseServer
          .from("templates")
          .update({ is_active: isActive })
          .eq("id", templateId)
          .select()
          .single();

        if (tErr) {
          return NextResponse.json({ error: tErr.message }, { status: 500 });
        }

        const withUrls = await attachSignedUrls(updated);
        return NextResponse.json({ success: true, template: withUrls });
      }

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

        // Find template to get file paths and check if active
        const { data: existing } = await supabaseServer
          .from("templates")
          .select("frame_path, background_path, event_id, is_active")
          .eq("id", templateId)
          .maybeSingle();

        const wasActive = existing?.is_active === true;

        if (existing) {
          // Only remove storage files if no other template references them (e.g. duplicates/copies)
          const filesToRemove: string[] = [];
          if (existing.frame_path) {
            const { count } = await supabaseServer
              .from("templates")
              .select("id", { count: "exact", head: true })
              .eq("frame_path", existing.frame_path)
              .neq("id", templateId);
            if (!count || count === 0) filesToRemove.push(existing.frame_path);
          }
          if (existing.background_path) {
            const { count } = await supabaseServer
              .from("templates")
              .select("id", { count: "exact", head: true })
              .eq("background_path", existing.background_path)
              .neq("id", templateId);
            if (!count || count === 0) filesToRemove.push(existing.background_path);
          }
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

        return NextResponse.json({ success: true, wasActive });
      }

      if (action === "rename") {
        const { name } = body;
        if (!templateId || !name || typeof name !== "string" || !name.trim()) {
          return NextResponse.json(
            { error: "templateId and non-empty name are required" },
            { status: 400 }
          );
        }

        const { data: updated, error: rErr } = await supabaseServer
          .from("templates")
          .update({ name: name.trim() })
          .eq("id", templateId)
          .select()
          .single();

        if (rErr) {
          return NextResponse.json({ error: rErr.message }, { status: 500 });
        }

        const withUrls = await attachSignedUrls(updated);
        return NextResponse.json({ success: true, template: withUrls });
      }

      if (action === "duplicate") {
        if (!templateId) {
          return NextResponse.json({ error: "templateId is required" }, { status: 400 });
        }

        const { data: existing, error: getErr } = await supabaseServer
          .from("templates")
          .select("*")
          .eq("id", templateId)
          .single();

        if (getErr || !existing) {
          return NextResponse.json({ error: "Template not found" }, { status: 404 });
        }

        const newId = crypto.randomUUID();
        const { data: duplicated, error: dupErr } = await supabaseServer
          .from("templates")
          .insert({
            id: newId,
            event_id: existing.event_id,
            name: `${existing.name} (Copy)`,
            layout: existing.layout,
            shots_count: existing.shots_count,
            canvas_width: existing.canvas_width,
            canvas_height: existing.canvas_height,
            slots: existing.slots,
            frame_path: existing.frame_path,
            background_path: existing.background_path,
            is_active: false,
          })
          .select()
          .single();

        if (dupErr) {
          return NextResponse.json({ error: dupErr.message }, { status: 500 });
        }

        const withUrls = await attachSignedUrls(duplicated);
        return NextResponse.json({ success: true, template: withUrls });
      }

      if (action === "copy_to_event") {
        const { targetEventId } = body;
        if (!templateId || !targetEventId) {
          return NextResponse.json(
            { error: "templateId and targetEventId are required" },
            { status: 400 }
          );
        }

        const { data: existing, error: getErr } = await supabaseServer
          .from("templates")
          .select("*")
          .eq("id", templateId)
          .single();

        if (getErr || !existing) {
          return NextResponse.json({ error: "Template not found" }, { status: 404 });
        }

        const newId = crypto.randomUUID();
        const { data: copied, error: copyErr } = await supabaseServer
          .from("templates")
          .insert({
            id: newId,
            event_id: targetEventId,
            name: existing.name,
            layout: existing.layout,
            shots_count: existing.shots_count,
            canvas_width: existing.canvas_width,
            canvas_height: existing.canvas_height,
            slots: existing.slots,
            frame_path: existing.frame_path,
            background_path: existing.background_path,
            is_active: false,
          })
          .select()
          .single();

        if (copyErr) {
          return NextResponse.json({ error: copyErr.message }, { status: 500 });
        }

        const withUrls = await attachSignedUrls(copied);
        return NextResponse.json({ success: true, template: withUrls });
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

      const templateImage = (formData.get("file") || formData.get("templateImage")) as File | null;
      const mode = (formData.get("mode") as string) || "frame";

      let frameFile = formData.get("frame") as File | null;
      let backgroundFile = formData.get("background") as File | null;

      if (templateImage && templateImage.size > 0) {
        if (mode === "frame") {
          frameFile = templateImage;
        } else {
          backgroundFile = templateImage;
        }
      }

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
          { error: "A template image (PNG or JPG, max 5 MB) is required" },
          { status: 400 }
        );
      }

      // Validate file size and type
      const allowedTypes = ["image/png", "image/jpeg", "image/jpg"];

      if (frameFile && frameFile.size > 0) {
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

      if (backgroundFile && backgroundFile.size > 0) {
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
      if (frameFile && frameFile.size > 0) {
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
      if (backgroundFile && backgroundFile.size > 0) {
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

      // Check if this event already has a default template
      const { count: defaultCount } = await supabaseServer
        .from("templates")
        .select("id", { count: "exact", head: true })
        .eq("event_id", eventId)
        .eq("is_default", true);

      const isFirstDefault = !defaultCount || defaultCount === 0;
      const isDefault = isFirstDefault;

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
          is_active: isDefault ? true : shouldSetActive,
          is_default: isDefault,
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

