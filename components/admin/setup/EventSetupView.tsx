"use client";

import React, { useState } from "react";
import { Sparkles, SlidersHorizontal, Image, Camera } from "lucide-react";
import type { Event } from "@/lib/types";
import EventsList from "./EventsList";
import HardwareStatusPanel from "./HardwareStatusPanel";
import EventModal from "./EventModal";
import ConfirmModal from "./ConfirmModal";
import { Pill } from "@/components/ui/Pill";
import { Label } from "@/components/ui/Label";
import { StatusPill } from "@/components/ui/StatusPill";

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

  // Refetch / sync
  const refreshEvents = async () => {
    try {
      const res = await fetch("/api/events");
      if (res.ok) {
        const data = await res.json();
        if (data.events) {
          setEvents(data.events);
          if (!data.events.some((e: Event) => e.id === selectedEventId) && data.events[0]) {
            setSelectedEventId(data.events[0].id);
          }
        }
      }
    } catch (err) {
      console.error("Failed to refresh events:", err);
    }
  };

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
    if (data.events) {
      setEvents(data.events);
      if (data.created) setSelectedEventId(data.created.id);
      else if (data.updated) setSelectedEventId(data.updated.id);
    } else {
      await refreshEvents();
    }
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
            const data = await res.json();
            if (data.events) setEvents(data.events);
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
            const data = await res.json();
            if (data.events) setEvents(data.events);
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
            const data = await res.json();
            if (data.events) {
              setEvents(data.events);
              if (data.events[0]) setSelectedEventId(data.events[0].id);
            }
          }
        } finally {
          setIsProcessingAction(false);
          setConfirmState((prev) => ({ ...prev, isOpen: false }));
        }
      },
    });
  };

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)] min-h-[580px]">
      {/* TABS ROW */}
      <div className="flex items-center justify-between pb-4">
        <div className="flex items-center gap-2">
          {/* Active Tab */}
          <Pill variant="primary" className="gap-2">
            <SlidersHorizontal className="h-4 w-4 text-accent" />
            <span>Setup &amp; Diagnostics</span>
          </Pill>

          {/* Disabled Tab: Templates */}
          <div
            className="flex min-h-[44px] items-center gap-2 rounded-full px-4 text-sm font-medium text-muted cursor-not-allowed select-none bg-ink/5"
            title="Photo templates configuration is coming in the next phase"
          >
            <Image className="h-4 w-4 opacity-50" />
            <span>Templates</span>
            <Label className="text-[10px] opacity-60">Soon</Label>
          </div>

          {/* Disabled Tab: Poses */}
          <div
            className="flex min-h-[44px] items-center gap-2 rounded-full px-4 text-sm font-medium text-muted cursor-not-allowed select-none bg-ink/5"
            title="Guest pose prompt configuration is coming in the next phase"
          >
            <Camera className="h-4 w-4 opacity-50" />
            <span>Poses</span>
            <Label className="text-[10px] opacity-60">Soon</Label>
          </div>
        </div>

        {/* Mock Mode Tag */}
        <StatusPill tone="warn" icon={Sparkles}>
          Mock Mode
        </StatusPill>
      </div>

      {/* TWO COLUMN WORKSPACE */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-0 overflow-hidden">
        {/* LEFT COLUMN: Events (4 columns) */}
        <div className="lg:col-span-4 h-full min-h-0 flex flex-col">
          <EventsList
            events={events}
            selectedEventId={selectedEventId}
            onSelectEvent={(id) => setSelectedEventId(id)}
            onOpenAddModal={handleOpenAddModal}
          />
        </div>

        {/* RIGHT COLUMN: Hardware Status (8 columns) */}
        <div className="lg:col-span-8 h-full min-h-0 flex flex-col">
          <HardwareStatusPanel
            selectedEvent={selectedEvent}
            onEditEvent={handleOpenEditModal}
            onSetActive={handleSetActive}
            onCloseEvent={handleCloseEvent}
            onDeleteEvent={handleDeleteEvent}
          />
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
