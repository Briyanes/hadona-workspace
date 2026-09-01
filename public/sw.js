/* Service Worker — Hadona Workspace
 * - Push notification (web-push) → tampilkan notifikasi
 * - notificationclick → fokus/buka window + navigate ke link
 */
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Terima perintah SKIP_WAITING dari page — percepat SW waiting menjadi aktif
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "Hadona Workspace", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Hadona Workspace";
  const options = {
    body: data.body || "",
    icon: "/icon.png",
    badge: "/icon.png",
    tag: data.tag || "hadona-notification",
    renotify: true,
    data: { url: data.url || "/" },
    vibrate: [100, 50, 100],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Fokus window yang sudah terbuka & navigate
      for (const client of clientList) {
        if ("focus" in client) {
          client.focus();
          if (client.navigate && url !== "/") {
            client.navigate(url).catch(() => {});
          }
          return;
        }
      }
      // Belum ada window → buka baru
      return self.clients.openWindow(url);
    })
  );
});