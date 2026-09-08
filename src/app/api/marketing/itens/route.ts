// Itens expostos — máquinas e implementos que foram pro estande.
import { criarRotasCrud } from '@/lib/marketing/crud';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const { GET, POST, PATCH, DELETE } = criarRotasCrud({
  tabela: 'mkt_itens',
  entidade: 'item',
  acao: 'acoes:editar',
  label: 'modelo',
  campos: ['tipo', 'modelo', 'descricao', 'chassi', 'codigo_produto', 'quantidade',
           'valor_unitario', 'destino', 'vendido', 'proposta_id', 'foto_url', 'observacoes'],
  numericos: ['quantidade', 'valor_unitario', 'proposta_id'],
  booleanos: ['vendido'],
});
