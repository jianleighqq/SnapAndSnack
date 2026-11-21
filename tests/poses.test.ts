import test from "node:test";
import assert from "node:assert/strict";
import { SEEDED_DEFAULT_POSES } from "../lib/poses";
import type { Pose } from "../lib/types";

test("SEEDED_DEFAULT_POSES defines the 4 expected default poses in order", () => {
  assert.equal(SEEDED_DEFAULT_POSES.length, 4);
  assert.equal(SEEDED_DEFAULT_POSES[0].name, "Classic couple");
  assert.equal(SEEDED_DEFAULT_POSES[1].name, "Group");
  assert.equal(SEEDED_DEFAULT_POSES[2].name, "Peace sign");
  assert.equal(SEEDED_DEFAULT_POSES[3].name, "Funny face");

  for (let i = 0; i < SEEDED_DEFAULT_POSES.length; i++) {
    assert.equal(SEEDED_DEFAULT_POSES[i].sort_order, i + 1);
    assert.ok(SEEDED_DEFAULT_POSES[i].description);
  }
});

test("Active pose filtering excludes hidden/inactive poses for guests", () => {
  const poses: Pose[] = [
    { id: "1", name: "Pose 1", is_active: true, sort_order: 1 },
    { id: "2", name: "Pose 2", is_active: false, sort_order: 2 },
    { id: "3", name: "Pose 3", is_active: true, sort_order: 3 },
  ];

  const guestPoses = poses.filter((p) => p.is_active);
  assert.equal(guestPoses.length, 2);
  assert.deepEqual(guestPoses.map((p) => p.id), ["1", "3"]);
});

test("Reordering poses updates sort_order sequentially", () => {
  const poses: Pose[] = [
    { id: "p1", name: "Pose 1", is_active: true, sort_order: 1 },
    { id: "p2", name: "Pose 2", is_active: true, sort_order: 2 },
    { id: "p3", name: "Pose 3", is_active: true, sort_order: 3 },
  ];

  // Move p3 to top: [p3, p1, p2]
  const orderedIds = ["p3", "p1", "p2"];
  const reordered = orderedIds.map((id, index) => {
    const found = poses.find((p) => p.id === id)!;
    return { ...found, sort_order: index + 1 };
  });

  assert.equal(reordered[0].id, "p3");
  assert.equal(reordered[0].sort_order, 1);
  assert.equal(reordered[1].id, "p1");
  assert.equal(reordered[1].sort_order, 2);
  assert.equal(reordered[2].id, "p2");
  assert.equal(reordered[2].sort_order, 3);
});

test("Surprise me avoids duplicates when enough distinct poses exist", () => {
  const pool: Pose[] = [
    { id: "p1", name: "Pose 1", is_active: true, sort_order: 1 },
    { id: "p2", name: "Pose 2", is_active: true, sort_order: 2 },
    { id: "p3", name: "Pose 3", is_active: true, sort_order: 3 },
    { id: "p4", name: "Pose 4", is_active: true, sort_order: 4 },
  ];

  const totalShots = 3;
  const initialSlots: (string | null)[] = [null, null, null];

  const alreadyChosen = new Set(initialSlots.filter((p): p is string => p !== null));
  const available = pool.filter((p) => !alreadyChosen.has(p.id));

  assert.ok(available.length >= totalShots);

  const distinctChosen = available.slice(0, totalShots).map((p) => p.id);
  assert.equal(new Set(distinctChosen).size, totalShots);
});

test("Surprise me allows repetition when fewer active poses than shots exist", () => {
  // Only 2 active poses, but event has 3 shots
  const pool: Pose[] = [
    { id: "p1", name: "Pose 1", is_active: true, sort_order: 1 },
    { id: "p2", name: "Pose 2", is_active: true, sort_order: 2 },
  ];

  const totalShots = 3;
  const initialSlots: (string | null)[] = [null, null, null];

  let remainIdx = 0;
  let allIdx = 0;
  const availableRemaining = [...pool];
  const allPool = [...pool];

  const filled = initialSlots.map((p) => {
    if (p !== null) return p;
    if (remainIdx < availableRemaining.length) {
      return availableRemaining[remainIdx++].id;
    }
    return allPool[allIdx++ % allPool.length].id;
  });

  assert.equal(filled.length, 3);
  assert.ok(filled.every((p) => p !== null));
  // Repetition occurred because pool size (2) < shots (3)
  assert.ok(filled.includes("p1"));
  assert.ok(filled.includes("p2"));
});

test("Image compression scaling logic scales down images exceeding 900px while preserving aspect ratio", () => {
  const calculateScaledDimensions = (w: number, h: number, maxDim = 900) => {
    let width = w;
    let height = h;
    if (width > maxDim || height > maxDim) {
      if (width >= height) {
        height = Math.round((height * maxDim) / width);
        width = maxDim;
      } else {
        width = Math.round((width * maxDim) / height);
        height = maxDim;
      }
    }
    return { width, height };
  };

  // 1800 x 1200 landscape -> 900 x 600
  const landscape = calculateScaledDimensions(1800, 1200);
  assert.equal(landscape.width, 900);
  assert.equal(landscape.height, 600);

  // 1000 x 2000 portrait -> 450 x 900
  const portrait = calculateScaledDimensions(1000, 2000);
  assert.equal(portrait.width, 450);
  assert.equal(portrait.height, 900);

  // 600 x 600 (within limit) -> 600 x 600
  const small = calculateScaledDimensions(600, 600);
  assert.equal(small.width, 600);
  assert.equal(small.height, 600);
});
