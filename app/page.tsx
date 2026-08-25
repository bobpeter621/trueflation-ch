import LikChart from "./components/LikChartLoader";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen items-center px-4 py-12 sm:px-8">
      <main className="w-full max-w-4xl flex flex-col gap-8">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">trueflation.ch</h1>
          <p className="mt-2 text-sm" style={{ color: "var(--color-text-secondary)" }}>
            Offizielle Inflation, Trueflation und Geldmengenausweitung für die Schweiz —
            transparent gegenübergestellt. (P1: Minimal-Chart, nur Linie 1)
          </p>
        </header>

        <LikChart />
      </main>
    </div>
  );
}
