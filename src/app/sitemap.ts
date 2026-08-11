import type { MetadataRoute } from "next";

/**
 * sitemap.xml — Generates sitemap for search engines.
 * Since Hadona is a private workspace app, only public landing/login pages are included.
 * Dashboard routes are protected and not indexed.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://hadona.app";
  const lastModified = new Date();

  return [
    {
      url: baseUrl,
      lastModified,
      changeFrequency: "monthly",
      priority: 1,
    },
    {
      url: `${baseUrl}/login`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.8,
    },
  ];
}