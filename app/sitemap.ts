/**
 * trueflation.ch — Sitemap (US 4.8)
 *
 * Next.js generiert daraus automatisch /sitemap.xml. Statische Seiten-
 * struktur, konsistent mit der Navigation in app/page.tsx.
 */

import type { MetadataRoute } from "next";

// output: "export" (next.config.ts, US 5.4) verlangt explizit statische
// Generierung fuer Metadata-Routen -- ohne dieses Flag bricht der Build
// ("force-static/revalidate not configured"). sitemap() nutzt ohnehin nur
// new Date() zur Build-Zeit, kein Request-/Laufzeitkontext -- unveraendertes
// Verhalten.
export const dynamic = "force-static";

const BASE_URL = "https://trueflation.ch";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: BASE_URL, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${BASE_URL}/methodik`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/datenquellen`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE_URL}/aenderungen`, lastModified: now, changeFrequency: "weekly", priority: 0.5 },
    { url: `${BASE_URL}/ueber`, lastModified: now, changeFrequency: "yearly", priority: 0.4 },
    { url: `${BASE_URL}/impressum`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${BASE_URL}/kontakt`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];
}
