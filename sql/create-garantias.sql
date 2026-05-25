-- =============================================================================
-- Módulo de Garantias — Portal Nova Tratores
-- Ciclo completo: técnico solicita -> garantista analisa -> envio à fábrica ->
-- retornos de B.O./pendência -> aprovação/recusa -> reflexo na OS -> relatório.
-- =============================================================================

-- 1) Montadoras configuráveis (checklist montado visualmente pelo admin) -------
CREATE TABLE IF NOT EXISTS garantia_montadoras (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome            TEXT NOT NULL UNIQUE,            -- "Mahindra", "Kuhn", "Ventura"
  ativo           BOOLEAN NOT NULL DEFAULT TRUE,
  checklist_def   JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{id,tipo,label,obrigatorio,opcoes?,secao?}]
  cor             TEXT,                            -- cor do badge em relatórios
  logo_url        TEXT,
  contato_fabrica TEXT,
  criado_por      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2) Numeração sequencial segura (GAR-0001, GAR-0002, ...) ---------------------
CREATE SEQUENCE IF NOT EXISTS garantia_numero_seq START 1;

-- 3) Garantia (uma requisição de garantia) ------------------------------------
CREATE TABLE IF NOT EXISTS garantias (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero        TEXT UNIQUE,                       -- preenchido pelo trigger
  id_ordem      TEXT NOT NULL,                     -- Ordem_Servico.Id_Ordem
  chassis       TEXT,
  modelo        TEXT,
  cliente       TEXT,
  ppv_ids       TEXT,                              -- snapshot de Ordem_Servico.ID_PPV
  montadora_id  UUID REFERENCES garantia_montadoras(id),
  status        TEXT NOT NULL DEFAULT 'aberta'
    CHECK (status IN ('aberta','em_analise','bo_tecnico','enviada','info_pendente','aprovada','rejeitada')),
  tecnico_nome  TEXT NOT NULL,
  garantista_nome    TEXT,
  garantista_user_id UUID,
  -- valores do TÉCNICO
  tecnico_horas NUMERIC(10,2) DEFAULT 0,
  tecnico_km    NUMERIC(10,2) DEFAULT 0,
  tecnico_obs   TEXT,
  -- valores do GARANTISTA (pode ajustar p/ mais ou p/ menos)
  garantista_horas NUMERIC(10,2),
  garantista_km    NUMERIC(10,2),
  garantista_obs   TEXT,
  -- checklist
  checklist_snapshot  JSONB,                       -- cópia congelada da def usada
  checklist_respostas JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- desfecho
  resultado     TEXT CHECK (resultado IN ('aprovada','rejeitada')),
  motivo_recusa TEXT,
  retorno_fabrica_url TEXT,                        -- obrigatório antes de finalizar
  valor_pago_horas NUMERIC(12,2),
  valor_pago_km    NUMERIC(12,2),
  valor_pago_pecas NUMERIC(12,2),                  -- soma das peças aprovadas pela fábrica
  valor_pago_total NUMERIC(12,2),                  -- horas + km + peças aprovadas
  -- tempo
  enviada_fabrica_em TIMESTAMPTZ,
  finalizada_em      TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_garantias_os        ON garantias(id_ordem);
CREATE INDEX IF NOT EXISTS idx_garantias_chassis   ON garantias(chassis);
CREATE INDEX IF NOT EXISTS idx_garantias_status    ON garantias(status);
CREATE INDEX IF NOT EXISTS idx_garantias_montadora ON garantias(montadora_id);
CREATE INDEX IF NOT EXISTS idx_garantias_tecnico   ON garantias(tecnico_nome);
CREATE INDEX IF NOT EXISTS idx_garantias_created   ON garantias(created_at DESC);
-- só uma garantia ativa por OS (permite nova após finalizar a anterior)
CREATE UNIQUE INDEX IF NOT EXISTS uq_garantia_os_ativa ON garantias(id_ordem)
  WHERE status NOT IN ('aprovada','rejeitada');

-- Trigger de numeração
CREATE OR REPLACE FUNCTION set_garantia_numero()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.numero IS NULL OR NEW.numero = '' THEN
    NEW.numero := 'GAR-' || lpad(nextval('garantia_numero_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_garantia_numero ON garantias;
CREATE TRIGGER trg_garantia_numero
  BEFORE INSERT ON garantias
  FOR EACH ROW EXECUTE FUNCTION set_garantia_numero();

-- 4) Peças selecionadas pelo técnico para a garantia --------------------------
CREATE TABLE IF NOT EXISTS garantia_pecas (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  garantia_id    UUID NOT NULL REFERENCES garantias(id) ON DELETE CASCADE,
  cod_produto    TEXT,
  descricao      TEXT NOT NULL,
  quantidade     NUMERIC(10,2) NOT NULL DEFAULT 1,
  preco_unitario NUMERIC(12,2) DEFAULT 0,
  origem         TEXT,                             -- 'ppv' | 'pecasinfo_manual'
  fonte_ppv_id   TEXT,
  resultado      TEXT NOT NULL DEFAULT 'pendente'
    CHECK (resultado IN ('pendente','aprovada','rejeitada')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_garantia_pecas ON garantia_pecas(garantia_id);

-- 5) Pendências: B.O. (pré-fábrica) e Informação Pendente (pós-fábrica) --------
CREATE TABLE IF NOT EXISTS garantia_pendencias (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  garantia_id    UUID NOT NULL REFERENCES garantias(id) ON DELETE CASCADE,
  tipo           TEXT NOT NULL CHECK (tipo IN ('bo','info_fabrica')),
  status         TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','respondida')),
  descricao      TEXT NOT NULL,                    -- o que falta (garantista)
  exige_visita   BOOLEAN NOT NULL DEFAULT FALSE,   -- "ir até a propriedade"
  criado_por     TEXT NOT NULL,
  resposta_texto TEXT,
  respondido_por TEXT,
  respondido_em  TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_garantia_pend         ON garantia_pendencias(garantia_id);
CREATE INDEX IF NOT EXISTS idx_garantia_pend_status  ON garantia_pendencias(status);

-- 6) Anexos (polimórfico: garantia, pendência, resposta, retorno da fábrica) ---
CREATE TABLE IF NOT EXISTS garantia_anexos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  garantia_id   UUID NOT NULL REFERENCES garantias(id) ON DELETE CASCADE,
  pendencia_id  UUID REFERENCES garantia_pendencias(id) ON DELETE CASCADE,
  categoria     TEXT NOT NULL
    CHECK (categoria IN ('tecnico','garantista','pendencia_pedido','pendencia_resposta','retorno_fabrica','envio_fabrica')),
  url           TEXT NOT NULL,
  nome_arquivo  TEXT,
  content_type  TEXT,
  enviado_por   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_garantia_anexos      ON garantia_anexos(garantia_id);
CREATE INDEX IF NOT EXISTS idx_garantia_anexos_pend ON garantia_anexos(pendencia_id);

-- 7) Timeline / histórico de eventos da garantia ------------------------------
CREATE TABLE IF NOT EXISTS garantia_eventos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  garantia_id     UUID NOT NULL REFERENCES garantias(id) ON DELETE CASCADE,
  tipo            TEXT NOT NULL,
  status_anterior TEXT,
  status_novo     TEXT,
  ator            TEXT,
  detalhe         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_garantia_eventos ON garantia_eventos(garantia_id, created_at);

-- 8) RLS habilitado + políticas permissivas para o app ------------------------
ALTER TABLE garantia_montadoras  ENABLE ROW LEVEL SECURITY;
ALTER TABLE garantias            ENABLE ROW LEVEL SECURITY;
ALTER TABLE garantia_pecas       ENABLE ROW LEVEL SECURITY;
ALTER TABLE garantia_pendencias  ENABLE ROW LEVEL SECURITY;
ALTER TABLE garantia_anexos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE garantia_eventos     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "garantia_montadoras_all" ON garantia_montadoras;
DROP POLICY IF EXISTS "garantias_all"           ON garantias;
DROP POLICY IF EXISTS "garantia_pecas_all"      ON garantia_pecas;
DROP POLICY IF EXISTS "garantia_pendencias_all" ON garantia_pendencias;
DROP POLICY IF EXISTS "garantia_anexos_all"     ON garantia_anexos;
DROP POLICY IF EXISTS "garantia_eventos_all"    ON garantia_eventos;

CREATE POLICY "garantia_montadoras_all" ON garantia_montadoras FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "garantias_all"           ON garantias           FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "garantia_pecas_all"      ON garantia_pecas      FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "garantia_pendencias_all" ON garantia_pendencias FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "garantia_anexos_all"     ON garantia_anexos     FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "garantia_eventos_all"    ON garantia_eventos    FOR ALL USING (true) WITH CHECK (true);

-- 9) Realtime (board do garantista + Meu Painel do técnico) -------------------
ALTER PUBLICATION supabase_realtime ADD TABLE garantias;
ALTER PUBLICATION supabase_realtime ADD TABLE garantia_pendencias;

-- 10) Storage bucket para anexos (fotos do técnico, retorno da fábrica) -------
INSERT INTO storage.buckets (id, name, public)
VALUES ('garantias', 'garantias', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "garantias_bucket_read"   ON storage.objects;
DROP POLICY IF EXISTS "garantias_bucket_write"  ON storage.objects;
DROP POLICY IF EXISTS "garantias_bucket_delete" ON storage.objects;
CREATE POLICY "garantias_bucket_read"   ON storage.objects FOR SELECT USING (bucket_id = 'garantias');
CREATE POLICY "garantias_bucket_write"  ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'garantias');
CREATE POLICY "garantias_bucket_delete" ON storage.objects FOR DELETE USING (bucket_id = 'garantias');
