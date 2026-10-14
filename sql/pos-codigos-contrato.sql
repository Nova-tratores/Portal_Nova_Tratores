-- Códigos do "Nº do Contrato de Venda" da OS (José, 14/10/2026). A lista padrão
-- (planilha "Padronização Códigos Internos") está no código; aqui ficam os
-- códigos ADICIONADOS ou EDITADOS pela tela da OS. Sem esta tabela a lista
-- padrão continua aparecendo, só não dá para adicionar/editar.
CREATE TABLE IF NOT EXISTS pos_codigos_contrato (
  codigo      text PRIMARY KEY,
  quando      text NOT NULL DEFAULT '',
  ativo       boolean NOT NULL DEFAULT true,
  criado_por  text,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE pos_codigos_contrato ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pos_codigos_contrato FROM anon, authenticated;
NOTIFY pgrst, 'reload schema';
