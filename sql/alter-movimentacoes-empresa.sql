-- Botão "mudar de empresa" na peça do PPV / OS (26/11/2026).
-- Empresa:          empresa escolhida à mão para a peça ("Nova Tratores" / "Castro Peças").
--                   Vazio = o portal descobre pelo cadastro (como era antes).
-- Sem_Cadastro_Em:  tentaram mudar e a peça não existe nessa empresa — marca na tela.
alter table public.movimentacoes add column if not exists "Empresa" text;
alter table public.movimentacoes add column if not exists "Sem_Cadastro_Em" text;
