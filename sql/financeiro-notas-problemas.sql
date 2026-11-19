-- Notas fiscais › abas Problemas e Envios ao Omie (19/11/2026) — chave nova financeiro:notas-problemas
-- (explícita: o módulo Financeiro inteiro não dá). Só ACRESCENTA e é idempotente. Sem este SQL só
-- Admin/Dev veem as duas abas; a aba Notas segue igual para todos que já têm financeiro:notas.
-- Quem ganha: a função Financeiro (como em financeiro-lancar-conta.sql). Outras pessoas: marcar
-- "Notas fiscais — Problemas e Envios ao Omie" no Admin.
update portal_permissoes p
   set modulos_permitidos = coalesce(p.modulos_permitidos, '{}') || array['financeiro:notas-problemas']
 where not coalesce(p.is_admin, false) and not coalesce(p.is_dev, false)
   and not ('financeiro:notas-problemas' = any(coalesce(p.modulos_permitidos, '{}')))
   and exists (select 1 from financeiro_usu u where u.id = p.user_id and u.funcao = 'Financeiro');

-- conferir:
-- select u.nome from portal_permissoes p join financeiro_usu u on u.id = p.user_id
--  where 'financeiro:notas-problemas' = any(p.modulos_permitidos);
