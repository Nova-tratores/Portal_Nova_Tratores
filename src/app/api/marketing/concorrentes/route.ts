// Concorrentes observados na feira — inteligência que hoje se perde na conversa.
import { criarRotasCrud } from '@/lib/marketing/crud';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const { GET, POST, PATCH, DELETE } = criarRotasCrud({
  tabela: 'mkt_concorrentes',
  entidade: 'concorrente',
  acao: 'acoes:editar',
  label: 'marca',
  ordem: 'marca',
  campos: ['marca', 'representante', 'o_que_expos', 'preco_praticado', 'condicao',
           'destaque', 'ameaca', 'observacoes', 'foto_url', 'registrado_por_nome'],
});
