-- Permissões do Financeiro por aba (10/11/2026) — RODAR ANTES do deploy (só ACRESCENTA chaves; idempotente).
--
-- 1) As áreas do Financeiro novo (Caixa, Compras, Pessoas, Contas do mês, Banco, Recebimentos, Relatório) passam a
--    ter uma chave por aba no Admin (financeiro:<aba>), EXPLÍCITA: o módulo Financeiro inteiro não dá (Pós-Vendas e
--    Peças têm o módulo para os kanbans deles). Antes quem via era "Dev ou função Financeiro" (fixo no código):
--    quem tem a função Financeiro hoje ganha todas as chaves, para ninguém perder acesso.
-- 2) Correção de contas, Baixar contas e Boletos de fornecedor (foram do Ajustes para Financeiro › Caixa em 09/11):
--    ajustes:<x> → financeiro:<x> (e o Ajustes inteiro → as três).
-- Admin e Dev têm tudo sem chave. Sem este SQL, depois do deploy a função Financeiro some das áreas.

with chaves(c) as (values
    ('financeiro:recebimentos'),
    ('financeiro:hoje'),
    ('financeiro:calendario'),
    ('financeiro:vencidos'),
    ('financeiro:contas-cliente'),
    ('financeiro:baixa-contas'),
    ('financeiro:correcao-contas'),
    ('financeiro:boletos-fornecedor'),
    ('financeiro:compras-mercadoria'),
    ('financeiro:compras-tratores'),
    ('financeiro:compras-uso-e-consumo'),
    ('financeiro:compras-frete'),
    ('financeiro:compras-servicos'),
    ('financeiro:compras-devolucoes'),
    ('financeiro:pessoas-folha'),
    ('financeiro:pessoas-beneficios'),
    ('financeiro:pessoas-comissoes'),
    ('financeiro:pessoas-viagens'),
    ('financeiro:contas-fixas'),
    ('financeiro:contas-impostos'),
    ('financeiro:contas-bens'),
    ('financeiro:contas-marketing'),
    ('financeiro:banco-emprestimos'),
    ('financeiro:banco-antecipacoes'),
    ('financeiro:banco-tarifas'),
    ('financeiro:banco-contas-correntes'),
    ('financeiro:relatorio-pagar'),
    ('financeiro:contas-cliente-regra')
),
alvo as (
  select p.user_id
  from portal_permissoes p
  join financeiro_usu u on u.id = p.user_id
  where u.funcao = 'Financeiro' and not coalesce(p.is_admin, false) and not coalesce(p.is_dev, false)
)
update portal_permissoes p
   set modulos_permitidos = coalesce(p.modulos_permitidos, '{}')
     || array(select c from chaves where c <> all(coalesce(p.modulos_permitidos, '{}')))
 where p.user_id in (select user_id from alvo)
   and exists (select 1 from chaves where c <> all(coalesce(p.modulos_permitidos, '{}')));

-- 2) telas de contas que vieram do Ajustes
with de_para(antiga, nova) as (values
    ('ajustes:correcao-contas', 'financeiro:correcao-contas'),
    ('ajustes:baixa-contas', 'financeiro:baixa-contas'),
    ('ajustes:boletos-fornecedor', 'financeiro:boletos-fornecedor')
)
update portal_permissoes p
   set modulos_permitidos = p.modulos_permitidos || array(
         select d.nova from de_para d
          where (d.antiga = any(p.modulos_permitidos) or 'ajustes' = any(p.modulos_permitidos))
            and d.nova <> all(p.modulos_permitidos))
 where exists (
         select 1 from de_para d
          where (d.antiga = any(p.modulos_permitidos) or 'ajustes' = any(p.modulos_permitidos))
            and d.nova <> all(p.modulos_permitidos));

-- Conferência: quem ficou com chaves das abas
select u.nome, u.funcao, array(select x from unnest(p.modulos_permitidos) x where x like 'financeiro:%') as chaves_financeiro
  from portal_permissoes p join financeiro_usu u on u.id = p.user_id
 where exists (select 1 from unnest(p.modulos_permitidos) x where x like 'financeiro:%' and x not in ('financeiro:editar_cards'))
 order by u.nome;

-- (OPCIONAL, só DEPOIS do deploy) limpar as chaves antigas do Ajustes, que saíram do catálogo do Admin:
-- update portal_permissoes
--    set modulos_permitidos = array(select x from unnest(modulos_permitidos) x
--                                    where x not in ('ajustes:correcao-contas', 'ajustes:baixa-contas', 'ajustes:boletos-fornecedor'))
--  where modulos_permitidos && array['ajustes:correcao-contas', 'ajustes:baixa-contas', 'ajustes:boletos-fornecedor'];
