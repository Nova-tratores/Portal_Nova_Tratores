-- Rodar no projeto citrhumdkfivdzbmayde (PORTAL).
-- Nome de exibição das fases do POS e do PPV (José, 29/10/2026: "um lápis do lado de cada fase" para o
-- pós-vendas renomear; muda no POS e no PPV juntos). A fase gravada nas OS/PPVs NÃO muda — `chave` é o
-- valor de sempre (ex.: 'Cobrando Cliente'); só o `rotulo` mostrado na tela. Sem linha = mostra a chave.
-- Escrita só pela rota /api/fases/rotulos (service role). Sem esta tabela o portal mostra os nomes de sempre.

create table if not exists public.fases_rotulos (
  chave          text primary key,
  rotulo         text not null check (char_length(btrim(rotulo)) between 1 and 60),
  atualizado_por text,
  atualizado_em  timestamptz not null default now()
);

alter table public.fases_rotulos enable row level security;
revoke all on public.fases_rotulos from anon, authenticated;

notify pgrst, 'reload schema';
