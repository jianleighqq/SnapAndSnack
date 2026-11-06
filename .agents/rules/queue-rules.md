---
trigger: always_on
---

# Queue business rules

Statuses: WAITING, REMINDED, IN_PROGRESS, COMPLETED, CANCELLED.

- Call Next completes the current guest, promotes the next guest to IN_PROGRESS and refreshes the other statuses.
- The 5-minute get-ready reminder applies to the 2nd client in line and beyond, not to the guest who is immediately next.
- Cancelling a booking always asks for confirmation first.
- Queue numbers are unique per event and never reused.
- Guests open their page with a long random guest_token in the URL. No login. A guest page shows only that guest's own queue status and photos.
- Only one event can be ACTIVE at a time. The queue, the booth screen and the guest pages all use the active event.
- Call Next completes the current guest and promotes the next WAITING or REMINDED guest to IN_PROGRESS. It does not touch any other guest except through the status rule below.
- Status rule (recomputed after every queue change: Call Next, cancel, reorder, add guest): the first guest in line behind the IN_PROGRESS guest is REMINDED. Every other guest after that is WAITING. COMPLETED and CANCELLED guests never change.

Data model:
events(id, name, event_type, event_code, start_time, end_time, avg_shoot_minutes, shots_per_guest, max_retakes, print_layout: SINGLE | STRIP | GRID, status: SCHEDULED | ACTIVE | CLOSED)
guests(id, event_id, full_name, email, guest_token)
queue(id, event_id, guest_id, queue_number, scheduled_shoot_time, status)
- Shoot flow: the guest on the booth screen is the one whose status is IN_PROGRESS (set by Call Next). Start Shooting does not change the queue.
- Done in the Shoot Console sets that guest to COMPLETED and returns to "/". It does not call the next guest. The operator presses Call Next for that.
- Cancel Shoot in the Shoot Console leaves the guest IN_PROGRESS and returns to "/". It does not cancel the booking.
- Only one guest can be IN_PROGRESS at a time. If no one is IN_PROGRESS, Start Shooting on "/" shows "Waiting for the next guest" instead of opening the Shoot Console.
Queue logic (callNext, reorder, cancel, addGuest) must be pure functions with unit tests.
- max_retakes defaults to 2 per shot. avg_shoot_minutes should leave room for retakes.