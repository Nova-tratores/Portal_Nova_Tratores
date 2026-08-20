-- E-mails de cobrança do financeiro: cada envio (boleto/lembrete) e cada
-- resposta do cliente, ligados ao card (Chamado_NF). Alimenta o bloco
-- "E-mails deste boleto" no card e o painel de respostas ao lado do sininho.
-- Aplicar no SQL Editor do Supabase.

create table if not exists financeiro_emails (
  id            bigserial primary key,
  chamado_id    bigint not null,
  tipo          text not null check (tipo in ('boleto','lembrete','resposta')),
  direcao       text not null default 'enviado' check (direcao in ('enviado','recebido')),
  de_email      text,
  destinatarios text,
  assunto       text,
  corpo         text,
  message_id    text,
  in_reply_to   text,
  user_id       uuid,
  parcela_n     smallint,
  venc_ref      date,
  lido_em       timestamptz,
  criado_em     timestamptz not null default now()
);

create index if not exists idx_fin_emails_chamado on financeiro_emails (chamado_id, criado_em);
create index if not exists idx_fin_emails_tipo on financeiro_emails (tipo, criado_em desc);
create unique index if not exists uq_fin_emails_msgid on financeiro_emails (message_id) where message_id is not null;

alter table financeiro_emails enable row level security;

-- Leitura pra qualquer logado (o bloco aparece nos kanbans); escrita SÓ via
-- service role (rotas do servidor) — sem policy de insert/update/delete.
drop policy if exists p_fin_emails_sel on financeiro_emails;
create policy p_fin_emails_sel on financeiro_emails
  for select to authenticated using (true);
