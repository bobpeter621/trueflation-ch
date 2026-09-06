/**
 * trueflation.ch — Wortmarken-Logo (Requirements Abschnitt 6a: "Favicon
 * und Logo, schlicht, funktioniert in beiden Modi")
 *
 * Bewusst kein Bild-Asset (SVG/PNG), sondern ein reines SVG-Text-Wortmark,
 * das die Design-Prinzipien direkt umsetzt (6a): "Zahl vor Zierde",
 * monospace-Akzent auf dem Namensteil, sparsame Farbe (nutzt die bestehende
 * Trueflation-Akzentfarbe als einzigen Farbtupfer, sonst neutral/aktuelle
 * Textfarbe) -- funktioniert in beiden Modi ueber currentColor/CSS-Variablen,
 * kein fest codierter Hex-Wert, der in einem Modus falsch aussehen koennte
 * (exakt die Fehlerklasse aus den K1/color-scheme-Funden, hier von Anfang
 * an vermieden).
 */
export default function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 240 40"
      className={className}
      role="img"
      aria-label="trueflation.ch"
      style={{ height: "1.5em", width: "auto" }}
    >
      {/* Kleines Liniensymbol (zwei divergierende Pfade = Kernaussage der
          Seite: offizielle Inflation vs. Trueflation laufen auseinander) --
          nutzt dieselben zwei Kernlinien-Tokens wie Chart/Rechner (Design-
          Prinzip 6a: "Farbcodierung bleibt konsistent auf allen Screens"). */}
      <path
        d="M2 28 L10 24 L18 26 L26 18"
        fill="none"
        stroke="var(--color-line-lik)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2 30 L10 27 L18 32 L26 12"
        fill="none"
        stroke="var(--color-line-trueflation)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <text
        x="34"
        y="27"
        fontFamily="var(--font-mono), ui-monospace, monospace"
        fontSize="18"
        fontWeight="600"
        fill="currentColor"
      >
        trueflation<tspan fill="var(--color-text-muted)">.ch</tspan>
      </text>
    </svg>
  );
}
