-- =============================================================================
-- CONTAS DE TESTE — marca em financeiro_usu (24/11/2026, Fase 0 · B).
--
-- Conta marcada como teste some de todo seletor de pessoa ("Para quem?", Fila,
-- filtros), mas continua existindo e logando: serve para testar o portal.
-- O código (ehContaTeste em src/lib/texto.ts) usa esta coluna quando ela existe;
-- antes de rodar, ele cai no filtro antigo por "teste" no nome/função.
--
-- "Reserva Ortiz" NÃO é marcada: falta confirmar se é conta real.
-- Rodar no Supabase › SQL Editor. Pode rodar de novo sem problema.
-- =============================================================================

-- ------------------------------------------------------------------- SOBE
alter table public.financeiro_usu
  add column if not exists teste boolean not null default false;

comment on column public.financeiro_usu.teste is
  'Conta de teste: não aparece nos seletores de pessoa. Marcar à mão.';

update public.financeiro_usu
   set teste = true
 where nome in ('Mecânico Teste', 'Teste Mobile (Claude)', 'VENDEDOR TESTE 2');

-- Conferir: devem aparecer as 3 contas.
select id, nome, funcao, ativo, teste
  from public.financeiro_usu
 where teste
 order by nome;

-- ------------------------------------------------------------------- DESCE
-- Para desfazer (o código volta sozinho para o filtro por nome):
--   alter table public.financeiro_usu drop column if exists teste;
