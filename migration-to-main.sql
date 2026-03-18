-- =============================================
-- MIGRAÇÃO: yvwwqxunabvmmqzznrxl → citrhumdkfivdzbmayde
-- Rodar no SQL Editor do projeto PRINCIPAL
-- Projeto: citrhumdkfivdzbmayde
-- =============================================
-- ATENÇÃO: Após criar as tabelas, importe os dados via CSV
-- (Supabase Dashboard > Table Editor > Import)
-- =============================================

-- =============================================
-- 1. ORDEM DE SERVIÇO (POS)
-- =============================================
CREATE TABLE IF NOT EXISTS "Ordem_Servico" (
  "Id_Ordem" TEXT PRIMARY KEY,
  "Os_Cliente" TEXT,
  "Cnpj_Cliente" TEXT,
  "Endereco_Cliente" TEXT,
  "Os_Tecnico" TEXT,
  "Os_Tecnico2" TEXT DEFAULT '',
  "Data" DATE,
  "Serv_Solicitado" TEXT,
  "Causa" TEXT,
  "Serv_Realizado" TEXT,
  "Qtd_HR" TEXT,
  "Valor_HR" TEXT,
  "Qtd_KM" TEXT,
  "Valor_KM" TEXT,
  "Valor_Total" TEXT,
  "Codigo_Servico" TEXT,
  "Status" TEXT DEFAULT 'Orçamento',
  "ID_PPV" TEXT DEFAULT '',
  "Id_Req" TEXT,
  "Projeto" TEXT DEFAULT '',
  "ID_Relatorio_Final" TEXT,
  "Ordem_Omie" TEXT,
  "Motivo_Cancelamento" TEXT DEFAULT '',
  "Revisao" TEXT DEFAULT '',
  "Tipo_Servico" TEXT DEFAULT 'Manutenção',
  "Desconto" TEXT DEFAULT '0',
  "Desconto_Hora" NUMERIC DEFAULT 0,
  "Desconto_KM" NUMERIC DEFAULT 0,
  "Previsao_Execucao" DATE,
  "Previsao_Faturamento" DATE,
  "id_omie" BIGINT
);

-- =============================================
-- 2. CLIENTES (sync Omie)
-- =============================================
CREATE TABLE IF NOT EXISTS "Clientes" (
  "id_omie" BIGINT PRIMARY KEY,
  "nome_fantasia" TEXT,
  "razao_social" TEXT,
  "cnpj_cpf" TEXT,
  "email" TEXT,
  "telefone" TEXT,
  "cep" TEXT,
  "endereco" TEXT,
  "numero" TEXT,
  "bairro" TEXT,
  "cidade" TEXT,
  "estado" TEXT
);

-- =============================================
-- 3. CLIENTES MANUAIS
-- =============================================
CREATE TABLE IF NOT EXISTS "Clientes_Manuais" (
  "id" BIGSERIAL PRIMARY KEY,
  "Cli_Nome" TEXT,
  "Cli_Cpf_Cnpj" TEXT,
  "Cli_Email" TEXT,
  "Cli_Fone" TEXT,
  "Cli_Endereco" TEXT,
  "Cli_Cidade" TEXT
);

-- =============================================
-- 4. TÉCNICOS
-- =============================================
CREATE TABLE IF NOT EXISTS "Tecnicos_Appsheet" (
  "IdUsuario" TEXT PRIMARY KEY,
  "UsuNome" TEXT,
  "UsuEmail" TEXT
);

-- =============================================
-- 5. MOVIMENTAÇÕES (peças/produtos nos pedidos)
-- =============================================
CREATE TABLE IF NOT EXISTS "movimentacoes" (
  "Id" BIGINT PRIMARY KEY,
  "Id_PPV" TEXT,
  "Data_Hora" TEXT,
  "Tecnico" TEXT,
  "TipoMovimento" TEXT,
  "CodProduto" TEXT,
  "Descricao" TEXT,
  "Qtde" TEXT,
  "Preco" NUMERIC DEFAULT 0
);

-- =============================================
-- 6. PROJETOS (sync Omie)
-- =============================================
CREATE TABLE IF NOT EXISTS "Projeto" (
  "id" BIGSERIAL PRIMARY KEY,
  "id_omie" BIGINT,
  "Nome_Projeto" TEXT,
  "Nome_Cliente" TEXT,
  "Codigo_Cliente" TEXT,
  "Situacao" TEXT,
  "codigo_omie" TEXT
);

