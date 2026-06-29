import { POLL_MAX_MS, POLL_MIN_MS } from '../constants';
import { startAlertasPoller, stopAlertasPoller, sincronizarUltimoAlertaVisto } from './alertasPoller';
import { executarBetanoColeta } from './betanoColetaSupabase';
import { hasBackgroundJobNativeModule } from './nativeCapabilities';
import { getForegroundServiceOptions } from './notifications';
import {
  runCollectionCycle,
  runCollectionCycleComErro,
  runCollectionCycleFromApi,
} from './processGames';
import {
  formatarStatusScheduler,
  iniciarMonitorNuvem,
  obterStatusScheduler,
  pararMonitorNuvem,
} from './schedulerSupabase';
import { supabaseConfigurado } from './supabase';
import {
  executarColetaWeb,
  randomPollDelay,
  sleep,
} from './scrapeBridge';

type BackgroundJobType = typeof import('react-native-background-actions').default;

function loadBackgroundJob(): BackgroundJobType | null {
  if (!hasBackgroundJobNativeModule()) return null;
  return require('react-native-background-actions').default as BackgroundJobType;
}

export type MonitorStatus =
  | 'idle'
  | 'running'
  | 'collecting'
  | 'error';

let status: MonitorStatus = 'idle';
let lastMessage = 'Monitor parado';
let lastRunAt: string | null = null;
let onStatusChange: ((message: string) => void) | null = null;
let cloudStatusTimer: ReturnType<typeof setInterval> | null = null;
let cloudMonitorAtivo = false;

function setStatus(next: MonitorStatus, message: string): void {
  status = next;
  lastMessage = message;
  onStatusChange?.(message);
}

async function atualizarStatusNuvem(): Promise<void> {
  const scheduler = await obterStatusScheduler();
  if (!scheduler?.ativo) {
    if (cloudMonitorAtivo) {
      cloudMonitorAtivo = false;
      stopAlertasPoller();
      setStatus('idle', 'Monitor na nuvem parado');
    }
    return;
  }

  cloudMonitorAtivo = true;
  const msg = formatarStatusScheduler(scheduler);
  if (scheduler.lastRunAt) {
    lastRunAt = scheduler.lastRunAt;
  }
  setStatus('running', msg);
}

function startCloudStatusPolling(): void {
  if (cloudStatusTimer) return;
  void atualizarStatusNuvem();
  cloudStatusTimer = setInterval(() => {
    void atualizarStatusNuvem();
  }, 30_000);
}

function stopCloudStatusPolling(): void {
  if (!cloudStatusTimer) return;
  clearInterval(cloudStatusTimer);
  cloudStatusTimer = null;
}

export function getMonitorSnapshot() {
  const job = loadBackgroundJob();
  const isRunning = supabaseConfigurado
    ? cloudMonitorAtivo
    : job?.isRunning() ?? false;

  return {
    status,
    lastMessage,
    lastRunAt,
    isRunning,
  };
}

export function subscribeMonitorStatus(listener: (message: string) => void): () => void {
  onStatusChange = listener;
  return () => {
    if (onStatusChange === listener) {
      onStatusChange = null;
    }
  };
}

async function executarCicloColetaSupabase(): Promise<string> {
  setStatus('collecting', 'Coletando basquete via Supabase (API JSON)...');
  const { resultado, erro } = await executarBetanoColeta();

  if (erro || !resultado) {
    throw new Error(erro ?? 'Falha na coleta Supabase');
  }

  if (resultado.blocked) {
    throw new Error(resultado.summary);
  }

  if (!resultado.ok) {
    throw new Error(resultado.summary);
  }

  const resumoJson = JSON.stringify({
    collectedAt: resultado.collectedAt,
    summary: resultado.summary,
    gameCount: resultado.gameCount,
    fetch: resultado.fetch,
  });

  const result = await runCollectionCycleFromApi(resultado.games, resumoJson);
  lastRunAt = new Date().toISOString();

  if (result.games.length === 0) {
    throw new Error(
      `${resultado.summary}. API respondeu mas nenhum jogo válido foi encontrado.`,
    );
  }

  return `${result.message} (API Betano) — ${new Date().toLocaleTimeString('pt-BR')}`;
}

