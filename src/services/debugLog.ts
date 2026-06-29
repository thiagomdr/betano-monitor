import { NativeModules } from 'react-native';

const SESSION_ID = '94b3c3';
const INGEST_ID = '86615625-6ae5-4e98-a1da-0a5f0f15fc42';

function ingestHost(): string {
  try {
    const scriptURL: string | undefined =
      NativeModules.SourceCode?.getConstants?.()?.scriptURL;
    if (scriptURL) {
      const match = scriptURL.match(/^https?:\/\/([^:/]+)/);
      if (match?.[1] && match[1] !== 'localhost' && match[1] !== '127.0.0.1') {
        return match[1];
      }
    }
  } catch {
    // ignore
  }

  return '127.0.0.1';
}

export function debugLog(
  location: string,
  message: string,
  data: Record<string, unknown>,
  hypothesisId: string,
  runId = 'pre-fix',
): void {
  const payload = {
    sessionId: SESSION_ID,
    hypothesisId,
    location,
    message,
    data,
    timestamp: Date.now(),
    runId,
  };

  if (__DEV__) {
    console.log(`[DBG-${SESSION_ID}]`, JSON.stringify(payload));
  }

  const base = `http://${ingestHost()}:7904`;
  fetch(`${base}/ingest/${INGEST_ID}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Debug-Session-Id': SESSION_ID,
    },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

export function textoIndica404(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes("doesn't exist") ||
    lower.includes('não existe') ||
    lower.includes('not found') ||
    /\b404\b/.test(text)
  );
}
