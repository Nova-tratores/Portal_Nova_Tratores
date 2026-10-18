-- OS "faturada" no portal que o Omie NÃO faturou (OS-0822, 16/10/2026).
-- O FaturarOS respondeu "A NFS-e foi faturada com sucesso", o portal carimbou e
-- concluiu, mas a OS seguiu aberta na etapa 30 do Omie e a nota nunca saiu.
-- A reconciliação agora percebe e desfaz o carimbo — para isso a trava da OS
-- faturada também libera quando faturamento_status = 'omie_nao_faturou'
-- (além do 'nfse_cancelada' do sql/pos-refaturar.sql). Fora isso continua protegendo.
-- Sem este SQL o portal só para de procurar a nota e avisa na OS.

CREATE OR REPLACE FUNCTION tg_os_faturada_protege()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.faturado_omie_em IS NOT NULL
     AND COALESCE(OLD.faturamento_status, '') NOT IN ('nfse_cancelada', 'omie_nao_faturou') THEN
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

-- (opcional) a situação nova na lista do CHECK — sem isto o portal usa 'nfse_cancelada'
-- só durante a liberação e termina em 'erro' do mesmo jeito.
ALTER TABLE "Ordem_Servico" DROP CONSTRAINT IF EXISTS ordem_servico_faturamento_status_chk;
ALTER TABLE "Ordem_Servico" ADD CONSTRAINT ordem_servico_faturamento_status_chk CHECK (
  faturamento_status IS NULL OR faturamento_status IN (
    'faturando','desconhecido','erro',
    'nfse_aguardando','nfse_autorizada','nfse_rejeitada','nfse_cancelada',
    'recibo_emitido','omie_nao_faturou'
  )
);
NOTIFY pgrst, 'reload schema';
