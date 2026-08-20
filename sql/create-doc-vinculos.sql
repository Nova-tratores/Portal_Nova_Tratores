-- ============================================================================
-- RASTREIO DE NOTAS — vínculos MANUAIS entre documentos (19/08/2026)
--
-- O matching automático agrupa por chave NF-e / nº+CNPJ / nº+fornecedor;
-- quando ele não acha (grafia diferente, nota sem número), a equipe vincula
-- na mão. Grafo genérico SEM FK (padrão do repo — tabelas legadas não têm
-- PK uniforme). O par é canônico: a rota ordena (tipo_a,id_a) <= (tipo_b,id_b)
-- antes de gravar, então o UNIQUE pega a duplicata invertida.
--
-- tipo_vinculo: 'liga' (une fichas) | 'separa' (reservado pra fase 2).
-- RLS: leitura authenticated; escrita SÓ service role (rotas API).
-- Idempotente. Rodar no SQL Editor do Supabase.
-- ============================================================================

CREATE TABLE IF NOT EXISTS portal_doc_vinculos (
  id BIGSERIAL PRIMARY KEY,
  tipo_a TEXT NOT NULL CHECK (tipo_a IN ('finan_pagar','requisicao','chamado_nf','nota_entrada','nota_saida','titulo_omie')),
  id_a   TEXT NOT NULL,
  tipo_b TEXT NOT NULL CHECK (tipo_b IN ('finan_pagar','requisicao','chamado_nf','nota_entrada','nota_saida','titulo_omie')),
  id_b   TEXT NOT NULL,
  tipo_vinculo TEXT NOT NULL DEFAULT 'liga' CHECK (tipo_vinculo IN ('liga','separa')),
  criado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_por_nome TEXT NOT NULL DEFAULT '',
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((tipo_a, id_a) IS DISTINCT FROM (tipo_b, id_b))
);

CREATE UNIQUE INDEX IF NOT EXISTS doc_vinculos_par_uidx ON portal_doc_vinculos (tipo_a, id_a, tipo_b, id_b);
CREATE INDEX IF NOT EXISTS doc_vinculos_a_idx ON portal_doc_vinculos (tipo_a, id_a);
CREATE INDEX IF NOT EXISTS doc_vinculos_b_idx ON portal_doc_vinculos (tipo_b, id_b);

ALTER TABLE portal_doc_vinculos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS doc_vinculos_select ON portal_doc_vinculos;
CREATE POLICY doc_vinculos_select ON portal_doc_vinculos
  FOR SELECT TO authenticated USING (true);
-- sem policy de escrita: INSERT/DELETE só via service role

NOTIFY pgrst, 'reload schema';
