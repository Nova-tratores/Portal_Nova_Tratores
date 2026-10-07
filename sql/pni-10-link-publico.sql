-- pni-10 — Link público da etiqueta (QR sem login).
--
-- Cada peça ganha uma chave aleatória (32 caracteres hex, 122 bits — não dá
-- para adivinhar nem "andar" de uma peça para a outra trocando o número).
-- O QR da etiqueta aponta para /e/<chave>; a página lê pelo servidor (service
-- role) e mostra só o básico, sem preço nem histórico. As tabelas continuam
-- fechadas para quem não está logado (RLS não muda).
-- Rodar UMA vez, depois do pni-09.

alter table public.pni_itens
  add column if not exists token_publico text not null default replace(gen_random_uuid()::text, '-', '');

create unique index if not exists pni_itens_token_publico_uq on public.pni_itens (token_publico);

notify pgrst, 'reload schema';
