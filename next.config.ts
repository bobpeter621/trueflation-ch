import type { NextConfig } from "next";

/**
 * trueflation.ch — statischer Export (Requirements Abschnitt 11, US 5.4)
 *
 * Architektur-Entscheidung: "Auslieferung der Seite: statisch über CDN ...
 * Droplet-Rolle bewusst minimal: traegt ausschliesslich Analytics + Mirror,
 * nicht als Webserver fuer die Seite selbst." `output: "export"` erzwingt
 * genau das — `next build` erzeugt reine HTML/JS/CSS-Dateien unter out/,
 * kein Node-Serverprozess noetig (kein `next start` in Produktion).
 *
 * Betroffene Kompatibilitaet (geprüft, 30.08.2026):
 * - app/feed.json/route.ts: GET-Route-Handler ohne dynamische Segmente/
 *   Request-Abhaengigkeit -> wird beim Build einmal ausgeführt und als
 *   statische Datei exportiert (kompatibel mit output: export).
 * - app/opengraph-image.tsx: ImageResponse, ebenfalls build-zeit-generiert,
 *   kompatibel.
 * - app/components/*.tsx mit "use client": laufen client-seitig, unbetroffen.
 * - Next.js Image-Optimierung ist bei output:"export" serverseitig nicht
 *   verfuegbar (kein Optimierungs-Server im statischen Export) — das
 *   Projekt nutzt aktuell kein next/image, daher kein Anpassungsbedarf.
 */
const nextConfig: NextConfig = {
  output: "export",
};

export default nextConfig;
