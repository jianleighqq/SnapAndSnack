import React, { Suspense } from "react";
import GuestStatusView from "@/components/guest/GuestStatusView";
import { RefreshCw } from "lucide-react";

export const dynamic = "force-dynamic";

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
