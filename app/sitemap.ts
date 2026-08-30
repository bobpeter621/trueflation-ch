/**
 * trueflation.ch — Sitemap (US 4.8)
 *
 * Next.js generiert daraus automatisch /sitemap.xml. Statische Seiten-
 * struktur, konsistent mit der Navigation in app/page.tsx.
 */

import type { MetadataRoute } from "next";

const BASE_URL = "https://trueflation.ch";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: BASE_URL, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${BASE_URL}/methodik`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/datenquellen`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE_URL}/aenderungen`, lastModified: now, changeFrequency: "weekly", priority: 0.5 },
    { url: `${BASE_URL}/kontakt`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];
}
