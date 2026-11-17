export interface GifGenerationOptions {
  width?: number;
  paletteColors?: 128 | 256;
  frameDelayMs?: number; // default 700ms (0.7s)
  lastFramePauseMs?: number; // default 500ms (0.5s pause, total 1200ms)
  maxBytes?: number; // default 3 MB
}

export interface GifResult {
  dataUrl: string;
  byteLength: number;
  width: number;
  height: number;
}

export interface GifEncLib {
  GIFEncoder: (options?: any) => any;
  quantize: (rgba: Uint8Array | Uint8ClampedArray | number[], maxColors: number, options?: any) => number[][];
  applyPalette: (rgba: Uint8Array | Uint8ClampedArray | number[], palette: number[][], format?: string) => Uint8Array;
}

export const DEFAULT_GIF_WIDTH = 480;
export const DEFAULT_FRAME_DELAY_MS = 700; // 0.7 s
export const DEFAULT_LAST_FRAME_PAUSE_MS = 500; // 0.5 s pause
export const MAX_GIF_BYTES = 3 * 1024 * 1024; // 3 MB

let cachedLib: GifEncLib | null = null;

/**
 * Defensively loads gifenc with a dynamic import to handle CJS/ESM interop across all bundlers.
 */
export async function getGifEncLib(): Promise<GifEncLib> {
  if (cachedLib) return cachedLib;

  const mod: any = await import("gifenc");
  // Resolve CJS / ESM interop defensively
  const lib =
    typeof mod.GIFEncoder === "function"
      ? mod
      : typeof mod.default?.GIFEncoder === "function"
      ? mod.default
      : (mod.default ?? mod);

  const { GIFEncoder, quantize, applyPalette } = lib;

  if (typeof GIFEncoder !== "function") {
    throw new TypeError(
      `GIFEncoder is not a function (resolved from gifenc exports: ${Object.keys(lib || {}).join(", ")})`
    );
  }
  if (typeof quantize !== "function") {
    throw new TypeError("quantize is not a function in gifenc");
  }
  if (typeof applyPalette !== "function") {
    throw new TypeError("applyPalette is not a function in gifenc");
  }

  cachedLib = { GIFEncoder, quantize, applyPalette };
  return cachedLib;
}

/**
 * Calculates frame delay in milliseconds:
 * 0.7s per frame, with an added 0.5s pause on the last frame (total 1.2s).
 */
export function calculateFrameDelay(
  frameIndex: number,
  totalFrames: number,
  baseDelayMs: number = DEFAULT_FRAME_DELAY_MS,
  lastFramePauseMs: number = DEFAULT_LAST_FRAME_PAUSE_MS
): number {
  if (totalFrames <= 1) return baseDelayMs;
  return frameIndex === totalFrames - 1 ? baseDelayMs + lastFramePauseMs : baseDelayMs;
}

/**
 * Checks whether GIF bytes exceed the maximum allowed size.
 */
export function exceedsMaxBytes(byteLength: number, maxBytes: number = MAX_GIF_BYTES): boolean {
  return byteLength > maxBytes;
}

/**
 * Loads an image from a Data URL or URL into an HTMLImageElement.
 */
function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      return reject(new Error("Image loading requires a browser environment"));
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load frame image for animated GIF"));
    img.src = src;
  });
}

/**
 * Encodes an array of HTMLImageElements into a GIF Uint8Array with the specified settings.
 */
function encodeFrames(
  images: HTMLImageElement[],
  width: number,
  paletteColors: 128 | 256,
  baseDelayMs: number,
  lastFramePauseMs: number,
  lib: GifEncLib
): { bytes: Uint8Array; width: number; height: number } {
  const { GIFEncoder, quantize, applyPalette } = lib;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    throw new Error("Unable to create canvas 2d context for GIF encoding");
  }

  // Calculate height from the first image's aspect ratio
  const first = images[0];
  const aspect = first.naturalHeight && first.naturalWidth ? first.naturalHeight / first.naturalWidth : 1;
  const height = Math.round(width * aspect);

  canvas.width = width;
  canvas.height = height;

  // Called without new as per gifenc API
  const gif = GIFEncoder();

  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    const imgData = ctx.getImageData(0, 0, width, height);
    const rgba = new Uint8Array(imgData.data.buffer, imgData.data.byteOffset, imgData.data.byteLength);

    // Quantize palette from frame pixel data
    const palette = quantize(rgba, paletteColors, { format: "rgb565" });
    const index = applyPalette(rgba, palette, "rgb565");

    const delay = calculateFrameDelay(i, images.length, baseDelayMs, lastFramePauseMs);

    // repeat: 0 on the first frame configures infinite loop in GIF Netscape block
    gif.writeFrame(index, width, height, {
      palette,
      delay,
      repeat: i === 0 ? 0 : undefined,
    });
  }

  gif.finish();
  return { bytes: gif.bytes(), width, height };
}

/**
 * Converts a Uint8Array into a data:image/gif;base64 string.
 */
export function bytesToDataUrl(bytes: Uint8Array): string {
  let binary = "";
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `data:image/gif;base64,${btoa(binary)}`;
}

/**
 * Generates an animated looping GIF from an array of image data URLs.
 * Settings:
 * - 480 px width (maintains shot aspect ratio)
 * - 0.7 s per frame, infinite loop
 * - 0.5 s pause on the last frame
 * - Palette of 256 colors (auto-reduced to 128 colors or 360px if > 3 MB)
 */
export async function createAnimatedGif(
  imageUrls: string[],
  options: GifGenerationOptions = {}
): Promise<GifResult> {
  if (!imageUrls || imageUrls.length === 0) {
    throw new Error("No images provided for GIF generation");
  }

  const baseDelayMs = options.frameDelayMs ?? DEFAULT_FRAME_DELAY_MS;
  const lastPauseMs = options.lastFramePauseMs ?? DEFAULT_LAST_FRAME_PAUSE_MS;
  const maxBytes = options.maxBytes ?? MAX_GIF_BYTES;

  // Defensively resolve gifenc functions before processing
  const lib = await getGifEncLib();

  // Load all images concurrently
  const loadedImages = await Promise.all(imageUrls.map(loadImageElement));

  // Attempt 1: Target 480px, 256 colors
  let targetWidth = options.width ?? DEFAULT_GIF_WIDTH;
  let paletteColors: 128 | 256 = options.paletteColors ?? 256;

  let { bytes, width, height } = encodeFrames(
    loadedImages,
    targetWidth,
    paletteColors,
    baseDelayMs,
    lastPauseMs,
    lib
  );

  // Attempt 2: If exceeds 3 MB, try 128 colors
  if (exceedsMaxBytes(bytes.byteLength, maxBytes) && paletteColors === 256) {
    paletteColors = 128;
    const retry = encodeFrames(loadedImages, targetWidth, paletteColors, baseDelayMs, lastPauseMs, lib);
    bytes = retry.bytes;
    width = retry.width;
    height = retry.height;
  }

  // Attempt 3: If still exceeds 3 MB, downscale width to 360px with 128 colors
  if (exceedsMaxBytes(bytes.byteLength, maxBytes)) {
    targetWidth = 360;
    paletteColors = 128;
    const retry = encodeFrames(loadedImages, targetWidth, paletteColors, baseDelayMs, lastPauseMs, lib);
    bytes = retry.bytes;
    width = retry.width;
    height = retry.height;
  }

  return {
    dataUrl: bytesToDataUrl(bytes),
    byteLength: bytes.byteLength,
    width,
    height,
  };
}
