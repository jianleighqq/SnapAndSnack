/**
 * Optional Development Database Seed Script
 *
 * Populates a fresh Supabase database with sample events, guests, and queue entries.
 * Run via:
 *   npx tsx scripts/seed.ts
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";

// Load environment from .env.local or .env
function loadEnv() {
  const envFile = fs.existsSync(".env.local") ? ".env.local" : fs.existsSync(".env") ? ".env" : null;
  if (!envFile) return;

  const content = fs.readFileSync(envFile, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [key, ...rest] = trimmed.split("=");
    if (key && rest.length > 0) {
      const val = rest.join("=").trim().replace(/^["'](.*)["']$/, "$1");
      if (!process.env[key.trim()]) {
        process.env[key.trim()] = val;
      }
    }
  }
}

loadEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function seed() {
  console.log("Seeding Supabase database...");

  // Insert event without manual string IDs
  const { data: event, error: evErr } = await supabase
    .from("events")
    .insert({
      name: "Summer Food & Photo Bash 2026",
      event_type: "Corporate",
      event_code: "SNAP26",
      start_time: "2026-10-28T18:00:00Z",
      end_time: "2026-10-28T23:00:00Z",
      avg_shoot_minutes: 5,
      shots_per_guest: 3,
      max_retakes: 2,
      print_layout: "STRIP",
      max_prints_per_guest: 1,
      status: "ACTIVE",
    })
    .select()
    .single();

  if (evErr || !event) {
    console.error("Events seed failed:", evErr?.message);
    process.exit(1);
  }
  console.log("✓ Seeded active event:", event.id);

  // Insert guests
  const { data: guests, error: gstErr } = await supabase
    .from("guests")
    .insert([
      { event_id: event.id, full_name: "Maya Lin", email: "maya.lin@example.com" },
      { event_id: event.id, full_name: "Liam Chen", email: "liam.chen@example.com" },
      { event_id: event.id, full_name: "Sophia Rodriguez", email: "sophia.r@example.com" },
    ])
    .select();

  if (gstErr || !guests) {
    console.error("Guests seed failed:", gstErr?.message);
    process.exit(1);
  }
  console.log(`✓ Seeded ${guests.length} guests`);

  // Insert queue entries
  const { data: queue, error: qErr } = await supabase
    .from("queue_entries")
    .insert([
      {
        event_id: event.id,
        guest_id: guests[0].id,
        queue_number: 1,
        status: "IN_PROGRESS",
      },
      {
        event_id: event.id,
        guest_id: guests[1].id,
        queue_number: 2,
        status: "REMINDED",
      },
      {
        event_id: event.id,
        guest_id: guests[2].id,
        queue_number: 3,
        status: "WAITING",
      },
    ])
    .select();

  if (qErr) {
    console.error("Queue seed failed:", qErr.message);
    process.exit(1);
  }
  console.log(`✓ Seeded ${queue?.length || 0} queue entries`);
  console.log("Database seeding completed successfully!");
}

seed().catch((err) => {
  console.error("Seeding error:", err);
  process.exit(1);
});
