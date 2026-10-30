import React from "react";
import { Camera } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tile } from "@/components/ui/Tile";
import { Label } from "@/components/ui/Label";

export default function OperatorShootPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        label="Operator Console"
        title="Shoot"
        accent="Console"
        description="Camera tethering status, live preview, manual shutter trigger, and printer controls."
      />

      <Tile tone="surface" className="p-10 text-center max-w-lg mx-auto my-12">
        <div className="w-16 h-16 mx-auto mb-4 bg-paper rounded-full flex items-center justify-center text-accent">
          <Camera className="w-8 h-8" />
        </div>
        <h2 className="font-display text-2xl uppercase tracking-tight mb-2 text-ink">
          Shoot Console Module
        </h2>
        <p className="text-sm text-muted">
          Hardware relay integration (Sony Camera Remote SDK &amp; Canon SELPHY print relay) will be connected in Phase 3.
        </p>
      </Tile>
    </div>
  );
}
