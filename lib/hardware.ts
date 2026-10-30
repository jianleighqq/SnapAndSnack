export type HardwareStatusType = "CONNECTED" | "READY" | "WARNING" | "ERROR" | "OFFLINE";

export interface HardwareTestResult {
  success: boolean;
  message: string;
  timestamp: string;
  troubleshooting?: string;
}

export interface CameraStatus {
  status: HardwareStatusType;
  model: string;
  resolution: string;
  availableModels: string[];
}

export interface PrinterStatus {
  status: HardwareStatusType;
  model: string;
  printsThisSession: number;
  paperLoaded: number;
}

export interface CloudStatus {
  status: HardwareStatusType;
  internet: boolean;
  database: "Connected" | "Disconnected" | "Connecting";
  registrationWebhook: {
    status: "Healthy" | "Idle" | "Error";
    lastReceivedAt: string | null;
  };
  googleDriveSync: "Off (optional)";
}

export interface CaptureOptions {
  type?: "Photo" | "GIF" | "Video";
  pose?: string;
}

export interface CaptureResult {
  success: boolean;
  imageUrl?: string;
  message?: string;
}

export interface PrintResult {
  success: boolean;
  message: string;
  paperLoaded: number;
}

export interface IHardwareService {
  getCameraStatus(model?: string): Promise<CameraStatus>;
  testCapture(model?: string): Promise<HardwareTestResult>;
  capture(options?: CaptureOptions): Promise<CaptureResult>;
  getPrinterStatus(): Promise<PrinterStatus>;
  setPaperLoaded(count: number): Promise<PrinterStatus>;
  testPrint(): Promise<HardwareTestResult & { paperLoaded: number; printsThisSession: number }>;
  print(): Promise<PrintResult>;
  getCloudStatus(): Promise<CloudStatus>;
  recheckCloudStatus(): Promise<CloudStatus>;

  // Developer overrides for testing error UI
  setMockError(device: "camera" | "printer" | "cloud", forceError: boolean): void;
  getMockErrors(): { camera: boolean; printer: boolean; cloud: boolean };
}

const STORAGE_KEY_HARDWARE = "snap_mock_hardware";

