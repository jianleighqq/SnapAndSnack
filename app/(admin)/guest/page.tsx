import React, { Suspense } from "react";
import type { Metadata } from "next";
import GuestStatusView from "@/components/guest/GuestStatusView";
import { RefreshCw } from "lucide-react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "My Queue Ticket",
  robots: { index: false, follow: false },
};

export default function GuestDisplayPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center justify-center py-20 font-mono text-sm">
          <RefreshCw className="h-6 w-6 text-accent animate-spin mb-4" />
          <p className="text-ink font-medium">Loading guest portal...</p>
        </div>
      }
    >
      <GuestStatusView />
    </Suspense>
  );
}
