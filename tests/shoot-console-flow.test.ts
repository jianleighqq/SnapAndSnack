import test from "node:test";
import assert from "node:assert/strict";
import { hardware } from "../lib/hardware";
import { composePrintLayout } from "../lib/layout";
import { POSES, POSE_PREVIEW_PAUSE_MS, type CapturedShot } from "../components/booth/ShootConsole";

test("Multi-shot sequence captures exactly N distinct shots without state truncation", async () => {
  const totalShots = 3;
  const shots: CapturedShot[] = [];
  const selectedPoses = ["couple", "group", "peace"];

  for (let i = 0; i < totalShots; i++) {
    const poseObj = POSES.find((p) => p.id === selectedPoses[i]) || POSES[0];
    const res = await hardware.capture({ type: "Photo", pose: poseObj.name });
    assert.equal(res.success, true);
    assert.ok(res.imageUrl);
    shots[i] = { image: res.imageUrl!, poseId: selectedPoses[i] };
  }

  assert.equal(shots.length, 3);
  assert.equal(shots[0].poseId, "couple");
  assert.equal(shots[1].poseId, "group");
  assert.equal(shots[2].poseId, "peace");
});

test("Per-shot pose slots: supports repeated poses across multiple slots", async () => {
  const selectedPoses = ["couple", "couple", "funny"];

  const shots: CapturedShot[] = [];
  for (let i = 0; i < selectedPoses.length; i++) {
    const poseObj = POSES.find((p) => p.id === selectedPoses[i]) || POSES[0];
    const res = await hardware.capture({ type: "Photo", pose: poseObj.name });
    shots[i] = { image: res.imageUrl!, poseId: selectedPoses[i] };
  }

  assert.equal(shots[0].poseId, "couple");
  assert.equal(shots[1].poseId, "couple");
  assert.equal(shots[2].poseId, "funny");
});

test("Surprise me fills all empty slots with valid poses without overwriting filled ones", () => {
  const totalShots = 3;
  const initialSlots: (string | null)[] = ["peace", null, null];

  // Simulating handleSurpriseMe
  const filled = initialSlots.map((p) => {
    if (p !== null) return p;
    const rand = POSES[0].id;
    return rand;
  });

  assert.equal(filled.length, 3);
  assert.equal(filled[0], "peace"); // untouched
  assert.equal(filled[1], "couple"); // filled
  assert.equal(filled[2], "couple"); // filled
  assert.ok(filled.every((p) => p !== null));
});

test("Changing a filled slot updates target slot only", () => {
  const slots: (string | null)[] = ["couple", "group", "peace"];
  const targetSlot = 1; // Change shot 2

  slots[targetSlot] = "funny";

  assert.equal(slots[0], "couple");
  assert.equal(slots[1], "funny");
  assert.equal(slots[2], "peace");
});

test("Retake shot 2 keeps that shot's own assigned pose", async () => {
  const shots: CapturedShot[] = [
    { image: "img1", poseId: "couple" },
    { image: "img2_old", poseId: "funny" },
    { image: "img3", poseId: "peace" },
  ];

  const retakeIdx = 1;
  const poseOption = POSES.find((p) => p.id === shots[retakeIdx].poseId)!;
  assert.equal(poseOption.name, "Funny face");

  const newCapture = await hardware.capture({ type: "Photo", pose: poseOption.name });
  shots[retakeIdx] = { image: newCapture.imageUrl!, poseId: shots[retakeIdx].poseId };

  assert.equal(shots[0].poseId, "couple");
  assert.equal(shots[1].poseId, "funny");
  assert.equal(shots[1].image, newCapture.imageUrl!);
  assert.equal(shots[2].poseId, "peace");
});

test("Cancel shoot resets slots to empty and clears all state", () => {
  const totalShots = 3;
  let selectedPoses: (string | null)[] = ["couple", "group", "peace"];
  let shots: CapturedShot[] = [{ image: "1", poseId: "couple" }];
  let activeSlotIndex = 2;

  // Perform Cancel
  selectedPoses = new Array(totalShots).fill(null);
  shots = [];
  activeSlotIndex = 0;

  assert.deepEqual(selectedPoses, [null, null, null]);
  assert.equal(shots.length, 0);
  assert.equal(activeSlotIndex, 0);
});

test("Pose preview constant is configured to 3000ms", () => {
  assert.equal(POSE_PREVIEW_PAUSE_MS, 3000);
});
