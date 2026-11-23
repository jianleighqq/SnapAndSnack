import { test } from "node:test";
import assert from "node:assert";
import {
  calculateFrameDelay,
  exceedsMaxBytes,
  bytesToDataUrl,
  getGifEncLib,
  DEFAULT_FRAME_DELAY_MS,
  DEFAULT_LAST_FRAME_PAUSE_MS,
  MAX_GIF_BYTES,
} from "../lib/gif";
import * as gifencModule from "gifenc";

const gifenc = (gifencModule as any).default || gifencModule;
const { GIFEncoder, quantize, applyPalette } = gifenc;

test("calculateFrameDelay applies 0.7s per frame and 0.5s pause on the last frame", () => {
  const totalFrames = 3;

  // Frame 1 (index 0): 700 ms (0.7 s)
  const delay0 = calculateFrameDelay(0, totalFrames, 700);
  assert.strictEqual(delay0, 700);

  // Frame 2 (index 1): 700 ms (0.7 s)
  const delay1 = calculateFrameDelay(1, totalFrames, 700);
  assert.strictEqual(delay1, 700);

  // Frame 3 (index 2, last frame): 700 ms + 500 ms = 1200 ms (0.7s + 0.5s pause)
  const delay2 = calculateFrameDelay(2, totalFrames, 700);
  assert.strictEqual(delay2, 1200);

  // Single frame fallback
  assert.strictEqual(calculateFrameDelay(0, 1, 700), 700);
});

test("exceedsMaxBytes accurately checks against size limits", () => {
  assert.strictEqual(exceedsMaxBytes(24 * 1024 * 1024), false);
  assert.strictEqual(exceedsMaxBytes(25 * 1024 * 1024), false);
  assert.strictEqual(exceedsMaxBytes(25 * 1024 * 1024 + 1), true);
  assert.strictEqual(exceedsMaxBytes(3 * 1024 * 1024 + 1, 3 * 1024 * 1024), true);
});

test("bytesToDataUrl encodes Uint8Array to data:image/gif;base64", () => {
  const sampleBytes = new Uint8Array([71, 73, 70, 56, 57, 97]); // "GIF89a"
  const dataUrl = bytesToDataUrl(sampleBytes);
  assert.ok(dataUrl.startsWith("data:image/gif;base64,"));
  assert.strictEqual(dataUrl, "data:image/gif;base64,R0lGODlh");
});

test("getGifEncLib resolves functions defensively without error", async () => {
  const lib = await getGifEncLib();
  assert.strictEqual(typeof lib.GIFEncoder, "function");
  assert.strictEqual(typeof lib.quantize, "function");
  assert.strictEqual(typeof lib.applyPalette, "function");

  // Verify GIFEncoder creates an encoder instance without 'new'
  const encoder = lib.GIFEncoder();
  assert.strictEqual(typeof encoder.writeFrame, "function");
  assert.strictEqual(typeof encoder.finish, "function");
  assert.strictEqual(typeof encoder.bytes, "function");
});

test("gifenc GIFEncoder produces valid looping GIF bytes with Netscape loop extension", () => {
  const gif = GIFEncoder();
  const width = 4;
  const height = 4;

  // Generate 2 dummy frames
  for (let f = 0; f < 2; f++) {
    const rgba = new Uint8Array(width * height * 4);
    for (let i = 0; i < rgba.length; i += 4) {
      rgba[i] = f === 0 ? 255 : 0; // Red vs Blue
      rgba[i + 1] = 0;
      rgba[i + 2] = f === 0 ? 0 : 255;
      rgba[i + 3] = 255;
    }
    const palette = quantize(rgba, 128);
    const index = applyPalette(rgba, palette);
    const delay = calculateFrameDelay(f, 2);

    gif.writeFrame(index, width, height, {
      palette,
      delay,
      repeat: f === 0 ? 0 : undefined,
    });
  }

  gif.finish();
  const bytes = gif.bytes();

  assert.ok(bytes.byteLength > 0);
  assert.ok(bytes.byteLength < MAX_GIF_BYTES);

  // Check GIF89a header
  const header = String.fromCharCode(...bytes.slice(0, 6));
  assert.strictEqual(header, "GIF89a");
});
