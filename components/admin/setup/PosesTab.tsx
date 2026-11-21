"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Camera,
  Plus,
  Trash2,
  Edit2,
  ArrowUp,
  ArrowDown,
  Check,
  AlertTriangle,
  Loader2,
  Image as ImageIcon,
  X,
  Sparkles,
} from "lucide-react";
import type { Pose } from "@/lib/types";
import { Pill } from "@/components/ui/Pill";
import { Label } from "@/components/ui/Label";
import { Tile } from "@/components/ui/Tile";
import { Modal } from "@/components/ui/Modal";
import { compressGuideImage } from "@/lib/image-compress";

export default function PosesTab() {
  const [poses, setPoses] = useState<Pose[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeActionId, setActiveActionId] = useState<string | null>(null);

  // Add Pose Form State
  const [isAdding, setIsAdding] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [addName, setAddName] = useState("");
  const [addDescription, setAddDescription] = useState("");
  const [addFile, setAddFile] = useState<File | null>(null);
  const [addPreviewUrl, setAddPreviewUrl] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Edit Pose Modal State
  const [editModal, setEditModal] = useState<{
    isOpen: boolean;
    pose: Pose | null;
    name: string;
    description: string;
    file: File | null;
    previewUrl: string | null;
  }>({
    isOpen: false,
    pose: null,
    name: "",
    description: "",
    file: null,
    previewUrl: null,
  });
  const editFileInputRef = useRef<HTMLInputElement | null>(null);

  // Delete Confirmation Modal State
  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean;
    pose: Pose | null;
  }>({
    isOpen: false,
    pose: null,
  });

  // Fetch all poses
  const fetchPoses = async () => {
    try {
      const res = await fetch("/api/poses", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data.poses && Array.isArray(data.poses)) {
          setPoses(data.poses);
        }
      }
    } catch (err) {
      console.error("[PosesTab] Failed to fetch poses:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPoses();
  }, []);

  // Handle file selection for Add Pose
  const handleSelectAddFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setFormError("Guide picture exceeds 5 MB limit");
      return;
    }

    setFormError(null);
    setAddFile(file);
    const url = URL.createObjectURL(file);
    setAddPreviewUrl(url);
  };

  // Handle file selection for Edit Pose
  const handleSelectEditFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert("Guide picture exceeds 5 MB limit");
      return;
    }

    const url = URL.createObjectURL(file);
    setEditModal((prev) => ({
      ...prev,
      file,
      previewUrl: url,
    }));
  };

  // Submit Add Pose
  const handleCreatePose = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = addName.trim().slice(0, 40);
    if (!trimmedName) {
      setFormError("Pose name is required (max 40 characters)");
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      const formData = new FormData();
      formData.append("action", "create");
      formData.append("name", trimmedName);
      if (addDescription.trim()) {
        formData.append("description", addDescription.trim().slice(0, 80));
      }

      if (addFile) {
        // Compress in browser before upload (max 900px, quality 0.85)
        const compressedBlob = await compressGuideImage(addFile, 900, 0.85);
        formData.append("guideImage", compressedBlob, `${trimmedName}.jpg`);
      }

      const res = await fetch("/api/poses", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create pose");
      }

      // Reset form
      setAddName("");
      setAddDescription("");
      setAddFile(null);
      if (addPreviewUrl) URL.revokeObjectURL(addPreviewUrl);
      setAddPreviewUrl(null);
      setIsAdding(false);
      await fetchPoses();
    } catch (err: any) {
      setFormError(err.message || "Failed to create pose");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit Edit Pose
  const handleConfirmEdit = async () => {
    if (!editModal.pose) return;
    const trimmedName = editModal.name.trim().slice(0, 40);
    if (!trimmedName) {
      alert("Pose name is required");
      return;
    }

    setActiveActionId(editModal.pose.id);
    try {
      const formData = new FormData();
      formData.append("action", "edit");
      formData.append("poseId", editModal.pose.id);
      formData.append("name", trimmedName);
      if (editModal.description.trim()) {
        formData.append("description", editModal.description.trim().slice(0, 80));
      }

      if (editModal.file) {
        const compressedBlob = await compressGuideImage(editModal.file, 900, 0.85);
        formData.append("guideImage", compressedBlob, "guide.jpg");
      }

      const res = await fetch("/api/poses", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        setEditModal({
          isOpen: false,
          pose: null,
          name: "",
          description: "",
          file: null,
          previewUrl: null,
        });
        await fetchPoses();
      }
    } finally {
      setActiveActionId(null);
    }
  };

  // Toggle Active State
  const handleToggleActive = async (pose: Pose) => {
    setActiveActionId(pose.id);
    try {
      const res = await fetch("/api/poses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "toggle_active",
          poseId: pose.id,
          isActive: !pose.is_active,
        }),
      });
      if (res.ok) {
        await fetchPoses();
      }
    } finally {
      setActiveActionId(null);
    }
  };

  // Reorder Pose (Move Up or Down)
  const handleMove = async (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= poses.length) return;

    const nextPoses = [...poses];
    const [moved] = nextPoses.splice(index, 1);
    nextPoses.splice(targetIndex, 0, moved);
    setPoses(nextPoses);

    try {
      await fetch("/api/poses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reorder",
          orderedIds: nextPoses.map((p) => p.id),
        }),
      });
    } catch (err) {
      console.warn("[PosesTab] Failed to save reordered poses:", err);
      await fetchPoses();
    }
  };

  // Delete Pose
  const handleConfirmDelete = async () => {
    if (!deleteModal.pose) return;
    setActiveActionId(deleteModal.pose.id);

    try {
      const res = await fetch("/api/poses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete",
          poseId: deleteModal.pose.id,
        }),
      });

      if (res.ok) {
        setDeleteModal({ isOpen: false, pose: null });
        await fetchPoses();
      }
    } finally {
      setActiveActionId(null);
    }
  };

  return (
    <div className="flex flex-col h-full space-y-4 overflow-y-auto pr-1">
      {/* HEADER / ACTIONS */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-paper p-4 rounded-tile border border-ink/5">
        <div>
          <h2 className="font-display text-lg uppercase tracking-wider text-ink">
            Pose Library
          </h2>
          <p className="text-xs text-muted">
            Manage guide photos and pose suggestions shown to guests on the booth screen.
          </p>
        </div>

        {!isAdding && (
          <Pill
            variant="primary"
            size="md"
            onClick={() => setIsAdding(true)}
            className="uppercase tracking-wider font-mono text-xs gap-1.5"
          >
            <Plus className="h-4 w-4" />
            <span>Add Pose</span>
          </Pill>
        )}
      </div>

      {/* ADD POSE FORM */}
      {isAdding && (
        <Tile tone="surface" className="p-6 rounded-tile border border-ink/10 space-y-5 animate-fadeIn">
          <div className="flex items-center justify-between pb-3 border-b border-ink/10">
            <div className="flex items-center gap-2">
              <Camera className="h-5 w-5 text-accent" />
              <h3 className="font-display text-lg uppercase tracking-wide">
                New Pose Guide
              </h3>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsAdding(false);
                setFormError(null);
                setAddFile(null);
                setAddPreviewUrl(null);
              }}
              className="text-xs font-mono uppercase text-muted hover:text-ink"
            >
              Cancel
            </button>
          </div>

          {formError && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-danger/10 border border-danger/20 text-danger text-xs font-sans">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <form onSubmit={handleCreatePose} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Name & Description */}
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Pose Name (max 40 chars)</Label>
                  <input
                    type="text"
                    required
                    maxLength={40}
                    value={addName}
                    onChange={(e) => setAddName(e.target.value)}
                    placeholder="e.g. Back-to-Back"
                    className="w-full rounded-xl border border-ink/20 bg-paper px-3.5 py-2 text-sm text-ink placeholder:text-muted focus:border-ink focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">
                    Short Description (optional, max 80 chars)
                  </Label>
                  <input
                    type="text"
                    maxLength={80}
                    value={addDescription}
                    onChange={(e) => setAddDescription(e.target.value)}
                    placeholder="e.g. Turn away, fold arms, cool expressions"
                    className="w-full rounded-xl border border-ink/20 bg-paper px-3.5 py-2 text-sm text-ink placeholder:text-muted focus:border-ink focus:outline-none"
                  />
                </div>
              </div>

              {/* Guide Picture Upload & Preview */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Guide Picture (JPG, PNG, WEBP, max 5 MB)</Label>
                <div className="flex items-center gap-4">
                  {addPreviewUrl ? (
                    <div className="relative h-28 w-28 rounded-xl overflow-hidden border border-ink/15 bg-neutral-900 shrink-0">
                      <img
                        src={addPreviewUrl}
                        alt="Preview"
                        className="h-full w-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setAddFile(null);
                          setAddPreviewUrl(null);
                          if (fileInputRef.current) fileInputRef.current.value = "";
                        }}
                        className="absolute top-1 right-1 p-1 rounded-full bg-ink/70 text-paper hover:bg-ink transition-colors"
                        title="Remove image"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="h-28 w-28 rounded-xl border-2 border-dashed border-ink/20 bg-paper hover:border-ink/40 cursor-pointer flex flex-col items-center justify-center text-muted shrink-0 transition-colors"
                    >
                      <ImageIcon className="h-6 w-6 opacity-60 mb-1" />
                      <span className="text-[10px] font-mono uppercase">Upload</span>
                    </div>
                  )}

                  <div className="text-xs text-muted space-y-1">
                    <p>Select a photo showing how guests should pose.</p>
                    <p className="text-[11px] font-mono text-muted/80">
                      Automatically resized and optimized before upload.
                    </p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleSelectAddFile}
                      className="hidden"
                    />
                    {!addPreviewUrl && (
                      <Pill
                        variant="secondary"
                        size="sm"
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="text-xs font-mono uppercase tracking-wider"
                      >
                        Choose Picture
                      </Pill>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-ink/10">
              <button
                type="button"
                onClick={() => {
                  setIsAdding(false);
                  setFormError(null);
                  setAddFile(null);
                  setAddPreviewUrl(null);
                }}
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
                  <span>Save Pose</span>
                )}
              </Pill>
            </div>
          </form>
        </Tile>
      )}

      {/* POSES LIST */}
      <div className="flex-1 space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center p-12 text-muted">
            <Loader2 className="h-6 w-6 animate-spin text-accent mr-2" />
            <span className="text-xs font-mono">Loading poses...</span>
          </div>
        ) : poses.length === 0 ? (
          <Tile tone="surface" className="p-8 text-center rounded-tile border border-ink/5 space-y-3">
            <Camera className="h-8 w-8 mx-auto text-muted opacity-50" />
            <div>
              <h3 className="font-display text-base uppercase tracking-wide">
                No Poses Configured
              </h3>
              <p className="text-xs text-muted max-w-sm mx-auto mt-1">
                Add poses with guide pictures to help your guests strike creative poses during their shoot.
              </p>
            </div>
            {!isAdding && (
              <Pill
                variant="secondary"
                size="sm"
                onClick={() => setIsAdding(true)}
                className="uppercase tracking-wider font-mono text-xs"
              >
                Add First Pose
              </Pill>
            )}
          </Tile>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {poses.map((pose, index) => {
              const isFirst = index === 0;
              const isLast = index === poses.length - 1;

              return (
                <Tile
                  key={pose.id}
                  tone="surface"
                  className={`p-4 rounded-tile border transition-all flex flex-col justify-between ${
                    pose.is_active
                      ? "border-accent/40 bg-paper ring-1 ring-accent/20"
                      : "border-ink/5 opacity-70 hover:opacity-100"
                  }`}
                >
                  <div className="space-y-3">
                    {/* Top Row: Name, Order, & Active Badge */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-ink/5 text-muted uppercase">
                            #{index + 1}
                          </span>
                          <h4 className="font-display text-base uppercase tracking-wide text-ink truncate">
                            {pose.name}
                          </h4>
                        </div>
                        {pose.description && (
                          <p className="text-xs text-muted line-clamp-2 mt-1">
                            {pose.description}
                          </p>
                        )}
                      </div>

                      {pose.is_active ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-mono font-bold text-success uppercase shrink-0">
                          <Check className="h-3 w-3" /> Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-ink/5 px-2 py-0.5 text-[10px] font-mono text-muted uppercase shrink-0">
                          Hidden
                        </span>
                      )}
                    </div>

                    {/* Guide Image Preview Tile */}
                    <div className="h-44 w-full bg-neutral-900 rounded-xl overflow-hidden relative flex items-center justify-center border border-ink/5">
                      {pose.image_url ? (
                        <img
                          src={pose.image_url}
                          alt={pose.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center text-paper/40 p-4 text-center">
                          <Camera className="h-8 w-8 mb-1 opacity-50" />
                          <span className="text-[10px] font-mono uppercase tracking-wider">
                            No guide picture
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Active Toggle */}
                    <div className="flex items-center justify-between text-xs font-mono pt-1">
                      <span className="text-muted">Available to guests</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={pose.is_active}
                        disabled={activeActionId === pose.id}
                        onClick={() => handleToggleActive(pose)}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          pose.is_active ? "bg-accent" : "bg-ink/20"
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-paper shadow ring-0 transition duration-200 ease-in-out ${
                            pose.is_active ? "translate-x-4" : "translate-x-0"
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  {/* Bottom Row Actions: Reorder & Edit/Delete */}
                  <div className="flex items-center justify-between pt-3 mt-3 border-t border-ink/10 gap-1">
                    {/* Reorder Buttons */}
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={isFirst}
                        onClick={() => handleMove(index, "up")}
                        className="p-1.5 rounded-full text-muted hover:text-ink hover:bg-ink/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        title="Move up"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={isLast}
                        onClick={() => handleMove(index, "down")}
                        className="p-1.5 rounded-full text-muted hover:text-ink hover:bg-ink/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        title="Move down"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {/* Edit & Delete */}
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          setEditModal({
                            isOpen: true,
                            pose,
                            name: pose.name,
                            description: pose.description || "",
                            file: null,
                            previewUrl: pose.image_url || null,
                          })
                        }
                        className="p-1.5 rounded-full text-muted hover:text-ink hover:bg-ink/5 transition-colors"
                        title="Edit pose"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>

                      <button
                        type="button"
                        disabled={activeActionId === pose.id}
                        onClick={() => setDeleteModal({ isOpen: true, pose })}
                        className="p-1.5 rounded-full text-muted hover:text-danger hover:bg-danger/10 transition-colors"
                        title="Delete pose"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </Tile>
              );
            })}
          </div>
        )}
      </div>

      {/* EDIT MODAL */}
      <Modal
        isOpen={editModal.isOpen}
        onClose={() =>
          setEditModal({
            isOpen: false,
            pose: null,
            name: "",
            description: "",
            file: null,
            previewUrl: null,
          })
        }
      >
        <div className="p-6 bg-paper rounded-tile border border-ink/10 space-y-4 max-w-md w-full mx-auto">
          <div className="flex items-center justify-between border-b border-ink/10 pb-3">
            <h3 className="font-display text-lg uppercase tracking-wide">
              Edit Pose
            </h3>
            <button
              type="button"
              onClick={() =>
                setEditModal({
                  isOpen: false,
                  pose: null,
                  name: "",
                  description: "",
                  file: null,
                  previewUrl: null,
                })
              }
              className="text-xs font-mono uppercase text-muted hover:text-ink"
            >
              Cancel
            </button>
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Pose Name</Label>
              <input
                type="text"
                maxLength={40}
                value={editModal.name}
                onChange={(e) =>
                  setEditModal((prev) => ({ ...prev, name: e.target.value }))
                }
                className="w-full rounded-xl border border-ink/20 bg-surface px-3 py-2 text-sm text-ink focus:border-ink focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Description</Label>
              <input
                type="text"
                maxLength={80}
                value={editModal.description}
                onChange={(e) =>
                  setEditModal((prev) => ({ ...prev, description: e.target.value }))
                }
                className="w-full rounded-xl border border-ink/20 bg-surface px-3 py-2 text-sm text-ink focus:border-ink focus:outline-none"
              />
            </div>

            <div className="space-y-1 pt-1">
              <Label className="text-xs font-semibold">Guide Picture</Label>
              <div className="flex items-center gap-3">
                {editModal.previewUrl ? (
                  <div className="relative h-20 w-20 rounded-xl overflow-hidden border border-ink/10 bg-neutral-900 shrink-0">
                    <img
                      src={editModal.previewUrl}
                      alt="Preview"
                      className="h-full w-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="h-20 w-20 rounded-xl bg-ink/5 flex items-center justify-center text-muted shrink-0">
                    <Camera className="h-6 w-6 opacity-40" />
                  </div>
                )}
                <div className="space-y-1">
                  <input
                    ref={editFileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleSelectEditFile}
                    className="hidden"
                  />
                  <Pill
                    variant="secondary"
                    size="sm"
                    type="button"
                    onClick={() => editFileInputRef.current?.click()}
                    className="text-xs font-mono uppercase tracking-wider"
                  >
                    Change Picture
                  </Pill>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-ink/10">
            <button
              type="button"
              onClick={() =>
                setEditModal({
                  isOpen: false,
                  pose: null,
                  name: "",
                  description: "",
                  file: null,
                  previewUrl: null,
                })
              }
              className="px-3 py-1.5 text-xs font-mono uppercase text-muted hover:text-ink"
            >
              Cancel
            </button>
            <Pill
              variant="primary"
              size="sm"
              onClick={handleConfirmEdit}
              disabled={!editModal.name.trim()}
              className="uppercase font-mono text-xs"
            >
              Save Changes
            </Pill>
          </div>
        </div>
      </Modal>

      {/* DELETE CONFIRMATION MODAL */}
      <Modal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, pose: null })}
      >
        <div className="p-6 bg-paper rounded-tile border border-ink/10 space-y-4 max-w-sm w-full mx-auto">
          <div className="flex items-center gap-2 text-danger">
            <Trash2 className="h-5 w-5" />
            <h3 className="font-display text-lg uppercase tracking-wide">
              Delete Pose?
            </h3>
          </div>

          <p className="text-xs text-ink leading-relaxed">
            Are you sure you want to delete &ldquo;{deleteModal.pose?.name}&rdquo;?
          </p>

          <p className="text-[11px] text-muted">
            Past photos using this pose will keep their media safely, and the guide picture will be removed from storage.
          </p>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setDeleteModal({ isOpen: false, pose: null })}
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
    </div>
  );
}
