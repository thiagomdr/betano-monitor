import { supabase, supabaseConfigurado } from './supabase';

export interface SchedulerStatus {
  ativo: boolean;
  usuarioId: string | null;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastIntervalMs: number | null;
}

async function obterUsuarioId(): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.user?.id) return null;
  return data.session.user.id;
}

export async function vincularUsuarioAoScheduler(): Promise<void> {
  if (!supabaseConfigurado || !supabase) return;

  const usuarioId = await obterUsuarioId();
  if (!usuarioId) return;

  const { data: existente } = await supabase
    .from('coleta_scheduler')
    .select('usuario_id')
    .eq('id', 'default')
    .maybeSingle();

  if (existente?.usuario_id && existente.usuario_id !== usuarioId) return;

  await supabase.from('coleta_scheduler').upsert({
    id: 'default',
    usuario_id: usuarioId,
    data_atualizacao: new Date().toISOString(),
  });
}

export async function obterStatusScheduler(): Promise<SchedulerStatus | null> {
  if (!supabaseConfigurado || !supabase) return null;

  const { data, error } = await supabase
    .from('coleta_scheduler')
    .select('ativo, usuario_id, next_run_at, last_run_at, last_interval_ms')
    .eq('id', 'default')
    .maybeSingle();

  if (error || !data) return null;

  return {
    ativo: Boolean(data.ativo),
    usuarioId: (data.usuario_id as string | null) ?? null,
    nextRunAt: (data.next_run_at as string | null) ?? null,
    lastRunAt: (data.last_run_at as string | null) ?? null,
    lastIntervalMs: (data.last_interval_ms as number | null) ?? null,
  };
}

export async function iniciarMonitorNuvem(): Promise<string> {
  if (!supabaseConfigurado || !supabase) {
    throw new Error('Supabase não configurado no .env');
  }

  const usuarioId = await obterUsuarioId();
  if (!usuarioId) {
    throw new Error('Faça login no Supabase antes de iniciar o monitor');
  }

  const agora = new Date().toISOString();
  const { error } = await supabase.from('coleta_scheduler').upsert({
    id: 'default',
    usuario_id: usuarioId,
    ativo: true,
    next_run_at: agora,
    data_atualizacao: agora,
  });

  if (error) throw new Error(error.message);

  return 'Monitor na nuvem ativo — coleta automática a cada 4–8 min (aleatório)';
}

export async function pararMonitorNuvem(): Promise<void> {
  if (!supabaseConfigurado || !supabase) return;

  const { error } = await supabase
    .from('coleta_scheduler')
    .update({
      ativo: false,
      data_atualizacao: new Date().toISOString(),
    })
    .eq('id', 'default');

  if (error) throw new Error(error.message);
}

export function formatarStatusScheduler(status: SchedulerStatus | null): string {
  if (!status) return 'Scheduler não configurado — aplique a migration no Supabase';
  if (!status.ativo) return 'Monitor na nuvem parado';

  const partes = ['Monitor na nuvem ativo'];
  if (status.lastRunAt) {
    partes.push(`última: ${new Date(status.lastRunAt).toLocaleTimeString('pt-BR')}`);
  }
  if (status.nextRunAt) {
    partes.push(`próxima: ${new Date(status.nextRunAt).toLocaleTimeString('pt-BR')}`);
  }
  if (status.lastIntervalMs) {
    const sec = Math.round(status.lastIntervalMs / 1000);
    const min = Math.floor(sec / 60);
    const resto = sec % 60;
    partes.push(`intervalo anterior: ${min}m ${resto}s`);
  }
  return partes.join(' · ');
}
