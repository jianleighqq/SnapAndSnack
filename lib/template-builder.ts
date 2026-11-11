import type { TemplateSlot } from "./template-detector";

export interface RenderTemplateOptions {
  canvasWidth: number;
  canvasHeight: number;
  slots: TemplateSlot[];
  shots: string[]; // Data URLs or signed URLs of captured photos
  backgroundUrl?: string | null;
  frameUrl?: string | null;
}

/**
 * Loads an image from a URL or data URL into an HTMLImageElement with CORS enabled.
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error(`Failed to load image from source: ${src.substring(0, 50)}...`));
    img.src = src;
  });
}

/**
 * Draws an image with center-crop ("cover" aspect ratio) within a destination rectangle [dx, dy, dw, dh].
 */
function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number
) {
  const imgW = img.naturalWidth || img.width;
  const imgH = img.naturalHeight || img.height;

  const targetAspect = dw / dh;
  const imgAspect = imgW / imgH;

  let sx = 0;
  let sy = 0;
  let sw = imgW;
  let sh = imgH;

  if (imgAspect > targetAspect) {
    // Image is wider than slot: crop horizontal sides
    sw = imgH * targetAspect;
    sx = (imgW - sw) / 2;
  } else {
    // Image is taller than slot: crop vertical sides
    sh = imgW / targetAspect;
    sy = (imgH - sh) / 2;
  }

  ctx.save();
  // Clip strictly to slot boundary
  ctx.beginPath();
  ctx.rect(dx, dy, dw, dh);
  ctx.clip();
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
  ctx.restore();
}

/**
 * Renders a complete photo strip canvas using an event template:
 * 1. Background image (behind everything)
 * 2. Captured photos center-cropped into each slot
 * 3. Frame overlay (on top of everything)
 *
 * Exports a high-quality JPEG data URL (quality 0.92) matching the template's pixel dimensions.
 */
export async function renderTemplateStrip(options: RenderTemplateOptions): Promise<string> {
  const {
    canvasWidth,
    canvasHeight,
    slots,
    shots,
    backgroundUrl,
    frameUrl,
  } = options;

  if (typeof document === "undefined") {
    throw new Error("renderTemplateStrip requires a browser environment with Canvas support");
  }

  const canvas = document.createElement("canvas");
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not acquire 2D canvas context");

  // Fill solid paper background by default before drawing assets
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // 1. Draw Background Image (drawn BEHIND the photos)
  if (backgroundUrl) {
    try {
      const bgImg = await loadImage(backgroundUrl);
      ctx.drawImage(bgImg, 0, 0, canvasWidth, canvasHeight);
    } catch (err) {
      console.warn("Could not load template background image:", err);
    }
  }

  // 2. Draw each kept shot into its designated slot (center-cropped)
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    const shotSrc = shots[i];
    if (!slot || !shotSrc) continue;

    try {
      const shotImg = await loadImage(shotSrc);
      drawImageCover(ctx, shotImg, slot.x, slot.y, slot.w, slot.h);
    } catch (err) {
      console.warn(`Could not load shot #${i + 1}:`, err);
      // Fallback placeholder tile inside slot
      ctx.fillStyle = "#1e1c1a";
      ctx.fillRect(slot.x, slot.y, slot.w, slot.h);
    }
  }

  // 3. Draw Frame Overlay (drawn ON TOP of the photos)
  if (frameUrl) {
    try {
      const frameImg = await loadImage(frameUrl);
      ctx.drawImage(frameImg, 0, 0, canvasWidth, canvasHeight);
    } catch (err) {
      console.warn("Could not load template frame overlay:", err);
    }
  }

  return canvas.toDataURL("image/jpeg", 0.92);
}

/**
 * Creates a standard 4x6 print sheet (1200 x 1800 px) for the STRIP layout.
 * Places two identical vertical strips side-by-side with a subtle dashed cut line in the middle.
 */
export async function composeDualPrintSheet(
  stripDataUrl: string,
  options?: {
    sheetWidth?: number;
    sheetHeight?: number;
  }
): Promise<string> {
  const sheetW = options?.sheetWidth ?? 1200;
  const sheetH = options?.sheetHeight ?? 1800;

  if (typeof document === "undefined") {
    throw new Error("composeDualPrintSheet requires browser canvas");
  }

  const canvas = document.createElement("canvas");
  canvas.width = sheetW;
  canvas.height = sheetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not acquire 2D canvas context");

  // White base paper
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, sheetW, sheetH);

  const stripImg = await loadImage(stripDataUrl);
  const halfW = sheetW / 2; // 600px each

  // Draw Left Strip (0 -> 600)
  ctx.drawImage(stripImg, 0, 0, halfW, sheetH);

  // Draw Right Strip (600 -> 1200)
  ctx.drawImage(stripImg, halfW, 0, halfW, sheetH);

  // Central dashed cut line
  ctx.save();
  ctx.strokeStyle = "rgba(22, 21, 19, 0.25)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.moveTo(halfW, 0);
  ctx.lineTo(halfW, sheetH);
  ctx.stroke();
  ctx.restore();

  return canvas.toDataURL("image/jpeg", 0.95);
}

