-- Fornecedores: Sigla e Código numérico (13/11/2026) — RODAR ANTES do deploy (idempotente).
-- Código: automático em sequência e único; os que já existem recebem 1..N pela ordem de cadastro (id).
--         O default é do banco, então todo cadastro (Requisições › Fornecedores e o cadastro rápido do
--         Financeiro › Lançar conta) ganha o número sozinho, sem corrida entre duas pessoas.
-- Sigla:  opcional; preenchida, não repete (sem diferenciar maiúscula/minúscula). A tela grava em MAIÚSCULAS.

create sequence if not exists fornecedores_codigo_seq;

alter table "Fornecedores"
  add column if not exists sigla text,
  add column if not exists codigo integer;

-- backfill: quem ainda não tem código recebe o próximo número, pela ordem de cadastro
with base as (select coalesce(max(codigo), 0) as maior from "Fornecedores"),
ordem as (
  select id, row_number() over (order by id) as n
    from "Fornecedores"
   where codigo is null
)
update "Fornecedores" f
   set codigo = base.maior + ordem.n
  from ordem, base
 where f.id = ordem.id;

select setval('fornecedores_codigo_seq', greatest((select coalesce(max(codigo), 0) from "Fornecedores"), 1));

alter table "Fornecedores" alter column codigo set default nextval('fornecedores_codigo_seq');
alter table "Fornecedores" alter column codigo set not null;
alter sequence fornecedores_codigo_seq owned by "Fornecedores".codigo;

create unique index if not exists fornecedores_codigo_uk on "Fornecedores" (codigo);
create unique index if not exists fornecedores_sigla_uk on "Fornecedores" (upper(btrim(sigla)))
  where nullif(btrim(sigla), '') is not null;

-- quem insere pelo navegador precisa poder usar a sequência (o default chama nextval)
grant usage, select on sequence fornecedores_codigo_seq to authenticated, service_role;

notify pgrst, 'reload schema';

-- conferir:
-- select count(*), min(codigo), max(codigo), count(distinct codigo) from "Fornecedores";
