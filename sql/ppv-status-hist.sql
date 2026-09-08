-- ============================================================================
-- PPV — DATA DE MUDANÇA DE FASE (status_desde) + HISTÓRICO (pedidos_status_hist)
--
-- Até aqui `pedidos` não guardava QUANDO a fase mudou (só faturado_omie_em, e
-- só pra "Faturado"). O logs_ppv tem 3 gramáticas de texto, data em 2 formatos
-- e furos (faturamento detectado na etapa 50 do Omie, PPV criado pela OS/rastreio,
-- edição manual sem estado anterior = "Dados atualizados").
--
-- Solução: TRIGGER no banco. Todo caminho que troca `pedidos.status` (PATCH
-- manual, auto-sync com a OS em lib/ppv/queries.ts, lib/pos/sync-ppv.ts, os
-- pontos de lib/ppv/omie.ts, criação pela OS em api/pos/ordens e
-- lib/pecas/os-ppv.ts) passa por aqui sem mudar código de rota.
--
--   pedidos.status_desde   timestamptz  — quando entrou na fase atual.
--                          NULL nos pedidos antigos = "desconhecido" (a tela
--                          mostra travessão). Único backfill seguro: Faturado
--                          com faturado_omie_em.
--   pedidos_status_hist    uma linha por troca REAL de fase (INSERT inicial +
--                          cada UPDATE em que NEW.status <> OLD.status).
--                          Salvar sem trocar a fase NÃO gera linha (o PATCH manda
--                          `status` em todo salvar).
--
-- Autoria (quem trocou) NÃO vai aqui — o PostgREST não passa o usuário pro
-- trigger; continua no logs_ppv como hoje. `manual_override` (=
-- status_manual_override do pedido) ajuda a separar manual × sync.
--
-- O trigger grava o texto CRU do status. Valores legados existem no banco
-- ("Fechado", "Aguardando", "Cancelado", "Aguardando Para Faturar") — quem lê
-- normaliza com normalizarStatus() (lib/ppv/utils.ts), como o resto do PPV.
--
-- Padrão copiado de sql/propostas-evolucao.sql (proposta_status_hist +
-- trg_status_hist). Idempotente — rodar no SQL Editor do Supabase.
-- ============================================================================

ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS status_desde timestamptz;

COMMENT ON COLUMN pedidos.status_desde IS 'Quando o pedido entrou na fase atual (carimbado pelo trigger tg_ppv_status_hist). NULL = desconhecido (anterior à migration).';

CREATE TABLE IF NOT EXISTS pedidos_status_hist (
  id               bigserial PRIMARY KEY,
  id_pedido        text NOT NULL,            -- ex.: PPV-0453 / REM-0005 (sem FK: pedidos.id_pedido é texto e há legado)
  status_de        text,                     -- NULL na criação
  status_para      text NOT NULL,
  dias_na_fase     numeric(10,2),            -- tempo na fase ANTERIOR; NULL quando ela não tinha data
  manual_override  boolean,                  -- pedidos.status_manual_override no momento da troca
  criado_em        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_pedidos_status_hist_pedido ON pedidos_status_hist (id_pedido, criado_em DESC);
CREATE INDEX IF NOT EXISTS ix_pedidos_status_hist_data   ON pedidos_status_hist (criado_em);

ALTER TABLE pedidos_status_hist ENABLE ROW LEVEL SECURITY;
-- Sem policies = anon/authenticated não leem nem escrevem. Só o service role
-- (rota GET /api/ppv/status-hist e o próprio trigger, que roda como dono da tabela).

CREATE OR REPLACE FUNCTION trg_ppv_status_hist()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.status_desde := now();
    INSERT INTO pedidos_status_hist (id_pedido, status_de, status_para, dias_na_fase, manual_override)
    VALUES (NEW.id_pedido, NULL, COALESCE(NEW.status, ''), NULL, NEW.status_manual_override);
    RETURN NEW;
  END IF;

  -- UPDATE: só troca REAL de fase conta.
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO pedidos_status_hist (id_pedido, status_de, status_para, dias_na_fase, manual_override)
    VALUES (
      NEW.id_pedido,
      OLD.status,
      COALESCE(NEW.status, ''),
      CASE WHEN OLD.status_desde IS NULL THEN NULL
           ELSE round(extract(epoch from (now() - OLD.status_desde)) / 86400.0, 2) END,
      NEW.status_manual_override
    );
    NEW.status_desde := now();
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_ppv_status_hist ON pedidos;
CREATE TRIGGER tg_ppv_status_hist
BEFORE INSERT OR UPDATE ON pedidos
FOR EACH ROW EXECUTE FUNCTION trg_ppv_status_hist();

-- Backfill seguro: Faturado com carimbo do faturamento no Omie.
UPDATE pedidos
   SET status_desde = faturado_omie_em
 WHERE status_desde IS NULL
   AND faturado_omie_em IS NOT NULL
   AND status = 'Concluída';

NOTIFY pgrst, 'reload schema';
