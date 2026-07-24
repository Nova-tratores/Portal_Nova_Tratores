-- =============================================================================
-- Garantias em DUAS ETAPAS por montadora (Kuhn / Ipacol)
-- Fluxo: enviada (peças na fábrica) → aguardando_servico → ressarcimento_fabrica
--        → aprovada/rejeitada
-- Aplicar manualmente no SQL editor do Supabase ANTES do deploy do portal.
-- 100% aditiva: os apps em produção continuam funcionando sem deploy.
-- =============================================================================

-- 1) Status novos no pipeline
ALTER TABLE garantias DROP CONSTRAINT IF EXISTS garantias_status_check;
ALTER TABLE garantias ADD CONSTRAINT garantias_status_check
  CHECK (status IN ('aberta','em_analise','bo_tecnico','enviada','info_pendente',
                    'aguardando_servico','ressarcimento_fabrica','aprovada','rejeitada'));

-- 2) Timestamps para aging das etapas
ALTER TABLE garantias ADD COLUMN IF NOT EXISTS pecas_retorno_em         TIMESTAMPTZ;
ALTER TABLE garantias ADD COLUMN IF NOT EXISTS ressarcimento_enviado_em TIMESTAMPTZ;

-- 3) Config por montadora: fluxo padrão (tudo junto) ou duas etapas,
--    e se o pedido de ressarcimento sai por e-mail do portal.
ALTER TABLE garantia_montadoras ADD COLUMN IF NOT EXISTS fluxo TEXT NOT NULL DEFAULT 'padrao';
ALTER TABLE garantia_montadoras DROP CONSTRAINT IF EXISTS garantia_montadoras_fluxo_check;
ALTER TABLE garantia_montadoras ADD CONSTRAINT garantia_montadoras_fluxo_check
  CHECK (fluxo IN ('padrao','duas_etapas'));
ALTER TABLE garantia_montadoras ADD COLUMN IF NOT EXISTS ressarcimento_por_email BOOLEAN NOT NULL DEFAULT FALSE;

-- 4) Pendência guarda para onde a garantia volta ao ser respondida.
--    (Uma pendência info_fabrica aberta durante o ressarcimento deve voltar
--    para ressarcimento_fabrica, não para enviada.)
ALTER TABLE garantia_pendencias ADD COLUMN IF NOT EXISTS status_retorno TEXT;

-- 5) Montadoras que já trabalham em duas etapas (só onde existir; não cria)
UPDATE garantia_montadoras SET fluxo = 'duas_etapas' WHERE lower(nome) IN ('kuhn','ipacol');
