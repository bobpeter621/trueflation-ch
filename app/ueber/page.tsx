/**
 * trueflation.ch — Über/Disclaimer-Seite (Screen 5, Requirements Abschnitt 6+7)
 */

import { ueber } from "../i18n/content/ueber";

export const metadata = {
  title: "Über trueflation.ch",
  description: "Projekthintergrund, Disclaimer und Lizenzhinweise.",
};

export default function UeberPage() {
  return (
    <div className="flex flex-col min-h-screen items-center px-4 py-12 sm:px-8">
      <main className="w-full max-w-2xl flex flex-col gap-8">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">{ueber.heading}</h1>
          <p className="mt-2 text-sm" style={{ color: "var(--color-text-secondary)" }}>
            {ueber.intro}
          </p>
        </header>

        <section aria-labelledby="disclaimer-heading">
          <h2 id="disclaimer-heading" className="text-lg font-medium">
            {ueber.disclaimerHeading}
          </h2>
          <p className="mt-2 text-sm" style={{ color: "var(--color-text-secondary)" }}>
            {ueber.disclaimerText}
          </p>
        </section>

        <section aria-labelledby="non-commercial-heading">
          <h2 id="non-commercial-heading" className="text-lg font-medium">
            {ueber.nonCommercialHeading}
          </h2>
          <p className="mt-2 text-sm" style={{ color: "var(--color-text-secondary)" }}>
            {ueber.nonCommercialText}{" "}
            <a href="https://creativecommons.org/licenses/by/4.0/deed.de" className="underline">
              {ueber.licenseLinkText}
            </a>
            .
          </p>
        </section>

        <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
          {ueber.moreInfoText}
          <a href="/methodik" className="underline">
            {ueber.methodikLinkText}
          </a>
          .
        </p>

        <footer className="text-xs" style={{ color: "var(--color-text-muted)" }}>
          <a href="/impressum" className="underline">
            Impressum &amp; Datenschutz
          </a>
        </footer>
      </main>
    </div>
  );
}
