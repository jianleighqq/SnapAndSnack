import { supabaseServer } from "../lib/supabase-server";

async function main() {
  const { data: session } = await supabaseServer
    .from("shoot_sessions")
    .select("id")
    .limit(1)
    .single();

  console.log("Using session:", session);

  const { data, error } = await supabaseServer
    .from("media_assets")
    .insert({
      session_id: session?.id,
      media_type: "PHOTO",
      shot_number: 1,
      retake_count: 0,
      pose_id: null,
      storage_path: "test/test.jpg",
      in_gallery: false,
    })
    .select();

  console.log("Insert result with null pose_id:", data, error);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error("Catch error:", e);
  process.exit(1);
});
