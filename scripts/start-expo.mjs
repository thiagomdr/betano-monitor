import { appendFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const LOG_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'debug-94b3c3.log');
const SESSION_ID = '94b3c3';

function detectLanIp() {
  const nets = networkInterfaces();
  for (const entries of Object.values(nets)) {
    for (const net of entries ?? []) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return '127.0.0.1';
}

function debugLog(hypothesisId, message, data, runId = 'pre-fix') {
  const line = JSON.stringify({
    sessionId: SESSION_ID,
    hypothesisId,
    location: 'scripts/start-expo.mjs',
    message,
    data,
    timestamp: Date.now(),
    runId,
  });
  appendFileSync(LOG_PATH, `${line}\n`);
}

const rawArgs = process.argv.slice(2);
const devClient = rawArgs.includes('--dev-client');
const clearCache = rawArgs.includes('--clear');
const lanIp = detectLanIp();

process.env.REACT_NATIVE_PACKAGER_HOSTNAME = lanIp;

const expoArgs = [
  'expo',
  'start',
  '--lan',
  ...(devClient ? ['--dev-client'] : ['--go']),
  ...(clearCache ? ['--clear'] : []),
];

// #region agent log
debugLog('H1', 'Expo start mode', {
  devClient,
  expoGo: !devClient,
  qrScheme: devClient ? 'exp+betano-monitor://expo-development-client' : 'exp://',
});
debugLog('H2', 'Packager hostname for phone', {
  lanIp,
  envHostname: process.env.REACT_NATIVE_PACKAGER_HOSTNAME,
  note: 'Without LAN IP, manifest uses 127.0.0.1 and phone cannot load bundle',
});

async function verifyManifest(hostname) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const res = await fetch('http://127.0.0.1:8081');
      const text = await res.text();
      const match = text.match(/http:\/\/([^/]+)\/index/);
      const bundleHost = match?.[1] ?? 'unknown';
      debugLog('H2', 'Manifest bundle host verified', {
        bundleHost,
        expected: `${hostname}:8081`,
        ok: bundleHost === `${hostname}:8081`,
        attempt,
      });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  debugLog('H2', 'Manifest bundle host verify failed', { expected: `${hostname}:8081` });
}

setTimeout(() => {
  verifyManifest(lanIp).catch(() => {});
}, 8000);
// #endregion

console.log(`[betano-monitor] LAN IP: ${lanIp}`);
console.log(`[betano-monitor] Modo: ${devClient ? 'development build (APK)' : 'Expo Go'}`);
console.log(`[betano-monitor] Celular deve estar na mesma Wi-Fi e acessar http://${lanIp}:8081`);

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const useShell = process.platform === 'win32';
const spawnCommand = 'npx';

// #region agent log
debugLog('H1', 'spawn config before child', {
  platform: process.platform,
  useShell,
  spawnCommand,
  expoArgs,
  cwd: projectRoot,
  priorError: 'EINVAL when npx.cmd + shell:false on Windows',
});
// #endregion

const child = spawn(spawnCommand, expoArgs, {
  stdio: 'inherit',
  shell: useShell,
  env: process.env,
  cwd: projectRoot,
});

child.on('error', (err) => {
  // #region agent log
  debugLog('H1', 'spawn child error', {
    code: err.code,
    errno: err.errno,
    message: err.message,
    useShell,
    spawnCommand,
  }, 'pre-fix');
  // #endregion
  console.error(err);
  process.exit(1);
});

child.on('exit', (code) => {
  // #region agent log
  debugLog('H1', 'spawn child exit', { code, useShell }, code === 0 ? 'post-fix' : 'pre-fix');
  // #endregion
  process.exit(code ?? 0);
});
