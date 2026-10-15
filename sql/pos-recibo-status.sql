-- OS interna faturada com RECIBO (José, 15/10/2026): nova situação "recibo_emitido".
-- A regra antiga só aceitava as situações de NFS-e e recusava a nova sem avisar.
ALTER TABLE "Ordem_Servico" DROP CONSTRAINT IF EXISTS ordem_servico_faturamento_status_chk;
ALTER TABLE "Ordem_Servico" ADD CONSTRAINT ordem_servico_faturamento_status_chk CHECK (
  faturamento_status IS NULL OR faturamento_status IN (
    'faturando','desconhecido','erro',
    'nfse_aguardando','nfse_autorizada','nfse_rejeitada','nfse_cancelada',
    'recibo_emitido'
  )
);
-- OS que já saíram com recibo e ficaram "aguardando NFS-e"
UPDATE "Ordem_Servico" SET faturamento_status = 'recibo_emitido'
 WHERE recibo_numero IS NOT NULL AND nfse_numero IS NULL AND faturamento_status = 'nfse_aguardando';
NOTIFY pgrst, 'reload schema';
