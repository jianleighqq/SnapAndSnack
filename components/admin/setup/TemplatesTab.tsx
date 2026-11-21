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
  Edit2,
  Copy,
  FolderSymlink,
  RefreshCw,
  X,
} from "lucide-react";
import type { Event, PhotoTemplate, PhotoTemplateSlot } from "@/lib/types";
import { Pill } from "@/components/ui/Pill";
import { Label } from "@/components/ui/Label";
import { Tile } from "@/components/ui/Tile";
import { Modal } from "@/components/ui/Modal";
import {
  analyzeTemplateImage,
  generateDefaultSlots,
  validateCanvasAspectRatio,
  TemplateMode,
} from "@/lib/template-detector";

interface TemplatesTabProps {
  selectedEvent: Event | null;
  allEvents?: Event[];
  onUpdateEventShots?: (eventId: string, newShots: number) => Promise<void>;
  onUpdateEventMode?: (mode: "OPERATOR" | "GUEST") => Promise<void>;
}

export default function TemplatesTab({
  selectedEvent,
  allEvents = [],
  onUpdateEventShots,
  onUpdateEventMode,
}: TemplatesTabProps) {
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

  // Single Uploaded File & Mode Detection
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [templatePreviewUrl, setTemplatePreviewUrl] = useState<string | null>(null);
  const [mode, setMode] = useState<TemplateMode>("frame");
  const [detectedSummary, setDetectedSummary] = useState<string | null>(null);
  const [detectedWindows, setDetectedWindows] = useState<PhotoTemplateSlot[] | null>(null);

  // Dimensions & Slots
  const [canvasWidth, setCanvasWidth] = useState(600);
  const [canvasHeight, setCanvasHeight] = useState(1800);
  const [slots, setSlots] = useState<PhotoTemplateSlot[]>([]);
  const [slotWarning, setSlotWarning] = useState<string | null>(null);
  const [aspectWarning, setAspectWarning] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Live Canvas Ref for rendering sample preview
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Modal States
  const [renameModal, setRenameModal] = useState<{
    isOpen: boolean;
    template: PhotoTemplate | null;
    newName: string;
  }>({ isOpen: false, template: null, newName: "" });

  const [copyModal, setCopyModal] = useState<{
    isOpen: boolean;
    template: PhotoTemplate | null;
    targetEventId: string;
  }>({ isOpen: false, template: null, targetEventId: "" });

  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean;
    template: PhotoTemplate | null;
  }>({ isOpen: false, template: null });

  const [syncShotsModal, setSyncShotsModal] = useState<{
    isOpen: boolean;
    template: PhotoTemplate | null;
  }>({ isOpen: false, template: null });

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
      if (templatePreviewUrl) URL.revokeObjectURL(templatePreviewUrl);
    };
  }, [templatePreviewUrl]);

  // Handle Single Template Image Selection & Auto-Detection
  const handleTemplateImageChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage("Template image exceeds 5 MB limit");
      return;
    }

    setErrorMessage(null);
    setTemplateFile(file);

    const objectUrl = URL.createObjectURL(file);
    setTemplatePreviewUrl(objectUrl);

    // Read image dimensions and scan pixel transparency
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      setCanvasWidth(w);
      setCanvasHeight(h);

      // Validate aspect ratio (1:3 or 1:1.5)
      const aspectCheck = validateCanvasAspectRatio(w, h);
      setAspectWarning(aspectCheck.message || null);

      // Analyze pixels with offscreen canvas
      const scanCanvas = document.createElement("canvas");
      scanCanvas.width = w;
      scanCanvas.height = h;
      const ctx = scanCanvas.getContext("2d");
      if (!ctx) return;

      ctx.drawImage(img, 0, 0, w, h);
      const imgData = ctx.getImageData(0, 0, w, h);
      const isPng = file.type === "image/png";

      const analysis = analyzeTemplateImage(imgData, isPng);
      setMode(analysis.mode);
      setDetectedSummary(analysis.summary);

      if (analysis.mode === "frame") {
        setDetectedWindows(analysis.windows);
        setSlots(analysis.windows);
        if (analysis.windows.length !== shotsCount) {
          setSlotWarning(
            `Detected ${analysis.windows.length} window${analysis.windows.length === 1 ? "" : "s"}, but shots count is currently set to ${shotsCount}.`
          );
        } else {
          setSlotWarning(null);
        }
      } else {
        setDetectedWindows(null);
        const defaultSlots = generateDefaultSlots(w, h, shotsCount);
        setSlots(defaultSlots);
        setSlotWarning(null);
      }
    };
    img.src = objectUrl;
  };

  // Toggle between Frame Overlay and Background mode manually
  const handleToggleMode = () => {
    const nextMode: TemplateMode = mode === "frame" ? "background" : "frame";
    setMode(nextMode);

    if (nextMode === "frame") {
      if (detectedWindows && detectedWindows.length > 0) {
        setSlots(detectedWindows);
        setDetectedSummary(
          `Frame with ${detectedWindows.length} windows (manual override)`
        );
      } else {
        setDetectedSummary("Frame overlay (manual override)");
      }
    } else {
      const defaultSlots = generateDefaultSlots(canvasWidth, canvasHeight, shotsCount);
      setSlots(defaultSlots);
      setDetectedSummary(
        "Background image: set your photo slots below (manual override)"
      );
      setSlotWarning(null);
    }
  };

  // Re-generate default slots when shotsCount changes in background mode
  const handleShotsCountChange = (newCount: number) => {
    setShotsCount(newCount);
    if (mode === "background" || !detectedWindows) {
      setSlots(generateDefaultSlots(canvasWidth, canvasHeight, newCount));
    } else if (mode === "frame" && detectedWindows) {
      if (detectedWindows.length !== newCount) {
        setSlotWarning(
          `Detected ${detectedWindows.length} window${detectedWindows.length === 1 ? "" : "s"}, but shots count is set to ${newCount}.`
        );
      } else {
        setSlotWarning(null);
      }
    }
  };

  // Set shots count to detected windows count
  const handleAdoptDetectedShots = () => {
    if (detectedWindows && detectedWindows.length > 0) {
      setShotsCount(detectedWindows.length);
      setSlotWarning(null);
    }
  };

  // Update specific slot coordinate
  const handleSlotChange = (
    index: number,
    field: keyof PhotoTemplateSlot,
    val: number
  ) => {
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
      // 1. If Background Mode: Draw uploaded image BEHIND photos
      if (mode === "background" && templatePreviewUrl) {
        try {
          const bgImg = await new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = templatePreviewUrl;
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

        // Highlight border
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

      // 3. If Frame Mode: Draw uploaded image ON TOP of photos
      if (mode === "frame" && templatePreviewUrl) {
        try {
          const frameImg = await new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = templatePreviewUrl;
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
    mode,
    canvasWidth,
    canvasHeight,
    slots,
    templatePreviewUrl,
  ]);

  // Set Default Template (maps to is_default = true and is_active = true)
  const handleSetDefault = async (templateId: string) => {
    if (!selectedEvent?.id) return;
    setActiveActionId(templateId);
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_default",
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

  // Toggle Available to Guests (maps to is_active)
  const handleToggleActive = async (templateId: string, nextActive: boolean) => {
    if (!selectedEvent?.id) return;
    setActiveActionId(templateId);
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "toggle_active",
          templateId,
          isActive: nextActive,
        }),
      });
      if (res.ok) {
        await fetchTemplates();
      } else {
        const data = await res.json().catch(() => ({}));
        if (data?.error) {
          setErrorMessage(data.error);
        }
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
    if (!templateFile) {
      setErrorMessage("Please select a template image (PNG or JPG)");
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
      formData.append("mode", mode);
      formData.append("file", templateFile);

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
      setTemplateFile(null);
      setTemplatePreviewUrl(null);
      setSlots([]);
      setSlotWarning(null);
      setAspectWarning(null);
      setDetectedSummary(null);
      setDetectedWindows(null);
      await fetchTemplates();
    } catch (err: any) {
      console.error("Save template error:", err);
      setErrorMessage(err.message || "Failed to save template");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Action: Rename Template
  const handleConfirmRename = async () => {
    if (!renameModal.template || !renameModal.newName.trim()) return;
    setActiveActionId(renameModal.template.id);
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "rename",
          templateId: renameModal.template.id,
          name: renameModal.newName.trim(),
        }),
      });
      if (res.ok) {
        setRenameModal({ isOpen: false, template: null, newName: "" });
        await fetchTemplates();
      }
    } finally {
      setActiveActionId(null);
    }
  };

  // Action: Duplicate Template
  const handleDuplicateTemplate = async (templateId: string) => {
    setActiveActionId(templateId);
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "duplicate",
          templateId,
        }),
      });
      if (res.ok) {
        await fetchTemplates();
      }
    } finally {
      setActiveActionId(null);
    }
  };

  // Action: Copy to Another Event
  const handleConfirmCopy = async () => {
    if (!copyModal.template || !copyModal.targetEventId) return;
    setActiveActionId(copyModal.template.id);
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "copy_to_event",
          templateId: copyModal.template.id,
          targetEventId: copyModal.targetEventId,
        }),
      });
      if (res.ok) {
        setCopyModal({ isOpen: false, template: null, targetEventId: "" });
        await fetchTemplates();
      }
    } finally {
      setActiveActionId(null);
    }
  };

  // Action: Delete Template
  const handleConfirmDelete = async () => {
    if (!deleteModal.template) return;
    setActiveActionId(deleteModal.template.id);
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete",
          templateId: deleteModal.template.id,
          eventId: selectedEvent?.id,
        }),
      });
      if (res.ok) {
        setDeleteModal({ isOpen: false, template: null });
        await fetchTemplates();
      }
    } finally {
      setActiveActionId(null);
    }
  };

  // Action: Sync Event Shots Count with Template and Set Active
  const handleConfirmSyncShots = async () => {
    if (!syncShotsModal.template || !selectedEvent?.id || !onUpdateEventShots) return;
    const targetShots = syncShotsModal.template.shots_count;
    const targetTplId = syncShotsModal.template.id;
    setActiveActionId(targetTplId);
    try {
      await onUpdateEventShots(selectedEvent.id, targetShots);
      await handleSetDefault(targetTplId);
      setSyncShotsModal({ isOpen: false, template: null });
    } finally {
      setActiveActionId(null);
    }
  };

  const otherEvents = allEvents.filter((e) => e.id !== selectedEvent?.id);

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

      {/* EVENT TEMPLATE MODE SELECTOR */}
      <div className="bg-paper p-4 rounded-tile border border-ink/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <Label className="text-[10px] font-mono text-muted uppercase tracking-wider block mb-1">
            Template Mode
          </Label>
          <div className="flex items-center gap-2">
            <span className="font-display uppercase text-sm tracking-wide text-ink">
              {selectedEvent?.template_mode === "GUEST"
                ? "Guests Choose at Booth"
                : "Operator Picks (Default Template Only)"}
            </span>
          </div>
          <p className="text-[11px] text-muted mt-0.5">
            {selectedEvent?.template_mode === "GUEST"
              ? "Guests will choose their frame on the booth from all templates marked available."
              : "The default template will be applied automatically to all strips."}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onUpdateEventMode?.("OPERATOR")}
            className={`px-3 py-1.5 rounded-full text-xs font-mono uppercase tracking-wider transition-all ${
              (selectedEvent?.template_mode || "OPERATOR") === "OPERATOR"
                ? "bg-ink text-paper font-bold shadow-sm"
                : "bg-surface text-muted hover:text-ink border border-ink/10"
            }`}
          >
            Operator picks
          </button>
          <button
            type="button"
            onClick={() => onUpdateEventMode?.("GUEST")}
            className={`px-3 py-1.5 rounded-full text-xs font-mono uppercase tracking-wider transition-all ${
              selectedEvent?.template_mode === "GUEST"
                ? "bg-ink text-paper font-bold shadow-sm"
                : "bg-surface text-muted hover:text-ink border border-ink/10"
            }`}
          >
            Guests choose
          </button>
        </div>
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

            {/* Single File Picker */}
            <div className="p-4 rounded-xl border border-ink/10 bg-paper space-y-3">
              <div className="flex items-center justify-between">
                <Label className="font-bold">Template Image (PNG or JPG, max 5 MB)</Label>
                <span className="text-[10px] font-mono text-muted uppercase">
                  Auto-detects frame vs background
                </span>
              </div>
              <input
                type="file"
                required
                accept="image/png,image/jpeg"
                onChange={handleTemplateImageChange}
                className="w-full text-xs text-muted file:mr-3 file:py-1.5 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-mono file:bg-ink file:text-paper hover:file:opacity-80 cursor-pointer"
              />

              {/* Mode Detection & Switcher */}
              {detectedSummary && (
                <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-surface border border-ink/10 text-xs font-mono">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        mode === "frame" ? "bg-accent" : "bg-sun"
                      }`}
                    />
                    <span className="font-semibold text-ink">{detectedSummary}</span>
                    <span className="text-muted">
                      ({mode === "frame" ? "FRAME OVERLAY" : "BACKGROUND"})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleToggleMode}
                    className="text-accent hover:underline font-bold uppercase text-[11px]"
                  >
                    Switch to {mode === "frame" ? "Background mode" : "Frame mode"}
                  </button>
                </div>
              )}
            </div>

            {/* Aspect Ratio Warning */}
            {aspectWarning && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 text-xs font-mono">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                <span>{aspectWarning}</span>
              </div>
            )}

            {/* Shots Mismatch Warning with Quick Adopt Button */}
            {slotWarning && (
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-accent/10 border border-accent/20 text-accent text-xs font-mono">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{slotWarning}</span>
                </div>
                {detectedWindows && detectedWindows.length > 0 && (
                  <button
                    type="button"
                    onClick={handleAdoptDetectedShots}
                    className="px-2.5 py-1 rounded-full bg-accent text-paper font-bold hover:opacity-90 uppercase text-[10px]"
                  >
                    Set Shots to {detectedWindows.length}
                  </button>
                )}
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
                    onClick={() =>
                      setSlots(generateDefaultSlots(canvasWidth, canvasHeight, shotsCount))
                    }
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
                          onChange={(e) =>
                            handleSlotChange(idx, "x", parseInt(e.target.value, 10) || 0)
                          }
                          className="w-full rounded border border-ink/20 px-2 py-1 text-xs"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-muted block">Y:</span>
                        <input
                          type="number"
                          value={slot.y}
                          onChange={(e) =>
                            handleSlotChange(idx, "y", parseInt(e.target.value, 10) || 0)
                          }
                          className="w-full rounded border border-ink/20 px-2 py-1 text-xs"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-muted block">Width:</span>
                        <input
                          type="number"
                          value={slot.w}
                          onChange={(e) =>
                            handleSlotChange(idx, "w", parseInt(e.target.value, 10) || 0)
                          }
                          className="w-full rounded border border-ink/20 px-2 py-1 text-xs"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-muted block">Height:</span>
                        <input
                          type="number"
                          value={slot.h}
                          onChange={(e) =>
                            handleSlotChange(idx, "h", parseInt(e.target.value, 10) || 0)
                          }
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
                  <Eye className="h-3 w-3" /> Live Strip Preview ({mode.toUpperCase()})
                </Label>
                <div className="max-h-[380px] overflow-hidden flex items-center justify-center rounded-lg shadow-sm border border-ink/10 bg-neutral-900">
                  <canvas
                    ref={previewCanvasRef}
                    className="max-h-[370px] w-auto object-contain"
                  />
                </div>
                <span className="text-[10px] text-muted mt-2 font-mono">
                  {mode === "frame"
                    ? "Frame drawn on top of photos"
                    : "Background drawn behind photos"}
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
              <label
                htmlFor="setActiveImmediately"
                className="text-xs font-mono text-ink cursor-pointer"
              >
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
          <Tile
            tone="surface"
            className="p-8 text-center rounded-tile border border-ink/5 space-y-3"
          >
            <ImageIcon className="h-8 w-8 mx-auto text-muted opacity-50" />
            <div>
              <h3 className="font-display text-base uppercase tracking-wide">
                No Templates Yet
              </h3>
              <p className="text-xs text-muted max-w-sm mx-auto mt-1">
                This event currently uses the clean default photo strip. Upload a custom
                frame or background to brand the photos.
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
            {templates.map((tpl) => {
              const isMismatch =
                selectedEvent && tpl.shots_count !== selectedEvent.shots_per_guest;
              const isFrameMode = Boolean(tpl.frame_url);

              return (
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
                    {/* Top Bar with Badges */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="font-display text-base uppercase tracking-wide text-ink truncate max-w-[200px]">
                          {tpl.name}
                        </h4>
                        <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-ink/5 text-muted uppercase">
                            {tpl.shots_count} SHOTS
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-ink/5 text-muted uppercase">
                            {isFrameMode ? "FRAME" : "BACKGROUND"}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {tpl.is_default && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-mono font-bold text-accent uppercase">
                            Default
                          </span>
                        )}
                        {tpl.is_active ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-mono font-bold text-success uppercase">
                            <Check className="h-3 w-3" /> Available
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-ink/5 px-2 py-0.5 text-[10px] font-mono text-muted uppercase">
                            Inactive
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Shots Mismatch Alert */}
                    {isMismatch && (
                      <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-800 text-[11px] font-mono space-y-1.5">
                        <div className="flex items-center gap-1.5 font-bold">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                          <span>Shots Mismatch ({tpl.shots_count} vs {selectedEvent?.shots_per_guest})</span>
                        </div>
                        <p className="text-[10px] text-amber-700 leading-tight">
                          Event requires {selectedEvent?.shots_per_guest} shots. This template cannot be set as default and is excluded from the guest list.
                        </p>
                        {onUpdateEventShots && (
                          <button
                            type="button"
                            onClick={() => setSyncShotsModal({ isOpen: true, template: tpl })}
                            className="text-[10px] uppercase font-bold text-accent hover:underline block pt-0.5"
                          >
                            Update event to {tpl.shots_count} shots &rarr;
                          </button>
                        )}
                      </div>
                    )}

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

                    {/* Template Controls: Default Radio & Available to Guests Toggle */}
                    <div className="space-y-2 pt-2 border-t border-ink/10">
                      {/* 1. Set as Default Radio */}
                      <label
                        className={`flex items-center justify-between text-xs font-mono select-none ${
                          isMismatch ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
                        }`}
                      >
                        <span className="font-semibold text-ink flex items-center gap-2">
                          <input
                            type="radio"
                            name={`default_template_${selectedEvent?.id}`}
                            checked={Boolean(tpl.is_default)}
                            disabled={Boolean(isMismatch) || activeActionId === tpl.id}
                            onChange={() => handleSetDefault(tpl.id)}
                            className="h-4 w-4 text-accent border-ink/20 focus:ring-accent"
                          />
                          <span>Set as default</span>
                        </span>
                        {tpl.is_default && (
                          <span className="text-[10px] text-accent font-bold uppercase">
                            Default
                          </span>
                        )}
                      </label>

                      {/* 2. Available to Guests Toggle */}
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="text-muted">Available to guests</span>
                        {tpl.is_default ? (
                          <span className="text-[10px] text-muted italic">
                            Always available (default)
                          </span>
                        ) : isMismatch ? (
                          <span className="text-[10px] text-amber-700 italic">
                            Excluded (mismatch)
                          </span>
                        ) : (
                          <button
                            type="button"
                            role="switch"
                            aria-checked={Boolean(tpl.is_active)}
                            disabled={activeActionId === tpl.id}
                            onClick={() => handleToggleActive(tpl.id, !tpl.is_active)}
                            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                              tpl.is_active ? "bg-accent" : "bg-ink/20"
                            }`}
                          >
                            <span
                              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-paper shadow ring-0 transition duration-200 ease-in-out ${
                                tpl.is_active ? "translate-x-4" : "translate-x-0"
                              }`}
                            />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Card Actions */}
                  <div className="flex items-center justify-between pt-3 mt-3 border-t border-ink/10 gap-1">
                    <div className="flex items-center gap-1">
                      {/* Rename Button */}
                      <button
                        type="button"
                        onClick={() =>
                          setRenameModal({
                            isOpen: true,
                            template: tpl,
                            newName: tpl.name,
                          })
                        }
                        className="p-1.5 rounded-full text-muted hover:text-ink hover:bg-ink/5 transition-colors"
                        title="Rename template"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>

                      {/* Duplicate Button */}
                      <button
                        type="button"
                        disabled={activeActionId === tpl.id}
                        onClick={() => handleDuplicateTemplate(tpl.id)}
                        className="p-1.5 rounded-full text-muted hover:text-ink hover:bg-ink/5 transition-colors"
                        title="Duplicate template"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>

                      {/* Copy to Another Event Button */}
                      {otherEvents.length > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            setCopyModal({
                              isOpen: true,
                              template: tpl,
                              targetEventId: otherEvents[0]?.id || "",
                            })
                          }
                          className="p-1.5 rounded-full text-muted hover:text-ink hover:bg-ink/5 transition-colors"
                          title="Copy to another event"
                        >
                          <FolderSymlink className="h-3.5 w-3.5" />
                        </button>
                      )}

                      {/* Delete Button */}
                      <button
                        type="button"
                        disabled={activeActionId === tpl.id}
                        onClick={() => setDeleteModal({ isOpen: true, template: tpl })}
                        className="p-1.5 rounded-full text-muted hover:text-danger hover:bg-danger/10 transition-colors"
                        title="Delete template"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="text-[10px] font-mono text-muted uppercase">
                      {tpl.canvas_width} × {tpl.canvas_height}
                    </div>
                  </div>
                </Tile>
              );
            })}
          </div>
        )}
      </div>

      {/* RENAME MODAL */}
      <Modal
        isOpen={renameModal.isOpen}
        onClose={() => setRenameModal({ isOpen: false, template: null, newName: "" })}
      >
        <div className="p-6 bg-paper rounded-tile border border-ink/10 space-y-4 max-w-sm w-full mx-auto">
          <h3 className="font-display text-lg uppercase tracking-wide">
            Rename Template
          </h3>
          <input
            type="text"
            value={renameModal.newName}
            onChange={(e) =>
              setRenameModal((prev) => ({ ...prev, newName: e.target.value }))
            }
            className="w-full rounded-xl border border-ink/20 bg-surface px-3 py-2 text-sm text-ink focus:border-ink focus:outline-none"
            placeholder="Template name"
            autoFocus
          />
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setRenameModal({ isOpen: false, template: null, newName: "" })}
              className="px-3 py-1.5 text-xs font-mono uppercase text-muted hover:text-ink"
            >
              Cancel
            </button>
            <Pill
              variant="primary"
              size="sm"
              onClick={handleConfirmRename}
              disabled={!renameModal.newName.trim()}
              className="uppercase font-mono text-xs"
            >
              Save
            </Pill>
          </div>
        </div>
      </Modal>

      {/* COPY TO ANOTHER EVENT MODAL */}
      <Modal
        isOpen={copyModal.isOpen}
        onClose={() => setCopyModal({ isOpen: false, template: null, targetEventId: "" })}
      >
        <div className="p-6 bg-paper rounded-tile border border-ink/10 space-y-4 max-w-md w-full mx-auto">
          <div className="space-y-1">
            <h3 className="font-display text-lg uppercase tracking-wide">
              Copy Template to Another Event
            </h3>
            <p className="text-xs text-muted">
              Reuse &ldquo;{copyModal.template?.name}&rdquo; in a different event without re-uploading.
            </p>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-semibold">Destination Event</Label>
            <select
              value={copyModal.targetEventId}
              onChange={(e) =>
                setCopyModal((prev) => ({ ...prev, targetEventId: e.target.value }))
              }
              className="w-full rounded-xl border border-ink/20 bg-surface px-3 py-2 text-sm text-ink focus:border-ink focus:outline-none"
            >
              {otherEvents.map((evt) => (
                <option key={evt.id} value={evt.id}>
                  {evt.name} ({evt.shots_per_guest || 3} shots)
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setCopyModal({ isOpen: false, template: null, targetEventId: "" })}
              className="px-3 py-1.5 text-xs font-mono uppercase text-muted hover:text-ink"
            >
              Cancel
            </button>
            <Pill
              variant="primary"
              size="sm"
              onClick={handleConfirmCopy}
              disabled={!copyModal.targetEventId}
              className="uppercase font-mono text-xs"
            >
              Copy Template
            </Pill>
          </div>
        </div>
      </Modal>

      {/* DELETE CONFIRMATION MODAL */}
      <Modal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, template: null })}
      >
        <div className="p-6 bg-paper rounded-tile border border-ink/10 space-y-4 max-w-sm w-full mx-auto">
          <div className="flex items-center gap-2 text-danger">
            <Trash2 className="h-5 w-5" />
            <h3 className="font-display text-lg uppercase tracking-wide">
              Delete Template?
            </h3>
          </div>

          <p className="text-xs text-ink leading-relaxed">
            Are you sure you want to delete &ldquo;{deleteModal.template?.name}&rdquo;?
          </p>

          {deleteModal.template?.is_active && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-800 text-xs font-mono flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
              <span>
                <strong>Warning:</strong> This is the currently active template. Deleting it will cause the booth to fall back to the default clean layout without a custom overlay.
              </span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setDeleteModal({ isOpen: false, template: null })}
              className="px-3 py-1.5 text-xs font-mono uppercase text-muted hover:text-ink"
            >
              Cancel
            </button>
            <Pill
              variant="danger"
              size="sm"
              onClick={handleConfirmDelete}
              className="uppercase font-mono text-xs"
            >
              Delete
            </Pill>
          </div>
        </div>
      </Modal>

      {/* SYNC EVENT SHOTS CONFIRMATION MODAL */}
      <Modal
        isOpen={syncShotsModal.isOpen}
        onClose={() => setSyncShotsModal({ isOpen: false, template: null })}
      >
        <div className="p-6 bg-paper rounded-tile border border-ink/10 space-y-4 max-w-sm w-full mx-auto">
          <div className="flex items-center gap-2 text-accent">
            <RefreshCw className="h-5 w-5" />
            <h3 className="font-display text-lg uppercase tracking-wide">
              Update Event Shots?
            </h3>
          </div>

          <p className="text-xs text-ink leading-relaxed">
            Update &ldquo;{selectedEvent?.name}&rdquo; from {selectedEvent?.shots_per_guest} shots to{" "}
            <strong>{syncShotsModal.template?.shots_count} shots</strong> per guest?
          </p>
          <p className="text-[11px] text-muted">
            This will update the event setting and immediately set &ldquo;{syncShotsModal.template?.name}&rdquo; as the active template for this event.
          </p>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setSyncShotsModal({ isOpen: false, template: null })}
              className="px-3 py-1.5 text-xs font-mono uppercase text-muted hover:text-ink"
            >
              Cancel
            </button>
            <Pill
              variant="primary"
              size="sm"
              onClick={handleConfirmSyncShots}
              className="uppercase font-mono text-xs"
            >
              Update &amp; Set Active
            </Pill>
          </div>
        </div>
      </Modal>
    </div>
  );
}
