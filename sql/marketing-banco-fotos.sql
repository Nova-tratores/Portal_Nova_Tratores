-- =============================================================================
-- Banco de fotos do Marketing (26/11/2026, José: "ela conseguir pegar essas fotos para o post e assim também
-- alimentando o nosso banco de dados com fotos de tratores").
-- Cada foto: o arquivo (Storage site-produtos/banco-fotos), de onde veio (envio manual ou vídeo do YouTube) e o que a IA
-- viu nela (descrição, etiquetas, modelo do trator quando dá para ler, nota de 1 a 5). O robô dos posts busca aqui.
-- Rodar no projeto do portal (citrhumdkfivdzbmayde). Pode rodar de novo sem estragar nada.
-- =============================================================================
create table if not exists mkt_fotos (
  id            uuid primary key default gen_random_uuid(),
  url           text not null,                 -- foto grande (até 2048 px, JPG)
  miniatura     text,                          -- foto pequena para a grade (480 px, WebP)
  caminho       text,                          -- caminho no Storage (para apagar)
  largura       int,
  altura        int,
  origem        text not null default 'envio' check (origem in ('envio', 'youtube')),
  origem_id     text,                          -- id do vídeo do YouTube
  origem_titulo text,                          -- título do vídeo
  segundo       int,                           -- em que segundo do vídeo a foto foi tirada
  descricao     text,                          -- uma frase da IA ("trator vermelho plantando soja ao entardecer")
  etiquetas     text[] not null default '{}',
  modelo        text,                          -- modelo do trator, só quando dá para ler
  nota          int check (nota between 1 and 5),
  ia_status     text not null default 'pendente' check (ia_status in ('pendente', 'ok', 'erro')),
  ia_erro       text,
  usada_em      int not null default 0,        -- quantos posts já usaram a foto
  criado_por    text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists mkt_fotos_etiquetas on mkt_fotos using gin (etiquetas);
create index if not exists mkt_fotos_criado on mkt_fotos (criado_em desc);
-- o mesmo segundo do mesmo vídeo não entra duas vezes
create unique index if not exists mkt_fotos_video_segundo on mkt_fotos (origem_id, segundo) where origem = 'youtube';

-- só o servidor do portal (chave de serviço) mexe aqui
alter table mkt_fotos enable row level security;
