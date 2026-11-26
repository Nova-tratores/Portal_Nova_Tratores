-- =============================================================================
-- Arte do post em camadas (26/11/2026, José: "entregar o resultado em camada, de forma que qualquer coisa
-- conseguimos editar o post lá no módulo de marketing").
-- site_posts.arte guarda as camadas da arte do robô: a cena (imagem de fundo já pronta), os textos (data, título,
-- frase, destaque), a paleta de cores e a posição do texto. Editar a arte no portal redesenha só o texto (grátis);
-- "Nova cena" pede outra imagem à IA. A imagem final continua em midia.feed.
-- Rodar no projeto do portal (citrhumdkfivdzbmayde). Pode rodar de novo sem estragar nada.
-- =============================================================================
alter table site_posts add column if not exists arte jsonb;
