-- Radar Tratores (28/10/2026): motivo de não fazer a revisão de 50 h + horímetro informado.
-- Passou de 90 dias sem orçamento = vermelho; o motivo tira do vermelho e "ainda não deu as horas"
-- guarda o horímetro para prever quando chega a 50 h (lib/revisoes/contatos-radar.ts).
-- Projeto Supabase: portal (citrhumdk…). Rodar depois de sql/radar-tratores-contatos.sql.
alter table public.radar_tratores_contatos add column if not exists motivo text;
alter table public.radar_tratores_contatos add column if not exists horimetro numeric;
-- quando falar de novo: até a data o trator fica de molho; no dia volta para a fila
alter table public.radar_tratores_contatos add column if not exists retornar_em date;

alter table public.radar_tratores_contatos drop constraint if exists radar_tratores_contatos_resultado_check;
alter table public.radar_tratores_contatos add constraint radar_tratores_contatos_resultado_check
  check (resultado in ('tudo_certo', 'problema', 'agendou_50h', 'quer_peca', 'nao_atendeu', 'dispensado', 'sem_revisao'));

alter table public.radar_tratores_contatos drop constraint if exists radar_tratores_contatos_motivo_check;
alter table public.radar_tratores_contatos add constraint radar_tratores_contatos_motivo_check
  check (motivo is null or motivo in ('sem_horas', 'outro_lugar', 'nao_quer', 'parado', 'outro'));

-- leitura automática do portal da Mahindra de hora em hora (07h–20h, seg–sáb) pelo agendador
do $$
begin
  if to_regclass('public.agendamentos') is not null then
    insert into agendamentos (chave, handler, nome, modulo, descricao, tipo, intervalo_min, janela_inicio, janela_fim, dias_semana, prioridade, usa_omie, duracao_max_min, ativo)
    values ('mahindra-certificados', 'mahindra-certificados', 'Certificados da Mahindra', 'Feedbacks',
      'Lê os certificados de garantia (entrega técnica) no portal de concessionárias da Mahindra para o Radar Tratores.',
      'intervalo', 60, '07:00', '20:00', array[1,2,3,4,5,6], 'rapido', false, 15, true)
    on conflict (chave) do nothing;
  end if;
end $$;

notify pgrst, 'reload schema';
