---
trigger: always_on
---

# Snap & Snack: project overview

Snap & Snack is a web-based photo booth and event management app for a client who runs events.
Guests register on their phones, wait in a queue, shoot photos at a booth, and get a personal gallery.

## Three screens people see
- Booth screen: the home page "/". A full-screen touch display shown to guests when no one is shooting.
  It has a big Start Shooting button and a PIN-protected Config Settings button for the operator.
- -- Operator (admin): runs on one laptop behind the PIN. Queue Board, Event Setup, and a Shoot Console link in the menu that opens the same capture flow as /booth/shoot.
  Event Setup (/admin/setup) is where events are created and set as active, and where hardware status is checked.
- Guest: a phone page opened from a personal status link. Shows queue number, alerts, cancel booking and gallery.

## Registration flow
QR code -> Google Form -> Apps Script webhook -> our API -> queue entry -> status link sent to the guest.

## Hardware (later phases only)
Sony a7IV and a6700 cameras and a Canon SELPHY CP1500 printer. The camera is controlled through a local relay
agent, never directly from the browser.
The booth laptop is a MacBook Air M2, but development happens on Windows.
For now, use mock hardware only.

## Out of scope for now
Do not build Gallery, Google Drive sync, the guest status page, the registration intake API or real hardware integrations until the user asks. Use placeholder pages for those.

Exception: the Shoot Console at /booth/shoot is now in scope. Build it with mock data and mock hardware only, behind the /lib/hardware interface. Do not connect a real camera or printer.