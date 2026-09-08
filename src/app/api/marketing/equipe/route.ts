// Equipe da ação — quem foi, em que papel, quantos dias.
import { criarRotasCrud } from '@/lib/marketing/crud';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const { GET, POST, PATCH, DELETE } = criarRotasCrud({
  tabela: 'mkt_equipe',
  entidade: 'equipe',
  acao: 'acoes:editar',
  label: 'nome',
  ordem: 'nome',
  campos: ['usuario_id', 'nome', 'papel', 'telefone', 'dias', 'horas', 'custo_estimado', 'observacoes'],
  numericos: ['dias', 'horas', 'custo_estimado'],
});
