-- =============================================================================
-- PEÇA SEM COBRANÇA (PPV e OS)
--
-- Marcar uma peça como "não gerar cobrança" no PPV (ou na OS, que usa o PPV):
--   * o preço das movimentações daquela peça vai a 0 (todas as somas do portal —
--     total do PPV, total da OS, painel dos mecânicos — já ignoram sozinhas);
--   * o preço de antes fica guardado AQUI, junto do motivo, para o PDF mostrar
--     o valor riscado com "não cobrado" e para desmarcar voltar o preço.
-- Um pedido de VENDA com peça assim não vai pro Omie/faturamento: o portal manda
-- desmarcar ou separar a peça numa REMESSA (PPV novo).
--
-- Rodar UMA vez no Supabase (SQL editor). Idempotente.
-- =============================================================================

CREATE TABLE IF NOT EXISTS ppv_itens_sem_cobranca (
  id_ppv          text NOT NULL,
  cod_produto     text NOT NULL,
  motivo          text NOT NULL,
  preco_original  numeric NOT NULL DEFAULT 0,
  por             text,
  em              timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id_ppv, cod_produto)
);

-- Leitura/escrita só pelas rotas do servidor (service role): sem policy, o
-- navegador não lê nem grava direto.
ALTER TABLE ppv_itens_sem_cobranca ENABLE ROW LEVEL SECURITY;
