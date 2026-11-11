import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const env = fs.readFileSync(".env.local", "utf8");
for (const line of env.split("\n")) {
  const [k, ...v] = line.trim().split("=");
  if (k && v.length) {
    process.env[k.trim()] = v.join("=").trim().replace(/^['"](.*)['"]$/, "$1");
  }
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  const { data: printJoin, error: pErr } = await supabase
    .from("print_jobs")
    .select(`
      id,
      status,
      printed_at,
      media:media_assets (
        id,
        session:shoot_sessions (
          id,
          queue:queue_entries (
            guest_id,
            event_id
          )
        )
      )
    `)
    .limit(1);

  console.log("print_jobs join test:", printJoin, pErr);
}

run();
