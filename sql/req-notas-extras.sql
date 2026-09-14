-- Até 5 notas fiscais por requisição: foto_nf (existente) + foto_nf2..foto_nf5.
-- Caminhos no bucket público `requisicoes`, mesmo idioma de foto_nf.
-- ⚠️ APLICAR ANTES do deploy: conta-da-requisicao, rastreio e a rota de
-- fornecedores fazem select explícito com as colunas novas.

alter table "Requisicao" add column if not exists foto_nf2 text;
alter table "Requisicao" add column if not exists foto_nf3 text;
alter table "Requisicao" add column if not exists foto_nf4 text;
alter table "Requisicao" add column if not exists foto_nf5 text;

notify pgrst, 'reload schema';
