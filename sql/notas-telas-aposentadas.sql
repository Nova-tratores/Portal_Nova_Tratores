-- Telas de notas fiscais aposentadas (29/10/2026): o arquivo /financeiro/notas
-- (cache PDF + XML, entrada + saída, funciona com a Omie fora) cobre as duas.
--   /ajustes/notas               (NF de venda ao vivo na Omie)  → /financeiro/notas?tipo=saida
--   /visual-estoque/notas-entrada (consulta dos recebimentos)   → /financeiro/notas?tipo=entrada
-- Os endereços antigos redirecionam (next.config.ts).
--
-- Converte as chaves já dadas a alguém, para ninguém perder o acesso:
--   ajustes:notas                  → financeiro:notas
--   consulta-estoque:notas-entrada → financeiro:notas + financeiro:notas-entrada
-- (financeiro:notas-entrada = só CONSULTA das notas de entrada no arquivo; quem
--  dá entrada já as vê pelo Recebimentos — regra do podeVerEntrada).
-- Idempotente: rodar de novo não muda nada. O espelho das permissões v2
-- acompanha sozinho (boot + 10 min).
update portal_permissoes p
   set modulos_permitidos = (
     select array_agg(distinct m order by m)
       from unnest(
         array_cat(
           array_replace(
             array_remove(p.modulos_permitidos, 'consulta-estoque:notas-entrada'),
             'ajustes:notas', 'financeiro:notas'),
           case when 'consulta-estoque:notas-entrada' = any (p.modulos_permitidos)
                then array['financeiro:notas', 'financeiro:notas-entrada']
                else array[]::text[] end)
       ) as m
   )
 where p.modulos_permitidos && array['ajustes:notas', 'consulta-estoque:notas-entrada'];

-- conferência: deve voltar 0 linhas
select user_id, modulos_permitidos
  from portal_permissoes
 where modulos_permitidos && array['ajustes:notas', 'consulta-estoque:notas-entrada'];
