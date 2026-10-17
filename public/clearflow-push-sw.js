/* Shared ClearFlow Web Push handlers. Loaded by the generated Workbox service worker. */
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  const title = typeof data.title === "string" ? data.title.slice(0, 120) : "ClearFlow notification";
  const body = typeof data.body === "string" ? data.body.slice(0, 240) : "Open ClearFlow to review an update.";
  const path = typeof data.url === "string" && data.url.startsWith("/") && !data.url.startsWith("//")
    ? data.url : "/";
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: "/icon.svg",
    badge: "/icon.svg",
    tag: typeof data.notificationId === "string" ? data.notificationId : "clearflow-notification",
    data: { path },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = event.notification?.data?.path;
  const target = new URL(typeof path === "string" && path.startsWith("/") && !path.startsWith("//") ? path : "/", self.location.origin);
  event.waitUntil((async () => {
    const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of clientsList) {
      if (new URL(client.url).origin === self.location.origin) {
        await client.navigate(target.href);
        return client.focus();
      }
    }
    return self.clients.openWindow(target.href);
  })());
});
