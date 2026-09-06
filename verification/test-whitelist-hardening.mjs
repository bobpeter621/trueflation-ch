#!/usr/bin/env node
/**
 * trueflation.ch — Test: Whitelist-Hardening (Security-Review 05.09.2026,
 * Kimi + Sonnet, Findings 1.1-1.4)
 */
import http from 'node:http';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

let failures = 0;
function report(name, passed, detail) {
  console.log(`[${passed ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
  if (!passed) failures++;
}

async function main() {
  console.log('=== Whitelist-Hardening-Test (Findings 1.1-1.4) ===\n');
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'trueflation-whitelist-test-'));

  const server = http.createServer((req, res) => {
    if (req.url === '/redirect-to-metadata') {
      res.writeHead(302, { Location: 'http://169.254.169.254/latest/meta-data/' });
      res.end();
      return;
    }
    if (req.url === '/redirect-to-allowed') {
      res.writeHead(302, { Location: `http://127.0.0.1:${port}/ok` });
      res.end();
      return;
    }
    if (req.url === '/chunked-huge') {
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
      const chunk = Buffer.alloc(1024 * 1024, 'x');
      let sent = 0;
      const target = 105 * 1024 * 1024;
      const interval = setInterval(() => {
        if (sent >= target) {
          clearInterval(interval);
          res.end();
          return;
        }
        res.write(chunk);
        sent += chunk.length;
      }, 0);
      return;
    }
    if (req.url === '/hangs-forever') {
      return;
    }
    if (req.url === '/ok') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  const sourcesConfig = {
    sources: {
      redirectToMetadata: { url: `http://127.0.0.1:${port}/redirect-to-metadata` },
      redirectToAllowed: { url: `http://127.0.0.1:${port}/redirect-to-allowed` },
      chunkedHuge: { url: `http://127.0.0.1:${port}/chunked-huge` },
      hangsForever: { url: `http://127.0.0.1:${port}/hangs-forever` },
      redirectTarget: { url: `http://127.0.0.1:${port}/ok` },
    },
  };
  const sourcesPath = path.join(tmpDir, 'sources.json');
  writeFileSync(sourcesPath, JSON.stringify(sourcesConfig));

  process.env.TRUEFLATION_SOURCES_CONFIG_PATH = sourcesPath;
  const { fetchWhitelisted, WhitelistViolationError } = await import(
    new URL('../scripts/pipeline/lib/fetch-whitelisted.mjs', import.meta.url).href + '?t=' + Date.now()
  );

  try {
    await fetchWhitelisted(`http://127.0.0.1:${port}/redirect-to-metadata`);
    report('1.1: Redirect auf Cloud-Metadata wird abgelehnt', false, 'Redirect wurde gefolgt — SICHERHEITSLÜCKE');
  } catch (err) {
    report('1.1: Redirect auf Cloud-Metadata wird abgelehnt', err instanceof WhitelistViolationError, err.message);
  }

  try {
    const res = await fetchWhitelisted(`http://127.0.0.1:${port}/redirect-to-allowed`);
    const text = await res.text();
    report('1.1-Kontrolle: Redirect auf whitelistetes Ziel funktioniert', res.status === 200 && text === 'ok', `status=${res.status} body=${text}`);
  } catch (err) {
    report('1.1-Kontrolle: Redirect auf whitelistetes Ziel funktioniert', false, err.message);
  }

  try {
    const res = await fetchWhitelisted(`http://127.0.0.1:${port}/chunked-huge`);
    const buf = await res.arrayBuffer();
    report('1.2: Übergrosse chunked Response ohne Content-Length wird abgelehnt', false, `Response durchgelassen, ${buf.byteLength} Bytes gelesen`);
  } catch (err) {
    report('1.2: Übergrosse chunked Response ohne Content-Length wird abgelehnt', true, err.message);
  }

  const timeoutTestStart = Date.now();
  try {
    await fetchWhitelisted(`http://127.0.0.1:${port}/hangs-forever`);
    report('1.4: Hängender Request wird per Timeout abgebrochen', false, 'Request lief durch (kein Timeout)');
  } catch (err) {
    const elapsed = Date.now() - timeoutTestStart;
    report('1.4: Hängender Request wird per Timeout abgebrochen', elapsed < 60000, `nach ${elapsed}ms: ${err.message}`);
  }

  server.close();

  const insecureSourcesConfig = {
    sources: {
      insecureExternal: { url: 'http://example.com/data.csv' },
    },
  };
  const insecureSourcesPath = path.join(tmpDir, 'sources-insecure.json');
  writeFileSync(insecureSourcesPath, JSON.stringify(insecureSourcesConfig));
  process.env.TRUEFLATION_SOURCES_CONFIG_PATH = insecureSourcesPath;
  const { fetchWhitelisted: fetchWhitelisted2, WhitelistViolationError: WVE2 } = await import(
    new URL('../scripts/pipeline/lib/fetch-whitelisted.mjs', import.meta.url).href + '?t=' + (Date.now() + 1)
  );
  try {
    await fetchWhitelisted2('http://example.com/data.csv');
    report('1.3: Nicht-HTTPS-URL (externer Host) wird abgelehnt', false, 'HTTP-URL wurde durchgelassen — verstösst gegen Requirement 5 (HTTPS/TLS)');
  } catch (err) {
    report('1.3: Nicht-HTTPS-URL (externer Host) wird abgelehnt', err instanceof WVE2, err.message);
  }

  rmSync(tmpDir, { recursive: true, force: true });
  console.log(`\n=== ${failures === 0 ? 'ALLE TESTS BESTANDEN' : `${failures} TEST(S) FEHLGESCHLAGEN`} ===`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
