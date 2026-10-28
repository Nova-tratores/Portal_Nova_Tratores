-- Fotos do checklist de veículo em pasta PRIVADA (21/10/2026).
-- Antes iam para o bucket público `requisicoes` e abriam sem login (inclusive
-- o CRLV). Portal, app de vendas (pelo portal) e NT Mecânico passam a gravar
-- em `frota-checklist` e mostrar com link assinado de 1 hora, depois do login.
-- (As rotas também criam o bucket sozinhas se ele não existir.)
insert into storage.buckets (id, name, public)
values ('frota-checklist', 'frota-checklist', false)
on conflict (id) do update set public = false;

-- Depois que portal e NT Mecânico estiverem no ar, mover as fotos antigas:
--   node scripts/frota-checklist-fotos-privadas.mjs            (simula)
--   node scripts/frota-checklist-fotos-privadas.mjs --gravar   (move e apaga as públicas)
