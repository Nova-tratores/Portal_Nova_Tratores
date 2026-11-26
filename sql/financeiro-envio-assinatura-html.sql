-- Assinatura de e-mail (HTML) por usuário — financeiro_envio_config.assinatura_html (05/11/2026).
-- A caixa de e-mail do cabeçalho (CaixaEmail.js) e as rotas /api/financeiro/config-envio e
-- /api/financeiro/caixa-email leem esta coluna, que nunca foi criada: 201 erros
-- "column financeiro_envio_config.assinatura_html does not exist" só em 05/11.
-- Idempotente: pode rodar de novo.

alter table financeiro_envio_config add column if not exists assinatura_html text;

notify pgrst, 'reload schema';

-- Conferência (deve voltar 1 linha):
--   select column_name from information_schema.columns
--   where table_name = 'financeiro_envio_config' and column_name = 'assinatura_html';
