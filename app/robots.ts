/**
 * trueflation.ch — robots.txt (US 4.8)
 *
 * Erlaubt vollständige Indexierung — kein Grund, Suchmaschinen von einem
 * öffentlichen Transparenz-Projekt auszuschliessen. Next.js generiert
 * daraus automatisch /robots.txt.
 */

import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: "https://trueflation.ch/sitemap.xml",
  };
}
