import type { MetadataRoute } from "next";

/**
 * manifest.ts — Web App Manifest for PWA support.
 * Enables "Add to Home Screen" on mobile devices.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Hadona Workspace",
    short_name: "Hadona",
    description:
      "Workspace manajemen tim untuk agensi digital — tasks, clients, reports, invoices, & chat.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#6366f1",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/favicon.ico",
        sizes: "32x32",
        type: "image/x-icon",
      },
    ],
    categories: ["business", "productivity", "utilities"],
  };
}