class MockHardwareService implements IHardwareService {
  private selectedCamera = "Sony a7 IV";
  private printsThisSession = 0;
  private paperLoaded = 18; // Default 18-sheet SELPHY pack
  private lastWebhookTime = new Date(Date.now() - 15 * 60 * 1000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  private mockErrors = {
    camera: false,
    printer: false,
    cloud: false,
  };

  constructor() {
    this.hydrateFromStorage();
  }

  private hydrateFromStorage(): void {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(STORAGE_KEY_HARDWARE);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (typeof parsed.paperLoaded === "number") {
            this.paperLoaded = parsed.paperLoaded;
          }
          if (typeof parsed.printsThisSession === "number") {
            this.printsThisSession = parsed.printsThisSession;
          }
          if (parsed.mockErrors) {
            this.mockErrors = { ...this.mockErrors, ...parsed.mockErrors };
          }
        }
      } catch (err) {
        console.warn("Failed to load hardware state from localStorage:", err);
      }
    }
  }

  private persistToStorage(): void {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(
          STORAGE_KEY_HARDWARE,
          JSON.stringify({
            paperLoaded: this.paperLoaded,
            printsThisSession: this.printsThisSession,
            mockErrors: this.mockErrors,
          })
        );
      } catch (err) {
        console.warn("Failed to persist hardware state to localStorage:", err);
      }
    }
  }

  private delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  setMockError(device: "camera" | "printer" | "cloud", forceError: boolean): void {
    this.hydrateFromStorage();
    this.mockErrors[device] = forceError;
    this.persistToStorage();
  }

  getMockErrors() {
    this.hydrateFromStorage();
    return { ...this.mockErrors };
  }

  async getCameraStatus(model?: string): Promise<CameraStatus> {
    await this.delay(200);
    if (model) this.selectedCamera = model;

    if (this.mockErrors.camera) {
      return {
        status: "ERROR",
        model: this.selectedCamera,
        resolution: "No signal",
        availableModels: ["Sony a7 IV", "Sony a6700"],
      };
    }

    return {
      status: "CONNECTED",
      model: this.selectedCamera,
      resolution: "1080p live stream • 33MP capture",
      availableModels: ["Sony a7 IV", "Sony a6700"],
    };
  }

  async testCapture(model?: string): Promise<HardwareTestResult> {
    await this.delay(500);
    const camera = model || this.selectedCamera;
    const now = new Date().toLocaleTimeString();

    if (this.mockErrors.camera) {
      return {
        success: false,
        message: `Camera not found (${camera}). Connect it with USB, turn it on, then press Test Capture. (mock)`,
        timestamp: now,
        troubleshooting: "Check USB cable connection and verify camera is in PC Remote mode.",
      };
    }

    return {
      success: true,
      message: `Test frame captured successfully from ${camera} at ${now}. (mock)`,
      timestamp: now,
    };
  }

  async getPrinterStatus(): Promise<PrinterStatus> {
    await this.delay(200);

    if (this.mockErrors.printer || this.paperLoaded <= 0) {
      return {
        status: "ERROR",
        model: "Canon SELPHY CP1500",
        printsThisSession: this.printsThisSession,
        paperLoaded: this.paperLoaded,
      };
    }

    return {
      status: "READY",
      model: "Canon SELPHY CP1500",
      printsThisSession: this.printsThisSession,
      paperLoaded: this.paperLoaded,
    };
  }

  async setPaperLoaded(count: number): Promise<PrinterStatus> {
    this.paperLoaded = Math.max(0, count);
    this.persistToStorage();
    return this.getPrinterStatus();
  }

  async capture(options?: CaptureOptions): Promise<CaptureResult> {
    this.hydrateFromStorage();
    await this.delay(500);

    if (this.mockErrors.camera) {
      return {
        success: false,
        message: "Camera capture failed: device communication error. Check camera power and connection, then retry.",
      };
    }

    const type = options?.type || "Photo";
    const pose = options?.pose || "Classic couple";
    const timestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
      <rect width="800" height="600" fill="#1e1c1a"/>
      <rect x="24" y="24" width="752" height="552" rx="16" fill="#2a2724" stroke="#e8541e" stroke-width="2"/>
      <circle cx="400" cy="270" r="110" fill="#161513" stroke="#e8541e" stroke-width="4"/>
      <circle cx="400" cy="270" r="85" fill="#2a2724"/>
      <circle cx="400" cy="270" r="45" fill="#161513"/>
      <circle cx="420" cy="250" r="14" fill="#ffffff" opacity="0.8"/>
      <text x="400" y="440" text-anchor="middle" font-family="Inter, sans-serif" font-weight="700" font-size="28" fill="#f6f4f1" letter-spacing="2">${pose.toUpperCase()}</text>
      <text x="400" y="475" text-anchor="middle" font-family="monospace" font-size="16" fill="#e8541e" letter-spacing="3">${type.toUpperCase()} CAPTURE · ${timestamp}</text>
      <text x="400" y="530" text-anchor="middle" font-family="sans-serif" font-size="13" fill="#73706b" letter-spacing="4">SNAP &amp; SNACK STUDIO</text>
    </svg>`;

    const imageUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

    return {
      success: true,
      imageUrl,
      message: "Photo captured successfully.",
    };
  }

  async print(): Promise<PrintResult> {
    this.hydrateFromStorage();
    // Simulate printer job processing: 2 seconds as specified
    await this.delay(2000);

    if (this.paperLoaded <= 0) {
      return {
        success: false,
        message: "Out of paper. Ask the operator.",
        paperLoaded: 0,
      };
    }

    if (this.mockErrors.printer) {
      return {
        success: false,
        message: "Printer error: communication timeout. Check paper and retry.",
        paperLoaded: this.paperLoaded,
      };
    }

    this.paperLoaded -= 1;
    this.printsThisSession += 1;
    this.persistToStorage();
    this.persistToStorage();

    return {
      success: true,
      message: "Print completed successfully.",
      paperLoaded: this.paperLoaded,
    };
  }

  async testPrint(): Promise<HardwareTestResult & { paperLoaded: number; printsThisSession: number }> {
    await this.delay(600);
    const now = new Date().toLocaleTimeString();

    if (this.mockErrors.printer) {
      return {
        success: false,
        message: "Printer error: device communication failure or paper jam. Check the paper tray and feed slot, then press Test Print. (mock)",
        timestamp: now,
        troubleshooting: "Turn the printer off, clear any stuck sheets, verify cassette is seated, and power on.",
        paperLoaded: this.paperLoaded,
        printsThisSession: this.printsThisSession,
      };
    }

    if (this.paperLoaded <= 0) {
      return {
        success: false,
        message: "Out of paper. Load a fresh SELPHY postcard paper cassette, update 'Paper loaded', and retry. (mock)",
        timestamp: now,
        troubleshooting: "Load paper glossy side up in the tray.",
        paperLoaded: 0,
        printsThisSession: this.printsThisSession,
      };
    }

    this.paperLoaded -= 1;
    this.printsThisSession += 1;
    this.persistToStorage();

    return {
      success: true,
      message: `Test print job completed at ${now}. 1 sheet used. (mock)`,
      timestamp: now,
      paperLoaded: this.paperLoaded,
      printsThisSession: this.printsThisSession,
    };
  }

  async getCloudStatus(): Promise<CloudStatus> {
    await this.delay(200);

    if (this.mockErrors.cloud) {
      return {
        status: "ERROR",
        internet: false,
        database: "Disconnected",
        registrationWebhook: {
          status: "Error",
          lastReceivedAt: null,
        },
        googleDriveSync: "Off (optional)",
      };
    }

    return {
      status: "READY",
      internet: true,
      database: "Connected",
      registrationWebhook: {
        status: "Healthy",
        lastReceivedAt: `Today at ${this.lastWebhookTime}`,
      },
      googleDriveSync: "Off (optional)",
    };
  }

  async recheckCloudStatus(): Promise<CloudStatus> {
    await this.delay(500);
    return this.getCloudStatus();
  }
}

// Single instance exported behind interface
export const hardware: IHardwareService = new MockHardwareService();
