// Mídia da ação. `contrapartida = true` marca o que vai no PDF pra fábrica.
// ⚠️ O bucket `anexos` é PÚBLICO: registro de feira sim, documento com CPF não.
import { criarRotasCrud } from '@/lib/marketing/crud';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const { GET, POST, PATCH, DELETE } = criarRotasCrud({
  tabela: 'mkt_midias',
  entidade: 'midia',
  acao: 'midias:enviar',
  label: 'legenda',
  ordem: 'ordem',
  campos: ['apoio_id', 'tipo', 'url', 'legenda', 'veiculo', 'alcance', 'data',
           'contrapartida', 'ordem', 'criado_por_nome'],
  numericos: ['alcance', 'ordem'],
  datas: ['data'],
  booleanos: ['contrapartida'],
});
