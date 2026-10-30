---
trigger: always_on
---

# System architecture

Three zones. Respect these boundaries when deciding where code goes.

## 1. Guest phone (no code of ours except one page)
- QR code -> Google Form (name, Gmail) -> Apps Script "on form submit" -> POST to our intake API.
- Guests open their personal status page at /guest with a token. No app install, no login.

## 2. Cloud
- Web app: Next.js (booth screen at /, operator UI at /admin/*, guest UI at /guest, gallery at /gallery).
- API: Next.js route handlers in /app/api (intake, queue actions, media upload). Add a separate worker
  service only when a job is too long for a route handler (Drive sync, scheduled reminders).
- Database, realtime and file storage: Supabase (PostgreSQL, Realtime, Storage).
- Google Drive: optional. Cloud storage is the guaranteed gallery. Drive sync is a switchable module.

## 3. Booth laptop (MacBook Air M2)
- Browser app runs the guest-facing booth screen ("/") and the operator screens (Queue Board, Event Setup,
  Shoot Console).
- Relay agent: a small local program the browser talks to over a local WebSocket or HTTP.
  It controls the Sony camera (Camera Remote SDK) and prints to the Canon SELPHY (AirPrint).
- The browser never talks to the camera or printer directly. All hardware goes through the relay agent.

## Data flow
1. Registration: Form -> Apps Script -> /api/intake -> guest + queue row -> status link emailed.
2. Waiting: guest page subscribes to Supabase Realtime for queue changes and alerts.
3. Call next: operator action updates the queue, guest gets the start alert.
4. Booth: guest taps Start Shooting on "/", which opens the capture flow.
5. Capture: Shoot Console -> relay agent -> file back to the browser -> upload to Supabase Storage.
6. Sync (later): worker copies the file to the guest's Drive folder and grants read access to their Gmail.

## Rules that follow from this
- The intake endpoint must verify a shared secret (HMAC) sent by Apps Script. Reject anything unsigned.
- Never trust the browser for permissions. Guest pages are keyed by guest_token and show only that guest's data.
- Data access goes through /lib (a data-access layer), so mock data and Supabase are interchangeable.
- Use Supabase Realtime for live updates. Do not poll in a loop.
- Hardware and Google Drive code is isolated in its own modules (/lib/hardware, /lib/drive) behind interfaces,
  so they can be mocked.
- Keep secrets (Supabase service key, Google service account, webhook secret) server-side only.
  Never expose them to client components.
- Temporary exception: the booth Config Settings PIN is a mock value in NEXT_PUBLIC_BOOTH_PIN. It is
  visible in the browser and is not real security. Replace it with real operator login before any
  real event. Do not use NEXT_PUBLIC_ for any other secret.
- Hardware status and test actions go through the /lib/hardware interface (getCameraStatus, testCapture,
  getPrinterStatus, testPrint, getCloudStatus). Use the mock implementation until the relay agent exists.
- Do not assume printer ink or paper levels can be read from the Canon SELPHY. Track prints per session and
  let the operator set the paper loaded. Verify this in the printer phase.

## Build status (update as phases finish)
Build status: Phase 1 done (app shell, menu, Queue Board, "/" booth screen, Event Setup, restyle). Phase 2 (now): Shoot Console at /booth/shoot (replaces the placeholder), mock data and mock hardware only. Next: Guest status page, registration intake, Gallery.