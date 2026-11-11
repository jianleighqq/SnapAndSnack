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
  print(imageUrl?: string): Promise<PrintResult>;
  getCloudStatus(): Promise<CloudStatus>;
  recheckCloudStatus(): Promise<CloudStatus>;

  // Developer overrides for testing error UI
  setMockError(device: "camera" | "printer" | "cloud", forceError: boolean): void;
  getMockErrors(): { camera: boolean; printer: boolean; cloud: boolean };

  // Webcam stream lifecycle for browser preview
  initCamera?(): Promise<CameraStatus>;
  startStream?(videoElement: HTMLVideoElement): Promise<MediaStream | null>;
  stopStream?(): void;
  getStream?(): MediaStream | null;
}

export type HardwareGateway = IHardwareService;

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

  async print(imageUrl?: string): Promise<PrintResult> {
    this.hydrateFromStorage();
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

/**
 * Real Webcam & Browser Print Implementation of HardwareGateway.
 * Grabs video from getUserMedia, captures un-mirrored frames to canvas,
 * and prints 4x6 strips via browser print dialog.
 */
export class WebcamHardware implements IHardwareService {
  private stream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private permissionDenied = false;
  private paperLoaded = 999;
  private printsThisSession = 0;
  private mockErrors = {
    camera: false,
    printer: false,
    cloud: false,
  };

  setMockError(device: "camera" | "printer" | "cloud", forceError: boolean): void {
    this.mockErrors[device] = forceError;
  }

  getMockErrors() {
    return { ...this.mockErrors };
  }

  async initCamera(): Promise<CameraStatus> {
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      return {
        status: "OFFLINE",
        model: "Webcam",
        resolution: "Unavailable (SSR)",
        availableModels: ["Webcam"],
      };
    }

    try {
      if (!this.stream || !this.stream.active) {
        this.stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1920, min: 1280 },
            height: { ideal: 1080, min: 720 },
            facingMode: "user",
          },
          audio: false,
        });
        this.permissionDenied = false;
      }

      if (this.videoElement && this.videoElement.srcObject !== this.stream) {
        this.videoElement.srcObject = this.stream;
        await this.videoElement.play().catch(() => {});
      }

      const videoTrack = this.stream.getVideoTracks()[0];
      const settings = videoTrack?.getSettings();
      const resolution = settings?.width && settings?.height
        ? `${settings.width}×${settings.height} live stream`
        : "1080p live stream";
      const label = videoTrack?.label || "Built-in Webcam";

      return {
        status: "READY",
        model: label,
        resolution,
        availableModels: [label],
      };
    } catch (err: any) {
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        this.permissionDenied = true;
        return {
          status: "ERROR",
          model: "Webcam (Permission Denied)",
          resolution: "Permission denied by user or system",
          availableModels: [],
        };
      }
      if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        return {
          status: "ERROR",
          model: "No Camera Found",
          resolution: "No camera detected",
          availableModels: [],
        };
      }
      return {
        status: "ERROR",
        model: "Webcam Error",
        resolution: err.message || "Failed to initialize camera",
        availableModels: [],
      };
    }
  }

  async startStream(videoElement: HTMLVideoElement): Promise<MediaStream | null> {
    this.videoElement = videoElement;
    await this.initCamera();
    if (this.stream && this.videoElement) {
      this.videoElement.srcObject = this.stream;
      try {
        await this.videoElement.play();
      } catch (e) {
        console.warn("Video play interrupted:", e);
      }
    }
    return this.stream;
  }

  stopStream(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    if (this.videoElement) {
      this.videoElement.srcObject = null;
      this.videoElement = null;
    }
  }

  getStream(): MediaStream | null {
    return this.stream;
  }

  async getCameraStatus(): Promise<CameraStatus> {
    if (this.mockErrors.camera) {
      return {
        status: "ERROR",
        model: "Webcam",
        resolution: "No signal (mock error)",
        availableModels: ["Built-in Webcam"],
      };
    }

    if (typeof window === "undefined" || !navigator.mediaDevices) {
      return {
        status: "OFFLINE",
        model: "Webcam",
        resolution: "Server environment",
        availableModels: ["Built-in Webcam"],
      };
    }

    if (this.stream && this.stream.active) {
      const track = this.stream.getVideoTracks()[0];
      const settings = track?.getSettings();
      const resolution = settings?.width && settings?.height
        ? `${settings.width}×${settings.height} live stream`
        : "1080p live stream";
      return {
        status: "READY",
        model: track?.label || "Built-in Webcam",
        resolution,
        availableModels: [track?.label || "Built-in Webcam"],
      };
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((d) => d.kind === "videoinput");

      if (videoDevices.length === 0) {
        return {
          status: "ERROR",
          model: "No camera found",
          resolution: "No video input devices detected",
          availableModels: [],
        };
      }

      if (this.permissionDenied) {
        return {
          status: "ERROR",
          model: "Webcam (Permission denied)",
          resolution: "Permission denied",
          availableModels: [],
        };
      }

      const first = videoDevices[0];
      const modelName = first.label || "Built-in Webcam";

      return {
        status: "READY",
        model: modelName,
        resolution: "Webcam ready",
        availableModels: videoDevices.map((d, i) => d.label || `Camera ${i + 1}`),
      };
    } catch (err: any) {
      return {
        status: "ERROR",
        model: "Webcam Error",
        resolution: err.message || "Unable to inspect camera",
        availableModels: [],
      };
    }
  }

  async testCapture(model?: string): Promise<HardwareTestResult> {
    const now = new Date().toLocaleTimeString();
    if (this.mockErrors.camera) {
      return {
        success: false,
        message: "Camera error: device communication failure. (mock error)",
        timestamp: now,
        troubleshooting: "Check browser camera permissions.",
      };
    }

    const result = await this.capture({ type: "Photo", pose: "Test capture" });
    if (!result.success) {
      return {
        success: false,
        message: result.message || "Failed to capture test frame from webcam.",
        timestamp: now,
        troubleshooting: "Ensure camera is allowed in browser settings and not in use by another application.",
      };
    }

    return {
      success: true,
      message: `Test frame captured successfully from webcam at ${now}.`,
      timestamp: now,
    };
  }

  /**
   * Captures a frame from the live video stream.
   * Frame is drawn UN-MIRRORED to the canvas so the output photo preserves natural orientation.
   */
  async capture(options?: CaptureOptions): Promise<CaptureResult> {
    if (this.mockErrors.camera) {
      return {
        success: false,
        message: "Camera capture failed: device communication error (mock error triggered).",
      };
    }

    if (typeof window === "undefined" || typeof document === "undefined") {
      return {
        success: false,
        message: "Webcam capture is only supported in browser environments.",
      };
    }

    if (!this.stream || !this.stream.active) {
      await this.initCamera();
    }

    if (!this.stream || !this.stream.active) {
      return {
        success: false,
        message: this.permissionDenied
          ? "Camera permission denied. Please allow camera access in browser settings."
          : "No active camera stream available for capture.",
      };
    }

    try {
      let video = this.videoElement;
      let createdTempVideo = false;

      if (!video || !video.videoWidth) {
        createdTempVideo = true;
        video = document.createElement("video");
        video.srcObject = this.stream;
        video.muted = true;
        video.playsInline = true;
        await video.play();

        if (!video.videoWidth) {
          await new Promise<void>((resolve) => {
            if (video) video.onloadedmetadata = () => resolve();
            setTimeout(resolve, 600);
          });
        }
      }

      const width = video.videoWidth || 1920;
      const height = video.videoHeight || 1080;

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        return { success: false, message: "Could not create canvas context for capture." };
      }

      // Draw standard un-mirrored frame onto canvas
      ctx.drawImage(video, 0, 0, width, height);

      if (createdTempVideo) {
        video.pause();
        video.srcObject = null;
      }

      const imageUrl = canvas.toDataURL("image/jpeg", 0.95);

      return {
        success: true,
        imageUrl,
        message: "Photo captured successfully from webcam.",
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Webcam capture failed: ${err.message || String(err)}`,
      };
    }
  }

  async getPrinterStatus(): Promise<PrinterStatus> {
    if (this.mockErrors.printer || this.paperLoaded <= 0) {
      return {
        status: "ERROR",
        model: "System Default Printer (Browser 4×6)",
        printsThisSession: this.printsThisSession,
        paperLoaded: this.paperLoaded,
      };
    }

    return {
      status: "READY",
      model: "System Default Printer (Browser 4×6)",
      printsThisSession: this.printsThisSession,
      paperLoaded: this.paperLoaded,
    };
  }

  async setPaperLoaded(count: number): Promise<PrinterStatus> {
    this.paperLoaded = Math.max(0, count);
    return this.getPrinterStatus();
  }

  async print(imageUrl?: string): Promise<PrintResult> {
    if (this.mockErrors.printer) {
      return {
        success: false,
        message: "Printer error: communication timeout (mock error triggered).",
        paperLoaded: this.paperLoaded,
      };
    }

    if (typeof window === "undefined") {
      return {
        success: false,
        message: "Printing is only available in browser environments.",
        paperLoaded: this.paperLoaded,
      };
    }

    if (!imageUrl) {
      return {
        success: false,
        message: "No print image provided.",
        paperLoaded: this.paperLoaded,
      };
    }

    try {
      await this.triggerBrowserPrint(imageUrl);
      this.printsThisSession += 1;
      return {
        success: true,
        message: "Print dialog opened for 4×6 paper.",
        paperLoaded: this.paperLoaded,
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Print failed: ${err.message || String(err)}`,
        paperLoaded: this.paperLoaded,
      };
    }
  }

  async testPrint(): Promise<HardwareTestResult & { paperLoaded: number; printsThisSession: number }> {
    const now = new Date().toLocaleTimeString();

    if (this.mockErrors.printer) {
      return {
        success: false,
        message: "Printer error: device communication failure. (mock error)",
        timestamp: now,
        troubleshooting: "Verify browser print permissions and default printer setup.",
        paperLoaded: this.paperLoaded,
        printsThisSession: this.printsThisSession,
      };
    }

    const testSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1800" viewBox="0 0 1200 1800">
      <rect width="1200" height="1800" fill="#f6f4f1"/>
      <rect x="40" y="40" width="1120" height="1720" rx="20" fill="#ffffff" stroke="#161513" stroke-width="4"/>
      <text x="600" y="300" text-anchor="middle" font-family="Impact, sans-serif" font-size="72" fill="#161513" letter-spacing="4">SNAP &amp; SNACK</text>
      <text x="600" y="380" text-anchor="middle" font-family="monospace" font-size="28" fill="#e8541e" letter-spacing="4">4×6 TEST PRINT · ${now}</text>
      <rect x="150" y="480" width="900" height="900" rx="16" fill="#ecebe7" stroke="#161513" stroke-width="2"/>
      <circle cx="600" cy="930" r="160" fill="#161513"/>
      <text x="600" y="950" text-anchor="middle" font-family="sans-serif" font-size="44" fill="#f6f4f1" font-weight="bold">TEST FRAME</text>
      <text x="600" y="1520" text-anchor="middle" font-family="monospace" font-size="24" fill="#73706b">VERIFY 4×6 SIZE &amp; MARGINS</text>
    </svg>`;
    const testUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(testSvg)}`;

    try {
      await this.triggerBrowserPrint(testUrl);
      this.printsThisSession += 1;
      return {
        success: true,
        message: `Print dialog opened for 4×6 test page at ${now}.`,
        timestamp: now,
        paperLoaded: this.paperLoaded,
        printsThisSession: this.printsThisSession,
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Test print failed: ${err.message || String(err)}`,
        timestamp: now,
        paperLoaded: this.paperLoaded,
        printsThisSession: this.printsThisSession,
      };
    }
  }

  async getCloudStatus(): Promise<CloudStatus> {
    const isOnline = typeof navigator !== "undefined" ? navigator.onLine : true;
    if (this.mockErrors.cloud || !isOnline) {
      return {
        status: "ERROR",
        internet: isOnline,
        database: "Disconnected",
        registrationWebhook: { status: "Error", lastReceivedAt: null },
        googleDriveSync: "Off (optional)",
      };
    }

    return {
      status: "READY",
      internet: true,
      database: "Connected",
      registrationWebhook: { status: "Healthy", lastReceivedAt: "Connected" },
      googleDriveSync: "Off (optional)",
    };
  }

  async recheckCloudStatus(): Promise<CloudStatus> {
    return this.getCloudStatus();
  }

  /**
   * Helper that creates an invisible print iframe with @page { size: 4in 6in; margin: 0; }
   * and triggers window.print() inside it without disturbing the main UI.
   */
  private triggerBrowserPrint(imageUrl: string): Promise<void> {
    return new Promise((resolve) => {
      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "none";
      iframe.style.visibility = "hidden";
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow?.document;
      if (!doc) {
        document.body.removeChild(iframe);
        window.print();
        resolve();
        return;
      }

      doc.open();
      doc.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Snap &amp; Snack Print</title>
            <style>
              @page {
                size: 4in 6in;
                margin: 0;
              }
              @media print {
                html, body {
                  margin: 0 !important;
                  padding: 0 !important;
                  width: 4in !important;
                  height: 6in !important;
                  overflow: hidden !important;
                  background: white !important;
                  -webkit-print-color-adjust: exact !important;
                  print-color-adjust: exact !important;
                }
                .print-container {
                  width: 100%;
                  height: 100%;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                }
                .print-container img {
                  width: 100%;
                  height: 100%;
                  object-fit: contain;
                  display: block;
                }
              }
              body {
                margin: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                background: white;
              }
              img {
                max-width: 100%;
                max-height: 100%;
              }
            </style>
          </head>
          <body>
            <div class="print-container">
              <img id="print-img" src="${imageUrl}" alt="Print photo strip" />
            </div>
          </body>
        </html>
      `);
      doc.close();

      const img = doc.getElementById("print-img") as HTMLImageElement | null;
      const runPrint = () => {
        setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
          } catch (e) {
            console.warn("Iframe print error, falling back to window.print():", e);
            window.print();
          }
          setTimeout(() => {
            if (iframe.parentNode) {
              document.body.removeChild(iframe);
            }
            resolve();
          }, 1000);
        }, 300);
      };

      if (img && !img.complete) {
        img.onload = runPrint;
        img.onerror = () => runPrint();
      } else {
        runPrint();
      }
    });
  }
}

/**
 * Returns current hardware mode from environment.
 * Default is "mock", switchable to "webcam".
 */
export function getHardwareMode(): "mock" | "webcam" {
  if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_HARDWARE_MODE === "webcam") {
    return "webcam";
  }
  return "mock";
}

/**
 * Factory creating either real WebcamHardware or MockHardwareService.
 */
export function createHardwareGateway(): HardwareGateway {
  const mode = getHardwareMode();
  if (mode === "webcam") {
    return new WebcamHardware();
  }
  return new MockHardwareService();
}

// Single instance exported behind HardwareGateway interface
export const hardware: HardwareGateway = createHardwareGateway();
