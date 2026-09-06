/**
 * trueflation.ch — dynamisches OG-/Social-Preview-Bild (US 3.2)
 *
 * Zeigt die aktuelle Differenz offiziell (LIK) vs. Trueflation, damit jeder
 * geteilte Link selbst zur Botschaft wird. Next.js generiert dieses Bild
 * automatisch bei jedem Build (statischer Pipeline-Lauf, keine Runtime-
 * Kosten) und bindet es als og:image/twitter:image ein.
 *
 * Symmetrie-Anforderung (US 3.1 AC): Farbcodierung/Formulierung darf nicht
 * implizit voraussetzen, dass Trueflation immer höher liegt — beide
 * Richtungen werden unten explizit behandelt (higher/lower/equal), keine
 * hartcodierte "Trueflation > LIK"-Annahme.
 */

import { ImageResponse } from "next/og";
import trueflationData from "../data/trueflation/trueflation-index-yearly.json";

// output: "export" (next.config.ts, US 5.4) verlangt explizit statische
// Generierung fuer diese Metadata-Route -- ohne dieses Flag bricht der
// Build. Das Bild war ohnehin build-zeit-generiert (Kommentar oben:
// "generiert Next.js ... bei jedem Build"), keine Verhaltensaenderung.
export const dynamic = "force-static";

export const alt = "trueflation.ch — offizielle Inflation vs. Trueflation";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  const avgs = trueflationData.calendarYearAverages;
  const first = avgs[0];
  const last = avgs[avgs.length - 1];
  const likGrowth = (last.likIndexAvg / first.likIndexAvg - 1) * 100;
  const trueflationGrowth = (last.trueflationIndexAvg / first.trueflationIndexAvg - 1) * 100;
  const diff = trueflationGrowth - likGrowth;
  // Symmetrisch formuliert: kein "Trueflation ist immer höher" vorausgesetzt.
  const diffLabel =
    diff > 0.05
      ? `Trueflation liegt ${diff.toFixed(1)} Prozentpunkte höher`
      : diff < -0.05
        ? `Trueflation liegt ${Math.abs(diff).toFixed(1)} Prozentpunkte tiefer`
        : "Trueflation liegt praktisch gleich hoch";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          backgroundColor: "#0d1117",
          color: "#e8eaed",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 28, color: "#a8b0bb", marginBottom: 24 }}>trueflation.ch</div>
        <div style={{ display: "flex", fontSize: 40, marginBottom: 48, maxWidth: 900 }}>
          Offizielle Inflation vs. Trueflation, Schweiz {first.year}–{last.year}
        </div>
        <div style={{ display: "flex", flexDirection: "row", gap: 80, marginBottom: 40 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 24, color: "#7d93b3" }}>Offiziell (LIK)</div>
            <div style={{ display: "flex", fontSize: 72, fontFamily: "monospace", color: "#7d93b3" }}>
              {likGrowth >= 0 ? "+" : ""}{likGrowth.toFixed(1)}%
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 24, color: "#ff6b7f" }}>Trueflation</div>
            <div style={{ display: "flex", fontSize: 72, fontFamily: "monospace", color: "#ff6b7f" }}>
              {trueflationGrowth >= 0 ? "+" : ""}{trueflationGrowth.toFixed(1)}%
            </div>
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 26, color: "#a8b0bb" }}>{diffLabel} — Jahresdurchschnitt.</div>
      </div>
    ),
    { ...size }
  );
}
