"use client";

/**
 * trueflation.ch — Hell/Dunkel-Umschalter (US 3.18)
 *
 * Anforderungen (Requirements US 3.18 + Abschnitt 6a):
 * - Umschalter SICHTBAR (vorher: nur prefers-color-scheme, kein manueller
 *   Toggle — Frontend-Review-Fund 06.09.2026, WICHTIG).
 * - Wahl wird lokal respektiert: localStorage (Schlüssel "tf-theme"), KEIN
 *   personenbezogenes Tracking (reine Client-seitige Präferenz, verlässt den
 *   Browser nie).
 * - Standard folgt der Systemeinstellung: ohne gespeicherte Wahl greift
 *   ausschliesslich prefers-color-scheme (tokens.css @media-Block), das
 *   data-theme-Attribut bleibt dann ungesetzt.
 *
 * Zusammenspiel: tokens.css definiert [data-theme="light"]/["dark"]-Overrides,
 * die die System-Präferenz schlagen; LikChart.tsx beobachtet das data-theme-
 * Attribut per MutationObserver und liest die Linienfarben bei jeder
 * Umschaltung neu aus den CSS-Variablen (Chart-Farben folgen sofort).
 *
 * Das Anti-FOUC-Init-Script (layout.tsx, inline im <head>) setzt das
 * data-theme-Attribut bereits vor der Hydration aus localStorage — ohne es
 * flackerte die Seite bei gespeicherter Wahl kurz im System-Schema auf.
 */
import { useEffect, useState } from "react";

const STORAGE_KEY = "tf-theme";
type Theme = "light" | "dark";

function systemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export default function ThemeToggle() {
  // null bis zum Mount (SSR hat keinen Zugriff auf localStorage/System-Präferenz
  // — danach sofort auflösen, damit das Label nie falsch gerendert bleibt).
  const [theme, setTheme] = useState<Theme | null>(null);
  const [isManual, setIsManual] = useState(false);

  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme");
    if (current === "light" || current === "dark") {
      setTheme(current);
      setIsManual(true);
    } else {
      setTheme(systemTheme());
      setIsManual(false);
    }
    // Externe Änderungen am Attribut mitverfolgen (z.B. Init-Script oder ein
    // zweiter Toggle in derselben Seite) — Label bleibt konsistent.
    const observer = new MutationObserver(() => {
      const t = document.documentElement.getAttribute("data-theme");
      if (t === "light" || t === "dark") {
        setTheme(t);
        setIsManual(true);
      }
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage nicht verfügbar (privater Modus o.ä.) — Umschaltung
      // funktioniert trotzdem für die laufende Sitzung, wird nur nicht
      // persistiert. Kein Fehler für den Besucher.
    }
    setTheme(next);
    setIsManual(true);
  }

  const label =
    theme === null ? "Farbschema wechseln" : theme === "dark" ? "Dunkel" : "Hell";

  return (
    <button
      type="button"
      onClick={toggle}
      className="tf-theme-toggle"
      aria-label={`Farbschema wechseln — aktuell: ${label}${isManual ? " (manuell gewählt)" : " (Systemeinstellung)"}`}
      aria-pressed={theme === "dark"}
      title="Hell-/Dunkelmodus umschalten (wird lokal gespeichert)"
    >
      <span aria-hidden="true">{theme === "dark" ? "☾ " : "☀ "}</span>
      {label}
    </button>
  );
}
