-- =============================================================================
-- FROTA > PENDÊNCIAS — pendências registradas por veículo, com resolução
-- rastreada (quem abriu/resolveu, quando, como) e vínculo a Requisição ou OS.
-- Taxonomia veicular: SISTEMA > SUBSISTEMA > COMPONENTE (o nível mais fino é
-- opcional), com vida útil esperada pro alerta de recorrência ("era pra durar
-- mais"). Escrita SÓ via API (service role); RLS fecha o resto.
-- Aplicar no SQL Editor do Supabase do portal.
-- =============================================================================

create extension if not exists pgcrypto;

-- ── Taxonomia ────────────────────────────────────────────────────────────────
create table if not exists frota_componentes (
  id              uuid primary key default gen_random_uuid(),
  sistema         text not null,
  subsistema      text,
  componente      text,               -- nível mais específico (opcional)
  vida_util_meses int,                -- duração esperada (régua da recorrência)
  vida_util_km    int,
  ordem           int not null default 0,
  criado_em       timestamptz not null default now()
);

create unique index if not exists ux_frota_componentes_caminho
  on frota_componentes (sistema, coalesce(subsistema, ''), coalesce(componente, ''));

-- ── Pendências ───────────────────────────────────────────────────────────────
create table if not exists frota_pendencias (
  id              uuid primary key default gen_random_uuid(),
  veiculo_id      uuid,
  placa           text not null,
  origem          text not null default 'manual',   -- manual | checklist
  origem_ref      text,                             -- ex.: item do checklist + mês
  titulo          text not null,
  descricao       text,
  componente_id   uuid references frota_componentes(id),
  data_ocorrencia date,
  status          text not null default 'aberta',   -- aberta | resolvida
  aberta_por      text,
  aberta_em       timestamptz not null default now(),
  resolvida_por   text,
  resolvida_em    timestamptz,
  resolucao       text,                             -- como foi resolvido
  vinculo_tipo    text,                             -- requisicao | os
  vinculo_ref     text,                             -- nº/ID da requisição ou OS
  foto_url        text,                             -- foto do item (checklist)
  criado_em       timestamptz not null default now()
);

create index if not exists idx_frota_pend_placa on frota_pendencias (placa, status);
create index if not exists idx_frota_pend_comp  on frota_pendencias (componente_id);

-- ── RLS: tudo fechado ao navegador; as rotas do portal usam service role ─────
alter table frota_componentes enable row level security;
alter table frota_pendencias  enable row level security;

-- ── v2 (17/08): km e responsável na pendência manual ─────────────────────────
-- (se a v1 já foi aplicada, basta rodar estas duas linhas — o arquivo todo é
--  idempotente e também pode ser rodado inteiro de novo)
alter table frota_pendencias add column if not exists km int;
alter table frota_pendencias add column if not exists responsavel text;

-- ── Seed da taxonomia (idempotente) ──────────────────────────────────────────
insert into frota_componentes (sistema, subsistema, componente, vida_util_meses, vida_util_km, ordem) values
  ('Motor',           'Lubrificação',   'Óleo e filtro',                       6,   10000, 10),
  ('Motor',           'Arrefecimento',  'Radiador',                            96, 150000, 11),
  ('Motor',           'Arrefecimento',  'Bomba d''água',                       60, 100000, 12),
  ('Motor',           'Correias',       'Correia dentada / poly-v',            48,  60000, 13),
  ('Motor',           'Alimentação',    'Bomba de combustível',                96, 150000, 14),
  ('Motor',           'Alimentação',    'Bicos injetores',                     96, 150000, 15),
  ('Motor',           'Ignição',        'Velas e bobinas',                     24,  40000, 16),
  ('Motor',           'Arrefecimento',  null,                                null,   null, 17),
  ('Transmissão',     'Embreagem',      'Kit de embreagem (disco/platô)',      60,  80000, 20),
  ('Transmissão',     'Câmbio',         'Câmbio manual',                      120, 200000, 21),
  ('Transmissão',     'Câmbio',         'Câmbio automático',                   96, 150000, 22),
  ('Transmissão',     'Diferencial',    'Diferencial',                        120, 200000, 23),
  ('Transmissão',     'Semieixo',       'Junta homocinética',                  60,  80000, 24),
  ('Freios',          'Dianteiro',      'Pastilhas',                           18,  30000, 30),
  ('Freios',          'Dianteiro',      'Discos',                              36,  60000, 31),
  ('Freios',          'Traseiro',       'Lonas / tambor',                      36,  60000, 32),
  ('Freios',          'Hidráulica',     'Fluido de freio',                     24,   null, 33),
  ('Suspensão',       'Amortecedores',  null,                                  48,  60000, 40),
  ('Suspensão',       'Molas',          null,                                  96,   null, 41),
  ('Suspensão',       'Buchas e bandejas', null,                               48,  60000, 42),
  ('Suspensão',       'Rolamento de roda', null,                               60,  80000, 43),
  ('Direção',         'Caixa de direção', null,                                96, 150000, 50),
  ('Direção',         'Terminais e pivôs', null,                               48,  60000, 51),
  ('Elétrica',        'Bateria',        null,                                  30,   null, 60),
  ('Elétrica',        'Alternador',     null,                                  84, 120000, 61),
  ('Elétrica',        'Motor de partida', null,                                84, 120000, 62),
  ('Elétrica',        'Iluminação',     'Lâmpadas e faróis',                   24,   null, 63),
  ('Elétrica',        'Painel de instrumentos', null,                         null,   null, 64),
  ('Rodas e Pneus',   'Pneus',          null,                                  36,  50000, 70),
  ('Rodas e Pneus',   'Alinhamento e balanceamento', null,                      6,  10000, 71),
  ('Carroceria',      'Lataria e pintura', null,                              null,  null, 80),
  ('Carroceria',      'Vidros e para-brisa', null,                            null,  null, 81),
  ('Ar-condicionado', 'Compressor',     null,                                  84, 120000, 90),
  ('Ar-condicionado', 'Filtro de cabine', null,                                12,  15000, 91),
  ('Itens de segurança', 'Extintor / triângulo / macaco', null,                null, null, 95),
  ('Outros',          null,             null,                                 null,  null, 99)
on conflict (sistema, coalesce(subsistema, ''), coalesce(componente, '')) do nothing;

-- ── v3 (17/08): taxonomia AMPLIADA — todos os equipamentos, do interior ao
-- exterior (idempotente; rodar depois da v1/v2 ou o arquivo inteiro de novo) ──
insert into frota_componentes (sistema, subsistema, componente, vida_util_meses, vida_util_km, ordem) values
  ('Motor',           'Admissão',       'Filtro de ar',                        12,  15000, 18),
  ('Motor',           'Admissão',       'Turbina',                             96, 150000, 18),
  ('Motor',           'Alimentação',    'Filtro de combustível',               12,  20000, 18),
  ('Motor',           'Escapamento',    'Escapamento e catalisador',           60,  80000, 19),
  ('Motor',           'Escapamento',    'Sonda lambda',                        96, 150000, 19),
  ('Motor',           'Vedação',        'Juntas e retentores',                 96, 150000, 19),
  ('Motor',           'Coxins do motor', null,                                 60, 100000, 19),
  ('Transmissão',     'Câmbio',         'Fluido de câmbio',                    36,  60000, 22),
  ('Transmissão',     'Câmbio',         'Trambulador e cabos',                 60, 100000, 22),
  ('Transmissão',     'Cardan',         null,                                 120, 200000, 25),
  ('Freios',          'Hidráulica',     'Flexíveis e tubulações',              60, 100000, 33),
  ('Freios',          'Hidráulica',     'Cilindro mestre / servo-freio',       96, 150000, 33),
  ('Freios',          'Freio de mão',   null,                                  48,  60000, 34),
  ('Freios',          'ABS',            null,                                  96, 150000, 35),
  ('Suspensão',       'Batentes e coifas', null,                               48,  60000, 44),
  ('Suspensão',       'Estabilizadora e bieletas', null,                       48,  60000, 45),
  ('Direção',         'Bomba / direção assistida', null,                       96, 150000, 52),
  ('Direção',         'Coluna de direção', null,                              120, 200000, 53),
  ('Elétrica',        'Iluminação',     'Lanternas e setas',                   36,   null, 63),
  ('Elétrica',        'Chicote e fusíveis', null,                              96,   null, 65),
  ('Elétrica',        'Vidros elétricos', null,                                72,   null, 65),
  ('Elétrica',        'Travas e alarme', null,                                 72,   null, 66),
  ('Elétrica',        'Limpador de para-brisa', null,                          60,   null, 66),
  ('Elétrica',        'Buzina',         null,                                  60,   null, 66),
  ('Elétrica',        'Sensores e módulos', null,                              96,   null, 67),
  ('Elétrica',        'Som / multimídia', null,                                72,   null, 67),
  ('Rodas e Pneus',   'Rodas',          null,                                null,   null, 72),
  ('Carroceria',      'Retrovisores',   null,                                  48,   null, 82),
  ('Carroceria',      'Maçanetas e fechaduras', null,                          60,   null, 82),
  ('Carroceria',      'Borrachas e vedações', null,                            60,   null, 83),
  ('Carroceria',      'Para-choques',   null,                                null,   null, 83),
  ('Carroceria',      'Caçamba / carroceria de carga', null,                 null,   null, 84),
  ('Interior',        'Bancos e estofados', null,                              60,   null, 85),
  ('Interior',        'Tapetes e forrações', null,                             36,   null, 85),
  ('Interior',        'Painel e comandos', null,                               96,   null, 86),
  ('Interior',        'Cintos de segurança', null,                             96,   null, 86),
  ('Interior',        'Airbags',        null,                                 120,   null, 87),
  ('Interior',        'Pedais e volante', null,                                96,   null, 87),
  ('Ar-condicionado', 'Gás / carga',    null,                                  24,   null, 92),
  ('Ar-condicionado', 'Evaporador e condensador', null,                        84,   null, 92),
  ('Ar-condicionado', 'Ventilação interna', null,                              72,   null, 93)
on conflict (sistema, coalesce(subsistema, ''), coalesce(componente, '')) do nothing;
