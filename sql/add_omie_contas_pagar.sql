-- Integração Omie — Contas a Pagar
-- Rastreia o lançamento de contas a pagar criado no Omie a partir de um registro finan_pagar.

ALTER TABLE "finan_pagar" ADD COLUMN IF NOT EXISTS "omie_cod_lancamento" TEXT;   -- codigo_lancamento_omie (ou lista separada por vírgula, no caso de parcelado)
ALTER TABLE "finan_pagar" ADD COLUMN IF NOT EXISTS "omie_empresa"        TEXT;   -- 'Nova Tratores' | 'Castro Peças'
ALTER TABLE "finan_pagar" ADD COLUMN IF NOT EXISTS "omie_sync_em"        TIMESTAMPTZ;
ALTER TABLE "finan_pagar" ADD COLUMN IF NOT EXISTS "omie_categoria"      TEXT;   -- codigo_categoria usado (referência)
ALTER TABLE "finan_pagar" ADD COLUMN IF NOT EXISTS "omie_conta_corrente" BIGINT; -- id_conta_corrente usado (referência)
ALTER TABLE "finan_pagar" ADD COLUMN IF NOT EXISTS "omie_projeto"        BIGINT; -- codigo_projeto usado (referência)

-- Cache opcional: código do fornecedor no Omie (evita reconsultar por CNPJ a cada envio).
-- Pode haver códigos diferentes por empresa; guardamos o da Nova Tratores como principal.
ALTER TABLE "Fornecedores" ADD COLUMN IF NOT EXISTS "id_omie"            BIGINT;
ALTER TABLE "Fornecedores" ADD COLUMN IF NOT EXISTS "id_omie_castro"     BIGINT;

-- ---- Rascunho / Gate de envio ----
ALTER TABLE "finan_pagar" ADD COLUMN IF NOT EXISTS "status_envio"        TEXT DEFAULT 'rascunho';
-- valores: 'rascunho' | 'validado' | 'enviado' | 'erro'
ALTER TABLE "finan_pagar" ADD COLUMN IF NOT EXISTS "omie_ultimo_erro"    TEXT;
ALTER TABLE "finan_pagar" ADD COLUMN IF NOT EXISTS "omie_validado_em"    TIMESTAMPTZ;

-- ---- Enriquecimento Omie ----
ALTER TABLE "finan_pagar" ADD COLUMN IF NOT EXISTS "omie_vendedor"       BIGINT;  -- codigo_vendedor
ALTER TABLE "finan_pagar" ADD COLUMN IF NOT EXISTS "omie_tipo_documento" TEXT;    -- ex. "NFE", "REC", "BOL"
ALTER TABLE "finan_pagar" ADD COLUMN IF NOT EXISTS "omie_departamento"   TEXT;    -- codigo_departamento (opcional)

-- ---- Cache de vendedor/projeto Omie em entidades já existentes ----
-- Reaproveita o padrão de Fornecedores.id_omie / id_omie_castro.
ALTER TABLE "req_usuarios" ADD COLUMN IF NOT EXISTS "id_vendedor_omie"        BIGINT;
ALTER TABLE "req_usuarios" ADD COLUMN IF NOT EXISTS "id_vendedor_omie_castro" BIGINT;

ALTER TABLE "SupaPlacas"  ADD COLUMN IF NOT EXISTS "id_projeto_omie"          BIGINT;
ALTER TABLE "SupaPlacas"  ADD COLUMN IF NOT EXISTS "id_projeto_omie_castro"   BIGINT;

-- ---- NF-e (dados parseados do XML) ----
ALTER TABLE "finan_pagar" ADD COLUMN IF NOT EXISTS "nfe_chave"           TEXT;    -- 44 dígitos
ALTER TABLE "finan_pagar" ADD COLUMN IF NOT EXISTS "nfe_serie"           TEXT;
ALTER TABLE "finan_pagar" ADD COLUMN IF NOT EXISTS "nfe_data_emissao"    DATE;
ALTER TABLE "finan_pagar" ADD COLUMN IF NOT EXISTS "nfe_cnpj_emitente"   TEXT;
ALTER TABLE "finan_pagar" ADD COLUMN IF NOT EXISTS "nfe_xml_url"         TEXT;    -- storage bucket 'anexos'

CREATE UNIQUE INDEX IF NOT EXISTS idx_finan_pagar_nfe_chave
  ON "finan_pagar" ("nfe_chave") WHERE "nfe_chave" IS NOT NULL;
