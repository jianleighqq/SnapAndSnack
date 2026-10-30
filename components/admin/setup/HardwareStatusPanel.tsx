"use client";

import React, { useState, useEffect } from "react";
import {
  Camera,
  Printer,
  Cloud,
  CheckCircle2,
  AlertTriangle,
  RotateCw,
  Edit2,
  Check,
  Lock,
  Trash2,
  Plus,
  Minus,
  Info,
} from "lucide-react";
import type { Event } from "@/lib/types";
import {
  hardware,
  type CameraStatus,
  type PrinterStatus,
  type CloudStatus,
  type HardwareTestResult,
} from "@/lib/hardware";
import { Tile } from "@/components/ui/Tile";
import { Pill } from "@/components/ui/Pill";
import { Label } from "@/components/ui/Label";
import { StatusPill } from "@/components/ui/StatusPill";
import { cn } from "@/components/ui/cn";

interface HardwareStatusPanelProps {
  selectedEvent: Event | null;
  onEditEvent: (event: Event) => void;
  onSetActive: (event: Event) => void;
  onCloseEvent: (event: Event) => void;
  onDeleteEvent: (event: Event) => void;
}

export default function HardwareStatusPanel({
  selectedEvent,
  onEditEvent,
  onSetActive,
  onCloseEvent,
  onDeleteEvent,
}: HardwareStatusPanelProps) {
  // Hardware status state
  const [cameraStatus, setCameraStatus] = useState<CameraStatus | null>(null);
  const [printerStatus, setPrinterStatus] = useState<PrinterStatus | null>(null);
  const [cloudStatus, setCloudStatus] = useState<CloudStatus | null>(null);
  const [selectedCameraModel, setSelectedCameraModel] = useState("Sony a7 IV");

  // Loading states
  const [isCapturing, setIsCapturing] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isRecheckingCloud, setIsRecheckingCloud] = useState(false);

  // Result messages
  const [captureResult, setCaptureResult] = useState<HardwareTestResult | null>(null);
  const [printResult, setPrintResult] = useState<HardwareTestResult | null>(null);
  const [cloudResult, setCloudResult] = useState<HardwareTestResult | null>(null);

  // Dev error overrides
  const [devErrors, setDevErrors] = useState({
    camera: false,
    printer: false,
    cloud: false,
  });

  // Paper input state
  const [paperInput, setPaperInput] = useState<number>(18);

  const refreshAllHardware = async () => {
    try {
      const [cam, print, cloud] = await Promise.all([
        hardware.getCameraStatus(selectedCameraModel),
        hardware.getPrinterStatus(),
        hardware.getCloudStatus(),
      ]);
      setCameraStatus(cam);
      setPrinterStatus(print);
      setCloudStatus(cloud);
      setPaperInput(print.paperLoaded);
    } catch (err) {
      console.error("Failed to load hardware status:", err);
    }
  };

  useEffect(() => {
    refreshAllHardware();
    setDevErrors(hardware.getMockErrors());
  }, []);

  // Handle Camera switch
  const handleCameraChange = async (newModel: string) => {
    setSelectedCameraModel(newModel);
    const updated = await hardware.getCameraStatus(newModel);
    setCameraStatus(updated);
  };

  // Test Capture
  const handleTestCapture = async () => {
    setIsCapturing(true);
    setCaptureResult(null);
    try {
      const res = await hardware.testCapture(selectedCameraModel);
      setCaptureResult(res);
      const cam = await hardware.getCameraStatus(selectedCameraModel);
      setCameraStatus(cam);
    } catch (err: any) {
      setCaptureResult({
        success: false,
        message: err?.message || "Capture test failed (mock)",
        timestamp: new Date().toLocaleTimeString(),
      });
    } finally {
      setIsCapturing(false);
    }
  };

  // Test Print
  const handleTestPrint = async () => {
    setIsPrinting(true);
    setPrintResult(null);
    try {
      const res = await hardware.testPrint();
      setPrintResult(res);
      setPaperInput(res.paperLoaded);
      const print = await hardware.getPrinterStatus();
      setPrinterStatus(print);
    } catch (err: any) {
      setPrintResult({
        success: false,
        message: err?.message || "Print test failed (mock)",
        timestamp: new Date().toLocaleTimeString(),
      });
    } finally {
      setIsPrinting(false);
    }
  };

  // Paper input adjustment
  const handlePaperChange = async (newVal: number) => {
    const valid = Math.max(0, newVal);
    setPaperInput(valid);
    const updated = await hardware.setPaperLoaded(valid);
    setPrinterStatus(updated);
  };

  // Cloud recheck
  const handleRecheckCloud = async () => {
    setIsRecheckingCloud(true);
    setCloudResult(null);
    try {
      const updated = await hardware.recheckCloudStatus();
      setCloudStatus(updated);
      setCloudResult({
        success: updated.status === "READY",
        message:
          updated.status === "READY"
            ? `All cloud systems verified online at ${new Date().toLocaleTimeString()}. (mock)`
            : `Network or database connection issues detected at ${new Date().toLocaleTimeString()}. (mock)`,
        timestamp: new Date().toLocaleTimeString(),
      });
    } catch (err: any) {
      setCloudResult({
        success: false,
        message: err?.message || "Network recheck failed (mock)",
        timestamp: new Date().toLocaleTimeString(),
      });
    } finally {
      setIsRecheckingCloud(false);
    }
  };

  // Toggle Dev mock errors
  const toggleDevError = (device: "camera" | "printer" | "cloud") => {
    const nextVal = !devErrors[device];
    hardware.setMockError(device, nextVal);
    setDevErrors({ ...devErrors, [device]: nextVal });
    refreshAllHardware();
  };

  // Count issues
  const issuesCount =
    (cameraStatus?.status === "ERROR" ? 1 : 0) +
    (printerStatus?.status === "ERROR" ? 1 : 0) +
    (cloudStatus?.status === "ERROR" ? 1 : 0);

  return (
    <Tile tone="surface" className="flex flex-col h-full overflow-hidden">
      {/* Top Header with Summary Pill */}
      <div className="flex items-center justify-between p-4 border-b border-ink/10">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-xl uppercase tracking-tight text-ink">
            Hardware Status
          </h2>
          <span className="text-xs text-muted hidden sm:inline">
            for {selectedEvent ? selectedEvent.name : "selected event"}
          </span>
        </div>

        {/* Summary Pill */}
        {issuesCount === 0 ? (
          <StatusPill tone="ok" icon={CheckCircle2}>
            All systems online
          </StatusPill>
        ) : (
          <StatusPill tone="danger" icon={AlertTriangle}>
            {issuesCount} {issuesCount === 1 ? "issue" : "issues"} need attention
          </StatusPill>
        )}
      </div>

      {/* Selected Event Action Bar */}
      {selectedEvent && (
        <div className="bg-paper/60 border-b border-ink/10 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <Label tone="accent">Event:</Label>
            <span className="font-semibold text-ink text-sm uppercase">{selectedEvent.name}</span>
            <span className="font-mono bg-ink/5 px-2 py-0.5 rounded-full text-[11px] font-bold">
              {selectedEvent.event_code}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {selectedEvent.status !== "ACTIVE" && (
              <Pill
                variant="accent"
                onClick={() => onSetActive(selectedEvent)}
                className="gap-1 px-3.5 py-1.5 text-xs min-h-[36px]"
                title="Make this the currently active event for booth & queue"
              >
                <Check className="h-3.5 w-3.5" />
                <span>Set as Active</span>
              </Pill>
            )}

            {selectedEvent.status !== "CLOSED" && (
              <Pill
                variant="secondary"
                onClick={() => onCloseEvent(selectedEvent)}
                className="gap-1 px-3.5 py-1.5 text-xs min-h-[36px]"
                title="Mark this event as closed"
              >
                <Lock className="h-3.5 w-3.5" />
                <span>Close Event</span>
              </Pill>
            )}

            <Pill
              variant="secondary"
              onClick={() => onEditEvent(selectedEvent)}
              className="gap-1 px-3.5 py-1.5 text-xs min-h-[36px]"
              title="Edit event settings"
            >
              <Edit2 className="h-3.5 w-3.5" />
              <span>Edit</span>
            </Pill>

            <Pill
              variant="ghost"
              size="icon"
              onClick={() => onDeleteEvent(selectedEvent)}
              className="h-9 w-9 text-danger hover:bg-danger/10 hover:text-danger"
              title="Delete event"
              aria-label="Delete event"
            >
              <Trash2 className="h-4 w-4" />
            </Pill>
          </div>
        </div>
      )}

      {/* Cards Scrollable Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* CARD 1: Camera */}
        <Tile tone="paper" className="p-5 shadow-xs">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-surface rounded-full text-ink">
                <Camera className="h-5 w-5 text-accent" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-display text-lg uppercase tracking-tight text-ink">
                    Camera
                  </h3>
                  {cameraStatus?.status === "CONNECTED" ? (
                    <StatusPill tone="ok" icon={CheckCircle2}>
                      Connected
                    </StatusPill>
                  ) : (
                    <StatusPill tone="danger" icon={AlertTriangle}>
                      Error / Not Found
                    </StatusPill>
                  )}
                </div>
                <p className="text-xs text-muted font-medium mt-0.5">
                  {cameraStatus?.model} · {cameraStatus?.resolution}
                </p>
              </div>
            </div>

            {/* Test Capture Button */}
            <Pill
              variant="secondary"
              disabled={isCapturing}
              onClick={handleTestCapture}
              className="gap-1.5 text-xs min-h-[38px] px-3.5 shrink-0"
            >
              <RotateCw className={`h-3.5 w-3.5 ${isCapturing ? "animate-spin" : ""}`} />
              <span>{isCapturing ? "Capturing..." : "Test Capture"}</span>
            </Pill>
          </div>

          {/* Camera in use selector */}
          <div className="flex items-center gap-3 pt-3 border-t border-ink/10 text-xs">
            <Label tone="ink">Camera in use:</Label>
            <select
              id="camera-select"
              value={selectedCameraModel}
              onChange={(e) => handleCameraChange(e.target.value)}
              className="input-field min-h-[36px] w-auto py-1 px-3 rounded-full text-xs"
            >
              {cameraStatus?.availableModels.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              )) || (
                <>
                  <option value="Sony a7 IV">Sony a7 IV</option>
                  <option value="Sony a6700">Sony a6700</option>
                </>
              )}
            </select>
          </div>

          {/* Test Capture Result feedback */}
          {captureResult && (
            <div
              className={cn(
                "mt-3 p-3 text-xs rounded-xl",
                captureResult.success
                  ? "bg-ok/10 text-ok"
                  : "bg-danger/10 text-danger"
              )}
            >
              <div className="flex items-start gap-2">
                {captureResult.success ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="font-semibold">{captureResult.message}</div>
                  {captureResult.troubleshooting && (
                    <div className="text-[11px] font-medium mt-1">
                      Troubleshooting: {captureResult.troubleshooting}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </Tile>

        {/* CARD 2: Printer */}
        <Tile tone="paper" className="p-5 shadow-xs">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-surface rounded-full text-ink">
                <Printer className="h-5 w-5 text-accent" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-display text-lg uppercase tracking-tight text-ink">
                    Printer
                  </h3>
                  {printerStatus?.status === "READY" ? (
                    <StatusPill tone="ok" icon={CheckCircle2}>
                      Ready
                    </StatusPill>
                  ) : (
                    <StatusPill tone="danger" icon={AlertTriangle}>
                      Error / Check Paper
                    </StatusPill>
                  )}
                </div>
                <p className="text-xs text-muted font-medium mt-0.5">
                  Canon SELPHY CP1500 · 4x6" Dye-Sublimation Photo Printer
                </p>
              </div>
            </div>

            {/* Test Print Button */}
            <Pill
              variant="secondary"
              disabled={isPrinting}
              onClick={handleTestPrint}
              className="gap-1.5 text-xs min-h-[38px] px-3.5 shrink-0"
            >
              <RotateCw className={`h-3.5 w-3.5 ${isPrinting ? "animate-spin" : ""}`} />
              <span>{isPrinting ? "Printing..." : "Test Print"}</span>
            </Pill>
          </div>

          {/* Stats & Paper count editor */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-ink/10 text-xs">
            <div className="flex items-center gap-2">
              <Label>Prints this session:</Label>
              <span className="font-mono font-bold text-xs text-ink bg-surface px-2.5 py-1 rounded-full">
                {printerStatus?.printsThisSession ?? 0}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Label>Paper loaded:</Label>
              <div className="flex items-center bg-surface rounded-full p-0.5 border border-ink/10">
                <button
                  type="button"
                  onClick={() => handlePaperChange(paperInput - 1)}
                  className="interactive-secondary p-1 rounded-full text-ink"
                  title="Decrease paper count"
                  aria-label="Decrease paper count"
                >
                  <Minus className="h-3 w-3" />
                </button>
                <input
                  id="paper-loaded"
                  type="number"
                  min="0"
                  max="100"
                  value={paperInput}
                  onChange={(e) => handlePaperChange(Number(e.target.value))}
                  className="w-10 text-center text-xs font-mono font-bold bg-transparent focus:outline-none"
                  aria-label="Paper sheets loaded"
                />
                <button
                  type="button"
                  onClick={() => handlePaperChange(paperInput + 1)}
                  className="interactive-secondary p-1 rounded-full text-ink"
                  title="Increase paper count"
                  aria-label="Increase paper count"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
              <span className="text-[11px] text-muted">sheets</span>
            </div>
          </div>

          {/* Test Print Result feedback */}
          {printResult && (
            <div
              className={cn(
                "mt-3 p-3 text-xs rounded-xl",
                printResult.success
                  ? "bg-ok/10 text-ok"
                  : "bg-danger/10 text-danger"
              )}
            >
              <div className="flex items-start gap-2">
                {printResult.success ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="font-semibold">{printResult.message}</div>
                  {printResult.troubleshooting && (
                    <div className="text-[11px] font-medium mt-1">
                      Troubleshooting: {printResult.troubleshooting}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </Tile>

        {/* CARD 3: Network & Cloud */}
        <Tile tone="paper" className="p-5 shadow-xs">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-surface rounded-full text-ink">
                <Cloud className="h-5 w-5 text-accent" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-display text-lg uppercase tracking-tight text-ink">
                    Network &amp; Cloud
                  </h3>
                  {cloudStatus?.status === "READY" ? (
                    <StatusPill tone="ok" icon={CheckCircle2}>
                      Online
                    </StatusPill>
                  ) : (
                    <StatusPill tone="danger" icon={AlertTriangle}>
                      Disconnected
                    </StatusPill>
                  )}
                </div>
                <p className="text-xs text-muted font-medium mt-0.5">
                  Cloud synchronization and remote registration webhooks
                </p>
              </div>
            </div>

            {/* Recheck Button */}
            <Pill
              variant="secondary"
              disabled={isRecheckingCloud}
              onClick={handleRecheckCloud}
              className="gap-1.5 text-xs min-h-[38px] px-3.5 shrink-0"
            >
              <RotateCw className={`h-3.5 w-3.5 ${isRecheckingCloud ? "animate-spin" : ""}`} />
              <span>{isRecheckingCloud ? "Checking..." : "Recheck"}</span>
            </Pill>
          </div>

          {/* Network line items */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-3 border-t border-ink/10 text-xs">
            {/* Internet */}
            <div className="flex items-center justify-between p-3 bg-surface rounded-xl">
              <span className="font-medium text-ink">Internet</span>
              {cloudStatus?.internet ? (
                <span className="inline-flex items-center gap-1 text-ok font-semibold">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Connected</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-danger font-semibold">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span>Offline</span>
                </span>
              )}
            </div>

            {/* Database */}
            <div className="flex items-center justify-between p-3 bg-surface rounded-xl">
              <span className="font-medium text-ink">Database (Supabase)</span>
              {cloudStatus?.database === "Connected" ? (
                <span className="inline-flex items-center gap-1 text-ok font-semibold">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Connected</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-danger font-semibold">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span>Disconnected</span>
                </span>
              )}
            </div>

            {/* Webhook */}
            <div className="flex items-center justify-between p-3 bg-surface rounded-xl">
              <span className="font-medium text-ink">Registration Webhook</span>
              <span className="font-mono text-xs text-muted text-right truncate pl-2">
                {cloudStatus?.registrationWebhook.lastReceivedAt || "No recent registrations"}
              </span>
            </div>

            {/* Google Drive sync */}
            <div className="flex items-center justify-between p-3 bg-surface rounded-xl">
              <span className="font-medium text-ink">Google Drive Sync</span>
              <span className="font-mono text-[11px] text-muted">
                {cloudStatus?.googleDriveSync || "Off (optional)"}
              </span>
            </div>
          </div>

          {/* Cloud Recheck Result */}
          {cloudResult && (
            <div
              className={cn(
                "mt-3 p-3 text-xs rounded-xl",
                cloudResult.success
                  ? "bg-ok/10 text-ok"
                  : "bg-danger/10 text-danger"
              )}
            >
              <div className="flex items-center gap-2">
                {cloudResult.success ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                ) : (
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                )}
                <span className="font-semibold">{cloudResult.message}</span>
              </div>
            </div>
          )}
        </Tile>

        {/* Developer Diagnostics Toolbar */}
        {process.env.NODE_ENV === "development" && (
          <div className="p-4 bg-warn/10 rounded-2xl text-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold uppercase tracking-wider text-warn flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5" />
                Dev Diagnostics: Force Mock Errors
              </span>
              <Label className="text-[10px] text-warn">Dev Only</Label>
            </div>
            <div className="flex flex-wrap items-center gap-4 pt-1">
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={devErrors.camera}
                  onChange={() => toggleDevError("camera")}
                  className="accent-danger"
                />
                <span className="font-medium text-ink">Camera Error</span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={devErrors.printer}
                  onChange={() => toggleDevError("printer")}
                  className="accent-danger"
                />
                <span className="font-medium text-ink">Printer Error</span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={devErrors.cloud}
                  onChange={() => toggleDevError("cloud")}
                  className="accent-danger"
                />
                <span className="font-medium text-ink">Cloud Error</span>
              </label>
            </div>
          </div>
        )}
      </div>
    </Tile>
  );
}
