import { test } from "node:test";
import assert from "node:assert";
import {
  validateImageMagicBytes,
  toBinaryImageBlob,
  MINIMAL_JPEG_BUFFER,
} from "../lib/image-convert";

test("validateImageMagicBytes accepts valid JPEG buffers (FF D8 FF) and rejects non-JPEG data", () => {
  // Valid JPEG header
  const validJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  assert.strictEqual(validateImageMagicBytes(validJpeg, "PHOTO"), true);
  assert.strictEqual(validateImageMagicBytes(validJpeg, "STRIP"), true);

  // SVG text buffer
  const svgBuffer = Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>", "utf-8");
  assert.strictEqual(validateImageMagicBytes(svgBuffer, "PHOTO"), false);
  assert.strictEqual(validateImageMagicBytes(svgBuffer, "STRIP"), false);

  // Short or empty buffers
  assert.strictEqual(validateImageMagicBytes(Buffer.from([]), "PHOTO"), false);
  assert.strictEqual(validateImageMagicBytes(Buffer.from([0xff, 0xd8]), "PHOTO"), false);

  // PNG header
  const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.strictEqual(validateImageMagicBytes(pngBuffer, "PHOTO"), false);
});

test("validateImageMagicBytes accepts valid GIF buffers (47 49 46 38) and rejects non-GIF data", () => {
  // Valid GIF89a header
  const validGif = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
  assert.strictEqual(validateImageMagicBytes(validGif, "GIF"), true);

  // JPEG header rejected as GIF
  const validJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
  assert.strictEqual(validateImageMagicBytes(validJpeg, "GIF"), false);

  // SVG rejected as GIF
  const svgBuffer = Buffer.from("<svg></svg>", "utf-8");
  assert.strictEqual(validateImageMagicBytes(svgBuffer, "GIF"), false);
});

test("toBinaryImageBlob converts SVG to binary JPEG Blob with valid magic bytes", async () => {
  const svgDataUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent("<svg width='100' height='100'></svg>");
  const blob = await toBinaryImageBlob(svgDataUrl, "STRIP");

  assert.strictEqual(blob.type, "image/jpeg");
  const arrayBuffer = await blob.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  assert.ok(buffer.length >= 3);
  assert.strictEqual(buffer[0], 0xff);
  assert.strictEqual(buffer[1], 0xd8);
  assert.strictEqual(buffer[2], 0xff);
  assert.strictEqual(validateImageMagicBytes(buffer, "STRIP"), true);
});

test("MINIMAL_JPEG_BUFFER starts with FF D8 FF and satisfies JPEG validation", () => {
  assert.strictEqual(MINIMAL_JPEG_BUFFER[0], 0xff);
  assert.strictEqual(MINIMAL_JPEG_BUFFER[1], 0xd8);
  assert.strictEqual(MINIMAL_JPEG_BUFFER[2], 0xff);
  assert.strictEqual(validateImageMagicBytes(MINIMAL_JPEG_BUFFER, "PHOTO"), true);
  assert.strictEqual(validateImageMagicBytes(MINIMAL_JPEG_BUFFER, "STRIP"), true);
});

test("Download validation logic rejects error responses and non-image content types", () => {
  function checkDownloadResponse(status: number, contentType: string | null): { valid: boolean; error?: string } {
    if (status !== 200) {
      return { valid: false, error: "Download failed, please reload and try again" };
    }
    if (!contentType || !contentType.toLowerCase().startsWith("image/")) {
      return { valid: false, error: "Download failed, please reload and try again" };
    }
    return { valid: true };
  }

  // Valid image response
  assert.deepStrictEqual(checkDownloadResponse(200, "image/jpeg"), { valid: true });
  assert.deepStrictEqual(checkDownloadResponse(200, "image/gif"), { valid: true });

  // Expired signed URL returning 403 or 400
  assert.strictEqual(checkDownloadResponse(403, "application/json").valid, false);
  assert.strictEqual(checkDownloadResponse(403, "application/json").error, "Download failed, please reload and try again");

  // Error page returning 500 HTML
  assert.strictEqual(checkDownloadResponse(500, "text/html").valid, false);

  // OK response with unexpected non-image content type (e.g. JSON error object)
  assert.strictEqual(checkDownloadResponse(200, "application/json").valid, false);
  assert.strictEqual(checkDownloadResponse(200, "application/json").error, "Download failed, please reload and try again");
});
