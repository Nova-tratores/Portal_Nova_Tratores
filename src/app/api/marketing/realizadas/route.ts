// Ações realizadas (planejado x realizado). Com apoio_id, a linha é uma
// CONTRAPARTIDA daquele apoiador e entra no PDF do relatório.
import { criarRotasCrud } from '@/lib/marketing/crud';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const { GET, POST, PATCH, DELETE } = criarRotasCrud({
  tabela: 'mkt_realizadas',
  entidade: 'realizada',
  acao: 'acoes:editar',
  label: 'titulo',
  campos: ['apoio_id', 'titulo', 'descricao', 'tipo', 'planejado', 'realizado',
           'data', 'responsavel_nome', 'evidencia_url', 'observacoes'],
  datas: ['data'],
  booleanos: ['planejado', 'realizado'],
});
