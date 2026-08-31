/**
 * trueflation.ch — Datenquellen-Transparenzseite (US 4.3, US 4.6)
 *
 * Content-Stand 30.08.2026: alle sechs live genutzten Quellen ausgewiesen
 * (LIK, M2, Leitzins, Trueflation-Berechnung, Krankenkassenprämien, Gold/
 * Bitcoin via Twelve Data) — vorher stand hier noch der P2-Zwischenstand
 * ("Leitzins/Trueflation noch nicht implementiert"), obwohl beide seit P3
 * live sind. Zeigt sichtbar: Quelle, Stand, Link zur Originalpublikation
 * (Requirements Abschnitt 3).
 */

import { readFileSync } from "node:fs";
import path from "node:path";

export const metadata = {
  title: "Datenquellen — trueflation.ch",
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

function readSnbM2Data() {
  try {
    const raw = readFileSync(path.join(process.cwd(), "data", "snb-m2", "m2-monthly.json"), "utf-8");
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

function readPremiumData() {
  try {
    const raw = readFileSync(path.join(process.cwd(), "data", "kvpi-premium-index", "premium-index-ch.json"), "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readGoldData() {
  try {
    const raw = readFileSync(path.join(process.cwd(), "data", "overlays", "gold-chf-daily-derived.json"), "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readBtcData() {
  try {
    const raw = readFileSync(path.join(process.cwd(), "data", "overlays", "btc-chf-daily.json"), "utf-8");
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
  const premiumData = readPremiumData();
  const goldData = readGoldData();
  const btcData = readBtcData();

  const likLast = likData?.values?.[likData.values.length - 1];
  const snbLast = snbData?.values?.[snbData.values.length - 1];
  const leitzinsLast = leitzinsData?.values?.[leitzinsData.values.length - 1];
  const premiumValues = premiumData?.values ?? [];
  const premiumLast = premiumValues[premiumValues.length - 1];
  const goldLast = goldData?.values?.[goldData.values.length - 1];
  const btcLast = btcData?.values?.[btcData.values.length - 1];

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

        {/* Mobile-Fix (P5-Frontend-Review): Tabelle löste bei 375px horizontales
            Overflow der ganzen Seite aus — scrollbaren Container drumherum. */}
        <div className="w-full overflow-x-auto">
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
                {snbLast ? `${snbLast.date} — ${snbLast.value.toLocaleString("de-CH")} Mio. CHF` : "—"}
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
                {leitzinsLast ? `${leitzinsLast.date} — ${leitzinsLast.value}%` : "—"}
              </td>
              <td className="py-2">
                <a href="https://data.snb.ch/" className="underline">
                  data.snb.ch
                </a>
              </td>
            </tr>
            <tr className="border-b" style={{ borderColor: "var(--color-border)" }}>
              <td className="py-2">Trueflation (Berechnung)</td>
              <td className="py-2" colSpan={3} style={{ color: "var(--color-text-secondary)" }}>
                Eigene Berechnung aus LIK + Kranken­kassenprämien (ab 2020 zusätzlich miet-korrigiert) —
                keine eigene Erhebung, siehe{" "}
                <a href="/methodik" className="underline">
                  Methodik
                </a>{" "}
                für Formel und Quellen der Einzelkomponenten.
              </td>
            </tr>
            <tr className="border-b" style={{ borderColor: "var(--color-border)" }}>
              <td className="py-2">Krankenkassenprämien (Grundversicherung)</td>
              <td className="py-2">Bundesamt für Gesundheit (BAG)</td>
              <td className="py-2 tf-numeric">
                {premiumLast ? `${premiumLast.year} — CHF ${premiumLast.premiumCHF.toLocaleString("de-CH")}/Jahr` : "—"}
              </td>
              <td className="py-2">
                <a href="https://www.bag.admin.ch/bag/de/home/zahlen-und-statistiken/statistiken-versicherungen/statistiken-krankenversicherung.html" className="underline">
                  bag.admin.ch
                </a>
              </td>
            </tr>
            <tr className="border-b" style={{ borderColor: "var(--color-border)" }}>
              <td className="py-2">Gold (CHF, abgeleitet)</td>
              <td className="py-2">Twelve Data (XAU/USD × USD/CHF)</td>
              <td className="py-2 tf-numeric">
                {goldLast ? `${goldLast.date} — CHF ${goldLast.goldChf.toLocaleString("de-CH", { maximumFractionDigits: 0 })}` : "—"}
              </td>
              <td className="py-2">
                <a href="https://twelvedata.com/pricing" className="underline">
                  twelvedata.com
                </a>
              </td>
            </tr>
            <tr>
              <td className="py-2">Bitcoin (CHF)</td>
              <td className="py-2">Twelve Data</td>
              <td className="py-2 tf-numeric">
                {btcLast ? `${btcLast.date} — CHF ${btcLast.close.toLocaleString("de-CH", { maximumFractionDigits: 0 })}` : "—"}
              </td>
              <td className="py-2">
                <a href="https://twelvedata.com/pricing" className="underline">
                  twelvedata.com
                </a>
              </td>
            </tr>
          </tbody>
        </table>
        </div>

        <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
          Marktdaten (Gold, Bitcoin) sind keine amtliche Quelle und keine Inflationsmessung — sie
          dienen ausschliesslich dem optionalen Wertaufbewahrungs-Vergleich im Chart und Kaufkraft-
          Rechner, siehe{" "}
          <a href="/methodik" className="underline">
            Methodik
          </a>
          . Nutzung im Rahmen der{" "}
          <a href="https://twelvedata.com/pricing" className="underline">
            Twelve-Data-Nutzungsbedingungen
          </a>
          .
        </p>

        <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
          Fehler in einer Quellenangabe gefunden oder eine methodische Rückfrage?{" "}
          <a href="/kontakt" className="underline">
            Kontakt
          </a>
          .
        </p>

        <footer className="text-xs" style={{ color: "var(--color-text-muted)" }}>
          Eigene Inhalte dieser Seite: CC BY (Namensnennung). Amtliche Quelldaten unterliegen eigenen
          Lizenzbedingungen (siehe Links oben).
        </footer>
      </main>
    </div>
  );
}
