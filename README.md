# Snap & Snack

Web-based photo booth and event queue management system. Guests register on their phones, wait in a queue, shoot photos at the booth, and receive a personal gallery.

---

## Tech Stack & Architecture

- **Framework**: Next.js 14 (App Router) + React 18 + TypeScript (strict mode)
- **Styling**: Tailwind CSS with custom high-contrast brand tokens (`#e8541e` orange, `#161513` ink, `#f6f4f1` background, Anton heading font)
- **Data Layer**: `/lib` abstracted data layer supporting interchangeable Mock data and Supabase (PostgreSQL + Realtime)
- **Platform Targets**:
  - **Booth Screen**: Full-screen landscape attract display (`/`)
  - **Booth Capture**: Placeholder flow (`/booth/shoot`)
  - **Operator UI**: Laptop screens with persistent menu (`/admin/queue`, `/admin/setup`, `/admin/shoot`)
  - **Guest UI**: Mobile web (`/guest`, `/guest/[token]`)
  - **Public Gallery**: Responsive photo wall (`/gallery`)

> [!WARNING]
> **Operator PIN Security Note**: The Config Settings button uses `NEXT_PUBLIC_BOOTH_PIN` (default `1234`) stored in `.env.local`. This is a mock PIN for development and demonstration purposes only. It is client-visible and does NOT provide real authentication. It must be replaced with genuine authenticated operator login before running real events.

---

## System Status: Real vs. Mocked

| Component / Subsystem | Current Status | Notes |
| :--- | :--- | :--- |
| **Booth Shoot Console (`/booth/shoot`)** | 🟡 Live Mock Flow | 4-step capture flow, pose selection, Anton countdown, hardware capture & SELPHY mock print |
| **Event Setup & Management** | 🟡 Mock Data / LocalStorage | Pure business logic in `/lib/events.ts`, store in `/lib/db.ts` |
| **Hardware Diagnostics** | 🟡 Mock Interface | Behind `/lib/hardware.ts` with Sony USB & Canon SELPHY print counter simulation |
| **Queue Engine** | 🟡 Mock Data | Pure business logic in `/lib/queue.ts`, seed data in `/mocks` |
| **Intake API** | 🟡 Pending | Endpoint `/api/intake` with HMAC secret verification |
| **Supabase DB & Realtime** | ⚪ Prepared | Interfaces ready in `/lib/db.ts` |
| **Booth Camera Relay** | ⚪ Mock Interface | Local agent integration via `/lib/hardware.ts` |
| **Canon SELPHY Print Relay**| ⚪ Mock Interface | Local print integration via `/lib/hardware.ts` |
| **Google Drive Sync** | ⚪ Mock Interface | Sync worker via `/lib/drive` |

---

## Setup & Running Locally

1. **Install dependencies**:
   ```powershell
   npm install
   ```

2. **Configure environment variables**:
   Copy `.env.example` to `.env.local`:
   ```powershell
   cp .env.example .env.local
   ```

3. **Start local development server**:
   ```powershell
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

4. **Run unit tests**:
   ```powershell
   npm test
   ```
