import { supabaseServer } from "../lib/supabase-server";

async function main() {
  const { data: poses, error: pErr } = await supabaseServer.from("poses").select("*");
  console.log("poses table:", poses, pErr);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error("Catch error:", e);
  process.exit(1);
});

