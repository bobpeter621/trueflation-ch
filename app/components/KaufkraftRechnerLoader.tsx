"use client";

/**
 * Client-Wrapper für dynamic(..., { ssr: false }) — analog zu
 * LikChartLoader.tsx. Blocker-Fix (Code-Review 29.08.2026): KaufkraftRechner
 * liest window.location.search bereits im ersten Render (Lazy-Initializer
 * in useState/useMemo), um die Teilbarkeits-URL-Parameter (US 3.8 AC) zu
 * lesen. Ohne ssr:false würde die Komponente serverseitig mit den
 * Default-Werten vorgerendert und beim Hydration-Lauf im Browser dieselbe
 * Logik dann die TATSÄCHLICHEN Query-Parameter lesen — das bricht bei jedem
 * geteilten Link (?betrag=...&jahr=...) mit einem sichtbaren React-
 * Hydration-Mismatch. next/dynamic mit ssr:false erzwingt reines
 * Client-Rendering, wie beim Chart, wodurch Server- und Client-Zustand
 * nie divergieren können.
 */

import dynamic from "next/dynamic";

const KaufkraftRechner = dynamic(() => import("./KaufkraftRechner"), { ssr: false });

export default KaufkraftRechner;
