import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("root metadata defines title template, default, description, and themeColor", () => {
  const layoutPath = path.resolve(process.cwd(), "app/layout.tsx");
  const content = fs.readFileSync(layoutPath, "utf-8");

  assert.ok(
    content.includes('default: "Snap & Snack - Photo Booth"'),
    "Root metadata should include default title"
  );
  assert.ok(
    content.includes('template: "Snap & Snack - %s"'),
    "Root metadata should include template 'Snap & Snack - %s'"
  );
  assert.ok(
    content.includes('description: "Photo booth queue and event management"'),
    "Root metadata should include description"
  );
  assert.ok(
    content.includes('themeColor: "#F3F1ED"'),
    "Viewport should set themeColor to #F3F1ED"
  );
});

test("route page metadata and privacy robots directives match requirements", () => {
  const routes = [
    {
      file: "app/(booth)/page.tsx",
      title: "Photo Booth",
      private: false,
    },
    {
      file: "app/booth/page.tsx",
      title: "Photo Booth",
      private: true,
    },
    {
      file: "app/booth/shoot/page.tsx",
      title: "Shoot Console",
      private: true,
    },
    {
      file: "app/login/layout.tsx",
      title: "Operator Login",
      private: true,
    },
    {
      file: "app/(admin)/admin/queue/page.tsx",
      title: "Queue Board",
      private: true,
    },
    {
      file: "app/(admin)/admin/setup/page.tsx",
      title: "Event Setup",
      private: true,
    },
    {
      file: "app/(admin)/admin/gallery/layout.tsx",
      title: "Gallery",
      private: true,
    },
    {
      file: "app/(admin)/guest/page.tsx",
      title: "My Queue Ticket",
      private: true,
    },
    {
      file: "app/(admin)/gallery/page.tsx",
      title: "My Photos",
      private: true,
    },
    {
      file: "app/(admin)/admin/shoot/page.tsx",
      title: "Shoot Console",
      private: true,
    },
    {
      file: "app/not-found.tsx",
      title: "Page Not Found",
      private: true,
    },
  ];

  for (const route of routes) {
    const fullPath = path.resolve(process.cwd(), route.file);
    assert.ok(fs.existsSync(fullPath), `File exists: ${route.file}`);
    const fileContent = fs.readFileSync(fullPath, "utf-8");

    assert.ok(
      fileContent.includes(`title: "${route.title}"`),
      `${route.file} must specify title: "${route.title}"`
    );

    if (route.private) {
      assert.ok(
        fileContent.includes("robots: { index: false, follow: false }"),
        `${route.file} must include robots: { index: false, follow: false }`
      );
    } else {
      assert.ok(
        !fileContent.includes("robots: {"),
        `${route.file} should be indexable without robots restriction`
      );
    }
  }
});

test("favicon and icon files exist with non-zero size", () => {
  const iconFiles = [
    "app/icon.png",
    "app/apple-icon.png",
    "app/favicon.ico",
    "public/icon-32x32.png",
    "public/icon-16x16.png",
  ];

  for (const filePath of iconFiles) {
    const fullPath = path.resolve(process.cwd(), filePath);
    assert.ok(fs.existsSync(fullPath), `File exists: ${filePath}`);
    const stat = fs.statSync(fullPath);
    assert.ok(stat.size > 0, `File not empty: ${filePath}`);
  }
});