async function executarCicloColetaWebView(): Promise<string> {
  setStatus('collecting', 'Navegando para basquete ao vivo...');
  const scrape = await executarColetaWeb();
  const result = await runCollectionCycle(scrape.text);
  lastRunAt = new Date().toISOString();

  const sourceLabel =
    result.source === 'local'
      ? 'parser local'
      : result.source === 'llm'
        ? 'GPT-4o-mini'
        : 'sem dados';

  if (result.games.length === 0) {
    throw new Error(
      `${result.message} (${sourceLabel}). Página carregou mas nenhum jogo válido foi encontrado.`,
    );
  }

  return `${result.message} (${sourceLabel}) — ${new Date().toLocaleTimeString('pt-BR')}`;
}

async function executarCicloColeta(): Promise<string> {
  if (supabaseConfigurado) {
    return executarCicloColetaSupabase();
  }
  return executarCicloColetaWebView();
}

async function monitorLoopLocal(): Promise<void> {
  const job = loadBackgroundJob();
  if (!job) return;

  while (job.isRunning()) {
    try {
      const message = await executarCicloColetaWebView();
      setStatus('running', message);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Erro desconhecido no monitor';
      setStatus('error', message);

      try {
        const scrape = await executarColetaWeb().catch(() => null);
        if (scrape) {
          await runCollectionCycleComErro(scrape.text, message);
        }
      } catch {
        // falha ao registrar erro no Supabase não deve parar o loop
      }
    }

    const delay = randomPollDelay(POLL_MIN_MS, POLL_MAX_MS);
    await sleep(delay);
  }

  setStatus('idle', 'Monitor parado');
}

export async function startMonitor(): Promise<void> {
  if (supabaseConfigurado) {
    try {
      const message = await iniciarMonitorNuvem();
      await sincronizarUltimoAlertaVisto();
      startAlertasPoller();
      startCloudStatusPolling();
      cloudMonitorAtivo = true;
      setStatus('running', message);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao iniciar monitor na nuvem';
      setStatus('error', message);
      return;
    }
  }

  const job = loadBackgroundJob();
  if (!job) {
    setStatus(
      'error',
      'Monitor em background exige dev client ou APK. No Expo Go use "Coletar agora".',
    );
    return;
  }

  if (job.isRunning()) return;

  await job.start(monitorLoopLocal, getForegroundServiceOptions());
  setStatus('running', 'Monitor iniciado (local)');
}

export async function stopMonitor(): Promise<void> {
  if (supabaseConfigurado) {
    try {
      await pararMonitorNuvem();
    } catch {
      // ignorar
    }
    stopAlertasPoller();
    stopCloudStatusPolling();
    cloudMonitorAtivo = false;
    setStatus('idle', 'Monitor na nuvem parado');
    return;
  }

  const job = loadBackgroundJob();
  if (!job || !job.isRunning()) {
    setStatus('idle', 'Monitor parado');
    return;
  }

  await job.stop();
  setStatus('idle', 'Monitor parado');
}

export async function collectOnce(): Promise<string> {
  try {
    const message = await executarCicloColeta();
    setStatus('idle', message);
    return message;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Falha na coleta manual';
    setStatus('idle', message);

    try {
      if (supabaseConfigurado) {
        const { resultado } = await executarBetanoColeta();
        const texto =
          resultado != null
            ? JSON.stringify({
                collectedAt: resultado.collectedAt,
                summary: resultado.summary,
                gameCount: resultado.gameCount,
              })
            : message;
        await runCollectionCycleComErro(texto, message);
      } else {
        const scrape = await executarColetaWeb().catch(() => null);
        if (scrape) {
          await runCollectionCycleComErro(scrape.text, message);
        }
      }
    } catch {
      // ignorar falha ao registrar erro
    }

    throw error instanceof Error ? error : new Error(message);
  }
}

export async function bootstrapMonitorNuvem(): Promise<void> {
  if (!supabaseConfigurado) return;

  const scheduler = await obterStatusScheduler();
  if (scheduler?.ativo) {
    await sincronizarUltimoAlertaVisto();
    startAlertasPoller();
    startCloudStatusPolling();
    cloudMonitorAtivo = true;
    setStatus('running', formatarStatusScheduler(scheduler));
  }
}
