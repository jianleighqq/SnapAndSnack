"use client";

import React, { useState, useEffect } from "react";
import { SlidersHorizontal, Image, Camera } from "lucide-react";
import type { Event } from "@/lib/types";
import EventsList from "./EventsList";
import HardwareStatusPanel from "./HardwareStatusPanel";
import TemplatesTab from "./TemplatesTab";
import PosesTab from "./PosesTab";
import EventModal from "./EventModal";
import ConfirmModal from "./ConfirmModal";
import { Pill } from "@/components/ui/Pill";
import { Label } from "@/components/ui/Label";

interface EventSetupViewProps {
  initialEvents: Event[];
  initialActiveEvent: Event | null;
}

export default function EventSetupView({
  initialEvents,
  initialActiveEvent,
}: EventSetupViewProps) {
  const [events, setEvents] = useState<Event[]>(initialEvents);
  const [selectedEventId, setSelectedEventId] = useState<string>(
    initialActiveEvent?.id || initialEvents[0]?.id || ""
  );

  const [currentTab, setCurrentTab] = useState<"setup" | "templates" | "poses">("setup");

  // Modals state
  const [isAddEditModalOpen, setIsAddEditModalOpen] = useState(false);
  const [eventToEdit, setEventToEdit] = useState<Event | null>(null);

  // Confirmations
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    warningNote?: string | null;
    confirmLabel?: string;
    variant?: "primary" | "warning" | "danger";
    action?: () => Promise<void>;
  }>({
    isOpen: false,
    title: "",
    message: "",
  });

  const [isProcessingAction, setIsProcessingAction] = useState(false);

  const selectedEvent = events.find((e) => e.id === selectedEventId) || events[0] || null;
  const activeEvent = events.find((e) => e.status === "ACTIVE") || null;

  // Refetch / sync all events from the API route
  const refreshEvents = async (preferredId?: string) => {
    try {
      const res = await fetch("/api/events", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data.events && Array.isArray(data.events)) {
          setEvents(data.events);
          if (preferredId) {
            setSelectedEventId(preferredId);
          } else if (!data.events.some((e: Event) => e.id === selectedEventId) && data.events[0]) {
            setSelectedEventId(data.events[0].id);
          }
        }
      }
    } catch (err) {
      console.error("Failed to refresh events:", err);
    }
  };

  // On mount: clear legacy mock localStorage cache and load all events from API
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem("snap_mock_events");
      } catch {}
    }
    refreshEvents();
  }, []);

  // Open Add modal
  const handleOpenAddModal = () => {
    setEventToEdit(null);
    setIsAddEditModalOpen(true);
  };

  // Open Edit modal
  const handleOpenEditModal = (evt: Event) => {
    setEventToEdit(evt);
    setIsAddEditModalOpen(true);
  };

  // Save (Create or Update)
  const handleSaveEvent = async (inputData: any) => {
    const isEdit = !!eventToEdit;
    const res = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: isEdit ? "update" : "create",
        eventId: eventToEdit?.id,
        eventData: inputData,
      }),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || "Failed to save event");
    }

    const data = await res.json();
    const newTargetId = data.created?.id || data.updated?.id || eventToEdit?.id;

    // Always re-fetch the full list from the API route
    await refreshEvents(newTargetId);
  };

  // Set as Active action with confirmation
  const handleSetActive = (targetEvent: Event) => {
    if (targetEvent.status === "ACTIVE") return;

    setConfirmState({
      isOpen: true,
      title: "Set As Active Event",
      message: `Make "${targetEvent.name}" the currently active event? This event's title will display on the booth screen and queue system.`,
      warningNote: activeEvent
        ? `The current active event "${activeEvent.name}" will be returned to Scheduled status.`
        : null,
      confirmLabel: "Make Active",
      variant: "primary",
      action: async () => {
        setIsProcessingAction(true);
        try {
          const res = await fetch("/api/events", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "setActive", eventId: targetEvent.id }),
          });
          if (res.ok) {
            await refreshEvents(targetEvent.id);
          }
        } finally {
          setIsProcessingAction(false);
          setConfirmState((prev) => ({ ...prev, isOpen: false }));
        }
      },
    });
  };

  // Close Event action with queue check & confirmation
  const handleCloseEvent = async (targetEvent: Event) => {
    let hasQueue = false;
    try {
      const checkRes = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "checkQueue", eventId: targetEvent.id }),
      });
      if (checkRes.ok) {
        const checkData = await checkRes.json();
        hasQueue = !!checkData.hasActiveQueue;
      }
    } catch (e) {
      console.warn("Queue check error:", e);
    }

    setConfirmState({
      isOpen: true,
      title: "Close Event",
      message: `Are you sure you want to close "${targetEvent.name}"? Guests will no longer be able to enter the queue for this event.`,
      warningNote: hasQueue
        ? "Warning: There are still guests waiting or in-progress in the queue for this event!"
        : null,
      confirmLabel: "Close Event",
      variant: "warning",
      action: async () => {
        setIsProcessingAction(true);
        try {
          const res = await fetch("/api/events", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "close", eventId: targetEvent.id }),
          });
          if (res.ok) {
            await refreshEvents();
          }
        } finally {
          setIsProcessingAction(false);
          setConfirmState((prev) => ({ ...prev, isOpen: false }));
        }
      },
    });
  };

  // Delete Event action with confirmation
  const handleDeleteEvent = (targetEvent: Event) => {
    setConfirmState({
      isOpen: true,
      title: "Delete Event",
      message: `Are you sure you want to permanently delete "${targetEvent.name}"? This action cannot be undone.`,
      warningNote: targetEvent.status === "ACTIVE"
        ? "Caution: You are deleting the currently ACTIVE event. The booth screen will revert to default."
        : null,
      confirmLabel: "Delete Event",
      variant: "danger",
      action: async () => {
        setIsProcessingAction(true);
        try {
          const res = await fetch("/api/events", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "delete", eventId: targetEvent.id }),
          });
          if (res.ok) {
            await refreshEvents();
          }
        } finally {
          setIsProcessingAction(false);
          setConfirmState((prev) => ({ ...prev, isOpen: false }));
        }
      },
    });
  };

  // Update event shots_per_guest setting
  const handleUpdateEventShots = async (eventId: string, newShots: number) => {
    const target = events.find((e) => e.id === eventId);
    if (!target) return;
    const res = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update",
        eventId,
        eventData: {
          ...target,
          shots_per_guest: newShots,
        },
      }),
    });
    if (res.ok) {
      await refreshEvents(eventId);
    }
  };

  // Update event template_mode setting
  const handleUpdateEventMode = async (eventId: string, mode: "OPERATOR" | "GUEST") => {
    const target = events.find((e) => e.id === eventId);
    if (!target) return;
    const res = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update",
        eventId,
        eventData: {
          ...target,
          template_mode: mode,
        },
      }),
    });
    if (res.ok) {
      await refreshEvents(eventId);
    }
  };

  return (
    <div className="flex flex-col min-h-[580px] lg:h-[calc(100vh-10rem)]">
      {/* TABS ROW */}
      <div className="flex flex-wrap items-center gap-2 pb-4">
        {/* Setup & Diagnostics Tab */}
        <Pill
          variant={currentTab === "setup" ? "primary" : "secondary"}
          onClick={() => setCurrentTab("setup")}
          className="gap-2 cursor-pointer font-mono uppercase text-xs tracking-wider"
        >
          <SlidersHorizontal className={`h-4 w-4 ${currentTab === "setup" ? "text-accent" : ""}`} />
          <span>Setup &amp; Diagnostics</span>
        </Pill>

        {/* Templates Tab */}
        <Pill
          variant={currentTab === "templates" ? "primary" : "secondary"}
          onClick={() => setCurrentTab("templates")}
          className="gap-2 cursor-pointer font-mono uppercase text-xs tracking-wider"
        >
          <Image className={`h-4 w-4 ${currentTab === "templates" ? "text-accent" : ""}`} />
          <span>Templates</span>
        </Pill>

        {/* Poses Tab */}
        <Pill
          variant={currentTab === "poses" ? "primary" : "secondary"}
          onClick={() => setCurrentTab("poses")}
          className="gap-2 cursor-pointer font-mono uppercase text-xs tracking-wider"
        >
          <Camera className={`h-4 w-4 ${currentTab === "poses" ? "text-accent" : ""}`} />
          <span>Poses</span>
        </Pill>
      </div>

      {/* TWO COLUMN WORKSPACE */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-0 overflow-visible lg:overflow-hidden pb-8 lg:pb-0">
        {/* LEFT COLUMN: Events (4 columns) */}
        <div className="lg:col-span-4 h-auto lg:h-full min-h-0 flex flex-col">
          <EventsList
            events={events}
            selectedEventId={selectedEventId}
            onSelectEvent={(id) => setSelectedEventId(id)}
            onOpenAddModal={handleOpenAddModal}
          />
        </div>

        {/* RIGHT COLUMN: Tab Panel (8 columns) */}
        <div className="lg:col-span-8 h-auto lg:h-full min-h-0 flex flex-col">
          {currentTab === "setup" ? (
            <HardwareStatusPanel
              selectedEvent={selectedEvent}
              activeEvent={activeEvent}
              onEditEvent={handleOpenEditModal}
              onSetActive={handleSetActive}
              onCloseEvent={handleCloseEvent}
              onDeleteEvent={handleDeleteEvent}
            />
          ) : currentTab === "templates" ? (
            <TemplatesTab
              selectedEvent={selectedEvent}
              allEvents={events}
              onUpdateEventShots={handleUpdateEventShots}
              onUpdateEventMode={(m) => handleUpdateEventMode(selectedEvent.id, m)}
            />
          ) : (
            <PosesTab />
          )}
        </div>
      </div>

      {/* Event Add/Edit Modal */}
      <EventModal
        isOpen={isAddEditModalOpen}
        eventToEdit={eventToEdit}
        onClose={() => setIsAddEditModalOpen(false)}
        onSave={handleSaveEvent}
      />

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        warningNote={confirmState.warningNote}
        confirmLabel={confirmState.confirmLabel}
        variant={confirmState.variant}
        isLoading={isProcessingAction}
        onClose={() => setConfirmState((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={() => {
          if (confirmState.action) confirmState.action();
        }}
      />
    </div>
  );
}
