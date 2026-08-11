import type { MetadataRoute } from "next";

/**
 * robots.txt — Controls crawler access.
 * Allows all crawlers to access public pages,
 * blocks dashboard, auth, embed, shared, and API routes.
 */
export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://hadona.app";

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/dashboard/",
          "/api/",
          "/embed/",
          "/shared/",
          "/login",
          "/signup",
          "/onboarding",
          "/waiting-approval",
          "/rejected",
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}