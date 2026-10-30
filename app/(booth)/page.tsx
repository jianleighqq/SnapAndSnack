import React from "react";
import BoothAttractScreen from "@/components/booth/BoothAttractScreen";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function BoothPage() {
  const event = await db.getCurrentEvent().catch(() => null);

  return <BoothAttractScreen event={event} />;
}
