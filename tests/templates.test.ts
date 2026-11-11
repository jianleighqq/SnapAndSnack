import { test } from "node:test";
import assert from "node:assert";
import {
  detectTransparentWindows,
  generateDefaultSlots,
} from "../lib/template-detector";

test("generateDefaultSlots calculates valid slots within canvas bounds", () => {
  const canvasW = 600;
  const canvasH = 1800;
  const shots = 3;

  const slots = generateDefaultSlots(canvasW, canvasH, shots);
  assert.strictEqual(slots.length, 3);

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    // Check inside canvas bounds
    assert.ok(slot.x >= 0, `slot ${i} x out of bounds`);
    assert.ok(slot.y >= 0, `slot ${i} y out of bounds`);
    assert.ok(slot.x + slot.w <= canvasW, `slot ${i} width out of bounds`);
    assert.ok(slot.y + slot.h <= canvasH, `slot ${i} height out of bounds`);
    assert.ok(slot.w > 0 && slot.h > 0, `slot ${i} dimensions must be positive`);

    // Verify ordering top-to-bottom
    if (i > 0) {
      assert.ok(slot.y > slots[i - 1].y, `slot ${i} should be below slot ${i - 1}`);
    }
  }
});

test("generateDefaultSlots adapts to 1, 2, 3, and 4 shots", () => {
  for (const count of [1, 2, 3, 4]) {
    const slots = generateDefaultSlots(600, 1800, count);
    assert.strictEqual(slots.length, count);
  }
});

test("detectTransparentWindows identifies transparent window rectangles from pixel buffer", () => {
  const width = 200;
  const height = 400;
  // Create RGBA buffer (opaque white background: alpha = 255)
  const data = new Uint8Array(width * height * 4);
  data.fill(255);

  // Carve two transparent windows (alpha = 0)
  // Window 1: x: 20..179 (w=160), y: 40..179 (h=140)
  for (let y = 40; y <= 179; y++) {
    for (let x = 20; x <= 179; x++) {
      const idx = (y * width + x) * 4;
      data[idx + 3] = 0; // alpha = 0
    }
  }

  // Window 2: x: 20..179 (w=160), y: 220..359 (h=140)
  for (let y = 220; y <= 359; y++) {
    for (let x = 20; x <= 179; x++) {
      const idx = (y * width + x) * 4;
      data[idx + 3] = 0; // alpha = 0
    }
  }

  const detected = detectTransparentWindows({ width, height, data });
  assert.strictEqual(detected.length, 2);

  // Check Window 1
  assert.strictEqual(detected[0].x, 20);
  assert.strictEqual(detected[0].y, 40);
  assert.strictEqual(detected[0].w, 160);
  assert.strictEqual(detected[0].h, 140);

  // Check Window 2
  assert.strictEqual(detected[1].x, 20);
  assert.strictEqual(detected[1].y, 220);
  assert.strictEqual(detected[1].w, 160);
  assert.strictEqual(detected[1].h, 140);
});

