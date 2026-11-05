-- Radar Tratores (05/11/2026): em que passo está o atendimento em andamento (José: "precisa mostrar em
-- que passo está o atendimento"). atendeu = ligando, falta marcar se atendeu; conversa = falta dizer como
-- foi; motivo = falta o motivo de não fazer a 50 h; dispensar = falta o motivo da dispensa.
-- Projeto Supabase: portal (citrhumdk…). Sem a coluna, a tela funciona mas não guarda o passo.
alter table public.radar_tratores_atendimentos add column if not exists passo text
  check (passo is null or passo in ('atendeu', 'conversa', 'motivo', 'dispensar'));
notify pgrst, 'reload schema';
