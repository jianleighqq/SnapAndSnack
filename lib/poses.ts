import { supabaseServer } from "@/lib/supabase-server";
import type { Pose } from "@/lib/types";
import crypto from "crypto";

export const SEEDED_DEFAULT_POSES = [
  { name: "Classic couple", description: "Close & timeless", sort_order: 1 },
  { name: "Group", description: "Squad shoulder-to-shoulder", sort_order: 2 },
  { name: "Peace sign", description: "Retro booth double V", sort_order: 3 },
  { name: "Funny face", description: "Wild expressions, zero filter", sort_order: 4 },
];

/**
 * Attaches short-lived signed URLs (1 hour) for poses with stored guide pictures.
 */
export async function attachSignedPoseUrl(pose: any): Promise<Pose> {
  let image_url: string | null = null;
  if (pose.image_path) {
    try {
      const { data: signed } = await supabaseServer.storage
        .from("poses")
        .createSignedUrl(pose.image_path, 3600);
      image_url = signed?.signedUrl || null;
    } catch (err) {
      console.warn(`[Poses] Could not sign image for pose ${pose.id}:`, err);
    }
  }

  return {
    id: pose.id,
    name: pose.name,
    description: pose.description || null,
    is_active: Boolean(pose.is_active),
    sort_order: pose.sort_order ?? 0,
    image_path: pose.image_path || null,
    image_url,
    created_at: pose.created_at,
  };
}

/**
 * Auto-seeds default poses if the table is currently empty.
 */
export async function seedPosesIfEmpty(): Promise<void> {
  const { count, error } = await supabaseServer
    .from("poses")
    .select("id", { count: "exact", head: true });

  if (error) {
    console.warn("[Poses] Failed to check pose count for seeding:", error.message);
    return;
  }

  if (count === 0) {
    const rows = SEEDED_DEFAULT_POSES.map((p) => ({
      id: crypto.randomUUID(),
      name: p.name,
      description: p.description,
      sort_order: p.sort_order,
      is_active: true,
      image_path: null,
    }));

    const { error: seedErr } = await supabaseServer.from("poses").insert(rows);
    if (seedErr) {
      console.error("[Poses] Failed to seed default poses:", seedErr.message);
    } else {
      console.log("[Poses] Successfully seeded 4 default poses.");
    }
  }
}
