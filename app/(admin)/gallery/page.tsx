import React from "react";
import { Image as ImageIcon } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tile } from "@/components/ui/Tile";

export default function GalleryPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        label="Public Gallery"
        title="Event"
        accent="Gallery"
        description="Live stream of guest photos, GIF downloads, and social sharing links."
      />

      <Tile tone="surface" className="p-10 text-center max-w-lg mx-auto my-12">
        <div className="w-16 h-16 mx-auto mb-4 bg-paper rounded-full flex items-center justify-center text-accent">
          <ImageIcon className="w-8 h-8" />
        </div>
        <h2 className="font-display text-2xl uppercase tracking-tight mb-2 text-ink">
          Event Gallery Module
        </h2>
        <p className="text-sm text-muted">
          Supabase Storage live photo wall and guest download portals will be connected in Phase 3.
        </p>
      </Tile>
    </div>
  );
}
