import { supabaseServer } from "../lib/supabase-server";

async function main() {
  console.log("=== 1. ACTIVE EVENT ===");
  const { data: events } = await supabaseServer
    .from("events")
    .select("id, name, status")
    .eq("status", "ACTIVE");
  console.log("Active events:", events);

  console.log("\n=== 2. RECENT QUEUE ENTRIES ===");
  const { data: queue } = await supabaseServer
    .from("queue_entries")
    .select("id, guest_id, event_id, queue_number, status, created_at")
    .order("created_at", { ascending: false })
    .limit(5);
  console.log(queue);

  console.log("\n=== 3. RECENT SHOOT SESSIONS ===");
  const { data: sessions } = await supabaseServer
    .from("shoot_sessions")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(5);
  console.log(sessions);

  console.log("\n=== 4. RECENT MEDIA ASSETS ===");
  const { data: media } = await supabaseServer
    .from("media_assets")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(10);
  console.log(media);

  console.log("\n=== 5. STORAGE BUCKET 'photos' ===");
  const { data: buckets } = await supabaseServer.storage.listBuckets();
  console.log("Buckets:", buckets?.map((b) => ({ name: b.name, public: b.public })));

  if (events && events[0]) {
    const { data: files, error: fErr } = await supabaseServer.storage
      .from("photos")
      .list(events[0].id);
    console.log(`Files under ${events[0].id}:`, files, fErr);

    const guestId = '100ee55c-5678-4c9b-b65c-6271620d08ac';
    const { data: guestFiles, error: gErr } = await supabaseServer.storage
      .from("photos")
      .list(`${events[0].id}/${guestId}`);
    console.log(`Files under ${events[0].id}/${guestId}:`, guestFiles, gErr);
  }
}

main().then(() => process.exit(0)).catch((e) => {
  console.error("Error in debug:", e);
  process.exit(1);
});
