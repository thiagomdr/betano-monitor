import { vincularUsuarioAoScheduler } from './schedulerSupabase';
import { supabase } from './supabase';

export async function entrarComEmailSenha(
  email: string,
  senha: string,
): Promise<{ ok: boolean; mensagem: string }> {
  if (!supabase) {
    return { ok: false, mensagem: 'Supabase não configurado no .env' };
  }

  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password: senha,
  });

  if (error) {
    return { ok: false, mensagem: error.message };
  }

  await vincularUsuarioAoScheduler();

  return { ok: true, mensagem: 'Sessão iniciada' };
}

export async function sair(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut();
}

export async function obterEmailSessao(): Promise<string | null> {
  if (!supabase) return null;

  const { data } = await supabase.auth.getSession();
  return data.session?.user?.email ?? null;
}

export async function temSessaoAtiva(): Promise<boolean> {
  if (!supabase) return false;

  const { data } = await supabase.auth.getSession();
  return Boolean(data.session?.user?.id);
}
