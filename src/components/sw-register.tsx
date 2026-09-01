"use client";
/**
 * ServiceWorkerRegister — register /sw.js untuk Web Push.
 * Dipasang di root layout; silent-fail di browser tanpa dukungan.
 */
import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js")
      .catch(() => {
        // silent — SW opsional
      });
  }, []);
  return null;
}