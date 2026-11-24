-- =============================================================================
-- SALAS QUE FALTAVAM — Sala Pós Vendas e Sala Irneh (24/11/2026).
--
-- A Agenda já oferecia as 3 salas como "local" (só texto), mas o cadastro de
-- salas de verdade (com reserva e aviso de "sala ocupada") só tinha a "Sala de
-- reunião". Por isso o formulário de reunião mostrava 1 sala só.
--
-- Rodar no Supabase › SQL Editor. Pode rodar de novo sem duplicar.
-- =============================================================================

insert into public.salas (nome, cor, ordem)
select v.nome, v.cor, v.ordem
from (values
  ('Sala Pós Vendas', '#7c3aed', 1),
  ('Sala Irneh',      '#d97706', 2)
) as v(nome, cor, ordem)
where not exists (select 1 from public.salas s where lower(s.nome) = lower(v.nome));

-- Conferir: deve listar as 3 salas.
select nome, cor, ordem, ativa from public.salas order by ordem;
