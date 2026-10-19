-- Centro do Pós-Vendas (José, 16/10/2026): "guardar todas as informações em tabela".
-- Um robô do portal (a cada 10 min os últimos 90 dias; 1x por dia os 4 anos) preenche estas
-- tabelas a partir das fontes (OS, relatórios do app, Omie, PPV, requisições, cartão-frota,
-- vínculo técnico ↔ carro, salários). A tela lê daqui. Só o servidor lê e grava.
-- Sem estas tabelas a tela continua funcionando (calcula na hora, como antes).

-- 1) Uma linha por OS faturada (do portal ou só do Omie)
CREATE TABLE IF NOT EXISTS posvendas_os (
  os               text PRIMARY KEY,          -- OS-0824 · "OMIE 5347" quando só existe no Omie
  numero_omie      text,
  cliente          text,
  data             date NOT NULL,             -- dia do faturamento
  faturado_em      timestamptz,
  tecnicos         text[] NOT NULL DEFAULT '{}',
  horas_cobradas   numeric NOT NULL DEFAULT 0,
  km               numeric NOT NULL DEFAULT 0,
  mao_de_obra      numeric NOT NULL DEFAULT 0,
  deslocamento     numeric NOT NULL DEFAULT 0,
  pecas            numeric NOT NULL DEFAULT 0,
  outros           numeric NOT NULL DEFAULT 0,
  bruto            numeric NOT NULL DEFAULT 0,
  custo_terceiros  numeric NOT NULL DEFAULT 0,  -- requisições Trator-Cliente não cobradas
  custo_por_tipo   jsonb NOT NULL DEFAULT '{}',
  requisicoes      jsonb NOT NULL DEFAULT '[]', -- as requisições que formam o custo
  atualizado_em    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS posvendas_os_data_idx ON posvendas_os (data);

-- 2) Horas do relatório do app: uma linha por OS × dia × técnico
CREATE TABLE IF NOT EXISTS posvendas_horas (
  chave          text PRIMARY KEY,            -- <os>|<dia>|<técnico>|<n>
  os             text NOT NULL,
  data           date NOT NULL,
  tecnico        text NOT NULL,
  horas          numeric NOT NULL DEFAULT 0,
  interna        boolean NOT NULL DEFAULT false,
  motivo_interna text,                         -- tipo de serviço interno · conta corrente interna · contrato X
  cliente        text,
  atualizado_em  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS posvendas_horas_data_idx ON posvendas_horas (data);

-- 3) Gastos do pós-vendas: abastecimento, manutenção do carro e alimentação
CREATE TABLE IF NOT EXISTS posvendas_gastos (
  chave          text PRIMARY KEY,            -- cartao:<id> · req:<id>
  data           date NOT NULL,
  pessoa         text NOT NULL,               -- dono do carro (vínculo) ou quem abasteceu/pediu
  tipo           text NOT NULL CHECK (tipo IN ('abastecimento', 'manutencao', 'alimentacao')),
  origem         text NOT NULL CHECK (origem IN ('cartao', 'requisicao')),
  placa          text,
  valor          numeric NOT NULL DEFAULT 0,
  litros         numeric NOT NULL DEFAULT 0,
  ref            text,
  atualizado_em  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS posvendas_gastos_data_idx ON posvendas_gastos (data);

-- 4) Custo da equipe: salário + encargos de cada técnico (de config_vendedores_relatorio)
CREATE TABLE IF NOT EXISTS posvendas_equipe (
  pessoa         text PRIMARY KEY,
  nome_rh        text,
  salario        numeric NOT NULL DEFAULT 0,
  encargos       numeric NOT NULL DEFAULT 0,
  admissao       text,                        -- YYYY-MM
  demissao       text,                        -- YYYY-MM (null = ativo)
  atualizado_em  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE posvendas_os ENABLE ROW LEVEL SECURITY;
ALTER TABLE posvendas_horas ENABLE ROW LEVEL SECURITY;
ALTER TABLE posvendas_gastos ENABLE ROW LEVEL SECURITY;
ALTER TABLE posvendas_equipe ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON posvendas_os, posvendas_horas, posvendas_gastos, posvendas_equipe FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- 5) Dinheiro parado (José, 16/10/2026): OS que não faturaram — preenchidas esperando faturar e
--    as que passaram da data de execução sem relatório. É uma foto de agora (regravada pelo robô).
CREATE TABLE IF NOT EXISTS posvendas_pendencias (
  os             text PRIMARY KEY,
  tipo           text NOT NULL CHECK (tipo IN ('preenchida', 'atrasada')),
  status         text,
  cliente        text,
  tecnicos       text[] NOT NULL DEFAULT '{}',
  data_ref       date,
  dias           integer NOT NULL DEFAULT 0,
  mao_de_obra    numeric NOT NULL DEFAULT 0,
  deslocamento   numeric NOT NULL DEFAULT 0,
  pecas          numeric NOT NULL DEFAULT 0,
  total          numeric NOT NULL DEFAULT 0,
  garantia       boolean NOT NULL DEFAULT false,
  atualizado_em  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE posvendas_pendencias ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON posvendas_pendencias FROM anon, authenticated;
NOTIFY pgrst, 'reload schema';
