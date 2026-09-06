# trueflation.ch

Community-Projekt: transparente Gegenüberstellung von offizieller Inflation (BFS LIK),
Trueflation (Eigenkonstruktion) und Geldmengenausweitung (SNB) für die Schweiz.
Keine kommerzielle Nutzung, keine Werbung, kein bezahlter Service.

Vollständige Spezifikation: [`docs/requirements-v1.0.md`](docs/requirements-v1.0.md)
— **verbindliche Quelle der Wahrheit für dieses Projekt.**

## Repo-Struktur

```
trueflation/
├── app/            Next.js App Router (Frontend, Chart, Rechner)
├── config/
│   └── sources.json    Whitelist der Datenquellen (US 1.6) — einzige zulässige
│                        Herkunft für Pipeline-Abrufe, SSRF-Schutz
├── data/           Versionierte Zeitreihen (JSON/CSV) — Git-basierte Datenhaltung,
│                    jede Änderung = Commit mit Diff (Abschnitt 11)
├── docs/
│   └── requirements-v1.0.md   Vollständige Requirements — bei jedem Widerspruch
│                               zwischen Code und Dokument gilt das Dokument
├── public/         Next.js statische Assets
├── scripts/
│   └── notify-telegram.sh     Plausi-Freigabe / Fehler-Eskalation (US 1.7, US 5.3)
└── verification/   Ablage für Verifikations-Belege (V1–V8, Abschnitt 12)
```

## Datenquellen-Status (Kurzfassung — Details in Abschnitt 3/12 der Requirements)

| # | Quelle | Status |
|---|---|---|
| V1 | BFS LIK | ✅ Verifiziert — `lik-app.bfs.admin.ch` Fachapp-Endpunkt |
| V2 | KVPI-Teilindex | ⚠️ Teilweise — Korrekturfaktor gefunden, keine Zeitreihe |
| V3 | Strukturerhebung Mietdauer | ✅ Methodik geklärt, Zugriffsweg offen |
| V4–V8 | HABE, LIK-Teilindizes, SNB M2/Leitzins, Twelve Data | Offen |

## Entwicklung

```bash
npm install
npm run dev        # http://localhost:3000
npm run build       # Next.js Production Build (statischer Export gemäss US 5.4)
```

## Docker

```bash
docker build -t trueflation-app .
docker run -p 3000:3000 trueflation-app
```

## Betrieb & Sicherheit

- Alle Pipeline-Abrufe laufen ausschliesslich gegen URLs aus `config/sources.json`
  (Whitelist, US 1.6/1.9 — kein SSRF-Risiko).
- Plausi-Freigaben und Fehler-Eskalationen laufen über den Betreiber-
  Telegram-Kanal (`scripts/notify-telegram.sh`), keine separate
  Notification-Infrastruktur (US 5.3).

### Konfiguration über Umgebungsvariablen (Self-Hosting/Fork)

Secrets und betreiber-spezifische Pfade sind **nicht hartcodiert**, sondern
über Umgebungsvariablen konfigurierbar. Alle Defaults sind rückwärtskompatibel
zur ursprünglichen Produktivumgebung:

| Variable | Zweck | Default |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Telegram-Bot-Token direkt (Vorrang vor Datei; GitHub-Actions-Muster) | — |
| `TELEGRAM_CHAT_ID` | Telegram-Chat-ID direkt (Vorrang vor Config-Extraktion) | — |
| `TWELVEDATA_API_KEY` | Twelve-Data-API-Key direkt (Vorrang vor Datei; GitHub-Actions-Muster) | — |
| `TRUEFLATION_SECRETS_DIR` | Verzeichnis der Secret-Dateien (`telegram-token`, `twelvedata-api-key`) | `${HOME}/.openclaw/secrets` |
| `TRUEFLATION_OPERATOR_CONFIG` | Betreiber-Config-Datei, aus der die Chat-ID gelesen wird, falls `TELEGRAM_CHAT_ID` nicht gesetzt | `${HOME}/.openclaw/openclaw.json` |

In GitHub Actions werden `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` und
`TWELVEDATA_API_KEY` als verschlüsselte Repo-Secrets hinterlegt
(Settings → Secrets and variables → Actions) und den Pipeline-Schritten
als Env-Vars gereicht — siehe `.github/workflows/pipeline.yml`.
Lokal genügt der Default-Pfad: Dateien `<TRUEFLATION_SECRETS_DIR>/telegram-token`
und `<TRUEFLATION_SECRETS_DIR>/twelvedata-api-key` (je eine Zeile, chmod 600).
Secrets NIEMALS ins Repo committen.

## Lizenz

Eigene Inhalte (berechnete Werte, Grafiken, Feed-Daten): CC BY (siehe US 4.9).
Zugrundeliegende amtliche Daten (BFS, SNB) unterliegen eigenen Lizenzbedingungen —
siehe Quellenangaben auf der Seite.
