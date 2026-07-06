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
      url: "https://chickenbookie.com/about",
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.4
    },
    {
      url: "https://chickenbookie.com/contact",
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.4
    },
    {
      url: "https://chickenbookie.com/privacy",
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3
    },
    {
      url: "https://chickenbookie.com/terms",
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3
    }
  ];
}
