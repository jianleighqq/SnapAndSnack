import { supabaseServer } from "../lib/supabase-server";
import { db } from "../lib/db";

async function runVerification() {
  console.log("=== STEP 1: VERIFY ACTIVE EVENT & GUEST ===");
  const { data: event, error: eventErr } = await supabaseServer
    .from("events")
    .select("*")
    .eq("status", "ACTIVE")
    .maybeSingle();

  if (!event) {
    throw new Error("No active event found. Please ensure an active event exists.");
  }
  console.log("Active Event:", event.id, event.name);

  // Find or create a test guest in the active event
  const { data: queueEntry } = await supabaseServer
    .from("queue_entries")
    .select("*, guest:guests(*)")
    .eq("event_id", event.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!queueEntry || !queueEntry.guest) {
    throw new Error("No queue entry found for active event.");
  }

  const guest = queueEntry.guest;
  console.log("Guest:", guest.id, guest.full_name, "Token:", guest.guest_token);

  console.log("\n=== STEP 2: VERIFY / REUSE SHOOT SESSION ===");
  let sessionId: string;
  const { data: existingSession } = await supabaseServer
    .from("shoot_sessions")
    .select("id")
    .eq("queue_id", queueEntry.id)
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingSession) {
    sessionId = existingSession.id;
    console.log("Reusing existing session:", sessionId);
  } else {
    const { data: newSession, error: sErr } = await supabaseServer
      .from("shoot_sessions")
      .insert({ queue_id: queueEntry.id })
      .select("id")
      .single();
    if (sErr || !newSession) throw new Error("Could not create shoot session: " + sErr?.message);
    sessionId = newSession.id;
    console.log("Created new session:", sessionId);
  }

  console.log("\n=== STEP 3: UPLOAD SHOTS & STRIP (SIMULATE /api/media/upload) ===");
  // Create a minimal 1x1 valid transparent PNG data URL to test upload parsing
  const testPngBase64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
  const testSvgDataUrl = "data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3C%2Fsvg%3E";

  // Upload shot 1, 2, 3
  for (let shotNum = 1; shotNum <= 3; shotNum++) {
    const filePath = `${event.id}/${guest.id}/shot-${shotNum}.jpg`;
    const buffer = Buffer.from("test-shot-bytes-" + shotNum);

    const { error: uploadErr } = await supabaseServer.storage
      .from("photos")
      .upload(filePath, buffer, {
        contentType: "image/jpeg",
        upsert: true,
      });

    if (uploadErr) {
      throw new Error(`Failed to upload ${filePath}: ${uploadErr.message}`);
    }
    console.log(`Uploaded shot ${shotNum} to storage at ${filePath}`);

    // Insert or update media_assets
    const { data: existing } = await supabaseServer
      .from("media_assets")
      .select("id")
      .eq("session_id", sessionId)
      .eq("media_type", "PHOTO")
      .eq("shot_number", shotNum)
      .limit(1);

    if (existing && existing.length > 0) {
      const { error: assetErr } = await supabaseServer
        .from("media_assets")
        .update({
          retake_count: 0,
          pose_id: null,
          storage_path: filePath,
        })
        .eq("id", existing[0].id);
      if (assetErr) throw new Error(`Failed to update media_asset for shot ${shotNum}: ${assetErr.message}`);
    } else {
      const { error: assetErr } = await supabaseServer
        .from("media_assets")
        .insert({
          session_id: sessionId,
          media_type: "PHOTO",
          shot_number: shotNum,
          retake_count: 0,
          pose_id: null,
          storage_path: filePath,
          in_gallery: false,
        });
      if (assetErr) throw new Error(`Failed to insert media_asset for shot ${shotNum}: ${assetErr.message}`);
    }
    console.log(`media_assets row created for shot ${shotNum}`);
  }

  // Upload Strip
  const stripPath = `${event.id}/${guest.id}/strip.jpg`;
  const stripBuffer = Buffer.from("test-strip-bytes");
  const { error: stripUploadErr } = await supabaseServer.storage
    .from("photos")
    .upload(stripPath, stripBuffer, {
      contentType: "image/jpeg",
      upsert: true,
    });

  if (stripUploadErr) throw new Error("Strip upload failed: " + stripUploadErr.message);
  console.log(`Uploaded strip to storage at ${stripPath}`);

  const { data: existingStrip } = await supabaseServer
    .from("media_assets")
    .select("id")
    .eq("session_id", sessionId)
    .eq("media_type", "STRIP")
    .limit(1);

  if (existingStrip && existingStrip.length > 0) {
    const { error: stripAssetErr } = await supabaseServer
      .from("media_assets")
      .update({ storage_path: stripPath })
      .eq("id", existingStrip[0].id);
    if (stripAssetErr) throw new Error("Strip asset update failed: " + stripAssetErr.message);
  } else {
    const { error: stripAssetErr } = await supabaseServer
      .from("media_assets")
      .insert({
        session_id: sessionId,
        media_type: "STRIP",
        shot_number: null,
        retake_count: 0,
        pose_id: null,
        storage_path: stripPath,
        in_gallery: false,
      });
    if (stripAssetErr) throw new Error("Strip asset insert failed: " + stripAssetErr.message);
  }
  console.log("media_assets row created for STRIP");

  console.log("\n=== STEP 4: VERIFY SAVE TO GALLERY ===");
  const saveResult = await db.saveToGallery(sessionId, guest.id);
  console.log("saveToGallery result:", saveResult);
  if (!saveResult.success || saveResult.count === 0) {
    throw new Error("saveToGallery failed or updated 0 rows!");
  }

  // Check database rows
  const { data: updatedAssets } = await supabaseServer
    .from("media_assets")
    .select("id, media_type, shot_number, in_gallery")
    .eq("session_id", sessionId);

  console.log("Updated media assets in session:", updatedAssets);
  const allInGallery = updatedAssets?.every((a) => a.in_gallery === true);
  if (!allInGallery) {
    throw new Error("Not all media assets have in_gallery = true!");
  }
  console.log("All media assets have in_gallery = true: OK");

  console.log("\n=== STEP 5: VERIFY /api/gallery RESOLUTION & SIGNED URLS ===");
  // Step 5.1: token -> guest
  const { data: resolvedGuest } = await supabaseServer
    .from("guests")
    .select("id, full_name, event_id")
    .eq("guest_token", guest.guest_token)
    .single();

  if (!resolvedGuest) throw new Error("Could not resolve token to guest");

  // Step 5.2: guest -> queue entries -> sessions
  const { data: guestQueue } = await supabaseServer
    .from("queue_entries")
    .select("id")
    .eq("guest_id", resolvedGuest.id);
  const qIds = guestQueue?.map((q) => q.id) || [];

  const { data: guestSessions } = await supabaseServer
    .from("shoot_sessions")
    .select("id")
    .in("queue_id", qIds);
  const sIds = guestSessions?.map((s) => s.id) || [];

  // Step 5.3: media_assets in_gallery = true
  const { data: galleryAssets } = await supabaseServer
    .from("media_assets")
    .select("*")
    .in("session_id", sIds)
    .eq("in_gallery", true);

  console.log(`Found ${galleryAssets?.length} gallery assets for token ${guest.guest_token}`);
  if (!galleryAssets || galleryAssets.length === 0) {
    throw new Error("No gallery assets found for token!");
  }

  // Create signed URLs
  for (const asset of galleryAssets) {
    const { data: signed, error: signErr } = await supabaseServer.storage
      .from("photos")
      .createSignedUrl(asset.storage_path, 3600);
    if (signErr || !signed?.signedUrl) {
      throw new Error(`Failed to create signed URL for ${asset.storage_path}: ${signErr?.message}`);
    }
    console.log(`Signed URL generated for ${asset.media_type} (${asset.storage_path}) -> ${signed.signedUrl.substring(0, 60)}...`);
  }

  console.log("\n=== STEP 6: VERIFY ZERO-ROW FAILURE REPORTING ===");
  const emptyResult = await db.saveToGallery("00000000-0000-0000-0000-000000000000", "00000000-0000-0000-0000-000000000000");
  console.log("Empty save result (should be success: false, count: 0):", emptyResult);
  if (emptyResult.success !== false || emptyResult.count !== 0) {
    throw new Error("Expected failure for non-existent session/guest");
  }

  console.log("\nALL VERIFICATION CHECKS PASSED SUCCESSFULLY!");
}

runVerification()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Verification failed:", err);
    process.exit(1);
  });
