/**
 * trueflation.ch — Drift-Erkennung (US 1.14)
 *
 * Anders als die Sprungprüfung (US 1.7) fängt dies schleichende, aber
 * plausible Fehler ab: eine Quelle liefert über Monate systematisch leicht
 * falsche Werte (z.B. falsche Spalte nach stiller Formatänderung), ohne dass
 * ein einzelner Sprung auffällt.
 *
 * Für LIK: Abgleich gegen den in der BFS-Medienmitteilung publizierten
 * Indexstand — unabhängige zweite Quelle derselben Grösse. Das ist die
 * Absicherung gegen die dokumentierte Fragilität des App-State-Endpunkts
 * (kein API-Vertrag, siehe config/sources.json → lik.fragility).
 *
 * Referenzquelle: die "Detailresultate"-Seite / Medienmitteilungen-Feed
 * (tabs_1838835756/item_3/ws_parametrized_list, siehe requirements.md
 * Abschnitt 3, Fund vom V1) — jede Medienmitteilung enthält im Titel die
 * publizierte Monatsveränderung. Für einen strengeren Abgleich bräuchte man
 * den exakten Indexstand aus der Mitteilung (PDF/Text-Extraktion, nicht Teil
 * dieses P2-Schritts) — hier zunächst der schwächere, aber sofort umsetzbare
 * Abgleich: Titel-Prozentsatz gegen berechnete Monatsveränderung.
 */

import { fetchWhitelisted } from './fetch-whitelisted.mjs';

const MEDIENMITTEILUNGEN_ENDPOINT =
  'https://www.bfs.admin.ch/bfs/de/home/statistiken/preise/landesindex-konsumentenpreise/detailresultate/jcr:content/root/main/section/container/tabs_1838835756/item_3/ws_parametrized_list.model.json';

/**
 * Extrahiert die im Titel der jüngsten Medienmitteilung genannte
 * Monatsveränderung, z.B. "Die Konsumentenpreise sind im Juli um 0,1% gefallen"
 * → -0.1, "... um 0,2% gestiegen" → +0.2, "... stabil geblieben" → 0.
 */
function parseChangeFromTitle(title) {
  const risenMatch = title.match(/um\s+([\d,.]+)\s*%\s+gestiegen/i);
  if (risenMatch) return parseFloat(risenMatch[1].replace(',', '.'));

  const fallenMatch = title.match(/um\s+([\d,.]+)\s*%\s+gefallen/i);
  if (fallenMatch) return -parseFloat(fallenMatch[1].replace(',', '.'));

  if (/stabil geblieben/i.test(title)) return 0;

  return null;
}

/**
 * Vergleicht die berechnete Monatsveränderung (aus unseren Daten) gegen die
 * von BFS in der Medienmitteilung kommunizierte Veränderung.
 *
 * @param {number} computedChangeVormonat - changeRateVormonat aus unseren Daten
 * @param {number} tolerancePercentPoints - z.B. 0.05 (Prozentpunkte)
 * @returns {Promise<{status: 'ok'|'drift-detected'|'no-reference-available', referenceTitle?: string, referenceChange?: number, computedChange: number, deviation?: number}>}
 */
export async function checkLikDrift(computedChangeVormonat, tolerancePercentPoints = 0.05) {
  let response;
  try {
    response = await fetchWhitelisted(MEDIENMITTEILUNGEN_ENDPOINT, {
      headers: { 'User-Agent': 'trueflation.ch-drift-check/1.0' },
    });
  } catch (err) {
    console.warn(`[drift-check/lik] Referenzquelle nicht erreichbar (${err.message}) — Drift-Check übersprungen, kein Fehlschlag.`);
    return { status: 'no-reference-available', computedChange: computedChangeVormonat };
  }

  if (!response.ok) {
    console.warn(`[drift-check/lik] Referenzquelle antwortete mit HTTP ${response.status} — Drift-Check übersprungen.`);
    return { status: 'no-reference-available', computedChange: computedChangeVormonat };
  }

  const body = await response.json();
  const inner = JSON.parse(body.assetListAsJson);
  const latest = inner.list?.[0];
  if (!latest?.title) {
    console.warn('[drift-check/lik] Keine Medienmitteilung in der Referenzquelle gefunden.');
    return { status: 'no-reference-available', computedChange: computedChangeVormonat };
  }

  const referenceChange = parseChangeFromTitle(latest.title);
  if (referenceChange === null) {
    console.warn(`[drift-check/lik] Konnte Veränderung nicht aus Titel parsen: "${latest.title}"`);
    return { status: 'no-reference-available', computedChange: computedChangeVormonat, referenceTitle: latest.title };
  }

  const deviation = Math.abs(computedChangeVormonat - referenceChange);
  if (deviation > tolerancePercentPoints) {
    console.error(
      `[drift-check/lik] DRIFT ERKANNT: berechnet=${computedChangeVormonat}%, Referenz (BFS-Medienmitteilung)=${referenceChange}%, ` +
      `Abweichung=${deviation.toFixed(2)} Prozentpunkte > Toleranz ${tolerancePercentPoints}.`
    );
    return {
      status: 'drift-detected',
      referenceTitle: latest.title,
      referenceChange,
      computedChange: computedChangeVormonat,
      deviation,
    };
  }

  console.log(
    `[drift-check/lik] OK — berechnet=${computedChangeVormonat}%, Referenz="${latest.title}" (${referenceChange}%), ` +
    `Abweichung=${deviation.toFixed(2)} Prozentpunkte innerhalb Toleranz ${tolerancePercentPoints}.`
  );
  return { status: 'ok', referenceTitle: latest.title, referenceChange, computedChange: computedChangeVormonat, deviation };
}
