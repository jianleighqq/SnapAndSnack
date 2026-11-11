import React, { Suspense } from "react";
import GuestGalleryView from "@/components/guest/GuestGalleryView";
import { RefreshCw } from "lucide-react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function GalleryPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen flex-col items-center justify-center p-6 font-mono text-sm">
          <RefreshCw className="h-6 w-6 text-accent animate-spin mb-4" />
          <p className="text-ink font-medium">Loading your gallery...</p>
        </div>
      }
    >
      <GuestGalleryView />
    </Suspense>
  );
}
