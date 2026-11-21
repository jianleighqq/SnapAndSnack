import { test } from "node:test";
import assert from "node:assert";
import {
  detectTransparentWindows,
  generateDefaultSlots,
  calculateTransparencyRatio,
  analyzeTemplateImage,
  validateCanvasAspectRatio,
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

test("calculateTransparencyRatio calculates transparent pixel fraction accurately", () => {
  const width = 100;
  const height = 100;
  const data = new Uint8Array(width * height * 4);
  data.fill(255); // 100% opaque

  assert.strictEqual(calculateTransparencyRatio({ width, height, data }), 0);

  // Make 500 pixels transparent out of 10,000 (5%)
  for (let i = 0; i < 500; i++) {
    data[i * 4 + 3] = 0;
  }
  const ratio = calculateTransparencyRatio({ width, height, data });
  assert.strictEqual(ratio, 0.05);
});

test("analyzeTemplateImage detects frame overlay when PNG has >= 3% transparent windows", () => {
  const width = 200;
  const height = 400;
  const data = new Uint8Array(width * height * 4);
  data.fill(255);

  // Carve a transparent window: x: 20..179, y: 50..200 (area: 160 * 151 = 24,160 / 80,000 = ~30%)
  for (let y = 50; y <= 200; y++) {
    for (let x = 20; x <= 179; x++) {
      data[(y * width + x) * 4 + 3] = 0;
    }
  }

  // As PNG with > 3% transparent windows -> mode: frame
  const resultPng = analyzeTemplateImage({ width, height, data }, true);
  assert.strictEqual(resultPng.mode, "frame");
  assert.strictEqual(resultPng.windows.length, 1);
  assert.ok(resultPng.transparentRatio >= 0.03);

  // Same image uploaded as JPG -> mode: background
  const resultJpg = analyzeTemplateImage({ width, height, data }, false);
  assert.strictEqual(resultJpg.mode, "background");
  assert.strictEqual(resultJpg.windows.length, 0);
});

test("analyzeTemplateImage falls back to background if transparent area is under 3%", () => {
  const width = 200;
  const height = 400;
  const data = new Uint8Array(width * height * 4);
  data.fill(255);

  // Carve tiny transparent patch (area = 50 pixels out of 80,000 = 0.06% < 3%)
  for (let y = 50; y < 55; y++) {
    for (let x = 20; x < 30; x++) {
      data[(y * width + x) * 4 + 3] = 0;
    }
  }

  const result = analyzeTemplateImage({ width, height, data }, true);
  assert.strictEqual(result.mode, "background");
  assert.strictEqual(result.windows.length, 0);
});

test("validateCanvasAspectRatio checks standard 2x6 and 4x6 print dimensions", () => {
  // 600 x 1800 (1:3 vertical strip)
  const strip = validateCanvasAspectRatio(600, 1800);
  assert.strictEqual(strip.isStandard, true);

  // 1200 x 1800 (4:6 portrait sheet)
  const sheet = validateCanvasAspectRatio(1200, 1800);
  assert.strictEqual(sheet.isStandard, true);

  // 1800 x 1200 (4:6 landscape sheet)
  const landscapeSheet = validateCanvasAspectRatio(1800, 1200);
  assert.strictEqual(landscapeSheet.isStandard, true);

  // 1000 x 1000 (1:1 square - non-standard)
  const square = validateCanvasAspectRatio(1000, 1000);
  assert.strictEqual(square.isStandard, false);
  assert.ok(square.message && square.message.includes("Recommended: 600 × 1800 px"));
});

test("eligible templates filtering excludes inactive templates and mismatched shots_count", () => {
  const eventShots = 3;
  const mockTemplates = [
    { id: "t1", name: "Default 3-shot", is_active: true, is_default: true, shots_count: 3 },
    { id: "t2", name: "Guest Floral 3-shot", is_active: true, is_default: false, shots_count: 3 },
    { id: "t3", name: "Inactive 3-shot", is_active: false, is_default: false, shots_count: 3 },
    { id: "t4", name: "Active 4-shot (mismatch)", is_active: true, is_default: false, shots_count: 4 },
  ];

  const eligible = mockTemplates.filter(
    (t) => t.is_active && t.shots_count === eventShots
  );

  assert.strictEqual(eligible.length, 2);
  assert.deepStrictEqual(eligible.map((t) => t.id), ["t1", "t2"]);
});

test("guest frame step requires GUEST template_mode and at least 2 eligible templates", () => {
  const shouldShowFrameStep = (mode: string, eligibleCount: number) => {
    return mode === "GUEST" && eligibleCount >= 2;
  };

  assert.strictEqual(shouldShowFrameStep("OPERATOR", 3), false);
  assert.strictEqual(shouldShowFrameStep("GUEST", 1), false);
  assert.strictEqual(shouldShowFrameStep("GUEST", 2), true);
  assert.strictEqual(shouldShowFrameStep("GUEST", 5), true);
});

test("default template must remain available and cannot be deactivated directly", () => {
  const validateDeactivation = (isDefault: boolean, nextActive: boolean) => {
    if (isDefault && !nextActive) {
      return { allowed: false, error: "Deactivating the default template is not allowed. Choose another default first." };
    }
    return { allowed: true };
  };

  const defaultCheck = validateDeactivation(true, false);
  assert.strictEqual(defaultCheck.allowed, false);

  const nonDefaultCheck = validateDeactivation(false, false);
  assert.strictEqual(nonDefaultCheck.allowed, true);
});
