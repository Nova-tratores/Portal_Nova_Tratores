-- Financeiro: coluna "status_changed_at" (quando o card entrou na fase atual) — 29/10/2026.
-- Projeto: PORTAL (citrhumdk…). Idempotente.
--
-- O código do portal grava status_changed_at junto com a mudança de fase (envio do boleto por
-- e-mail, recobrança e "pago" na tela Vencidos, concluir no Financeiro), mas a coluna NUNCA
-- existiu: o banco recusava o update inteiro (42703) e o card não mudava de fase — o e-mail saía
-- e a pessoa tinha que "confirmar envio" à mão. Criar a coluna conserta isso na hora.

alter table public."Chamado_NF" add column if not exists status_changed_at timestamptz;

-- O banco marca sozinho quando a fase muda (o navegador não precisa mandar).
create or replace function public.chamado_nf_status_changed_at()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.status_changed_at := coalesce(new.status_changed_at, now());
  elsif new.status is distinct from old.status then
    new.status_changed_at := now();
  end if;
  return new;
end $$;

drop trigger if exists trg_chamado_nf_status_changed_at on public."Chamado_NF";
create trigger trg_chamado_nf_status_changed_at
  before insert or update on public."Chamado_NF"
  for each row execute function public.chamado_nf_status_changed_at();

-- Cards que já existem: última mudança de fase (ou criação) registrada no histórico.
update public."Chamado_NF" c
   set status_changed_at = h.quando
  from (
    select entidade_id, max(created_at) as quando
      from public.audit_log
     where entidade = 'Chamado_NF' and acao in ('mover_status', 'criar')
     group by entidade_id
  ) h
 where h.entidade_id = c.id::text
   and c.status_changed_at is null;

notify pgrst, 'reload schema';
