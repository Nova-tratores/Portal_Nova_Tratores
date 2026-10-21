-- Checklist mensal: conferência das fotos de pneu pela IA (21/10/2026).
-- Cada pneu tem duas fotos (banda de rodagem e lateral); a análise da IA
-- (comprova?, desgaste, marca, modelo, medida, DOT) fica no item.
-- Sem esta coluna o checklist funciona igual, só não guarda a análise.
alter table public.veiculo_checklist_itens add column if not exists ia_analise jsonb;
notify pgrst, 'reload schema';
