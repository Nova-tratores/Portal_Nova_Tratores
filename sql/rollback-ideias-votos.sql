-- Desfaz sql/ideias-votos.sql (apaga os votos e a marca "levar para reunião").
drop table if exists public.dev_ideias_votos;
alter table public.dev_ideias drop column if exists levar_reuniao;
notify pgrst, 'reload schema';
