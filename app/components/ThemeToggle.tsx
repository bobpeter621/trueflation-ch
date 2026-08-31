"use client";

/**
 * trueflation.ch — Hell/Dunkel-Umschalter (US 3.18)
 *
 * Zwei Zustände (hell/dunkel). Beim ALLERERSTEN Besuch folgt die Darstellung
 * der Systemeinstellung (prefers-color-scheme, via CSS-Media-Query in
 * tokens.css — dafür wird KEIN data-theme-Attribut gesetzt, damit eine
 * spätere System-Änderung weiterhin durchgreift). Sobald der Besucher
 * manuell umschaltet, wird die Wahl in localStorage ("tf-theme")
 * persistiert und als data-theme-Attribut auf <html> gesetzt — die
 * [data-theme]-Blöcke in tokens.css überschreiben dann die Media-Query.
 *
 * Kein personenbezogenes Tracking: localStorage verlässt den Browser nie,
 * es wird kein Server-Request/Cookie/Analytics daraus abgeleitet.
 *
 * FOUC-Vermeidung: das initiale Setzen von data-theme passiert NICHT hier,
 * sondern synchron in einem Inline-<script> im <head> (layout.tsx), VOR dem
 * ersten Paint und vor der React-Hydration. Diese Komponente übernimmt nur
 * die Interaktivität danach (Klick, Tastatur, Anzeige des aktiven Zustands).
 *
 * Live-Reaktion des Charts: der useThemeColors-Hook in LikChart.tsx
 * beobachtet data-theme via MutationObserver und löst die Token-Farben bei
 * jedem Wechsel neu auf — hier muss nur das Attribut gesetzt werden.
 */

import { useEffect, useState } from "react";

type Theme = "light" | "dark";
const STORAGE_KEY = "tf-theme";

/** Aktuell wirksames Theme: explizites data-theme-Attribut, sonst System. */
function effectiveTheme(): Theme {
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "light" || attr === "dark") return attr;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export default function ThemeToggle() {
  // null bis nach der Hydration — der Server weiss das Theme nicht, ein
  // geratenes Icon/Label würde einen Hydration-Mismatch erzeugen. Der Button
  // rendert deshalb initial mit neutralem Icon und wird im useEffect
  // scharf geschaltet.
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme(effectiveTheme());
    // Ohne manuelle Wahl weiter der Systemeinstellung folgen (Requirement:
    // "Standard folgt der Systemeinstellung") — Icon/Label live nachziehen.
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemChange = () => {
      try {
        if (localStorage.getItem(STORAGE_KEY) !== "light" && localStorage.getItem(STORAGE_KEY) !== "dark") {
          setTheme(mq.matches ? "dark" : "light");
        }
      } catch {
        // localStorage wirft (z.B. strikter Privatmodus): NICHT aus der
        // Systemeinstellung raten — das tatsächlich gesetzte data-theme-
        // Attribut hat Vorrang (sonst zeigen Icon/aria-label den falschen
        // Zustand, während die Seite korrekt weiterrendert).
        const attr = document.documentElement.getAttribute("data-theme");
        setTheme(attr === "light" || attr === "dark" ? attr : mq.matches ? "dark" : "light");
      }
    };
    mq.addEventListener("change", onSystemChange);
    return () => mq.removeEventListener("change", onSystemChange);
  }, []);

  function toggle() {
    const next = effectiveTheme() === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage nicht verfügbar (z.B. strikter Privatmodus): Umschalten
      // funktioniert trotzdem für diese Sitzung, nur ohne Persistenz.
    }
    document.documentElement.setAttribute("data-theme", next);
    setTheme(next);
  }

  const isDark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      className="tf-theme-toggle"
      aria-label={
        theme === null
          ? "Farbmodus umschalten (Hell/Dunkel)"
          : isDark
            ? "Hellmodus aktivieren"
            : "Dunkelmodus aktivieren"
      }
      aria-pressed={isDark}
      title={isDark ? "Hellmodus aktivieren" : "Dunkelmodus aktivieren"}
    >
      {/* Dekoratives Icon — Information steckt im aria-label, nicht im Symbol. */}
      <span aria-hidden="true" className="tf-theme-toggle-icon">
        {theme === null ? "◐" : isDark ? "☀" : "☾"}
      </span>
    </button>
  );
}
