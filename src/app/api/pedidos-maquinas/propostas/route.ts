// Propostas para importar no Pedido de Máquinas.
// GET ?q=            -> busca (cliente, modelo, cidade, nº); vendidas primeiro
// GET ?id=&total=    -> uma proposta + pagamento + prévia do que viria
// GET ?proposta_id=  -> pedidos de máquina ligados à proposta (tela da Proposta)
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { protegerRota } from '@/lib/ajustes/permissao-server';
import { respostaErro, MODULO, faltaTabela } from '@/lib/pedidos-maquinas/server';
import { COLS_PROPOSTA, lerProposta, pedidosDaProposta } from '@/lib/pedidos-maquinas/importar-server';
import { importarDaProposta, faseInfo } from '@/lib/pedidos-maquinas/regras';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const sem = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const VENDIDA = 'Concluida-Vendido';
const PERDIDA = 'Concluida- Não vendido.';

export async function GET(req: Request) {
  // quem está na Proposta também vê "Pedido PVM-… desta proposta"
  const g = await protegerRota(req, [{ modulo: MODULO }, { modulo: 'propostas' }]);
  if (g.resposta) return g.resposta;
  try {
    const url = new URL(req.url);
    const daProposta = url.searchParams.get('proposta_id');
    if (daProposta) {
      const peds = await pedidosDaProposta(Number(daProposta));
      return Response.json({ pedidos: peds.map((p) => ({ ...p, fase: faseInfo(p.status).rotulo })) });
    }

    const id = url.searchParams.get('id');
    if (id) {
      const { proposta, pagamento, semTabelaPagamento } = await lerProposta(Number(id));
      const total = Number(url.searchParams.get('total') || 0);
      const outros = await pedidosDaProposta(Number(id));
      return Response.json({ proposta, pagamento, semTabelaPagamento, previa: importarDaProposta(proposta, pagamento, total), pedidos: outros });
    }

    const termo = sem(url.searchParams.get('q') || '').trim();
    const { data, error } = await supabaseAdmin.from('v_formulario').select(COLS_PROPOSTA)
      .is('deleted_at', null).neq('status', PERDIDA).order('criado_em', { ascending: false }).limit(600);
    if (error) throw error;
    let lista = (data || []) as unknown as Record<string, unknown>[];
    if (termo) {
      lista = lista.filter((p) => sem(`${p.Cliente} ${p.Marca} ${p.Modelo} ${p.Cidade} ${p.vendedor_nome} ${p.id} ${String(p['Cpf/Cpnj'] || '').replace(/\D/g, '')}`).includes(termo));
    }
    lista.sort((a, b) => Number(b.status === VENDIDA) - Number(a.status === VENDIDA));
    lista = lista.slice(0, 40);

    const ids = lista.map((p) => Number(p.id));
    const ligados = new Map<number, string>();
    const pags = new Set<number>();
    if (ids.length) {
      const r = await supabaseAdmin.from('pedidos_maquinas').select('proposta_id, id_pedido').in('proposta_id', ids).neq('status', 'cancelado');
      if (r.error && !faltaTabela(r.error)) throw r.error;
      for (const x of r.data || []) ligados.set(Number(x.proposta_id), String(x.id_pedido));
      const pg = await supabaseAdmin.from('proposta_pagamento').select('proposta_id').in('proposta_id', ids);
      for (const x of pg.data || []) pags.add(Number(x.proposta_id));
    }
    return Response.json({
      propostas: lista.map((p) => ({ ...p, pedido: ligados.get(Number(p.id)) || null, temPagamento: pags.has(Number(p.id)) })),
    });
  } catch (e) {
    return respostaErro(e, 'propostas');
  }
}
