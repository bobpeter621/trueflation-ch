/**
 * trueflation.ch — Sitemap (US 4.8)
 *
 * Next.js generiert daraus automatisch /sitemap.xml. Statische Seiten-
 * struktur, konsistent mit der Navigation in app/page.tsx.
 * /aenderungen ist seit 05.09.2026 in /methodik integriert (Anker
 * #aenderungen-heading) und hat keine eigene Route mehr — nicht hier listen.
 */

import type { MetadataRoute } from "next";

// output: "export" (next.config.ts, US 5.4) verlangt explizit statische
// Generierung fuer diese Metadata-Route -- ohne dieses Flag bricht der Build.
export const dynamic = "force-static";

const BASE_URL = "https://trueflation.ch";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: BASE_URL, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${BASE_URL}/methodik`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/datenquellen`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE_URL}/ueber`, lastModified: now, changeFrequency: "yearly", priority: 0.4 },
    { url: `${BASE_URL}/impressum`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE_URL}/kontakt`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];
}
