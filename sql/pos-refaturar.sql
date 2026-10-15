-- "Cancelar nota e refazer" na OS faturada (José, 14/10/2026).
-- 1) histórico das notas anteriores da OS (a cancelada fica guardada aqui);
-- 2) a trava da OS faturada passa a deixar trocar o nº do Omie e limpar o
--    faturamento SÓ quando a nota foi cancelada pelo portal
--    (faturamento_status = 'nfse_cancelada'). Fora isso continua protegendo.
-- Sem este SQL o botão responde "rode sql/pos-refaturar.sql" e nada é cancelado.

ALTER TABLE "Ordem_Servico" ADD COLUMN IF NOT EXISTS faturamento_anterior jsonb;

CREATE OR REPLACE FUNCTION tg_os_faturada_protege()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.faturado_omie_em IS NOT NULL AND COALESCE(OLD.faturamento_status, '') <> 'nfse_cancelada' THEN
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

NOTIFY pgrst, 'reload schema';
