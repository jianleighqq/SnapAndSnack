"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Image as ImageIcon,
  Plus,
  Check,
  Trash2,
  AlertTriangle,
  Loader2,
  Sliders,
  Layers,
  Sparkles,
  ArrowRight,
  Eye,
} from "lucide-react";
import type { Event, PhotoTemplate, PhotoTemplateSlot } from "@/lib/types";
import { Pill } from "@/components/ui/Pill";
import { Label } from "@/components/ui/Label";
import { Tile } from "@/components/ui/Tile";
import { Hairline } from "@/components/ui/Hairline";
import { StatusPill } from "@/components/ui/StatusPill";
import {
  detectTransparentWindows,
  generateDefaultSlots,
} from "@/lib/template-detector";

interface TemplatesTabProps {
  selectedEvent: Event | null;
}

export default function TemplatesTab({ selectedEvent }: TemplatesTabProps) {
  const [templates, setTemplates] = useState<PhotoTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeActionId, setActiveActionId] = useState<string | null>(null);

  // Form State
  const [isCreating, setIsCreating] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [shotsCount, setShotsCount] = useState<number>(
    selectedEvent?.shots_per_guest || 3
  );
  const [setActiveImmediately, setSetActiveImmediately] = useState(true);

  // Uploaded File Objects & Data URLs for client detection
  const [frameFile, setFrameFile] = useState<File | null>(null);
  const [framePreviewUrl, setFramePreviewUrl] = useState<string | null>(null);
  const [backgroundFile, setBackgroundFile] = useState<File | null>(null);
  const [backgroundPreviewUrl, setBackgroundPreviewUrl] = useState<string | null>(null);

  // Dimensions & Slots
  const [canvasWidth, setCanvasWidth] = useState(600);
  const [canvasHeight, setCanvasHeight] = useState(1800);
  const [slots, setSlots] = useState<PhotoTemplateSlot[]>([]);
  const [slotWarning, setSlotWarning] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Live Canvas Ref for rendering sample photos
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Load templates whenever selected event changes
  const fetchTemplates = async () => {
    if (!selectedEvent?.id) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/templates?eventId=${selectedEvent.id}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates || []);
      }
    } catch (err) {
      console.error("Failed to fetch templates:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (selectedEvent?.id) {
      fetchTemplates();
      setShotsCount(selectedEvent.shots_per_guest || 3);
    }
  }, [selectedEvent?.id]);

  // Clean up object URLs on unmount or file reset
  useEffect(() => {
    return () => {
      if (framePreviewUrl) URL.revokeObjectURL(framePreviewUrl);
      if (backgroundPreviewUrl) URL.revokeObjectURL(backgroundPreviewUrl);
    };
  }, [framePreviewUrl, backgroundPreviewUrl]);

  // Handle Frame Selection & Transparent Window Detection
  const handleFrameChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage("Frame overlay exceeds 5 MB limit");
      return;
    }

    setErrorMessage(null);
    setFrameFile(file);

    const objectUrl = URL.createObjectURL(file);
    setFramePreviewUrl(objectUrl);

    // Read image dimensions and scan alpha channel
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      setCanvasWidth(w);
      setCanvasHeight(h);

      // Create an offscreen canvas to analyze pixel alpha
      const scanCanvas = document.createElement("canvas");
      scanCanvas.width = w;
      scanCanvas.height = h;
      const ctx = scanCanvas.getContext("2d");
      if (!ctx) return;

      ctx.drawImage(img, 0, 0, w, h);
      const imgData = ctx.getImageData(0, 0, w, h);

      // Detect transparent windows
      const detected = detectTransparentWindows(imgData);

      if (detected.length > 0) {
        setSlots(detected);
        if (detected.length !== shotsCount) {
          setSlotWarning(
            `Detected ${detected.length} transparent window${detected.length === 1 ? "" : "s"}, but shots count is set to ${shotsCount}. You can adjust slots below.`
          );
        } else {
          setSlotWarning(null);
        }
      } else {
        // Fallback default slots if frame is opaque or non-transparent
        const fallback = generateDefaultSlots(w, h, shotsCount);
        setSlots(fallback);
        setSlotWarning(
          "No transparent windows detected in frame. Generated default slots."
        );
      }
    };
    img.src = objectUrl;
  };

  // Handle Background Selection
  const handleBackgroundChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage("Background image exceeds 5 MB limit");
      return;
    }

    setErrorMessage(null);
    setBackgroundFile(file);

    const objectUrl = URL.createObjectURL(file);
    setBackgroundPreviewUrl(objectUrl);

    // If no frame is uploaded yet, use background image size as canvas size
    if (!frameFile) {
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        setCanvasWidth(w);
        setCanvasHeight(h);
        const defaultSlots = generateDefaultSlots(w, h, shotsCount);
        setSlots(defaultSlots);
      };
      img.src = objectUrl;
    }
  };

  // Re-generate default slots when shotsCount changes without a frame
  const handleShotsCountChange = (newCount: number) => {
    setShotsCount(newCount);
    if (!frameFile && slots.length > 0) {
      setSlots(generateDefaultSlots(canvasWidth, canvasHeight, newCount));
    }
  };

  // Update specific slot coordinate
  const handleSlotChange = (index: number, field: keyof PhotoTemplateSlot, val: number) => {
    setSlots((prev) => {
      const next = [...prev];
      if (next[index]) {
        next[index] = { ...next[index], [field]: Math.max(0, val) };
      }
      return next;
    });
  };

  // Live Canvas Preview of Template with Sample Photos
  useEffect(() => {
    if (!isCreating) return;
    const canvas = previewCanvasRef.current;
    if (!canvas) return;

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Base background
    ctx.fillStyle = "#1e1c1a";
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    let isMounted = true;

    async function drawPreview(renderCtx: CanvasRenderingContext2D) {
      // 1. Draw Background
      if (backgroundPreviewUrl) {
        try {
          const bgImg = await new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = backgroundPreviewUrl;
          });
          if (!isMounted) return;
          renderCtx.drawImage(bgImg, 0, 0, canvasWidth, canvasHeight);
        } catch {}
      }

      // 2. Draw Sample Photos in Slots
      for (let i = 0; i < slots.length; i++) {
        const s = slots[i];
        if (!s) continue;

        // Sample photo box
        renderCtx.fillStyle = i % 2 === 0 ? "#2d2a26" : "#38342f";
        renderCtx.fillRect(s.x, s.y, s.w, s.h);

        // Grid/border
        renderCtx.strokeStyle = "#e8541e";
        renderCtx.lineWidth = 2;
        renderCtx.strokeRect(s.x, s.y, s.w, s.h);

        // Center label
        renderCtx.fillStyle = "#f6f4f1";
        renderCtx.font = "bold 24px Inter, sans-serif";
        renderCtx.textAlign = "center";
        renderCtx.textBaseline = "middle";
        renderCtx.fillText(`SAMPLE SHOT #${i + 1}`, s.x + s.w / 2, s.y + s.h / 2);

        // Dimensions label
        renderCtx.fillStyle = "rgba(246, 244, 241, 0.6)";
        renderCtx.font = "14px JetBrains Mono, monospace";
        renderCtx.fillText(`${s.w} × ${s.h} px`, s.x + s.w / 2, s.y + s.h / 2 + 28);
      }

      // 3. Draw Frame Overlay On Top
      if (framePreviewUrl) {
        try {
          const frameImg = await new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = framePreviewUrl;
          });
          if (!isMounted) return;
          renderCtx.drawImage(frameImg, 0, 0, canvasWidth, canvasHeight);
        } catch {}
      }
    }

    drawPreview(ctx);

    return () => {
      isMounted = false;
    };
  }, [
    isCreating,
    canvasWidth,
    canvasHeight,
    slots,
    backgroundPreviewUrl,
    framePreviewUrl,
  ]);

  // Set Active Template
  const handleSetActive = async (templateId: string) => {
    if (!selectedEvent?.id) return;
    setActiveActionId(templateId);
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_active",
          templateId,
          eventId: selectedEvent.id,
        }),
      });
      if (res.ok) {
        await fetchTemplates();
      }
    } finally {
      setActiveActionId(null);
    }
  };

  // Delete Template
  const handleDeleteTemplate = async (templateId: string) => {
    if (!confirm("Are you sure you want to delete this template? Its files will be permanently removed.")) {
      return;
    }
    setActiveActionId(templateId);
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete",
          templateId,
          eventId: selectedEvent?.id,
        }),
      });
      if (res.ok) {
        await fetchTemplates();
      }
    } finally {
      setActiveActionId(null);
    }
  };

  // Submit Template Form
  const handleSubmitNewTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEvent?.id) return;
    if (!templateName.trim()) {
      setErrorMessage("Please enter a template name");
      return;
    }
    if (!frameFile && !backgroundFile) {
      setErrorMessage("Please select at least a Frame overlay or a Background image");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const formData = new FormData();
      formData.append("eventId", selectedEvent.id);
      formData.append("name", templateName.trim());
      formData.append("shotsCount", String(shotsCount));
      formData.append("canvasWidth", String(canvasWidth));
      formData.append("canvasHeight", String(canvasHeight));
      formData.append("slots", JSON.stringify(slots));
      formData.append("setActive", String(setActiveImmediately));

      if (frameFile) formData.append("frame", frameFile);
      if (backgroundFile) formData.append("background", backgroundFile);

      const res = await fetch("/api/templates", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create template");
      }

      // Reset form
      setIsCreating(false);
      setTemplateName("");
      setFrameFile(null);
      setFramePreviewUrl(null);
      setBackgroundFile(null);
      setBackgroundPreviewUrl(null);
      setSlots([]);
      setSlotWarning(null);
      await fetchTemplates();
    } catch (err: any) {
      console.error("Save template error:", err);
      setErrorMessage(err.message || "Failed to save template");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full space-y-4 overflow-y-auto pr-1">
      {/* HEADER / ACTIONS */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-paper p-4 rounded-tile border border-ink/5">
        <div>
          <h2 className="font-display text-lg uppercase tracking-wider text-ink">
            Strip Templates
          </h2>
          <p className="text-xs text-muted">
            Configure custom photo strip overlays and backgrounds for {selectedEvent?.name || "the event"}.
          </p>
        </div>

        {!isCreating && (
          <Pill
            variant="primary"
            size="md"
            onClick={() => {
              setIsCreating(true);
              setSlots(generateDefaultSlots(canvasWidth, canvasHeight, shotsCount));
            }}
            className="uppercase tracking-wider font-mono text-xs gap-1.5"
          >
            <Plus className="h-4 w-4" />
            <span>Upload Template</span>
          </Pill>
        )}
      </div>

      {/* CREATE TEMPLATE FORM */}
      {isCreating && (
        <Tile tone="surface" className="p-6 rounded-tile border border-ink/10 space-y-6 animate-fadeIn">
          <div className="flex items-center justify-between pb-3 border-b border-ink/10">
            <div className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-accent" />
              <h3 className="font-display text-lg uppercase tracking-wide">
                New Strip Template
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              className="text-xs font-mono uppercase text-muted hover:text-ink"
            >
              Cancel
            </button>
          </div>

          {errorMessage && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-danger/10 border border-danger/20 text-danger text-xs font-sans">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmitNewTemplate} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Template Name */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Template Name</Label>
                <input
                  type="text"
                  required
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="e.g. Vintage Floral 3-Shot"
                  className="w-full rounded-xl border border-ink/20 bg-paper px-3.5 py-2 text-sm text-ink placeholder:text-muted focus:border-ink focus:outline-none"
                />
              </div>

              {/* Shots Count */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Shots Count</Label>
                <select
                  value={shotsCount}
                  onChange={(e) => handleShotsCountChange(parseInt(e.target.value, 10))}
                  className="w-full rounded-xl border border-ink/20 bg-paper px-3.5 py-2 text-sm text-ink focus:border-ink focus:outline-none"
                >
                  <option value={1}>1 Shot</option>
                  <option value={2}>2 Shots</option>
                  <option value={3}>3 Shots (Default)</option>
                  <option value={4}>4 Shots</option>
                </select>
              </div>
            </div>

            {/* File Pickers */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Frame Overlay */}
              <div className="p-4 rounded-xl border border-ink/10 bg-paper space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="font-bold">Frame Overlay (PNG with transparent windows)</Label>
                  <span className="text-[10px] font-mono text-muted">Drawn on top</span>
                </div>
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  onChange={handleFrameChange}
                  className="w-full text-xs text-muted file:mr-3 file:py-1.5 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-mono file:bg-ink file:text-paper hover:file:opacity-80 cursor-pointer"
                />
                <p className="text-[11px] text-muted">
                  Auto-detects window cutouts. Max 5 MB PNG.
                </p>
              </div>

              {/* Background Image */}
              <div className="p-4 rounded-xl border border-ink/10 bg-paper space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="font-bold">Background (PNG or JPG)</Label>
                  <span className="text-[10px] font-mono text-muted">Drawn behind photos</span>
                </div>
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  onChange={handleBackgroundChange}
                  className="w-full text-xs text-muted file:mr-3 file:py-1.5 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-mono file:bg-ink file:text-paper hover:file:opacity-80 cursor-pointer"
                />
                <p className="text-[11px] text-muted">
                  Solid texture, event logo or backdrop. Max 5 MB.
                </p>
              </div>
            </div>

            {/* Detection / Slot Warning Banner */}
            {slotWarning && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-accent/10 border border-accent/20 text-accent text-xs font-mono">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{slotWarning}</span>
              </div>
            )}

            {/* LIVE PREVIEW & SLOT ADJUSTMENTS */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-2">
              {/* Slots Coordinate Editor */}
              <div className="lg:col-span-7 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="font-bold flex items-center gap-1.5">
                    <Sliders className="h-3.5 w-3.5 text-accent" />
                    Photo Slots ({slots.length}) · Canvas: {canvasWidth} × {canvasHeight} px
                  </Label>
                  <button
                    type="button"
                    onClick={() => setSlots(generateDefaultSlots(canvasWidth, canvasHeight, shotsCount))}
                    className="text-[11px] font-mono uppercase text-muted hover:text-ink underline"
                  >
                    Reset to Default Slots
                  </button>
                </div>

                <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
                  {slots.map((slot, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl border border-ink/10 bg-paper grid grid-cols-4 gap-2 text-xs font-mono items-center"
                    >
                      <div className="col-span-4 flex items-center justify-between pb-1 border-b border-ink/5">
                        <span className="font-bold text-accent">Slot #{idx + 1}</span>
                        <span className="text-[10px] text-muted">
                          {slot.w} × {slot.h} px
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-muted block">X:</span>
                        <input
                          type="number"
                          value={slot.x}
                          onChange={(e) => handleSlotChange(idx, "x", parseInt(e.target.value, 10) || 0)}
                          className="w-full rounded border border-ink/20 px-2 py-1 text-xs"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-muted block">Y:</span>
                        <input
                          type="number"
                          value={slot.y}
                          onChange={(e) => handleSlotChange(idx, "y", parseInt(e.target.value, 10) || 0)}
                          className="w-full rounded border border-ink/20 px-2 py-1 text-xs"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-muted block">Width:</span>
                        <input
                          type="number"
                          value={slot.w}
                          onChange={(e) => handleSlotChange(idx, "w", parseInt(e.target.value, 10) || 0)}
                          className="w-full rounded border border-ink/20 px-2 py-1 text-xs"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-muted block">Height:</span>
                        <input
                          type="number"
                          value={slot.h}
                          onChange={(e) => handleSlotChange(idx, "h", parseInt(e.target.value, 10) || 0)}
                          className="w-full rounded border border-ink/20 px-2 py-1 text-xs"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Live Preview Canvas */}
              <div className="lg:col-span-5 flex flex-col items-center justify-center p-3 rounded-xl border border-ink/10 bg-paper">
                <Label className="text-[10px] font-mono mb-2 text-muted uppercase tracking-wider flex items-center gap-1">
                  <Eye className="h-3 w-3" /> Live Strip Preview
                </Label>
                <div className="max-h-[380px] overflow-hidden flex items-center justify-center rounded-lg shadow-sm border border-ink/10 bg-neutral-900">
                  <canvas
                    ref={previewCanvasRef}
                    className="max-h-[370px] w-auto object-contain"
                  />
                </div>
                <span className="text-[10px] text-muted mt-2 font-mono">
                  Sample photos scaled to cover slots
                </span>
              </div>
            </div>

            {/* Set Active Checkbox */}
            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="setActiveImmediately"
                checked={setActiveImmediately}
                onChange={(e) => setSetActiveImmediately(e.target.checked)}
                className="h-4 w-4 rounded border-ink/20 text-ink focus:ring-ink"
              />
              <label htmlFor="setActiveImmediately" className="text-xs font-mono text-ink cursor-pointer">
                Set as active template for this event immediately
              </label>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-ink/10">
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="px-4 py-2 text-xs font-mono uppercase text-muted hover:text-ink"
              >
                Cancel
              </button>
              <Pill
                variant="primary"
                size="md"
                type="submit"
                disabled={isSubmitting}
                className="uppercase tracking-wider font-mono text-xs"
              >
                {isSubmitting ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Saving...
                  </span>
                ) : (
                  <span>Save Template</span>
                )}
              </Pill>
            </div>
          </form>
        </Tile>
      )}

      {/* TEMPLATES LIST */}
      <div className="flex-1 space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center p-12 text-muted">
            <Loader2 className="h-6 w-6 animate-spin text-accent mr-2" />
            <span className="text-xs font-mono">Loading templates...</span>
          </div>
        ) : templates.length === 0 ? (
          <Tile tone="surface" className="p-8 text-center rounded-tile border border-ink/5 space-y-3">
            <ImageIcon className="h-8 w-8 mx-auto text-muted opacity-50" />
            <div>
              <h3 className="font-display text-base uppercase tracking-wide">No Templates Yet</h3>
              <p className="text-xs text-muted max-w-sm mx-auto mt-1">
                This event currently uses the clean default photo strip. Upload a custom frame or background to brand the photos.
              </p>
            </div>
            {!isCreating && (
              <Pill
                variant="secondary"
                size="sm"
                onClick={() => {
                  setIsCreating(true);
                  setSlots(generateDefaultSlots(canvasWidth, canvasHeight, shotsCount));
                }}
                className="uppercase tracking-wider font-mono text-xs"
              >
                Create First Template
              </Pill>
            )}
          </Tile>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((tpl) => (
              <Tile
                key={tpl.id}
                tone="surface"
                className={`p-4 rounded-tile border transition-all flex flex-col justify-between ${
                  tpl.is_active
                    ? "border-accent bg-paper ring-1 ring-accent/20"
                    : "border-ink/5 hover:border-ink/20"
                }`}
              >
                <div className="space-y-3">
                  {/* Top Bar with Status */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-display text-base uppercase tracking-wide text-ink">
                        {tpl.name}
                      </h4>
                      <p className="text-[11px] font-mono text-muted">
                        {tpl.shots_count} SHOTS · {tpl.canvas_width} × {tpl.canvas_height} PX
                      </p>
                    </div>
                    {tpl.is_active && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-mono font-bold text-success uppercase">
                        <Check className="h-3 w-3" /> Active
                      </span>
                    )}
                  </div>

                  {/* Thumbnail / Image Preview Tile */}
                  <div className="h-44 w-full bg-neutral-900 rounded-xl overflow-hidden relative flex items-center justify-center p-2 border border-ink/5">
                    {tpl.background_url && (
                      <img
                        src={tpl.background_url}
                        alt="Background"
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    )}
                    {/* Render slot rectangles as semi-transparent guides */}
                    {tpl.slots?.map((s, i) => (
                      <div
                        key={i}
                        className="absolute border border-accent/60 bg-accent/10 flex items-center justify-center text-[9px] font-mono text-paper font-bold"
                        style={{
                          left: `${(s.x / tpl.canvas_width) * 100}%`,
                          top: `${(s.y / tpl.canvas_height) * 100}%`,
                          width: `${(s.w / tpl.canvas_width) * 100}%`,
                          height: `${(s.h / tpl.canvas_height) * 100}%`,
                        }}
                      >
                        #{i + 1}
                      </div>
                    ))}
                    {tpl.frame_url && (
                      <img
                        src={tpl.frame_url}
                        alt="Frame"
                        className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                      />
                    )}
                  </div>
                </div>

                {/* Card Actions */}
                <div className="flex items-center justify-between pt-3 mt-2 border-t border-ink/10">
                  <button
                    type="button"
                    disabled={activeActionId === tpl.id}
                    onClick={() => handleDeleteTemplate(tpl.id)}
                    className="p-1.5 rounded-full text-muted hover:text-danger hover:bg-danger/10 transition-colors"
                    title="Delete Template"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>

                  {!tpl.is_active ? (
                    <Pill
                      variant="secondary"
                      size="sm"
                      disabled={activeActionId === tpl.id}
                      onClick={() => handleSetActive(tpl.id)}
                      className="uppercase font-mono text-xs tracking-wider"
                    >
                      {activeActionId === tpl.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <span>Set Active</span>
                      )}
                    </Pill>
                  ) : (
                    <span className="text-[11px] font-mono text-muted uppercase">
                      In use by booth
                    </span>
                  )}
                </div>
              </Tile>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
