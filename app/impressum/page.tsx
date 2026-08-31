/**
 * trueflation.ch — Impressum & Datenschutz (Screen 7, US 5.7)
 */

import { impressum } from "../i18n/content/impressum";

export const metadata = {
  title: "Impressum & Datenschutz — trueflation.ch",
  description: "Verantwortlicher, Kontakt und Datenschutzerklärung.",
};

export default function ImpressumPage() {
  return (
    <div className="flex flex-col min-h-screen items-center px-4 py-12 sm:px-8">
      <main className="w-full max-w-2xl flex flex-col gap-8">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">{impressum.heading}</h1>
        </header>

        <section aria-labelledby="impressum-heading">
          <h2 id="impressum-heading" className="text-lg font-medium">
            {impressum.impressumHeading}
          </h2>
          <p className="mt-2 text-sm" style={{ color: "var(--color-text-secondary)" }}>
            {impressum.impressumIntro}
          </p>
          <dl className="mt-3 flex flex-col gap-2 text-sm">
            <div>
              <dt className="font-medium">{impressum.operatorLabel}</dt>
              <dd style={{ color: "var(--color-text-secondary)" }}>{impressum.operatorPlaceholder}</dd>
            </div>
            <div>
              <dt className="font-medium">{impressum.contactLabel}</dt>
              <dd style={{ color: "var(--color-text-secondary)" }}>
                <a href={`mailto:${impressum.contactPlaceholder}`} className="underline">
                  {impressum.contactPlaceholder}
                </a>
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs" style={{ color: "var(--color-text-muted)" }}>
            {impressum.pseudonymNote}
          </p>
        </section>

        <section aria-labelledby="datenschutz-heading">
          <h2 id="datenschutz-heading" className="text-lg font-medium">
            {impressum.datenschutzHeading}
          </h2>
          <p className="mt-2 text-sm" style={{ color: "var(--color-text-secondary)" }}>
            {impressum.datenschutzIntro}
          </p>

          <h3 className="mt-4 text-base font-medium">{impressum.analyticsHeading}</h3>
          <p className="mt-1 text-sm" style={{ color: "var(--color-text-secondary)" }}>
            {impressum.analyticsText}
          </p>

          <h3 className="mt-4 text-base font-medium">{impressum.serverLogsHeading}</h3>
          <p className="mt-1 text-sm" style={{ color: "var(--color-text-secondary)" }}>
            {impressum.serverLogsText}
          </p>

          <h3 className="mt-4 text-base font-medium">{impressum.noThirdPartyHeading}</h3>
          <p className="mt-1 text-sm" style={{ color: "var(--color-text-secondary)" }}>
            {impressum.noThirdPartyText}
          </p>
        </section>

        <footer className="text-xs" style={{ color: "var(--color-text-muted)" }}>
          <a href="/ueber" className="underline">
            Über trueflation.ch
          </a>
        </footer>
      </main>
    </div>
  );
}
