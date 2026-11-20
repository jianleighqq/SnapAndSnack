import React from "react";
import type { Metadata } from "next";
import BoothAttractScreen from "@/components/booth/BoothAttractScreen";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Photo Booth",
};

export default async function BoothPage() {
  const event = await db.getActiveEvent().catch(() => null);

  return <BoothAttractScreen event={event} />;
}
