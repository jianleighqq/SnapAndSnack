// Snap & Snack Service Worker for Web Push & Offline Ticket Notifications

self.addEventListener("push", (event) => {
  let data = {
    title: "Snap & Snack",
    body: "You have an update regarding your queue status.",
    url: "/guest",
  };

  try {
    if (event.data) {
      const parsed = event.data.json();
      data = { ...data, ...parsed };
    }
  } catch (err) {
    console.warn("[SW] Failed to parse push notification payload as JSON:", err);
    if (event.data) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: "/icon.png",
    badge: "/icon.png",
    tag: "queue",
    renotify: true,
    vibrate: [300, 150, 300, 150, 600],
    requireInteraction: true,
    data: {
      url: data.url || "/guest",
    },
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || "/guest";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      // If a window for Snap & Snack is already open, focus it and navigate if needed
      for (const client of windowClients) {
        if ("focus" in client) {
          if (client.url === targetUrl || client.url.includes("/guest")) {
            return client.focus();
          }
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
