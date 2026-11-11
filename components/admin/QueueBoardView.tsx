"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Users,
  Clock,
  CheckCircle2,
  ArrowRight,
  ChevronRight,
  Wifi,
  WifiOff,
  UserPlus,
} from "lucide-react";
import type { Event, QueueEntryWithGuest } from "@/lib/types";
import QueueCustomerModal from "./QueueCustomerModal";
import AddGuestModal from "./AddGuestModal";
import { Pill } from "@/components/ui/Pill";
import { Label } from "@/components/ui/Label";
import { Tile } from "@/components/ui/Tile";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusPill } from "@/components/ui/StatusPill";
import { QueueStatusPill, queueNumberClasses } from "@/components/ui/QueueStatus";
import { cn } from "@/components/ui/cn";

interface QueueBoardViewProps {
  initialEvent: Event | null;
  initialQueue: QueueEntryWithGuest[];
}

export default function QueueBoardView({
  initialEvent,
  initialQueue,
}: QueueBoardViewProps) {
  const [currentEvent, setCurrentEvent] = useState<Event | null>(initialEvent);
  const [queue, setQueue] = useState<QueueEntryWithGuest[]>(initialQueue);
  const [selectedEntry, setSelectedEntry] = useState<QueueEntryWithGuest | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [showAddGuestModal, setShowAddGuestModal] = useState(false);

  // Request counter, active fetch lock, and abort controller to avoid race conditions and overlap
  const latestRequestIdRef = useRef<number>(0);
  const isFetchingRef = useRef<boolean>(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  // ONE single fetch function for both the poll and post-action refresh
  const fetchQueueData = useCallback(async (isActionRefresh = false) => {
    // Prevent starting a new poll if one is already active (unless this is a priority action refresh)
    if (isFetchingRef.current && !isActionRefresh) {
      return;
    }

    // Cancel in-flight poll if an action refresh takes precedence
    if (isActionRefresh && abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const reqId = ++latestRequestIdRef.current;
    const controller = new AbortController();
    abortControllerRef.current = controller;
    isFetchingRef.current = true;

    try {
      const res = await fetch("/api/queue", {
        cache: "no-store",
        signal: controller.signal,
        headers: {
          "Cache-Control": "no-store",
        },
      });

      // Ignore any response older than the latest request
      if (reqId !== latestRequestIdRef.current) return;

      if (!res.ok) {
        setIsOnline(false);
        return;
      }

      const data = await res.json();
      if (reqId !== latestRequestIdRef.current) return;

      setIsOnline(true);
      if ("event" in data) {
        setCurrentEvent(data.event || null);
      }
      if (Array.isArray(data.queue)) {
        setQueue(data.queue);
      }
    } catch (err: any) {
      if (err.name === "AbortError") return;
      if (reqId === latestRequestIdRef.current) {
        setIsOnline(false);
      }
    } finally {
      if (reqId === latestRequestIdRef.current) {
        isFetchingRef.current = false;
      }
    }
  }, []);

  // Poll loop: waits for previous request to finish before scheduling the next (no overlapping polls)
  useEffect(() => {
    let isMounted = true;

    const scheduleNextPoll = () => {
      if (!isMounted) return;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      pollTimerRef.current = setTimeout(runPoll, 5000);
    };

    const runPoll = async () => {
      if (!isMounted) return;
      await fetchQueueData(false);
      scheduleNextPoll();
    };

    // Run initial fetch and begin scheduled polling
    runPoll();

    const onFocus = () => {
      if (!isFetchingRef.current) {
        fetchQueueData(false);
      }
    };
    window.addEventListener("focus", onFocus);

    return () => {
      isMounted = false;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      window.removeEventListener("focus", onFocus);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchQueueData]);

  const handleAction = async (
    action: "start" | "remind" | "finish" | "cancel",
    queueId: string
  ) => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, queueId }),
        cache: "no-store",
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        const message = errJson.error || errJson.details || "Failed to perform action";
        throw new Error(message);
      }

      // Authoritative refresh using the ONE shared fetch function
      await fetchQueueData(true);

      const actionLabels = {
        start: "started shooting",
        remind: "reminder sent",
        finish: "marked completed",
        cancel: "booking cancelled",
      };
      showNotification(`Guest successfully ${actionLabels[action]}.`);
    } catch (err: any) {
      console.error(err);
      showNotification(err?.message || "Error: Action could not be completed.");
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const handleCallNext = async () => {
    if (!currentEvent) {
      showNotification("No active event. Set one in Event Setup.");
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "callNext" }),
        cache: "no-store",
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        const message = errJson.error || errJson.details || "Failed to advance queue";
        throw new Error(message);
      }

      const data = await res.json();
      if (data.message === "No guests waiting") {
        showNotification(data.message);
      } else {
        // Authoritative refresh using the ONE shared fetch function
        await fetchQueueData(true);
        showNotification("Advanced queue: Next guest called.");
      }
    } catch (err: any) {
      console.error(err);
      showNotification(err?.message || "Failed to advance queue.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddGuest = async (fullName: string, email: string) => {
    if (!currentEvent) {
      throw new Error("No active event. Please set one in Event Setup.");
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "addGuest", fullName, email }),
        cache: "no-store",
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Failed to add guest to queue");
      }

      // Authoritative refresh using the ONE shared fetch function
      await fetchQueueData(true);
      showNotification(`Added ${fullName} to queue.`);
    } catch (err: any) {
      console.error(err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const inProgress = queue.filter((q) => q.status === "IN_PROGRESS");
  const waiting = queue.filter((q) => q.status === "WAITING" || q.status === "REMINDED");
  const completed = queue.filter((q) => q.status === "COMPLETED");
  const cancelled = queue.filter((q) => q.status === "CANCELLED");

  // Tab filter: by default only show active guests so finished guests are removed
  const [filterTab, setFilterTab] = useState<"active" | "completed" | "all">("active");

  const activeQueue = queue.filter(
    (q) => q.status === "IN_PROGRESS" || q.status === "WAITING" || q.status === "REMINDED"
  );

  const displayedQueue =
    filterTab === "active"
      ? activeQueue
      : filterTab === "completed"
      ? completed
      : queue;

  // Keep modal in sync with updated entry if it changes
  const activeSelectedEntry = selectedEntry
    ? queue.find((q) => q.id === selectedEntry.id) || selectedEntry
    : null;

  const filterTabs = [
    { key: "active" as const, label: `Active (${activeQueue.length})` },
    { key: "completed" as const, label: `Completed (${completed.length})` },
    { key: "all" as const, label: `All (${queue.length})` },
  ];

  return (
    <div className="space-y-8">
      {/* Toast Notification */}
      {notification && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm text-paper">
          <span className="h-2 w-2 rounded-full bg-accent" />
          <span>{notification}</span>
        </div>
      )}

      {/* Header */}
      <PageHeader
        label="Operator console"
        title="Queue"
        accent="Board"
        description={
          currentEvent ? (
            <>
              Active event:{" "}
              <strong className="font-semibold text-ink">
                {currentEvent.name}
              </strong>{" "}
              <span className="font-mono text-xs">({currentEvent.event_code})</span>
            </>
          ) : (
            <span className="text-muted italic">
              No active event. Set one in Event Setup.
            </span>
          )
        }
        actions={
          <>
            <StatusPill
              tone={isOnline ? "ok" : "danger"}
              icon={isOnline ? Wifi : WifiOff}
              className="hidden sm:inline-flex"
            >
              {isOnline ? "Online" : "Offline"}
            </StatusPill>
            <Pill
              variant="secondary"
              onClick={() => setShowAddGuestModal(true)}
              disabled={isLoading || !currentEvent}
            >
              <UserPlus className="h-4 w-4" />
              <span>Add Guest</span>
            </Pill>
            <Pill
              variant="primary"
              onClick={handleCallNext}
              disabled={isLoading || waiting.length === 0}
            >
              <span>Call Next Guest</span>
              <ArrowRight className="h-4 w-4" />
            </Pill>
          </>
        }
      />

      {/* Stats Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Tile tone="accent" className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <Label tone="inherit" className="opacity-80">Now shooting</Label>
            <Users className="h-4 w-4" />
          </div>
          <div className="font-display text-6xl leading-none">{inProgress.length}</div>
        </Tile>

        <Tile tone="sun" className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <Label tone="inherit" className="opacity-70">Waiting in line</Label>
            <Clock className="h-4 w-4" />
          </div>
          <div className="font-display text-6xl leading-none">{waiting.length}</div>
        </Tile>

        <Tile tone="surface" className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <Label>Completed</Label>
            <CheckCircle2 className="h-4 w-4 text-ok" />
          </div>
          <div className="font-display text-6xl leading-none">{completed.length}</div>
        </Tile>
      </div>

      {/* Queue List */}
      <section>
        <div className="mb-4 flex flex-col justify-between gap-3 md:flex-row md:items-end">
          <div>
            <h2 className="font-display text-3xl uppercase leading-none">
              {filterTab === "active" ? "Active Queue" : filterTab === "completed" ? "Completed Guests" : "All Registrations"}
            </h2>
            <p className="mt-1.5 text-sm text-muted">
              {filterTab === "active" ? "Showing active guests in line. Finished guests are automatically removed." : "Click any customer to review details"}
            </p>
          </div>

          <div className="flex items-center gap-1.5">
            {filterTabs.map((tab) => (
              <Pill
                key={tab.key}
                variant={filterTab === tab.key ? "primary" : "ghost"}
                onClick={() => setFilterTab(tab.key)}
                className="px-4"
              >
                {tab.label}
              </Pill>
            ))}
          </div>
        </div>

        <div className="divide-y divide-ink/10 border-y border-ink/15">
          {displayedQueue.length === 0 ? (
            <div className="py-12 text-center">
              <Label>
                {filterTab === "active"
                  ? "No active guests in line. Any finished customers have been removed."
                  : filterTab === "completed"
                  ? "No completed guests yet."
                  : "No guests in the queue."}
              </Label>
            </div>
          ) : (
            displayedQueue.map((entry) => {
              const isInProgress = entry.status === "IN_PROGRESS";
              const isCancelled = entry.status === "CANCELLED";

              return (
                <div
                  key={entry.id}
                  onClick={() => setSelectedEntry(entry)}
                  className={cn(
                    "group flex cursor-pointer flex-col items-start justify-between gap-3 px-2 py-4 transition-colors hover:bg-surface/70 focus:outline-none focus-visible:bg-surface sm:flex-row sm:items-center",
                    isInProgress && "bg-accent/[0.06]",
                    isCancelled && "opacity-60"
                  )}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      setSelectedEntry(entry);
                    }
                  }}
                >
                  {/* Left: Queue # + Guest details */}
                  <div className="flex items-center gap-4">
                    <div
                      className={cn(
                        "flex h-12 w-12 shrink-0 items-center justify-center rounded-full font-display text-xl",
                        entry.status === "WAITING" ? "bg-surface text-ink" : queueNumberClasses(entry.status)
                      )}
                    >
                      #{entry.queue_number}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-semibold text-ink transition-colors group-hover:text-accent">
                          {entry.guest.full_name}
                        </h3>
                        {isInProgress && <Label tone="accent">Now shooting</Label>}
                      </div>
                      <p className="font-mono text-xs text-muted">
                        {entry.guest.email}
                      </p>
                    </div>
                  </div>

                  {/* Right: Status badge & Action Hint */}
                  <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-end">
                    <QueueStatusPill status={entry.status} />

                    {/* Manage hint (the whole row is the button) */}
                    <span className="flex items-center gap-1 rounded-full border border-ink/15 px-3 py-1.5 text-xs font-medium text-muted transition-colors group-hover:border-ink group-hover:bg-ink group-hover:text-paper">
                      <span>Manage</span>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
        {cancelled.length > 0 && filterTab !== "all" && (
          <p className="mt-3 text-right">
            <Label>{cancelled.length} cancelled</Label>
          </p>
        )}
      </section>

      {/* Customer Action Modal */}
      <QueueCustomerModal
        entry={activeSelectedEntry}
        onClose={() => setSelectedEntry(null)}
        onAction={handleAction}
        isLoading={isLoading}
      />

      {/* Walk-in Add Guest Modal */}
      <AddGuestModal
        isOpen={showAddGuestModal}
        onClose={() => setShowAddGuestModal(false)}
        onAdd={handleAddGuest}
        isLoading={isLoading}
      />
    </div>
  );
}
