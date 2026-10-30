import test from "node:test";
import assert from "node:assert/strict";
import { composePrintLayout } from "../lib/layout";

test("composePrintLayout generates dual vertical strips with cut line for STRIP layout", () => {
  const dummyShots = ["shot1_data", "shot2_data", "shot3_data"];
  const result = composePrintLayout({
    shots: dummyShots,
    layout: "STRIP",
    eventName: "Celebration Gala 2026",
  });

  assert.ok(result.startsWith("data:image/svg+xml"));
  const decodedSvg = decodeURIComponent(result.replace("data:image/svg+xml;charset=utf-8,", ""));

  assert.ok(decodedSvg.includes("CUT HERE"));
  assert.ok(decodedSvg.includes("CELEBRATION GALA 2026"));
  assert.ok(decodedSvg.includes('viewBox="0 0 1200 1800"'));
});

test("composePrintLayout adapts to different photo counts (1 to 4)", () => {
  for (let count = 1; count <= 4; count++) {
    const dummyShots = Array.from({ length: count }, (_, i) => `shot_${i + 1}`);
    const result = composePrintLayout({
      shots: dummyShots,
      layout: "STRIP",
      eventName: "Summer Festival",
    });
    assert.ok(result.startsWith("data:image/svg+xml"));
  }
});

test("composePrintLayout produces SINGLE portrait and GRID layouts", () => {
  const dummyShots = ["shot1", "shot2", "shot3", "shot4"];

  const single = composePrintLayout({
    shots: dummyShots,
    layout: "SINGLE",
    eventName: "Wedding Portrait",
  });
  assert.ok(single.includes(encodeURIComponent("Wedding Portrait".toUpperCase())));

  const grid = composePrintLayout({
    shots: dummyShots,
    layout: "GRID",
    eventName: "Class of 2026",
  });
  assert.ok(grid.includes(encodeURIComponent("Class of 2026".toUpperCase())));
});

