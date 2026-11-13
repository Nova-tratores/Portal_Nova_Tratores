-- =============================================================================
-- Pedidos de Máquinas (13/11/2026) — o "PPV" do Comercial.
--
-- Tabelas PRÓPRIAS (não a `pedidos` do PPV): uns 15 leitores de `pedidos`
-- (sync POS↔PPV, faturamento da OS, relatórios, mecânicos…) não filtram por
-- tipo e um pedido de máquina vazaria para todos eles.
--
-- Leitura e escrita só pela API /api/pedidos-maquinas/* (service role).
-- RLS ligado sem policy + REVOKE. Idempotente.
-- =============================================================================

CREATE SEQUENCE IF NOT EXISTS public.pedidos_maquinas_seq;

CREATE TABLE IF NOT EXISTS public.pedidos_maquinas (
  id                   bigserial PRIMARY KEY,
  id_pedido            text NOT NULL UNIQUE
                       DEFAULT ('PVM-' || lpad(nextval('public.pedidos_maquinas_seq')::text, 4, '0')),
  status               text NOT NULL DEFAULT 'em_montagem',
  status_desde         timestamptz,
  empresa              text NOT NULL DEFAULT 'Nova Tratores',
  cliente              text,
  cliente_documento    text,
  cliente_cod_omie     bigint,
  vendedor_id          bigint REFERENCES public.vendedores(id),
  proposta_id          bigint,              -- "Formulario".id (sem FK: proposta pode ir para a lixeira)
  valor_total          numeric(14,2) NOT NULL DEFAULT 0,
  previsao_faturamento date,
  observacao           text,
  -- espelho da aba Omie (como no PPV)
  categoria_pedido     text,
  conta_corrente       text,
  cenario_fiscal       text,
  num_contrato         text,
  contato              text,
  dados_nf             text,
  consumo_final        boolean NOT NULL DEFAULT false,
  departamentos        jsonb NOT NULL DEFAULT '[]'::jsonb,
  projeto              text,
  -- retorno da Omie
  pedido_omie          text,
  omie_codigo_pedido   bigint,
  enviado_omie_em      timestamptz,
  nf_numero            text,
  faturado_omie_em     timestamptz,
  faturado_por         text,
  faturando_desde      timestamptz,         -- trava do faturamento (lease)
  motivo_cancelamento  text,
  criado_por           text,
  criado_em            timestamptz NOT NULL DEFAULT now(),
  atualizado_em        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_pedidos_maquinas_status   ON public.pedidos_maquinas (status);
CREATE INDEX IF NOT EXISTS ix_pedidos_maquinas_proposta ON public.pedidos_maquinas (proposta_id) WHERE proposta_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.pedidos_maquinas_itens (
  id              bigserial PRIMARY KEY,
  pedido_id       bigint NOT NULL REFERENCES public.pedidos_maquinas(id) ON DELETE CASCADE,
  codigo          text NOT NULL,            -- SKU (produtos.codigo) — máquina nova é cadastrada por chassi
  codigo_produto  bigint,                   -- id do produto na Omie (produtos.codigo_produto)
  descricao       text NOT NULL,
  familia         text,
  marca           text,
  modelo          text,
  chassi          text,
  qtde            numeric(12,3) NOT NULL DEFAULT 1,
  preco           numeric(14,2) NOT NULL DEFAULT 0,
  desconto        numeric(14,2) NOT NULL DEFAULT 0,
  criado_em       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_pedidos_maquinas_itens_pedido ON public.pedidos_maquinas_itens (pedido_id);

CREATE TABLE IF NOT EXISTS public.pedidos_maquinas_parcelas (
  id                       bigserial PRIMARY KEY,
  pedido_id                bigint NOT NULL REFERENCES public.pedidos_maquinas(id) ON DELETE CASCADE,
  n                        int NOT NULL,
  vencimento               date NOT NULL,
  valor                    numeric(14,2) NOT NULL,
  percentual               numeric(7,2) NOT NULL DEFAULT 0,
  meio                     text NOT NULL DEFAULT 'boleto',
  entrada                  boolean NOT NULL DEFAULT false,
  -- de onde veio na proposta: 0 = entrada, 1..N = parcela N (NULL = digitada no pedido)
  origem_proposta_parcela  int,
  UNIQUE (pedido_id, n)
);

CREATE TABLE IF NOT EXISTS public.pedidos_maquinas_logs (
  id          bigserial PRIMARY KEY,
  pedido_id   bigint NOT NULL REFERENCES public.pedidos_maquinas(id) ON DELETE CASCADE,
  acao        text NOT NULL,
  usuario     text,
  detalhes    jsonb,
  criado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_pedidos_maquinas_logs_pedido ON public.pedidos_maquinas_logs (pedido_id, criado_em DESC);

CREATE TABLE IF NOT EXISTS public.pedidos_maquinas_status_hist (
  id            bigserial PRIMARY KEY,
  pedido_id     bigint NOT NULL REFERENCES public.pedidos_maquinas(id) ON DELETE CASCADE,
  status_de     text,
  status_para   text NOT NULL,
  dias_na_fase  numeric(10,2),
  criado_em     timestamptz NOT NULL DEFAULT now()
);

-- status_desde + histórico por trigger (molde de sql/ppv-status-hist.sql)
CREATE OR REPLACE FUNCTION public.trg_pedidos_maquinas_status()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.atualizado_em := now();
  IF TG_OP = 'INSERT' THEN
    NEW.status_desde := now();
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.pedidos_maquinas_status_hist (pedido_id, status_de, status_para, dias_na_fase)
    VALUES (NEW.id, OLD.status, NEW.status,
      CASE WHEN OLD.status_desde IS NULL THEN NULL
           ELSE round(extract(epoch from (now() - OLD.status_desde)) / 86400.0, 2) END);
    NEW.status_desde := now();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_pedidos_maquinas_status ON public.pedidos_maquinas;
CREATE TRIGGER tg_pedidos_maquinas_status
  BEFORE INSERT OR UPDATE ON public.pedidos_maquinas
  FOR EACH ROW EXECUTE FUNCTION public.trg_pedidos_maquinas_status();

-- histórico da criação (AFTER: precisa do id gerado)
CREATE OR REPLACE FUNCTION public.trg_pedidos_maquinas_status_ins()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.pedidos_maquinas_status_hist (pedido_id, status_de, status_para, dias_na_fase)
  VALUES (NEW.id, NULL, NEW.status, NULL);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tg_pedidos_maquinas_status_ins ON public.pedidos_maquinas;
CREATE TRIGGER tg_pedidos_maquinas_status_ins
  AFTER INSERT ON public.pedidos_maquinas
  FOR EACH ROW EXECUTE FUNCTION public.trg_pedidos_maquinas_status_ins();

-- Pedido faturado não perde o vínculo com a Omie (mesma ideia da trava da OS faturada)
CREATE OR REPLACE FUNCTION public.trg_pedidos_maquinas_faturado()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.faturado_omie_em IS NOT NULL THEN
    NEW.pedido_omie := OLD.pedido_omie;
    NEW.omie_codigo_pedido := OLD.omie_codigo_pedido;
    NEW.faturado_omie_em := OLD.faturado_omie_em;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tg_pedidos_maquinas_faturado ON public.pedidos_maquinas;
CREATE TRIGGER tg_pedidos_maquinas_faturado
  BEFORE UPDATE ON public.pedidos_maquinas
  FOR EACH ROW EXECUTE FUNCTION public.trg_pedidos_maquinas_faturado();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pedidos_maquinas','pedidos_maquinas_itens','pedidos_maquinas_parcelas','pedidos_maquinas_logs','pedidos_maquinas_status_hist'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
  END LOOP;
END $$;
REVOKE ALL ON SEQUENCE public.pedidos_maquinas_seq FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';
