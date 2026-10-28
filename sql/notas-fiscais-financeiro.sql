-- Notas fiscais (cache PDF + XML) saíram do Estoque e foram para o Financeiro
-- (22/10/2026): /estoque/notas → /financeiro/notas, permissões
-- estoque:notas → financeiro:notas e estoque:notas-xml → financeiro:notas-xml.
--
-- Converte as chaves já dadas a alguém, para ninguém perder o acesso.
-- Idempotente: rodar de novo não muda nada. O espelho das permissões v2
-- acompanha sozinho (boot + 10 min). Quem tinha o módulo Estoque INTEIRO e
-- não tem Financeiro deixa de ver a tela — de propósito (ela é do Financeiro).
update portal_permissoes p
   set modulos_permitidos = (
     select array_agg(distinct m order by m)
       from unnest(
         array_replace(array_replace(p.modulos_permitidos, 'estoque:notas', 'financeiro:notas'),
                       'estoque:notas-xml', 'financeiro:notas-xml')
       ) as m
   )
 where p.modulos_permitidos && array['estoque:notas', 'estoque:notas-xml'];

-- conferência: deve voltar 0 linhas
select user_id, modulos_permitidos
  from portal_permissoes
 where modulos_permitidos && array['estoque:notas', 'estoque:notas-xml'];
