"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Image as ImageIcon,
  ExternalLink,
  RefreshCw,
  Users,
  Camera,
  Calendar,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tile } from "@/components/ui/Tile";
import { Pill, PillLink } from "@/components/ui/Pill";
import { Label } from "@/components/ui/Label";
import { Hairline } from "@/components/ui/Hairline";

interface OperatorGuestGallery {
  guest_id: string;
  full_name: string;
  queue_number: number;
  guest_token: string;
  strip: {
    id: string;
    signed_url: string | null;
    created_at: string;
  } | null;
  photos: {
    id: string;
    shot_number: number;
    signed_url: string | null;
    created_at: string;
  }[];
}

export default function OperatorGalleryPage() {
  const [event, setEvent] = useState<any>(null);
  const [guests, setGuests] = useState<OperatorGuestGallery[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadOperatorGallery = async () => {
    try {
      setIsRefreshing(true);
      const res = await fetch("/api/gallery?operator=true", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setEvent(data.event);
        setGuests(data.guests || []);
      }
    } catch (err) {
      console.error("Failed to load operator gallery:", err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadOperatorGallery();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 font-mono text-sm">
        <RefreshCw className="h-6 w-6 text-accent animate-spin mb-4" />
        <p className="text-ink font-medium">Loading event gallery...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Page Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          label="Operator View"
          title="Event"
          accent="Gallery"
          description={
            event
              ? `Published photo strips and captures for active event: ${event.name}`
              : "Published photo strips and captures for the active event."
          }
        />

        <div className="flex items-center gap-3">
          <Pill
            variant="secondary"
            size="md"
            disabled={isRefreshing}
            onClick={loadOperatorGallery}
            className="gap-1.5 text-xs font-mono uppercase tracking-wider min-h-[40px]"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            <span>{isRefreshing ? "Refreshing..." : "Refresh"}</span>
          </Pill>
        </div>
      </div>

      {/* No Active Event */}
      {!event && (
        <Tile tone="surface" className="p-8 text-center max-w-md mx-auto my-12 rounded-tile border border-ink/5">
          <div className="w-12 h-12 mx-auto mb-3 bg-paper rounded-full flex items-center justify-center text-accent">
            <Calendar className="w-6 h-6" />
          </div>
          <h2 className="font-display text-xl uppercase tracking-tight mb-2 text-ink">
            No Active Event
          </h2>
          <p className="text-xs text-muted mb-6 font-sans">
            Please activate an event in Event Setup before viewing published galleries.
          </p>
          <PillLink
            href="/admin/setup"
            variant="primary"
            className="text-xs font-mono uppercase tracking-wider"
          >
            Go to Event Setup
          </PillLink>
        </Tile>
      )}

      {/* Active Event with Empty Gallery */}
      {event && guests.length === 0 && (
        <Tile tone="surface" className="p-10 text-center max-w-lg mx-auto my-12 rounded-tile border border-ink/5">
          <div className="w-14 h-14 mx-auto mb-4 bg-paper rounded-full flex items-center justify-center text-accent">
            <ImageIcon className="w-7 h-7" />
          </div>
          <Label tone="accent" className="font-mono text-xs">{event.name}</Label>
          <h2 className="font-display text-2xl uppercase tracking-tight mb-2 text-ink mt-1">
            No Published Photos Yet
          </h2>
          <p className="text-xs text-muted max-w-sm mx-auto font-sans leading-relaxed">
            Guests who complete their photo shoot and save their memories will show up here automatically.
          </p>
        </Tile>
      )}

      {/* Grid of Guests with Gallery Photos */}
      {event && guests.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <Label tone="ink">
              {guests.length} {guests.length === 1 ? "Guest Gallery" : "Guest Galleries"} Published
            </Label>
            <span className="font-mono text-xs text-muted uppercase">
              Event: {event.event_code}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {guests.map((g) => {
              const queueStr = `#${String(g.queue_number).padStart(2, "0")}`;

              return (
                <Tile
                  key={g.guest_id}
                  tone="paper"
                  className="p-5 rounded-tile border border-ink/10 shadow-xs flex flex-col justify-between space-y-4 hover:border-ink/20 transition-colors"
                >
                  {/* Guest Top Header */}
                  <div>
                    <div className="flex items-center justify-between pb-2 border-b border-ink/10">
                      <div className="flex items-center gap-2">
                        <span className="font-display text-lg text-ink font-bold">
                          {queueStr}
                        </span>
                        <span className="text-xs text-ink uppercase font-semibold">
                          {g.full_name}
                        </span>
                      </div>
                      <span className="font-mono text-[10px] bg-ink/5 px-2 py-0.5 rounded-full text-muted uppercase font-bold">
                        {g.photos.length} {g.photos.length === 1 ? "Shot" : "Shots"}
                      </span>
                    </div>

                    {/* Image Previews */}
                    <div className="grid grid-cols-[1fr_2fr] gap-3 pt-3">
                      {/* Strip Preview */}
                      <div className="flex flex-col items-center">
                        <Label className="text-[9px] mb-1 text-muted uppercase">Strip</Label>
                        <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg border border-ink/10 bg-white p-0.5 shadow-xs flex items-center justify-center">
                          {g.strip?.signed_url ? (
                            <img
                              src={g.strip.signed_url}
                              alt="Photostrip"
                              className="h-full w-full object-contain rounded"
                            />
                          ) : (
                            <span className="text-[10px] font-mono text-muted">No strip</span>
                          )}
                        </div>
                      </div>

                      {/* Individual Photos Thumbnails */}
                      <div className="flex flex-col">
                        <Label className="text-[9px] mb-1 text-muted uppercase">Originals</Label>
                        <div className="grid grid-cols-2 gap-1.5">
                          {g.photos.slice(0, 4).map((p) => (
                            <div
                              key={p.id}
                              className="relative aspect-[4/3] overflow-hidden rounded border border-ink/10 bg-ink/5"
                            >
                              {p.signed_url && (
                                <img
                                  src={p.signed_url}
                                  alt={`Shot ${p.shot_number}`}
                                  className="h-full w-full object-cover"
                                />
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Open Public Link Button */}
                  <div className="pt-2">
                    <a
                      href={`/gallery?token=${encodeURIComponent(g.guest_token)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="interactive-secondary w-full inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-full border border-ink/20 px-4 text-xs font-mono uppercase tracking-wider text-ink hover:bg-ink/5 transition-colors"
                    >
                      <span>Open Guest View</span>
                      <ExternalLink className="h-3.5 w-3.5 text-accent" />
                    </a>
                  </div>
                </Tile>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

