-- =============================================================================
-- Agenda coletiva ← Rota da semana do app de vendas (NT Vendas) — 21/10/2026
--
-- O vendedor define a rota da semana no app; cada visita vira um compromisso dele
-- na Agenda coletiva. Para a rota poder ser EDITADA sem duplicar, o compromisso
-- guarda de onde veio:
--   origem      'rota_vendas' (NULL = criado à mão na agenda)
--   origem_ref  chave estável do item da rota (ex.: id do contato do feed + dia)
-- Republicar a semana: cria o que é novo, atualiza o que mudou e cancela o que saiu.
-- Só compromissos com origem = 'rota_vendas' são tocados; os manuais nunca.
--
-- Rodar no SQL Editor do Supabase do Portal. Idempotente. Depende de
-- sql/agenda-coletiva.sql (tabela agenda_eventos).
-- =============================================================================

ALTER TABLE agenda_eventos ADD COLUMN IF NOT EXISTS origem TEXT;
ALTER TABLE agenda_eventos ADD COLUMN IF NOT EXISTS origem_ref TEXT;

-- Um item da rota = um compromisso vivo por vendedor
CREATE UNIQUE INDEX IF NOT EXISTS uq_agenda_eventos_origem
  ON agenda_eventos (criado_por, origem, origem_ref)
  WHERE origem IS NOT NULL AND cancelado_em IS NULL;

CREATE INDEX IF NOT EXISTS idx_agenda_eventos_origem_inicio
  ON agenda_eventos (criado_por, origem, inicio)
  WHERE origem IS NOT NULL AND cancelado_em IS NULL;

NOTIFY pgrst, 'reload schema';
