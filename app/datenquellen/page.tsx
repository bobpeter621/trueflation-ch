/**
 * trueflation.ch — Datenquellen-Transparenzseite (US 4.3, US 4.6)
 *
 * P2-Umfang: zeigt die bisher tatsächlich verifizierten Quellen mit echtem
 * Stand (aus den importierten Datendateien gelesen, nicht hartcodiert) —
 * Anzeige folgt Requirements 3 ("Jede Kennzahl zeigt sichtbar: Quelle,
 * Stand, erwarteter nächster Aktualisierungstermin, Link zur Original-
 * publikation").
 */

import { readFileSync } from "node:fs";
import path from "node:path";

export const metadata = {
  title: "Datenquellen",
  description: "Übersicht aller verwendeten Datenquellen mit Stand, Lizenz und Quellenangabe.",
};

// Statisch gescopte Pfade (nicht dynamisch aus relPath zusammengesetzt) —
// vermeidet, dass Next.js das gesamte Repo für die Server-Komponente
// nachverfolgt (siehe Build-Warnung "Static analysis determined that this
// filesystem access causes the whole project to be traced").
function readLikData() {
  try {
    const raw = readFileSync(path.join(process.cwd(), "data", "lik", "total-index-monthly.json"), "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readLeitzinsData() {
  try {
    const raw = readFileSync(path.join(process.cwd(), "data", "snb-leitzins", "leitzins-current.json"), "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readTrueflationData() {
  try {
    const raw = readFileSync(path.join(process.cwd(), "data", "trueflation", "trueflation-index-monthly.json"), "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readSnbM2Data() {
  try {
    const raw = readFileSync(path.join(process.cwd(), "data", "snb-m2", "m2-monthly.json"), "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function formatIndexDate(indexDate: number): string {
  const s = String(indexDate);
  return `${s.slice(4, 6)}.${s.slice(0, 4)}`;
}

export default function DatenquellenPage() {
  const likData = readLikData();
  const snbData = readSnbM2Data();
  const leitzinsData = readLeitzinsData();
  const trueflationData = readTrueflationData();

  const likLast = likData?.values?.[likData.values.length - 1];
  const snbLast = snbData?.values?.[snbData.values.length - 1];
  const leitzinsLast = leitzinsData?.values?.[leitzinsData.values.length - 1];
  const trueflationLast = trueflationData?.values?.[trueflationData.values.length - 1];

  return (
    <div className="flex flex-col min-h-screen items-center px-4 py-12 sm:px-8">
      <main className="w-full max-w-4xl flex flex-col gap-8">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Datenquellen</h1>
          <p className="mt-2 text-sm" style={{ color: "var(--color-text-secondary)" }}>
            Jede Kennzahl zeigt Quelle, Stand und Original-Publikation. Amtliche BFS/SNB-Daten
            unterliegen dem Bundesstatistikgesetz (freie Nutzung, Quellenangabe Pflicht).
          </p>
        </header>

        {/* Mobile (375px): Tabelle bekommt eigenen horizontalen
            Scroll-Container statt die Seite um einige Pixel zu sprengen
            (Frontend-Review 05.09.2026: 5px Seiten-Overflow ohne Wrapper). */}
        <div style={{ overflowX: "auto" }}>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b" style={{ borderColor: "var(--color-border)" }}>
              <th className="text-left py-2">Kennzahl</th>
              <th className="text-left py-2">Quelle</th>
              <th className="text-left py-2">Stand</th>
              <th className="text-left py-2">Original</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b" style={{ borderColor: "var(--color-border)" }}>
              <td className="py-2">Offizielle Inflation (LIK)</td>
              <td className="py-2">Bundesamt für Statistik</td>
              <td className="py-2 tf-numeric">
                {likLast ? `${formatIndexDate(likLast.indexDate)} — ${likLast.indexValue}` : "—"}
              </td>
              <td className="py-2">
                <a
                  href="https://www.bfs.admin.ch/bfs/de/home/statistiken/preise/erhebungen/lik.html"
                  className="underline"
                >
                  bfs.admin.ch
                </a>
              </td>
            </tr>
            <tr className="border-b" style={{ borderColor: "var(--color-border)" }}>
              <td className="py-2">Geldmenge M2</td>
              <td className="py-2">Schweizerische Nationalbank</td>
              <td className="py-2 tf-numeric">
                {snbLast ? `${snbLast.date.slice(5, 7)}.${snbLast.date.slice(0, 4)} — ${snbLast.value.toLocaleString("de-CH")} Mio. CHF` : "—"}
              </td>
              <td className="py-2">
                <a href="https://data.snb.ch/" className="underline">
                  data.snb.ch
                </a>
              </td>
            </tr>
            <tr className="border-b" style={{ borderColor: "var(--color-border)" }}>
              <td className="py-2">SNB-Leitzins</td>
              <td className="py-2">Schweizerische Nationalbank</td>
              <td className="py-2 tf-numeric">
                {leitzinsLast ? `${leitzinsLast.date} — ${leitzinsLast.value} %` : "—"}
              </td>
              <td className="py-2">
                <a href="https://data.snb.ch/" className="underline">
                  data.snb.ch
                </a>
              </td>
            </tr>
            <tr>
              <td className="py-2">Trueflation (eigene Berechnung)</td>
              <td className="py-2">trueflation.ch auf Basis BFS/BAG (siehe Methodik)</td>
              <td className="py-2 tf-numeric">
                {trueflationLast
                  ? `${String(trueflationLast.month).slice(4, 6)}.${String(trueflationLast.month).slice(0, 4)} — ${trueflationLast.trueflationIndex.toFixed(1)}`
                  : "—"}
              </td>
              <td className="py-2">
                <a href="/methodik" className="underline">
                  Methodik
                </a>
              </td>
            </tr>
          </tbody>
        </table>
        </div>

        <footer className="text-xs" style={{ color: "var(--color-text-muted)" }}>
          Eigene Inhalte dieser Seite: CC BY (Namensnennung). Amtliche Quelldaten unterliegen eigenen
          Lizenzbedingungen (siehe Links oben).
        </footer>
      </main>
    </div>
  );
}
