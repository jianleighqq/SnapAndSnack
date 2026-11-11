"use client";

import React, { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Download,
  Image as ImageIcon,
  RefreshCw,
  XCircle,
  ArrowLeft,
  Sparkles,
  Check,
} from "lucide-react";
import { Tile } from "@/components/ui/Tile";
import { Pill, PillLink } from "@/components/ui/Pill";
import { Label } from "@/components/ui/Label";
import { Hairline } from "@/components/ui/Hairline";

interface GalleryPhoto {
  id: string;
  shot_number: number;
  signed_url: string | null;
  created_at: string;
}

interface GalleryStrip {
  id: string;
  signed_url: string | null;
  created_at: string;
}

interface GalleryData {
  event_name: string;
  first_name: string;
  queue_number: number | null;
  strip: GalleryStrip | null;
  photos: GalleryPhoto[];
}

export default function GuestGalleryView() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [data, setData] = useState<GalleryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadGallery() {
      if (!token.trim()) {
        setError("Gallery token is required");
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(`/api/gallery?token=${encodeURIComponent(token.trim())}`, {
          cache: "no-store",
        });

        if (res.status === 404) {
          if (isMounted) {
            setError("Gallery not found. Please check your link.");
            setLoading(false);
          }
          return;
        }

        if (!res.ok) {
          throw new Error("Failed to load gallery");
        }

        const json: GalleryData = await res.json();
        if (isMounted) {
          setData(json);
          setLoading(false);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err?.message || "Failed to load photos");
          setLoading(false);
        }
      }
    }

    loadGallery();

    return () => {
      isMounted = false;
    };
  }, [token]);

  // Robust blob-based file download
  const handleDownload = async (url: string, filename: string, id: string) => {
    try {
      setDownloadingId(id);
      const res = await fetch(url);
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (e) {
      // Fallback direct window open
      window.open(url, "_blank");
    } finally {
      setTimeout(() => setDownloadingId(null), 1000);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
        <RefreshCw className="h-8 w-8 text-accent animate-spin mb-3" />
        <Label tone="accent" className="font-mono text-xs">Snap &amp; Snack</Label>
        <h2 className="font-display text-2xl uppercase tracking-tight text-ink mt-1">
          Loading Your Gallery
        </h2>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center max-w-sm mx-auto">
        <Tile tone="surface" className="w-full p-8 text-center rounded-tile shadow-sm border border-ink/5">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-danger/10 text-danger">
            <XCircle className="h-7 w-7" />
          </div>
          <Label tone="muted" className="block mb-1">Guest Gallery</Label>
          <h2 className="font-display text-2xl uppercase tracking-tight text-ink mb-2">
            Gallery Not Found
          </h2>
          <p className="text-xs text-muted mb-6 leading-relaxed font-sans">
            {error || "We couldn’t find any gallery linked to this URL."}
          </p>
          <PillLink
            href={`/guest?token=${encodeURIComponent(token)}`}
            variant="secondary"
            className="w-full text-xs font-mono uppercase tracking-wider"
          >
            Check Queue Status
          </PillLink>
        </Tile>
      </div>
    );
  }

  const { event_name, first_name, queue_number, strip, photos } = data;
  const hasPhotos = (strip && strip.signed_url) || photos.length > 0;
  const queueLabel = queue_number ? `#${String(queue_number).padStart(2, "0")}` : "";

  return (
    <div className="min-h-screen max-w-md mx-auto flex flex-col justify-between p-4 sm:p-6 animate-fadeIn select-none">
      {/* Top Header */}
      <header className="pt-2 pb-4">
        <div className="flex items-center justify-between pb-3">
          <Link
            href={`/guest?token=${encodeURIComponent(token)}`}
            className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-muted hover:text-ink transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>My Ticket</span>
          </Link>
          <span className="font-mono text-[10px] bg-ink/5 px-2.5 py-0.5 rounded-full text-muted uppercase font-bold">
            {queueLabel}
          </span>
        </div>
        <Hairline />
        <div className="pt-3 text-center">
          <Label tone="accent" className="font-mono text-[11px]">
            {event_name}
          </Label>
          <h1 className="font-display text-3xl uppercase tracking-tight text-ink mt-0.5">
            {first_name}’s <span className="text-accent">Photos</span>
          </h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 py-4 space-y-6">
        {/* Empty State: No Photos Yet */}
        {!hasPhotos && (
          <Tile tone="surface" className="p-8 text-center rounded-tile border border-ink/5">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-paper text-accent">
              <ImageIcon className="h-7 w-7" />
            </div>
            <h2 className="font-display text-2xl uppercase tracking-tight text-ink mb-2">
              No Photos Yet
            </h2>
            <p className="text-xs text-muted mb-6 leading-relaxed font-sans">
              Your photo strip and individual shots will appear right here as soon as you complete your booth session and save them to the gallery.
            </p>
            <PillLink
              href={`/guest?token=${encodeURIComponent(token)}`}
              variant="primary"
              className="w-full text-xs font-mono uppercase tracking-wider"
            >
              Back to Queue Status
            </PillLink>
          </Tile>
        )}

        {/* Section 1: 4x6 Photostrip (Large) */}
        {strip && strip.signed_url && (
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <Label tone="accent">Official Photostrip</Label>
              <span className="font-mono text-[10px] text-muted uppercase">4×6 Postcard</span>
            </div>

            <Tile tone="surface" className="p-3 rounded-tile shadow-sm border border-ink/10 flex flex-col items-center">
              <div className="relative aspect-[2/3] w-full max-w-[280px] overflow-hidden rounded-xl border border-ink/10 bg-white p-1.5 shadow-md">
                <img
                  src={strip.signed_url}
                  alt="Official Photostrip"
                  className="h-full w-full object-contain rounded-lg"
                />
              </div>

              <div className="w-full pt-4">
                <Pill
                  variant="primary"
                  size="md"
                  disabled={downloadingId === strip.id}
                  onClick={() =>
                    handleDownload(
                      strip.signed_url!,
                      `snap-and-snack-${queue_number || "guest"}-strip.jpg`,
                      strip.id
                    )
                  }
                  className="w-full min-h-[46px] uppercase font-mono text-xs tracking-wider gap-2"
                >
                  {downloadingId === strip.id ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>Downloading...</span>
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4" />
                      <span>Download Full Strip</span>
                    </>
                  )}
                </Pill>
              </div>
            </Tile>
          </div>
        )}

        {/* Section 2: Individual Shots */}
        {photos.length > 0 && (
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between px-1">
              <Label tone="ink">Individual Shots ({photos.length})</Label>
              <span className="font-mono text-[10px] text-muted uppercase">Originals</span>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {photos.map((photo) => {
                if (!photo.signed_url) return null;
                const isDownloading = downloadingId === photo.id;
                const filename = `snap-and-snack-${queue_number || "guest"}-shot-${photo.shot_number}.jpg`;

                return (
                  <Tile
                    key={photo.id}
                    tone="surface"
                    className="p-3.5 rounded-tile border border-ink/5 shadow-xs flex flex-col items-center space-y-3"
                  >
                    <div className="flex w-full items-center justify-between px-1 text-[11px] font-mono">
                      <span className="font-bold uppercase text-ink">
                        Shot #{photo.shot_number}
                      </span>
                      <span className="text-[10px] text-muted">
                        {new Date(photo.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>

                    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-ink/10 bg-black/5 flex items-center justify-center">
                      <img
                        src={photo.signed_url}
                        alt={`Shot ${photo.shot_number}`}
                        className="h-full w-full object-cover"
                      />
                    </div>

                    <Pill
                      variant="secondary"
                      size="md"
                      disabled={isDownloading}
                      onClick={() => handleDownload(photo.signed_url!, filename, photo.id)}
                      className="w-full min-h-[42px] uppercase font-mono text-xs tracking-wider gap-1.5"
                    >
                      {isDownloading ? (
                        <>
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          <span>Downloading...</span>
                        </>
                      ) : (
                        <>
                          <Download className="h-3.5 w-3.5" />
                          <span>Download Shot #{photo.shot_number}</span>
                        </>
                      )}
                    </Pill>
                  </Tile>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="py-4 text-center text-muted font-mono text-[10px] border-t border-ink/10 mt-6">
        Snap &amp; Snack · Tap any download button to save to your photos
      </footer>
    </div>
  );
}

