import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import type { Pose } from "@/lib/types";
import { SEEDED_DEFAULT_POSES, seedPosesIfEmpty, attachSignedPoseUrl } from "@/lib/poses";
import { requireOperatorSession } from "@/lib/auth-server";
import { validateUploadMagicBytes } from "@/lib/image-convert";
import crypto from "crypto";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB limit

/**
 * GET /api/poses
 * Returns all poses (both active and inactive) ordered by sort_order ascending.
 */
export async function GET() {
  try {
    await seedPosesIfEmpty();

    const { data: poses, error } = await supabaseServer
      .from("poses")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[Poses API] Error fetching poses:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const posesWithUrls = await Promise.all((poses || []).map(attachSignedPoseUrl));
    return NextResponse.json(
      { poses: posesWithUrls },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err: any) {
    console.error("[Poses API] GET exception:", err);
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/poses
 * Handles creation, edits, reordering, active toggle, and deletion of poses.
 */
export async function POST(request: Request) {
  const isAuthorized = await requireOperatorSession(request);
  if (!isAuthorized) {
    return NextResponse.json(
      { error: "Unauthorized. Operator session required." },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const contentType = request.headers.get("content-type") || "";

    // 1. JSON Actions (reorder, toggle_active, delete, edit text)
    if (contentType.includes("application/json")) {
      const body = await request.json();
      const { action, poseId, isActive, orderedIds, name, description } = body;

      if (action === "toggle_active") {
        if (!poseId || typeof isActive !== "boolean") {
          return NextResponse.json(
            { error: "poseId and boolean isActive are required" },
            { status: 400 }
          );
        }

        const { data: updated, error } = await supabaseServer
          .from("poses")
          .update({ is_active: isActive })
          .eq("id", poseId)
          .select()
          .single();

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const withUrl = await attachSignedPoseUrl(updated);
        return NextResponse.json({ success: true, pose: withUrl });
      }

      if (action === "reorder") {
        if (!Array.isArray(orderedIds)) {
          return NextResponse.json({ error: "orderedIds array is required" }, { status: 400 });
        }

        // Update each pose's sort_order sequentially
        for (let i = 0; i < orderedIds.length; i++) {
          await supabaseServer
            .from("poses")
            .update({ sort_order: i + 1 })
            .eq("id", orderedIds[i]);
        }

        return NextResponse.json({ success: true });
      }

      if (action === "delete") {
        if (!poseId) {
          return NextResponse.json({ error: "poseId is required" }, { status: 400 });
        }

        // 1. Fetch existing pose to check if storage image needs removal
        const { data: existing } = await supabaseServer
          .from("poses")
          .select("*")
          .eq("id", poseId)
          .maybeSingle();

        // 2. Clear foreign key references in media_assets so past photos keep their media safely
        const { error: mediaErr } = await supabaseServer
          .from("media_assets")
          .update({ pose_id: null })
          .eq("pose_id", poseId);

        if (mediaErr) {
          console.warn("[Poses API] Could not nullify media_assets pose_id:", mediaErr.message);
        }

        // 3. Remove file from storage bucket if present
        if (existing?.image_path) {
          try {
            await supabaseServer.storage.from("poses").remove([existing.image_path]);
          } catch (stErr) {
            console.warn("[Poses API] Could not delete image from storage:", stErr);
          }
        }

        // 4. Delete row from poses table
        const { error: delErr } = await supabaseServer
          .from("poses")
          .delete()
          .eq("id", poseId);

        if (delErr) {
          return NextResponse.json({ error: delErr.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
      }

      if (action === "edit") {
        if (!poseId || !name || typeof name !== "string" || !name.trim()) {
          return NextResponse.json(
            { error: "poseId and non-empty name are required" },
            { status: 400 }
          );
        }

        const trimmedName = name.trim().slice(0, 40);
        const trimmedDesc = description ? String(description).trim().slice(0, 80) : null;

        const { data: updated, error } = await supabaseServer
          .from("poses")
          .update({
            name: trimmedName,
            description: trimmedDesc,
          })
          .eq("id", poseId)
          .select()
          .single();

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const withUrl = await attachSignedPoseUrl(updated);
        return NextResponse.json({ success: true, pose: withUrl });
      }

      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    // 2. Multipart Form Data (Create Pose or Edit with Image Upload)
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const action = (formData.get("action") as string) || "create";
      const name = ((formData.get("name") as string) || "").trim().slice(0, 40);
      const description = ((formData.get("description") as string) || "").trim().slice(0, 80) || null;
      const poseIdParam = formData.get("poseId") as string | null;
      const guideFile = formData.get("guideImage") as File | null;

      if (!name) {
        return NextResponse.json({ error: "Pose name is required (max 40 chars)" }, { status: 400 });
      }

      if (guideFile && guideFile.size > MAX_IMAGE_BYTES) {
        return NextResponse.json(
          { error: "Guide image exceeds 5 MB limit" },
          { status: 400 }
        );
      }

      if (action === "edit" && poseIdParam) {
        // Updating existing pose
        let newImagePath: string | undefined = undefined;

        if (guideFile && guideFile.size > 0) {
          const fileBuffer = Buffer.from(await guideFile.arrayBuffer());
          if (!validateUploadMagicBytes(fileBuffer, ["jpeg", "png", "webp"])) {
            return NextResponse.json(
              { error: "Invalid image format. Only JPEG, PNG, or WEBP are permitted." },
              { status: 400 }
            );
          }
          const storagePath = `poses/${poseIdParam}.jpg`;

          const { error: uploadErr } = await supabaseServer.storage
            .from("poses")
            .upload(storagePath, fileBuffer, {
              contentType: guideFile.type || "image/jpeg",
              upsert: true,
            });

          if (uploadErr) {
            console.error("[Poses API] Image edit upload failed:", uploadErr);
            return NextResponse.json(
              { error: "Failed to upload image file." },
              { status: 500 }
            );
          }
          newImagePath = storagePath;
        }

        const updateData: any = {
          name,
          description,
        };
        if (newImagePath) {
          updateData.image_path = newImagePath;
        }

        const { data: updated, error: updateErr } = await supabaseServer
          .from("poses")
          .update(updateData)
          .eq("id", poseIdParam)
          .select()
          .single();

        if (updateErr) {
          return NextResponse.json({ error: updateErr.message }, { status: 500 });
        }

        const withUrl = await attachSignedPoseUrl(updated);
        return NextResponse.json({ success: true, pose: withUrl });
      }

      // Create new pose
      const newPoseId = crypto.randomUUID();
      let storagePath: string | null = null;

      // 1. Upload guide image if supplied
      if (guideFile && guideFile.size > 0) {
        const fileBuffer = Buffer.from(await guideFile.arrayBuffer());
        if (!validateUploadMagicBytes(fileBuffer, ["jpeg", "png", "webp"])) {
          return NextResponse.json(
            { error: "Invalid image format. Only authentic JPG, PNG, or WEBP are permitted." },
            { status: 400 }
          );
        }
        storagePath = `poses/${newPoseId}.jpg`;

        const { error: uploadErr } = await supabaseServer.storage
          .from("poses")
          .upload(storagePath, fileBuffer, {
            contentType: guideFile.type || "image/jpeg",
            upsert: true,
          });

        if (uploadErr) {
          console.error("[Poses API] Image upload failed:", uploadErr);
          return NextResponse.json(
            { error: "Failed to upload guide picture." },
            { status: 500 }
          );
        }
      }

      // 2. Resolve next sort_order
      const { data: maxRow } = await supabaseServer
        .from("poses")
        .select("sort_order")
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();

      const nextOrder = (maxRow?.sort_order ?? 0) + 1;

      // 3. Insert row into database
      const { data: inserted, error: insertErr } = await supabaseServer
        .from("poses")
        .insert({
          id: newPoseId,
          name,
          description,
          sort_order: nextOrder,
          is_active: true,
          image_path: storagePath,
        })
        .select()
        .single();

      // Rollback: if database insertion fails, delete uploaded file from storage
      if (insertErr) {
        console.error("[Poses API] Row insert failed, rolling back uploaded image:", insertErr);
        if (storagePath) {
          try {
            await supabaseServer.storage.from("poses").remove([storagePath]);
          } catch {}
        }
        return NextResponse.json({ error: insertErr.message }, { status: 500 });
      }

      const withUrl = await attachSignedPoseUrl(inserted);
      return NextResponse.json({ success: true, pose: withUrl });
    }

    return NextResponse.json({ error: "Unsupported Content-Type" }, { status: 400 });
  } catch (err: any) {
    console.error("[Poses API] POST exception:", err);
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}
