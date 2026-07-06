import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    {
      url: "https://chickenbookie.com/",
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1
    },
    {
      url: "https://chickenbookie.com/privacy",
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3
    }
  ];
}
