export interface TemplateSlot {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ImageDataLike {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

/**
 * Detects transparent rectangular windows in a frame overlay by scanning the alpha channel.
 * Alpha values below `alphaThreshold` are considered transparent window pixels.
 *
 * Scans rows and columns to find distinct transparent bounding boxes.
 * Returns slots sorted from top to bottom.
 */
export function detectTransparentWindows(
  image: ImageDataLike,
  options?: {
    alphaThreshold?: number; // 0..255 (default 30: anything lower is transparent)
    minAreaRatio?: number; // Minimum ratio of canvas area to reject tiny noise (default 0.01)
  }
): TemplateSlot[] {
  const { width, height, data } = image;
  const alphaThreshold = options?.alphaThreshold ?? 30;
  const minAreaRatio = options?.minAreaRatio ?? 0.01;
  const minArea = width * height * minAreaRatio;

  // 1. Identify transparent horizontal scanlines to locate window Y bands
  // A row has a transparent window if a contiguous run of transparent pixels exceeds width * 0.2
  const rowHasTransparentWindow = new Array<boolean>(height).fill(false);

  for (let y = 0; y < height; y++) {
    let run = 0;
    let maxRun = 0;
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const alpha = data[idx + 3];
      if (alpha <= alphaThreshold) {
        run++;
        if (run > maxRun) maxRun = run;
      } else {
        run = 0;
      }
    }
    // Consider this row part of a window if transparent run is at least 20% of width
    if (maxRun >= width * 0.2) {
      rowHasTransparentWindow[y] = true;
    }
  }

  // 2. Group consecutive rows into vertical bands [minY, maxY]
  interface YBand {
    minY: number;
    maxY: number;
  }
  const yBands: YBand[] = [];
  let currentBand: YBand | null = null;

  for (let y = 0; y < height; y++) {
    if (rowHasTransparentWindow[y]) {
      if (!currentBand) {
        currentBand = { minY: y, maxY: y };
      } else {
        currentBand.maxY = y;
      }
    } else {
      if (currentBand) {
        if (currentBand.maxY - currentBand.minY >= 20) {
          yBands.push(currentBand);
        }
        currentBand = null;
      }
    }
  }
  if (currentBand && currentBand.maxY - currentBand.minY >= 20) {
    yBands.push(currentBand);
  }

  // 3. For each vertical band, find horizontal bounds [minX, maxX]
  const slots: TemplateSlot[] = [];

  for (const band of yBands) {
    let minX = width;
    let maxX = 0;

    // Sample rows within this band (avoiding 1-2px border anti-aliasing)
    const startY = Math.min(band.minY + 2, band.maxY);
    const endY = Math.max(band.maxY - 2, band.minY);

    for (let y = startY; y <= endY; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const alpha = data[idx + 3];
        if (alpha <= alphaThreshold) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
        }
      }
    }

    if (maxX > minX) {
      const w = maxX - minX + 1;
      const h = band.maxY - band.minY + 1;
      if (w * h >= minArea) {
        slots.push({
          x: minX,
          y: band.minY,
          w,
          h,
        });
      }
    }
  }

  // Sort top-to-bottom
  slots.sort((a, b) => a.y - b.y);

  return slots;
}

/**
 * Computes evenly spaced default vertical photo slots for a canvas.
 * Used when an operator uploads only a background image or resets layout.
 */
export function generateDefaultSlots(
  canvasWidth: number,
  canvasHeight: number,
  shotsCount: number
): TemplateSlot[] {
  const count = Math.max(1, Math.min(4, Math.floor(shotsCount || 3)));

  // Standard strip proportions: horizontal padding ~8-10% of width
  const padX = Math.round(canvasWidth * 0.08);
  const slotW = canvasWidth - padX * 2;

  // Reserve ~12% for bottom branding, ~5% for top margin
  const topMargin = Math.round(canvasHeight * 0.05);
  const bottomMargin = Math.round(canvasHeight * 0.12);
  const availableH = canvasHeight - topMargin - bottomMargin;

  // Inter-slot vertical gap
  const gap = count > 1 ? Math.round(canvasHeight * 0.02) : 0;
  const totalGaps = (count - 1) * gap;
  const slotH = Math.round((availableH - totalGaps) / count);

  const slots: TemplateSlot[] = [];
  for (let i = 0; i < count; i++) {
    slots.push({
      x: padX,
      y: topMargin + i * (slotH + gap),
      w: slotW,
      h: slotH,
    });
  }

  return slots;
}

