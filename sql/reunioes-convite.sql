-- =====================================================================
-- REUNIÕES — convite (José, 23/11/2026)
-- 1) celular do usuário, para o botão de WhatsApp (wa.me) abrir a conversa certa
-- 2) resposta ao convite: aceitou ou recusou (null = ainda não respondeu)
-- Só ACRESCENTA colunas; não apaga nada. Pode rodar mais de uma vez.
-- Rodar no Supabase: SQL Editor → colar tudo → Run.
-- =====================================================================

alter table public.financeiro_usu add column if not exists celular text;
comment on column public.financeiro_usu.celular is 'Só dígitos com 55 na frente (ex.: 5515999991234). Usado no wa.me do convite de reunião.';

alter table public.reunioes_presencas add column if not exists resposta text;
alter table public.reunioes_presencas drop constraint if exists reunioes_presencas_resposta_chk;
alter table public.reunioes_presencas add constraint reunioes_presencas_resposta_chk check (resposta is null or resposta in ('aceito', 'recusado'));
alter table public.reunioes_presencas add column if not exists respondido_em timestamptz;

-- quem conduz já conta como "aceito" nas reuniões que ainda não aconteceram
update public.reunioes_presencas p set resposta = 'aceito', respondido_em = now()
  from public.tickets t
 where t.id = p.reuniao_id and p.papel = 'condutor' and p.resposta is null
   and t.reuniao_etapa in ('agendada', 'pauta_fechada');

-- Desfazer (se precisar):
-- alter table public.reunioes_presencas drop column if exists respondido_em;
-- alter table public.reunioes_presencas drop column if exists resposta;
-- alter table public.financeiro_usu drop column if exists celular;
