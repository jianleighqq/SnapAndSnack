import React from "react";
import { db } from "@/lib/db";
import QueueBoardView from "@/components/admin/QueueBoardView";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function QueueBoardPage() {
  const [event, queue] = await Promise.all([
    db.getActiveEvent().catch(() => null),
    db.getQueue().catch(() => []),
  ]);

  return <QueueBoardView initialEvent={event} initialQueue={queue} />;
}
