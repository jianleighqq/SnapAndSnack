import test from "node:test";
import assert from "node:assert/strict";
import { hardware } from "../lib/hardware";

test("hardware.capture returns a valid image placeholder on success", async () => {
  hardware.setMockError("camera", false);
  const result = await hardware.capture({ type: "Photo", pose: "Classic couple" });

  assert.equal(result.success, true);
  assert.ok(result.imageUrl);
  assert.ok(result.imageUrl.startsWith("data:image/svg+xml"));
});

test("hardware.capture fails gracefully when camera error is triggered", async () => {
  hardware.setMockError("camera", true);
  const result = await hardware.capture({ type: "Photo", pose: "Funny face" });

  assert.equal(result.success, false);
  assert.ok(result.message?.includes("Camera"));

  // Reset error
  hardware.setMockError("camera", false);
});

test("hardware.print resolves after delay, decrements paper, and checks paper count", async () => {
  hardware.setMockError("printer", false);
  await hardware.setPaperLoaded(2);

  const print1 = await hardware.print();
  assert.equal(print1.success, true);
  assert.equal(print1.paperLoaded, 1);

  const print2 = await hardware.print();
  assert.equal(print2.success, true);
  assert.equal(print2.paperLoaded, 0);

  // When paper reaches 0, it must fail with "Out of paper. Ask the operator."
  const print3 = await hardware.print();
  assert.equal(print3.success, false);
  assert.equal(print3.message, "Out of paper. Ask the operator.");
  assert.equal(print3.paperLoaded, 0);

  // Restore paper for subsequent runs
  await hardware.setPaperLoaded(18);
});

test("hardware.print fails when printer mock error is set", async () => {
  await hardware.setPaperLoaded(10);
  hardware.setMockError("printer", true);

  const result = await hardware.print();
  assert.equal(result.success, false);
  assert.ok(result.message?.includes("Printer error"));

  // Reset
  hardware.setMockError("printer", false);
});

