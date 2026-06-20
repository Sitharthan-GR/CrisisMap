/// <reference lib="webworker" />

import { clientsClaim } from "workbox-core";
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";
import { BACKGROUND_SYNC_TAG, flushPendingReports } from "./lib/offlineSyncCore";

declare let self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
self.skipWaiting();
clientsClaim();

self.addEventListener("sync", (event: SyncEvent) => {
  if (event.tag !== BACKGROUND_SYNC_TAG) return;

  event.waitUntil(
    flushPendingReports().then(async () => {
      const clients = await self.clients.matchAll({ type: "window" });
      clients.forEach((client) => {
        client.postMessage({ type: "OFFLINE_SYNC_COMPLETE" });
      });
    }),
  );
});
