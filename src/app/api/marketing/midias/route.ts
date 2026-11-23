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
           'contrapartida', 'ordem'],
  // quem colocou vem do login (não do formulário)
  registraAutor: true,
  numericos: ['alcance', 'ordem'],
  // `ordem` e `contrapartida` são NOT NULL com padrão no banco: em branco,
  // omitir em vez de mandar null.
  padraoDoBanco: ['ordem', 'contrapartida'],
  datas: ['data'],
  booleanos: ['contrapartida'],
});
