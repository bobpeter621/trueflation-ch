/**
 * trueflation.ch — maschinenlesbarer Feed (US 4.7)
 *
 * Liefert die aktuellsten Werte pro Kennzahl unter fester URL (/feed.json)
 * für Journalisten/Entwickler/Bots zur Weiterverwendung. Bei der statischen
 * Git-Architektur "fast geschenkt" (US 4.7): reine Ableitung aus denselben
 * Datendateien, die auch den Chart speisen — keine zweite Berechnung, keine
 * Divergenzquelle.
 *
 * Lizenzfeld (US 4.9 AC): jede Weiterverwendung muss die CC-BY-Bedingung
 * sehen können, auch maschinelle Konsumenten — deshalb im JSON selbst,
 * nicht nur auf einer HTML-Seite.
 *
 * Route Handler statt statischer Datei: liest zur Build-/Request-Zeit
 * dieselben JSON-Quellen wie die Frontend-Komponenten, damit ein künftiger
 * Formatwechsel der Quelldaten nicht zwei Stellen synchron halten muss.
 */

import { NextResponse } from "next/server";

// output: "export" (next.config.ts, US 5.4) verlangt explizit statische
// Generierung fuer Route Handler -- ohne dieses Flag bricht der Build.
// generiertAm nutzt weiterhin new Date() (Build-Zeitpunkt statt Request-
// Zeitpunkt, siehe Kommentar unten) -- unveraendertes Verhalten fuer die
// Werte selbst, nur der Zeitstempel ist jetzt Build- statt Request-Zeit.
export const dynamic = "force-static";

import likMonthly from "../../data/lik/total-index-monthly.json";
import trueflationMonthly from "../../data/trueflation/trueflation-index-monthly.json";
import trueflationYearly from "../../data/trueflation/trueflation-index-yearly.json";

export async function GET() {
  const likValues = likMonthly.values;
  const lastLik = likValues[likValues.length - 1];

  const tfValues = trueflationMonthly.values;
  const lastTf = tfValues[tfValues.length - 1];

  const avgs = trueflationYearly.calendarYearAverages;
  const lastAvg = avgs[avgs.length - 1];
  const firstAvg = avgs[0];

  const body = {
    _comment: "trueflation.ch — maschinenlesbarer Feed. Werte sind reine Ableitungen aus " +
      "denselben Pipeline-Outputs, die auch die Website speisen — keine separate Neuberechnung. " +
      "Formel und Methodik siehe https://trueflation.ch/methodik.",
    generiertAm: new Date().toISOString(),
    lizenz: {
      typ: "CC BY 4.0",
      url: "https://creativecommons.org/licenses/by/4.0/deed.de",
      hinweis: "Namensnennung trueflation.ch erforderlich, kommerzielle Nutzung erlaubt. " +
        "Amtliche Quelldaten (BFS, SNB, BAG) unterliegen eigenen Lizenzbedingungen, siehe /datenquellen.",
    },
    kennzahlen: {
      lik: {
        bezeichnung: "Offizielle Inflation (Landesindex der Konsumentenpreise)",
        basis: likMonthly.basis,
        letzterStand: {
          datum: lastLik.indexDate,
          indexwert: lastLik.indexValue,
        },
        quelle: "Bundesamt für Statistik (BFS)",
      },
      trueflation: {
        bezeichnung: "Trueflation (LIK, ab 2020 miet-korrigiert, + Prämienkorrektur)",
        scope: trueflationMonthly.scope,
        letzterStand: {
          monat: lastTf.month,
          indexwert: lastTf.trueflationIndex,
        },
        jahresdurchschnittWachstumSeit: firstAvg
          ? {
              vonJahr: firstAvg.year,
              bisJahr: lastAvg.year,
              trueflationProzent: Number(
                ((lastAvg.trueflationIndexAvg / firstAvg.trueflationIndexAvg - 1) * 100).toFixed(2)
              ),
              likProzent: Number(
                ((lastAvg.likIndexAvg / firstAvg.likIndexAvg - 1) * 100).toFixed(2)
              ),
            }
          : null,
        methodikUrl: "https://trueflation.ch/methodik",
      },
    },
  };

  return NextResponse.json(body, {
    headers: {
      "Cache-Control": "public, max-age=3600",
    },
  });
}
