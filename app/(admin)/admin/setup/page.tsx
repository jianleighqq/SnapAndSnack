import React from "react";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import EventSetupView from "@/components/admin/setup/EventSetupView";
import { PageHeader } from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Event Setup",
  robots: { index: false, follow: false },
};

export default async function EventSetupPage() {
  const [events, activeEvent] = await Promise.all([
    db.getEvents().catch(() => []),
    db.getActiveEvent().catch(() => null),
  ]);

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)]">
      {/* Operator Console Header */}
      <PageHeader
        label="Operator Console"
        title="Event"
        accent="Setup"
        description="Configure event timings, photo templates, Google Form webhooks, and printer preferences."
        className="mb-4 shrink-0"
      />

      {/* Main Two-Column View */}
      <div className="flex-1 min-h-0">
        <EventSetupView
          initialEvents={events}
          initialActiveEvent={activeEvent}
        />
      </div>
    </div>
  );
}
