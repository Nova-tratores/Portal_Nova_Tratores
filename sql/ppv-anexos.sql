-- Anexos (mídia) + comentários de um Pedido de Venda (PPV).
-- Usado pelo botão "Anexos" da tela do PPV. Mídia vai pro bucket público
-- `requisicoes` (path ppv/<id_pedido>/...). Rodar UMA vez no Supabase.
CREATE TABLE IF NOT EXISTS ppv_anexos (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_pedido    text NOT NULL,                 -- PPV-xxxx
  tipo         text NOT NULL,                 -- 'midia' | 'comentario'
  url          text,                          -- link da mídia (quando tipo='midia')
  nome_arquivo text,
  comentario   text,                          -- texto (quando tipo='comentario')
  autor        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ppv_anexos_pedido_idx ON ppv_anexos (id_pedido);

-- Leitura p/ logados; escrita só via API (service role).
ALTER TABLE ppv_anexos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ppv_anexos_sel ON ppv_anexos;
CREATE POLICY ppv_anexos_sel ON ppv_anexos FOR SELECT TO authenticated USING (true);
