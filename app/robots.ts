/**
 * trueflation.ch — robots.txt (US 4.8)
 *
 * Erlaubt vollständige Indexierung — kein Grund, Suchmaschinen von einem
 * öffentlichen Transparenz-Projekt auszuschliessen. Next.js generiert
 * daraus automatisch /robots.txt.
 */

import type { MetadataRoute } from "next";

// output: "export" (next.config.ts, US 5.4) verlangt explizit statische
// Generierung fuer Metadata-Routen -- ohne dieses Flag bricht der Build.
export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: "https://trueflation.ch/sitemap.xml",
  };
}
