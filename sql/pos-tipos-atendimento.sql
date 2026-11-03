-- Tipos de atendimento da OS (POS) — lista editável pelo portal (03/11/2026).
-- Antes: "Manutenção" e "Revisão" fixos no OSDrawer. Agora quem tem a ação
-- pos:tipos_atendimento cadastra novos tipos e eles aparecem nas próximas OS.
-- Ordem_Servico.Tipo_Servico continua TEXTO (guarda o nome) — sem FK de propósito:
-- desativar um tipo não mexe nas OS antigas.
-- Escrita/leitura só pela API (/api/pos/tipos-atendimento, service role).
-- Idempotente.

create table if not exists public.pos_tipos_atendimento (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null check (length(btrim(nome)) between 1 and 40),
  ativo       boolean not null default true,
  ordem       int not null default 100,
  criado_por  text,
  criado_em   timestamptz not null default now(),
  desativado_por text,
  desativado_em  timestamptz
);

-- um nome ATIVO por vez (sem caixa); reativar = update
create unique index if not exists pos_tipos_atendimento_nome_ativo
  on public.pos_tipos_atendimento (lower(btrim(nome))) where ativo;

alter table public.pos_tipos_atendimento enable row level security;
revoke all on public.pos_tipos_atendimento from anon, authenticated;

insert into public.pos_tipos_atendimento (nome, ordem, criado_por)
select v.nome, v.ordem, 'migration'
from (values ('Manutenção', 1), ('Revisão', 2), ('Entrega Técnica', 3), ('Inspeção Pré-Entrega', 4)) as v(nome, ordem)
where not exists (
  select 1 from public.pos_tipos_atendimento t where lower(btrim(t.nome)) = lower(v.nome)
);

notify pgrst, 'reload schema';
