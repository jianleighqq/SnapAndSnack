import { supabaseServer } from "../lib/supabase-server";
import { detectTransparentWindows, generateDefaultSlots } from "../lib/template-detector";

async function run() {
  console.log("=== 1. FETCH ACTIVE EVENT ===");
  const { data: event } = await supabaseServer
    .from("events")
    .select("*")
    .eq("status", "ACTIVE")
    .maybeSingle();

  if (!event) throw new Error("No active event found");
  console.log("Active event:", event.id, event.name);

  console.log("\n=== 2. TEST TRANSPARENT WINDOW SCAN ALGORITHM ===");
  const width = 600;
  const height = 1800;
  const buffer = new Uint8Array(width * height * 4);
  buffer.fill(255); // Opaque base

  // Carve 3 transparent windows:
  // slot 1: y 60..500
  for (let y = 60; y <= 500; y++) {
    for (let x = 50; x <= 550; x++) {
      buffer[(y * width + x) * 4 + 3] = 0;
    }
  }
  // slot 2: y 560..1000
  for (let y = 560; y <= 1000; y++) {
    for (let x = 50; x <= 550; x++) {
      buffer[(y * width + x) * 4 + 3] = 0;
    }
  }
  // slot 3: y 1060..1500
  for (let y = 1060; y <= 1500; y++) {
    for (let x = 50; x <= 550; x++) {
      buffer[(y * width + x) * 4 + 3] = 0;
    }
  }

  const detected = detectTransparentWindows({ width, height, data: buffer });
  console.log("Detected slots:", detected);
  if (detected.length !== 3) {
    throw new Error(`Expected 3 detected slots, got ${detected.length}`);
  }

  console.log("\n=== 3. CREATE & UPLOAD TEMPLATE TO STORAGE ===");
  const templateId = "test-tpl-" + Date.now();
  const framePath = `${event.id}/${templateId}/frame.png`;
  const bgPath = `${event.id}/${templateId}/background.jpg`;

  const { error: fErr } = await supabaseServer.storage
    .from("templates")
    .upload(framePath, Buffer.from("dummy-frame-bytes"), {
      contentType: "image/png",
      upsert: true,
    });
  if (fErr) throw new Error("Frame upload failed: " + fErr.message);

  const { error: bErr } = await supabaseServer.storage
    .from("templates")
    .upload(bgPath, Buffer.from("dummy-bg-bytes"), {
      contentType: "image/jpeg",
      upsert: true,
    });
  if (bErr) throw new Error("Background upload failed: " + bErr.message);
  console.log("Uploaded frame & background to bucket 'templates'");

  // Deactivate prior templates
  await supabaseServer
    .from("templates")
    .update({ is_active: false })
    .eq("event_id", event.id);

  // Insert template row
  const { data: newTpl, error: insErr } = await supabaseServer
    .from("templates")
    .insert({
      id: crypto.randomUUID(),
      event_id: event.id,
      name: "Automated Test Template",
      layout: "STRIP",
      shots_count: 3,
      canvas_width: width,
      canvas_height: height,
      slots: detected,
      frame_path: framePath,
      background_path: bgPath,
      is_active: true,
    })
    .select()
    .single();

  if (insErr || !newTpl) throw new Error("Template insert failed: " + insErr?.message);
  console.log("Created template row:", newTpl.id, newTpl.name, "Active:", newTpl.is_active);

  console.log("\n=== 4. VERIFY SIGNED URLS GENERATION ===");
  const { data: signedFrame } = await supabaseServer.storage
    .from("templates")
    .createSignedUrl(newTpl.frame_path!, 3600);
  const { data: signedBg } = await supabaseServer.storage
    .from("templates")
    .createSignedUrl(newTpl.background_path!, 3600);

  console.log("Signed Frame URL:", signedFrame?.signedUrl?.substring(0, 60) + "...");
  console.log("Signed BG URL:", signedBg?.signedUrl?.substring(0, 60) + "...");
  if (!signedFrame?.signedUrl || !signedBg?.signedUrl) {
    throw new Error("Failed to generate signed URLs for template");
  }

  console.log("\n=== 5. VERIFY SINGLE ACTIVE EXCLUSIVITY ===");
  // Create another inactive template
  const { data: secondTpl } = await supabaseServer
    .from("templates")
    .insert({
      id: crypto.randomUUID(),
      event_id: event.id,
      name: "Second Inactive Template",
      layout: "STRIP",
      shots_count: 3,
      canvas_width: width,
      canvas_height: height,
      slots: generateDefaultSlots(width, height, 3),
      frame_path: null,
      background_path: null,
      is_active: false,
    })
    .select()
    .single();

  // Activate second template
  await supabaseServer.from("templates").update({ is_active: false }).eq("event_id", event.id);
  await supabaseServer.from("templates").update({ is_active: true }).eq("id", secondTpl!.id);

  const { data: activeList } = await supabaseServer
    .from("templates")
    .select("id, name, is_active")
    .eq("event_id", event.id)
    .eq("is_active", true);

  console.log("Active templates count:", activeList?.length);
  if (activeList?.length !== 1 || activeList[0].id !== secondTpl!.id) {
    throw new Error("Active template exclusivity check failed");
  }

  console.log("\n=== 6. CLEAN UP TEST TEMPLATES & FILES ===");
  await supabaseServer.storage.from("templates").remove([framePath, bgPath]);
  await supabaseServer.from("templates").delete().in("id", [newTpl.id, secondTpl!.id]);
  console.log("Cleaned up test templates");

  console.log("\nALL TEMPLATE CHECKS PASSED SUCCESSFULLY!");
}

run().then(() => process.exit(0)).catch((e) => {
  console.error("Verification failed:", e);
  process.exit(1);
});

