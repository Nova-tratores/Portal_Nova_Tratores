// Lista unificada de notas fiscais (entrada + saída) do cache + cobertura.
// Permissão: estoque:notas (ou módulo estoque inteiro / admin).
import { NextRequest, NextResponse } from 'next/server';
import { protegerRota } from '@/lib/ajustes/permissao-server';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { parseConta } from '@/lib/estoque/conta';
import { COLS, cobertura, migracaoFaltando, ultimaRodada } from '@/lib/notas/cache-docs';
import { ehTipoNota, filtroBusca } from '@/lib/notas/cache-regras';

export const dynamic = 'force-dynamic';

const ISO_DIA = /^\d{4}-\d{2}-\d{2}$/;
const POR_PAGINA = 50;

export async function GET(req: NextRequest) {
  const guarda = await protegerRota(req, [{ modulo: 'estoque', acao: 'notas' }]);
  if (guarda.resposta) return guarda.resposta;

  const sp = req.nextUrl.searchParams;
  const conta = parseConta(sp.get('conta'));
  const tipo = sp.get('tipo') || '';
  const de = ISO_DIA.test(sp.get('de') || '') ? sp.get('de')! : '';
  const ate = ISO_DIA.test(sp.get('ate') || '') ? sp.get('ate')! : '';
  const q = sp.get('q') || '';
  const situacao = sp.get('situacao') || ''; // completa | incompleta | sem_documento
  const pagina = Math.max(1, parseInt(sp.get('pagina') || '1', 10) || 1);
  const offset = (pagina - 1) * POR_PAGINA;

  try {
    let query = supabaseAdmin.from('notas_fiscais_docs').select(COLS, { count: 'exact' });
    if (conta) query = query.eq('conta_omie', conta);
    if (ehTipoNota(tipo)) query = query.eq('tipo', tipo);
    if (de) query = query.gte('data_emissao', de);
    if (ate) query = query.lte('data_emissao', ate);
    const or = filtroBusca(q);
    if (or) query = query.or(or);
    if (situacao === 'completa') query = query.not('pdf_path', 'is', null).not('xml_path', 'is', null);
    else if (situacao === 'incompleta') query = query.or('pdf_path.is.null,xml_path.is.null');
    else if (situacao === 'sem_documento') query = query.gte('tentativas', 8);
    query = query
      .order('data_emissao', { ascending: false, nullsFirst: false })
      .order('id', { ascending: false })
      .range(offset, offset + POR_PAGINA - 1);
    const [{ data, count, error }, cob, rodada] = await Promise.all([query, cobertura(conta), ultimaRodada()]);
    if (error) throw new Error(error.message);
    return NextResponse.json({
      notas: data || [],
      total: count || 0,
      pagina,
      porPagina: POR_PAGINA,
      totalPaginas: Math.max(1, Math.ceil((count || 0) / POR_PAGINA)),
      cobertura: cob,
      ultimaRodada: rodada,
      podeIndexar: guarda.user.isAdmin,
    });
  } catch (e) {
    const msg = (e as Error).message || '';
    if (migracaoFaltando(msg)) {
      return NextResponse.json({ erro: 'Cache de notas ainda não instalado no banco (aplicar sql/notas-fiscais-cache.sql).', migracaoFaltando: true }, { status: 503 });
    }
    return NextResponse.json({ erro: msg }, { status: 500 });
  }
}
