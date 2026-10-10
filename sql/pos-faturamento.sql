-- ============================================================================
-- POS — FATURAR A OS (NFS-e) PELO PORTAL
--
-- ⚠️ APLICAR ANTES DO DEPLOY. Sem estas colunas a rota de faturar responde 503
-- (de propósito: ato fiscal sem trava persistente pode emitir nota em dobro).
-- O resto do POS segue funcionando igual.
--
-- Plano: docs/pos-faturar-os-plano.md
--
-- Colunas novas em "Ordem_Servico":
--   omie_ncodos          código interno da OS no Omie (nCodOS). Até aqui só se
--                        guardava o cNumOS (Ordem_Omie), que NÃO é chave. As
--                        escritas (AlterarOS/ValidarOS/FaturarOS) usam este.
--   omie_ccodint         cCodIntOS efetivo — quando o código já existia no Omie,
--                        o envio usa "<Id_Ordem>-<timestamp>" e antes ninguém
--                        guardava; consultar pelo Id_Ordem achava a OS ANTIGA.
--   forma_pagamento      "30 dias" | "30/60" | ... | "À vista" (OPCOES_PAGAMENTO)
--                        escolhida na cobrança ou na janela de faturar.
--   faturando_desde      TRAVA: preenchida por um UPDATE condicional antes de
--                        qualquer escrita no Omie; vale 10 min (lease).
--   faturamento_status   faturando | desconhecido | erro | nfse_aguardando |
--                        nfse_autorizada | nfse_rejeitada | nfse_cancelada
--   faturamento_erro     última mensagem (erro do Omie / motivo da prefeitura)
--   faturamento_pecas    resultado por PPV faturado junto [{id, ok, erro, nf}]
--   faturado_omie_em     FaturarOS aceito (ou faturada direto no Omie e
--                        detectada pela reconciliação)
--   faturado_por         e-mail de quem faturou pelo portal
--   nfse_numero / nfse_link   nº da NFS-e e PDF GUARDADO no storage (regra do
--                        resolverNfseDaOS: consulta do gov.br nunca entra aqui)
-- ============================================================================

ALTER TABLE "Ordem_Servico" ADD COLUMN IF NOT EXISTS omie_ncodos        bigint;
ALTER TABLE "Ordem_Servico" ADD COLUMN IF NOT EXISTS omie_ccodint       text;
ALTER TABLE "Ordem_Servico" ADD COLUMN IF NOT EXISTS forma_pagamento    text;
ALTER TABLE "Ordem_Servico" ADD COLUMN IF NOT EXISTS faturando_desde    timestamptz;
ALTER TABLE "Ordem_Servico" ADD COLUMN IF NOT EXISTS faturamento_status text;
ALTER TABLE "Ordem_Servico" ADD COLUMN IF NOT EXISTS faturamento_erro   text;
ALTER TABLE "Ordem_Servico" ADD COLUMN IF NOT EXISTS faturamento_pecas  jsonb;
ALTER TABLE "Ordem_Servico" ADD COLUMN IF NOT EXISTS faturado_omie_em   timestamptz;
ALTER TABLE "Ordem_Servico" ADD COLUMN IF NOT EXISTS faturado_por       text;
ALTER TABLE "Ordem_Servico" ADD COLUMN IF NOT EXISTS nfse_numero        text;
ALTER TABLE "Ordem_Servico" ADD COLUMN IF NOT EXISTS nfse_link          text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ordem_servico_faturamento_status_chk') THEN
    ALTER TABLE "Ordem_Servico" ADD CONSTRAINT ordem_servico_faturamento_status_chk CHECK (
      faturamento_status IS NULL OR faturamento_status IN (
        'faturando','desconhecido','erro',
        'nfse_aguardando','nfse_autorizada','nfse_rejeitada','nfse_cancelada'
      )
    );
  END IF;
END $$;

-- Fila da reconciliação (agendador interno a cada 10 min): só as pendentes.
CREATE INDEX IF NOT EXISTS ordem_servico_faturamento_pendente_idx
  ON "Ordem_Servico" (faturamento_status)
  WHERE faturamento_status IN ('faturando','desconhecido','nfse_aguardando');

-- OS faturada: a identidade no Omie e o carimbo do faturamento não podem ser
-- apagados nem trocados por um "salvar" do drawer ou por um sync antigo.
-- (Status/valores são protegidos nas rotas — 409 — porque têm regra de negócio.)
CREATE OR REPLACE FUNCTION tg_os_faturada_protege()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.faturado_omie_em IS NOT NULL THEN
    IF NEW.faturado_omie_em IS NULL THEN
      NEW.faturado_omie_em := OLD.faturado_omie_em;
    END IF;
    IF COALESCE(NEW."Ordem_Omie", '') <> COALESCE(OLD."Ordem_Omie", '') THEN
      NEW."Ordem_Omie" := OLD."Ordem_Omie";
    END IF;
    IF OLD.omie_ncodos IS NOT NULL AND NEW.omie_ncodos IS DISTINCT FROM OLD.omie_ncodos THEN
      NEW.omie_ncodos := OLD.omie_ncodos;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS os_faturada_protege ON "Ordem_Servico";
CREATE TRIGGER os_faturada_protege
  BEFORE UPDATE ON "Ordem_Servico"
  FOR EACH ROW EXECUTE FUNCTION tg_os_faturada_protege();

NOTIFY pgrst, 'reload schema';
