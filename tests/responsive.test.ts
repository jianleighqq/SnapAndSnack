import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

test("app/layout.tsx exports valid responsive viewport configuration", () => {
  const filePath = path.resolve(process.cwd(), "app/layout.tsx");
  const content = fs.readFileSync(filePath, "utf-8");

  assert.ok(content.includes("export const viewport: Viewport"), "Viewport configuration should be exported");
  assert.ok(content.includes('width: "device-width"'), "Viewport width should be device-width");
  assert.ok(content.includes("initialScale: 1"), "Viewport initialScale should be 1");
});

test("BoothAttractScreen layout includes mobile vertical stack and clamped fluid headings", () => {
  const filePath = path.resolve(process.cwd(), "components/booth/BoothAttractScreen.tsx");
  const content = fs.readFileSync(filePath, "utf-8");

  // Mobile vertical stack and desktop rail separation
  assert.ok(content.includes("md:hidden"), "Should include mobile vertical stack (< md)");
  assert.ok(content.includes("hidden md:grid"), "Should include desktop rail grid (md:)");

  // Overflow and horizontal scroll prevention
  assert.ok(content.includes("overflow-x-hidden"), "Outer wrapper should prevent horizontal overflow");
  assert.ok(content.includes("max-w-full"), "Outer wrapper should constrain max width");

  // Logo on one line
  assert.ok(content.includes("whitespace-nowrap"), "Logo/Brand text should have whitespace-nowrap");

  // Config button collapses on small screens
  assert.ok(content.includes("hidden sm:inline"), "Config Settings text should be hidden on phones");

  // Fluid heading clamp
  assert.ok(content.includes("clamp("), "Headline should use fluid clamp sizing");
});

test("OperatorNav ensures one-line logo and mobile 44px tap targets", () => {
  const filePath = path.resolve(process.cwd(), "components/admin/OperatorNav.tsx");
  const content = fs.readFileSync(filePath, "utf-8");

  // Logo stays on one line
  assert.ok(content.includes("whitespace-nowrap"), "Brand text must stay on one line");

  // Touch target >= 44px
  assert.ok(content.includes("min-h-[44px]"), "Interactive items must have min 44px tap targets");
});

test("QueueBoardView collapses queue list into cards on mobile", () => {
  const filePath = path.resolve(process.cwd(), "components/admin/QueueBoardView.tsx");
  const content = fs.readFileSync(filePath, "utf-8");

  // Responsive filter tabs
  assert.ok(content.includes("flex-wrap"), "Filter tabs should wrap on small screens");

  // Card layout on mobile (< sm)
  assert.ok(content.includes("rounded-tile bg-surface"), "Queue items should render as rounded cards on mobile");

  // Mobile manage tap target >= 44px
  assert.ok(content.includes("min-h-[44px]"), "Manage button should provide min-h-[44px] tap target on mobile");
});

test("ShootConsole supports fluid scrolling and responsive shot grids", () => {
  const filePath = path.resolve(process.cwd(), "components/booth/ShootConsole.tsx");
  const content = fs.readFileSync(filePath, "utf-8");

  // Scrollable container for portrait tablets / smaller viewports
  assert.ok(content.includes("overflow-y-auto"), "Main console container should support vertical scrolling");

  // 4-slot grid adapts on smaller screens
  assert.ok(content.includes("grid-cols-2 sm:grid-cols-4"), "4-slot shot sequence should adapt on narrow viewports");
});

test("HardwareStatusPanel wraps card headers and provides >= 44px tap targets", () => {
  const filePath = path.resolve(process.cwd(), "components/admin/setup/HardwareStatusPanel.tsx");
  const content = fs.readFileSync(filePath, "utf-8");

  // Card headers wrap on mobile
  assert.ok(content.includes("flex-col sm:flex-row"), "Card headers must stack vertically on mobile");

  // Minimum tap target
  assert.ok(content.includes("min-h-[44px]"), "Action buttons must meet min 44px tap targets");
});