-- =============================================
-- 7. LOGS POS
-- =============================================
CREATE TABLE IF NOT EXISTS "logs_ppo" (
  "id" BIGSERIAL PRIMARY KEY,
  "Id_ppo" TEXT,
  "Data_Acao" TEXT,
  "Hora_Acao" TEXT,
  "UsuEmail" TEXT,
  "acao" TEXT,
  "Status_Anterior" TEXT,
  "Status_Atual" TEXT,
  "Dias_Na_Fase" INTEGER DEFAULT 0,
  "Total_Dias_Aberto" INTEGER DEFAULT 0,
  "created_at" TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- 8. LOGS PPV
-- =============================================
CREATE TABLE IF NOT EXISTS "logs_ppv" (
  "id" BIGSERIAL PRIMARY KEY,
  "id_ppv" TEXT,
  "data_hora" TEXT,
  "acao" TEXT,
  "usuario_email" TEXT
);

-- =============================================
-- 9. PEDIDOS (PPV)
-- =============================================
CREATE TABLE IF NOT EXISTS "pedidos" (
  "id_pedido" TEXT PRIMARY KEY,
  "Motivo_Saida_Pedido" TEXT,
  "data" TEXT,
  "cliente" TEXT,
  "Tipo_Pedido" TEXT,
  "valor_total" NUMERIC DEFAULT 0,
  "status" TEXT DEFAULT 'Aberto',
  "tecnico" TEXT,
  "observacao" TEXT,
  "motivo_cancelamento" TEXT DEFAULT '',
  "pedido_omie" TEXT DEFAULT '',
  "email_usuario" TEXT,
  "Tipo_Remessa" TEXT,
  "Motivo_Saida_Remessa" TEXT,
  "Id_Os" TEXT,
  "status_manual_override" BOOLEAN DEFAULT FALSE
);

-- =============================================
-- 10. SOLICITAÇÃO DE REQUISIÇÃO
-- =============================================
CREATE TABLE IF NOT EXISTS "Solicitacao_Requisicao" (
  "IdReq" TEXT,
  "ReqData" TEXT,
  "ReqMotivo" TEXT,
  "Material_Serv_Solicitado" TEXT,
  "ReqQuem" TEXT,
  "ReqTipo" TEXT,
  "Cliente" TEXT,
  "OsVinculada" TEXT,
  "ModeloChassisTrator" TEXT,
  "ReqSolicitante" TEXT,
  "ReqVeiculo" TEXT,
  "ReqHodometro" TEXT,
  "ReqEmail" TEXT,
  "StatusPipefy" TEXT,
  "NumReq" TEXT
);

-- =============================================
-- 11. ATUALIZAR REQUISIÇÃO
-- =============================================
CREATE TABLE IF NOT EXISTS "Atualizar_Req" (
  "ReqREF" TEXT,
  "ReqValor" TEXT
);

-- =============================================
-- 12. REVISÕES PRONTAS
-- =============================================
CREATE TABLE IF NOT EXISTS "Revisoes_Pronta" (
  "IdRevisoes" BIGSERIAL PRIMARY KEY,
  "DescricaoCompleta" TEXT
);

-- =============================================
-- 13. MÉTRICAS DE TÉCNICOS
-- =============================================
CREATE TABLE IF NOT EXISTS "tecnico_metricas" (
  "id" BIGSERIAL PRIMARY KEY,
  "id_ordem" TEXT,
  "tecnico" TEXT,
  "tipo" TEXT,
  "data_inicio" TIMESTAMPTZ,
  "data_fim" TIMESTAMPTZ,
  "dias" INTEGER DEFAULT 0,
  "notificado" BOOLEAN DEFAULT FALSE,
  "observacao" TEXT,
  "created_at" TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- 14. REVISÕES (catálogo de revisões por trator)
-- =============================================
CREATE TABLE IF NOT EXISTS "revisoes" (
  "id" BIGSERIAL PRIMARY KEY,
  "Cod_Trator" TEXT,
  "Trator" TEXT,
  "Horas" TEXT,
  "Cod_Prod_1" TEXT, "Qtd1" INTEGER,
  "Cod_Prod_2" TEXT, "Qtd2" INTEGER,
  "Cod_Prod_3" TEXT, "Qtd3" INTEGER,
  "Cod_Prod_4" TEXT, "Qtd4" INTEGER,
  "Cod_Prod_5" TEXT, "Qtd5" INTEGER,
  "Cod_Prod_6" TEXT, "Qtd6" INTEGER,
  "Cod_Prod_7" TEXT, "Qtd7" INTEGER,
  "Cod_Prod_8" TEXT, "Qtd8" INTEGER,
  "Cod_Prod_9" TEXT, "Qtd9" INTEGER,
  "Cod_Prod_10" TEXT, "Qtd10" INTEGER,
  "Cod_Prod_11" TEXT, "Qtd11" INTEGER,
  "Cod_Prod_12" TEXT, "Qtd12" INTEGER,
  "Cod_Prod_13" TEXT, "Qtd13" INTEGER,
  "Cod_Prod_14" TEXT, "Qtd14" INTEGER,
  "Cod_Prod_15" TEXT, "Qtd15" INTEGER
);

-- =============================================
-- 15. PRODUTOS MANUAIS
-- =============================================
CREATE TABLE IF NOT EXISTS "Produtos_Manuais" (
  "id" BIGSERIAL PRIMARY KEY,
  "Prod_Codigo" TEXT,
  "Prod_Descricao" TEXT,
  "Prod_Preco" TEXT
);

-- =============================================
-- 16. PLACAS (veículos)
-- =============================================
CREATE TABLE IF NOT EXISTS "Placas" (
  "IdPlaca" BIGSERIAL PRIMARY KEY,
  "NumPlaca" TEXT
);

-- =============================================
-- 17. PRODUTOS COMPLETOS (sync Omie)
-- =============================================
CREATE TABLE IF NOT EXISTS "Produtos_Completos" (
  "id_omie" BIGINT PRIMARY KEY,
  "Codigo_Produto" TEXT,
  "Descricao_Produto" TEXT,
  "Preco_Unit" NUMERIC,
  "Preco_Venda" NUMERIC,
  "CMC" NUMERIC,
  "Empresa" TEXT
);

-- =============================================
-- 18. TÉCNICOS (lista simples)
-- =============================================
CREATE TABLE IF NOT EXISTS "Tecnicos" (
  "Id" BIGSERIAL PRIMARY KEY,
  "Nome" TEXT
);

-- =============================================
-- RLS (Row Level Security) - Liberar acesso
-- =============================================
ALTER TABLE "Ordem_Servico" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Clientes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Clientes_Manuais" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Tecnicos_Appsheet" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "movimentacoes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Projeto" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "logs_ppo" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "logs_ppv" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pedidos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Solicitacao_Requisicao" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Atualizar_Req" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Revisoes_Pronta" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tecnico_metricas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "revisoes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Produtos_Manuais" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Placas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Produtos_Completos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Tecnicos" ENABLE ROW LEVEL SECURITY;


-- Políticas: acesso total para usuários autenticados
-- (ajuste conforme necessidade de restrição por função)
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'Ordem_Servico', 'Clientes', 'Clientes_Manuais', 'Tecnicos_Appsheet',
      'movimentacoes', 'Projeto', 'logs_ppo', 'logs_ppv', 'pedidos',
      'Solicitacao_Requisicao', 'Atualizar_Req', 'Revisoes_Pronta',
      'tecnico_metricas', 'revisoes', 'Produtos_Manuais',
      'Placas', 'Produtos_Completos', 'Tecnicos'
    ])
  LOOP
    EXECUTE format(
      'CREATE POLICY "Authenticated full access" ON %I FOR ALL USING (auth.role() = ''authenticated'') WITH CHECK (auth.role() = ''authenticated'')',
      tbl
    );
  END LOOP;
