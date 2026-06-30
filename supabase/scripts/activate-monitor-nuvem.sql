-- Ativa coleta automatica na nuvem (rode no SQL Editor do Supabase)
-- Substitua o e-mail se necessario.

update public.coleta_scheduler
set
  usuario_id = (select id from auth.users where email = 'thiagomdrsouza@gmail.com' limit 1),
  ativo = true,
  next_run_at = now(),
  data_atualizacao = now()
where id = 'default';

select ativo, usuario_id, last_run_at, next_run_at
from public.coleta_scheduler
where id = 'default';
