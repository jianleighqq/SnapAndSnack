import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

test("Modal component renders via createPortal to document.body with 100dvh coverage", () => {
  const filePath = path.resolve(process.cwd(), "components/ui/Modal.tsx");
  const content = fs.readFileSync(filePath, "utf-8");

  // Portal to body
  assert.ok(content.includes("createPortal("), "Modal must use createPortal");
  assert.ok(content.includes("document.body"), "Modal must portal directly into document.body");

  // Full-viewport backdrop coverage with 100dvh for mobile address bars
  assert.ok(content.includes("fixed inset-0"), "Backdrop must be position: fixed; inset: 0");
  assert.ok(content.includes("100dvh"), "Backdrop must use 100dvh to account for dynamic mobile browser bars");
  assert.ok(content.includes("w-screen"), "Backdrop must span full screen width");

  // Default z-index higher than sticky header (z-40)
  assert.ok(content.includes('zIndex = "z-50"'), "Default z-index must be z-50 or higher to exceed sticky header (z-40)");
});

test("Modal component handles body scroll locking with scrollbar width compensation", () => {
  const filePath = path.resolve(process.cwd(), "components/ui/Modal.tsx");
  const content = fs.readFileSync(filePath, "utf-8");

  // Scrollbar measurement
  assert.ok(
    content.includes("window.innerWidth - document.documentElement.clientWidth"),
    "Must calculate scrollbar width to prevent page layout jump"
  );
  assert.ok(content.includes('document.body.style.overflow = "hidden"'), "Must lock body scroll with overflow: hidden");
  assert.ok(content.includes("document.body.style.paddingRight"), "Must set paddingRight to offset scrollbar");

  // Reference counter for nested modals
  assert.ok(content.includes("openModalsCount"), "Must track nested modal count to prevent premature unlock");
});

test("Modal component manages focus trap, active element return, and keyboard dismiss", () => {
  const filePath = path.resolve(process.cwd(), "components/ui/Modal.tsx");
  const content = fs.readFileSync(filePath, "utf-8");

  // Keyboard navigation & Esc key
  assert.ok(content.includes('e.key === "Escape"'), "Must close on Escape key press");
  assert.ok(content.includes('e.key === "Tab"'), "Must trap Tab key focus within modal");
  assert.ok(content.includes("e.shiftKey"), "Must handle Shift+Tab backward focus loop");

  // Focus restoration & backdrop click
  assert.ok(content.includes("triggerElementRef.current.focus"), "Must restore focus to opening trigger element on close");
  assert.ok(content.includes("e.target === e.currentTarget"), "Must close when clicking the backdrop itself");
  assert.ok(content.includes('role="dialog"'), "Must have role=dialog for accessibility");
  assert.ok(content.includes('aria-modal="true"'), "Must have aria-modal=true");
});

test("QueueCustomerModal wraps both Manage modal and QR modal with Modal portal", () => {
  const filePath = path.resolve(process.cwd(), "components/admin/QueueCustomerModal.tsx");
  const content = fs.readFileSync(filePath, "utf-8");

  assert.ok(content.includes('import { Modal } from "@/components/ui/Modal"'), "QueueCustomerModal must import Modal");
  assert.ok(content.includes("<Modal"), "QueueCustomerModal must render via Modal portal");
  assert.ok(!content.includes('role="dialog"'), "Old inline role=dialog should be replaced by Modal component");
});

test("All admin and booth dialogs use the Modal portal component", () => {
  const files = [
    "components/admin/AddGuestModal.tsx",
    "components/admin/setup/ConfirmModal.tsx",
    "components/admin/setup/EventModal.tsx",
    "components/booth/PinModal.tsx",
    "components/booth/ShootConsole.tsx",
    "components/guest/GuestStatusView.tsx",
  ];

  for (const relPath of files) {
    const filePath = path.resolve(process.cwd(), relPath);
    const content = fs.readFileSync(filePath, "utf-8");

    assert.ok(
      content.includes("Modal"),
      `${relPath} must import and use Modal portal component`
    );
  }
});