END $$;

-- =============================================
-- ÍNDICES para performance
-- =============================================
CREATE INDEX IF NOT EXISTS idx_os_status ON "Ordem_Servico"("Status");
CREATE INDEX IF NOT EXISTS idx_os_tecnico ON "Ordem_Servico"("Os_Tecnico");
CREATE INDEX IF NOT EXISTS idx_os_data ON "Ordem_Servico"("Data" DESC);
CREATE INDEX IF NOT EXISTS idx_pedidos_status ON "pedidos"("status");
CREATE INDEX IF NOT EXISTS idx_pedidos_id_os ON "pedidos"("Id_Os");
CREATE INDEX IF NOT EXISTS idx_mov_id_ppv ON "movimentacoes"("Id_PPV");
CREATE INDEX IF NOT EXISTS idx_logs_ppo_id ON "logs_ppo"("Id_ppo");
CREATE INDEX IF NOT EXISTS idx_logs_ppv_id ON "logs_ppv"("id_ppv");
CREATE INDEX IF NOT EXISTS idx_metricas_ordem ON "tecnico_metricas"("id_ordem");
CREATE INDEX IF NOT EXISTS idx_clientes_cnpj ON "Clientes"("cnpj_cpf");
CREATE INDEX IF NOT EXISTS idx_projeto_omie ON "Projeto"("id_omie");
