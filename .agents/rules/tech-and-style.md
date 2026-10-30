---
trigger: always_on
---

# Tech stack and code style

## Stack
- Next.js 14 (App Router), TypeScript in strict mode, Tailwind CSS, npm.
- Supabase (PostgreSQL + Realtime). Start with mock data behind a data-access layer in /lib, so Supabase can
  replace it without changing the UI.

## Structure
- /app routes, /components UI, /lib data layer, queue logic and types, /mocks seed data.
- Use route groups so the booth screen has its own bare layout and the operator screens keep the app shell.
- Routes:
  - / : booth screen (full screen, no app shell, no menu)
  - /booth/shoot : placeholder for the capture flow
  - /admin/queue, /admin/setup, /admin/shoot : operator screens with the menu
  - /guest : guest status page, opened with a personal token link
  - /gallery : event gallery
- The operator menu is the only way to reach the operator screens. Keep every operator link in it.

## Code style
- Function components and hooks only.
- Keep business logic out of components. Put it in /lib as small pure functions.
- Use clear names. Add a short comment only where the reason is not obvious.
- Handle loading, empty and error states on every screen.

## Brand (editorial minimalist)
- Palette: ink #161513, paper background #f6f4f1, surface tile #ecebe7, accent orange #e8541e,
  sun yellow #f5c400 (tiles only), muted text #73706b, hairline rgba(22,21,19,0.15).
  Dark mode: background #121210, surface #1e1c1a, text #f6f4f1, same accent.
- Fonts (next/font/google): Anton for headlines, Inter for body, JetBrains Mono for small labels.
- Headlines: huge, condensed, uppercase, tight leading. At most one accent-colored word per headline.
- Labels: JetBrains Mono, 11-12px, uppercase, wide letter spacing, muted.
- Buttons are pills (fully rounded). Primary = ink fill with paper text. Secondary = hairline outline.
  Min height 44px on operator pages, 64px on the booth screen.
- Cards are flat surface tiles, radius 20px, no border, no shadow. Lists use 1px hairline dividers.
- Status badges are small rounded pills. Status colors: green #1a8a4a (ok), red #c23b2e (error),
  amber #b7791f (warning). Always pair color with an icon and text.
- Thin hairline connector lines may link a label or pill to a headline. Lots of whitespace.
- No thick borders, no hard shadows, no square corners, no gradients.
- Shared UI building blocks live in /components/ui (Pill, Label, Tile, Hairline, Ticker, StatusPill,
  PageHeader). Reuse them instead of one-off styles.
- The operator UI is for laptop screens. Guest pages must work on a phone.
- Operator menu is a light, minimal top bar: ink text, active item shown as a small pill.
- The booth screen "/" is full-screen landscape for a touch display on the light paper background:
  very large type, no scrolling. Only one animation (a slow pulse on the Start Shooting pill),
  and it must respect prefers-reduced-motion. The bottom ticker is static.
- No emoji. Use lucide-react for icons.
- When the user gives a reference image, copy only its layout and mood. Never copy its text, mascots,
  logos or branding. Use the Snap & Snack palette and fonts.