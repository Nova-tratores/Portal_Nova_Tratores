-- =============================================================================
-- FROTA · pendências: trava contra pendência automática DUPLICADA (10/10/2026)
--
-- O motor (src/lib/frota/pendencias-sync.ts) rodava a cada tela aberta, sem
-- trava; duas pessoas ao mesmo tempo inseriam a mesma pendência duas vezes
-- (caso real: AQJ3H59, requisição #6695, 2 abertas). O código agora roda uma
-- execução por vez, mas o banco também precisa recusar a repetida.
--
-- 1) fecha as repetidas que já existem (mantém a mais antiga de cada chave);
-- 2) cria o índice único parcial — só para pendência AUTOMÁTICA aberta
--    (manual não tem origem_ref e pode repetir à vontade).
--
-- Idempotente: pode rodar de novo. Em 10/10/2026 havia 1 linha a fechar.
-- O código funciona sem esta migration (só fica sem a trava do banco).
-- =============================================================================

begin;

with repetidas as (
  select id,
         row_number() over (
           partition by placa, origem, origem_ref
           order by aberta_em asc, id asc
         ) as n
  from frota_pendencias
  where status = 'aberta'
    and origem <> 'manual'
    and origem_ref is not null
)
update frota_pendencias p
set status        = 'resolvida',
    resolvida_por = 'Sistema',
    resolvida_em  = now(),
    resolucao     = 'Duplicada — limpeza automática (a mesma pendência já estava aberta).'
from repetidas r
where p.id = r.id
  and r.n > 1;

create unique index if not exists uq_frota_pend_auto_aberta
  on frota_pendencias (placa, origem, origem_ref)
  where status = 'aberta' and origem <> 'manual' and origem_ref is not null;

commit;

-- Conferência: deve devolver zero linhas
-- select placa, origem, origem_ref, count(*)
-- from frota_pendencias
-- where status = 'aberta' and origem <> 'manual' and origem_ref is not null
-- group by 1, 2, 3 having count(*) > 1;
