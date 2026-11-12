-- Caixa › Lançar conta (12/11/2026) — chave nova financeiro:lancar-conta (explícita, como as outras abas).
-- Só ACRESCENTA e é idempotente. Sem este SQL só Admin/Dev veem a aba; o resto do portal não muda.
-- Quem ganha: a função Financeiro (como em financeiro-permissoes-abas.sql; em 12/11 só a Amelia sem ser admin).
-- Outras pessoas: marcar "Lançar conta" no Admin (lança DIRETO no Omie — por isso não vai para quem só
-- criava rascunho pelas Requisições com financeiro:criar_lancamento).
update portal_permissoes p
   set modulos_permitidos = coalesce(p.modulos_permitidos, '{}') || array['financeiro:lancar-conta']
 where not coalesce(p.is_admin, false) and not coalesce(p.is_dev, false)
   and not ('financeiro:lancar-conta' = any(coalesce(p.modulos_permitidos, '{}')))
   and exists (select 1 from financeiro_usu u where u.id = p.user_id and u.funcao = 'Financeiro');

-- conferir:
-- select u.nome from portal_permissoes p join financeiro_usu u on u.id = p.user_id
--  where 'financeiro:lancar-conta' = any(p.modulos_permitidos);
