-- Regra de atualização de dívida por empresa (tela /financeiro/contas-cliente, 09/11/2026).
-- A calculadora só SIMULA (nada vai para a Omie). Sem esta tabela a tela usa o
-- padrão fixo (multa 2 % + juros 1 % a.m. simples) e avisa que a edição está desligada.
-- Escrita só pela rota /api/financeiro/contas-cliente/regra (service role).

create table if not exists public.financeiro_regra_juros (
  conta_omie      text primary key check (conta_omie in ('NOVA', 'CASTRO')),
  multa_pct       numeric(6,3) not null default 2   check (multa_pct >= 0 and multa_pct <= 100),
  juros_mes_pct   numeric(6,3) not null default 1   check (juros_mes_pct >= 0 and juros_mes_pct <= 100),
  tipo_juros      text not null default 'simples'   check (tipo_juros in ('simples', 'composto')),
  carencia_dias   integer not null default 0        check (carencia_dias >= 0 and carencia_dias <= 365),
  desconto_pct    numeric(6,3) not null default 0   check (desconto_pct >= 0 and desconto_pct <= 100),
  atualizado_por  text,
  atualizado_em   timestamptz not null default now()
);

alter table public.financeiro_regra_juros enable row level security;
revoke all on public.financeiro_regra_juros from anon, authenticated;

insert into public.financeiro_regra_juros (conta_omie) values ('NOVA'), ('CASTRO')
on conflict (conta_omie) do nothing;

notify pgrst, 'reload schema';
