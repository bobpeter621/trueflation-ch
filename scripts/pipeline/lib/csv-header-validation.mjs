/**
 * trueflation.ch — CSV-Header-Validierung (Spaltenüberschriften, US 2.7)
 *
 * FUND (Betreiber-Audit, 28.08.2026): Die SNB-CSV-Parser (bulk-import-snb-m2.mjs,
 * bulk-import-snb-leitzins.mjs) erkannten die Header-Zeile nur am PRÄFIX
 * ('"Date"' am Zeilenanfang) und griffen danach POSITIONAL auf die Spalten zu
 * (`const [date, d0, d1, valueStr] = parts`). Würde die Quelle die
 * Spaltenreihenfolge ändern, eine Spalte einfügen/umbenennen — ein beim BFS/SNB
 * bereits mehrfach beobachtetes Muster (siehe LIK-Rebasierung, GM1/GM2-Fund) —
 * würde der Parser stillschweigend falsche Werte in die falschen Felder
 * schreiben, statt abzubrechen. Kein Datenvertrags-Test prüfte die
 * TATSÄCHLICHEN Spaltenüberschriften gegen die erwartete Liste.
 *
 * DIESES MODUL schliesst die Lücke: `assertExactColumns()` prüft die
 * geparste Header-Zeile gegen eine erwartete Spaltenliste (Name + Reihenfolge,
 * da die nachgelagerten Parser positional zugreifen) und wirft bei jeder
 * Abweichung — zusätzliche, fehlende, umsortierte oder umbenannte Spalten.
 */

class HeaderValidationError extends Error {
  constructor(issues) {
    super(`Header-Validierung fehlgeschlagen:\n  - ${issues.join('\n  - ')}`);
    this.name = 'HeaderValidationError';
  }
}

/**
 * @param {string[]} actualColumns - aus der Header-Zeile geparste Spaltennamen, in Reihenfolge
 * @param {string[]} expectedColumns - erwartete Spaltennamen, in der exakt erwarteten Reihenfolge
 * @param {string} context - für die Fehlermeldung, z.B. "snb-m2" oder "snb-leitzins-current"
 * @throws {HeaderValidationError} bei jeder Abweichung (fehlend, zusätzlich, falsche Reihenfolge, umbenannt)
 */
export function assertExactColumns(actualColumns, expectedColumns, context) {
  const issues = [];

  if (actualColumns.length !== expectedColumns.length) {
    issues.push(
      `${context}: Spaltenanzahl weicht ab — erwartet ${expectedColumns.length} (${expectedColumns.join(', ')}), ` +
      `gefunden ${actualColumns.length} (${actualColumns.join(', ')}).`
    );
  }

  const missing = expectedColumns.filter((c) => !actualColumns.includes(c));
  const unexpected = actualColumns.filter((c) => !expectedColumns.includes(c));
  if (missing.length > 0) {
    issues.push(`${context}: fehlende Spalte(n): ${missing.join(', ')}.`);
  }
  if (unexpected.length > 0) {
    issues.push(`${context}: unerwartete Spalte(n): ${unexpected.join(', ')}.`);
  }

  // Reihenfolge nur prüfen, wenn beide Listen dieselben Elemente enthalten
  // (sonst würde die Reihenfolgeprüfung die missing/unexpected-Meldung nur verdoppeln).
  if (missing.length === 0 && unexpected.length === 0) {
    for (let i = 0; i < expectedColumns.length; i++) {
      if (actualColumns[i] !== expectedColumns[i]) {
        issues.push(
          `${context}: Spaltenreihenfolge weicht ab an Position ${i} — erwartet '${expectedColumns[i]}', ` +
          `gefunden '${actualColumns[i]}'. Nachgelagerter Parser greift POSITIONAL zu — stiller Fehler ohne diese Prüfung.`
        );
        break; // eine Reihenfolge-Meldung genügt, weitere wären Folgefehler
      }
    }
  }

  if (issues.length > 0) {
    throw new HeaderValidationError(issues);
  }
}

/** Parst eine einzelne CSV-Zeile im SNB-Quotierungsstil (";"-getrennt, in Anführungszeichen). */
export function parseSnbCsvLine(line) {
  return line.split(';').map((p) => p.replace(/^"|"$/g, ''));
}

export { HeaderValidationError };
