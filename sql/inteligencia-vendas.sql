-- =============================================================================
-- INTELIGÊNCIA DE VENDAS (/inteligencia-vendas) — 18/10/2026
--
-- Três tabelas novas. O resto do módulo só LÊ o que já existe (cadastro Omie,
-- vendas_itens, tratores, Formulario, OS, CRM dos vendedores, agro_*, IBGE).
--   iv_indicacoes .... indicações de clientes (ideia 14)
--   iv_concorrentes .. anúncios/preços/campanhas de outras revendas (ideia 12)
--   iv_cnpj .......... dados da Receita por CNPJ: dos clientes (CNAE, porte,
--                      abertura — ideia 18) e empresas rurais NOVAS da região
--                      (ideia 16, carga pelo script scripts/iv-cnpj-novos.ts)
-- RLS ligado e NENHUMA policy: só a API do portal (service role) lê e grava.
-- Idempotente. APLICAR À MÃO no SQL Editor.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.iv_indicacoes (
  id                bigserial PRIMARY KEY,
  criado_em         timestamptz NOT NULL DEFAULT now(),
  criado_por        text,
  atualizado_em     timestamptz NOT NULL DEFAULT now(),
  -- quem indicou (cliente da base: documento só dígitos; ou só o nome)
  indicante_doc     text,
  indicante_nome    text NOT NULL,
  -- quem foi indicado
  indicado_nome     text NOT NULL,
  indicado_telefone text,
  indicado_cidade   text,
  autorizado        boolean NOT NULL DEFAULT false, -- o indicado aceitou ser procurado
  interesse         text,                           -- máquina que interessa
  vendedor_id       integer,                        -- vendedores.id
  vendedor_nome     text,
  prazo_contato     date,
  status            text NOT NULL DEFAULT 'nova'
                    CHECK (status IN ('nova','contatada','proposta','ganha','perdida')),
  contatado_em      timestamptz,
  beneficio         text,                           -- reconhecimento combinado (se houver)
  beneficio_entregue boolean NOT NULL DEFAULT false,
  obs               text
);
CREATE INDEX IF NOT EXISTS iv_indicacoes_status_idx ON public.iv_indicacoes (status, prazo_contato);
CREATE INDEX IF NOT EXISTS iv_indicacoes_indicante_idx ON public.iv_indicacoes (indicante_doc);

CREATE TABLE IF NOT EXISTS public.iv_concorrentes (
  id          bigserial PRIMARY KEY,
  criado_em   timestamptz NOT NULL DEFAULT now(),
  criado_por  text,
  data_ref    date NOT NULL DEFAULT current_date,
  revenda     text NOT NULL,             -- quem anunciou
  marca       text,
  modelo      text,
  ano         integer,
  condicao    text CHECK (condicao IN ('novo','usado','seminovo')),
  tipo        text NOT NULL DEFAULT 'anuncio'
              CHECK (tipo IN ('anuncio','campanha','evento','loja','outro')),
  preco       numeric(14,2),
  condicoes   text,                      -- prazo, taxa, entrada, brinde…
  cidade      text,
  fonte       text,                      -- link ou "visto no Facebook", "cliente contou"
  obs         text
);
CREATE INDEX IF NOT EXISTS iv_concorrentes_data_idx ON public.iv_concorrentes (data_ref DESC);

CREATE TABLE IF NOT EXISTS public.iv_cnpj (
  cnpj              text PRIMARY KEY,      -- 14 dígitos
  razao_social      text,
  nome_fantasia     text,
  cnae_codigo       text,
  cnae_descricao    text,
  cnaes_secundarios jsonb,
  data_inicio       date,
  situacao          text,
  porte             text,
  municipio         text,
  uf                text,
  municipio_ibge    integer,
  telefone          text,
  origem            text NOT NULL DEFAULT 'cliente' CHECK (origem IN ('cliente','receita')),
  consultado_em     timestamptz NOT NULL DEFAULT now(),
  erro              text
);
CREATE INDEX IF NOT EXISTS iv_cnpj_origem_idx ON public.iv_cnpj (origem, data_inicio DESC);

ALTER TABLE public.iv_indicacoes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iv_concorrentes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iv_cnpj         ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.iv_indicacoes, public.iv_concorrentes, public.iv_cnpj FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';
