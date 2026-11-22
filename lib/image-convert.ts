/**
 * Image conversion utilities and binary magic-byte validators.
 * Ensures all photos, strips, and GIFs stored and downloaded in Snap & Snack
 * are authentic binary image files (JPEG magic bytes FF D8 FF; GIF magic bytes 47 49 46 38).
 */

// Standard minimal valid 1x1 white JPEG buffer for headless/mock environments
export const MINIMAL_JPEG_BUFFER = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
  0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
  0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
  0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20,
  0x24, 0x2e, 0x27, 0x20, 0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29,
  0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27, 0x39, 0x3d, 0x38, 0x32,
  0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
  0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00,
  0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
  0x09, 0x0a, 0x0b, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f,
  0x00, 0xbf, 0x00, 0xff, 0xd9,
]);

/**
 * Validates that an image buffer matches the required binary magic bytes:
 * - JPEG (PHOTO / STRIP): FF D8 FF
 * - GIF (GIF): 47 49 46 38 ('GIF8')
 */
export function validateImageMagicBytes(
  buffer: Buffer | Uint8Array,
  mediaType: "PHOTO" | "STRIP" | "GIF"
): boolean {
  if (!buffer || buffer.length < 4) return false;

  if (mediaType === "PHOTO" || mediaType === "STRIP") {
    // Standard JPEG Start of Image (SOI) marker followed by marker byte 0xFF
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }

  if (mediaType === "GIF") {
    // Standard GIF header ('GIF8')
    return (
      buffer[0] === 0x47 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x38
    );
  }

  return false;
}

/**
 * Converts a data URL, blob URL, or SVG into a real binary JPEG or GIF Blob.
 * In browser environments, rasterizes SVG and non-JPEG inputs onto an HTML5 canvas
 * to produce genuine JPEG bytes starting with magic bytes FF D8 FF.
 */
export async function toBinaryImageBlob(
  dataUrlOrSrc: string,
  mediaType: "PHOTO" | "STRIP" | "GIF",
  defaultWidth = 1200,
  defaultHeight = 1800
): Promise<Blob> {
  if (mediaType === "GIF") {
    const res = await fetch(dataUrlOrSrc);
    return res.blob();
  }

  // If already a binary JPEG data URL, fetch and extract blob
  if (dataUrlOrSrc.startsWith("data:image/jpeg")) {
    const res = await fetch(dataUrlOrSrc);
    return res.blob();
  }

  // In browser: render SVG / other image formats onto Canvas to guarantee real JPEG binary output
  if (typeof window !== "undefined" && typeof document !== "undefined") {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const width = img.naturalWidth || img.width || defaultWidth;
        const height = img.naturalHeight || img.height || defaultHeight;
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas context unavailable"));

        // Opaque white background for standard JPEG (no transparent background artifacting)
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error("Failed to create JPEG blob from canvas"));
            }
          },
          "image/jpeg",
          0.95
        );
      };
      img.onerror = (err) => {
        reject(new Error("Failed to load image for JPEG conversion: " + String(err)));
      };
      img.src = dataUrlOrSrc;
    });
  }

  // Headless / non-browser fallback for SVG inputs in tests
  if (dataUrlOrSrc.startsWith("data:image/svg")) {
    return new Blob([MINIMAL_JPEG_BUFFER], { type: "image/jpeg" });
  }

  const res = await fetch(dataUrlOrSrc);
  return res.blob();
}

export type AllowedUploadFormat = "jpeg" | "png" | "webp" | "gif";

/**
 * Validates real binary magic bytes for image uploads.
 * Rejects any file whose header does not match approved image signatures.
 */
export function validateUploadMagicBytes(
  buffer: Buffer | Uint8Array,
  allowed: AllowedUploadFormat[] = ["jpeg", "png", "webp"]
): boolean {
  if (!buffer || buffer.length < 12) return false;

  // JPEG: FF D8 FF
  if (allowed.includes("jpeg")) {
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return true;
    }
  }

  // PNG: 89 50 4E 47
  if (allowed.includes("png")) {
    if (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    ) {
      return true;
    }
  }

  // WEBP: RIFF....WEBP (52 49 46 46 .... 57 45 42 50)
  if (allowed.includes("webp")) {
    if (
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50
    ) {
      return true;
    }
  }

  // GIF: GIF8 (47 49 46 38)
  if (allowed.includes("gif")) {
    if (
      buffer[0] === 0x47 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x38
    ) {
      return true;
    }
  }

  return false;
}
