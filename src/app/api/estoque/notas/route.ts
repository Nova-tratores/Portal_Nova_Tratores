// Lista unificada de notas fiscais (entrada + saída) do cache + cobertura.
// Permissão: estoque:notas (ou módulo estoque inteiro / admin).
// Busca: `q` + `campo` (auto | nota | pedido | os | cliente | maquina) — os
// vínculos pedido/OS/máquina vêm de sql/notas-fiscais-vinculos.sql; sem ela a
// consulta cai para as colunas básicas e `vinculosFaltando` avisa a tela.
import { NextRequest, NextResponse } from 'next/server';
import { protegerRota } from '@/lib/ajustes/permissao-server';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { parseConta } from '@/lib/estoque/conta';
import { COLS, COLS_VINCULOS, cobertura, migracaoFaltando, ultimaRodada } from '@/lib/notas/cache-docs';
import { colunaBanco, ehCampoBusca, ehTipoNota, filtroBusca, parseOrdem, type CampoBusca } from '@/lib/notas/cache-regras';

export const dynamic = 'force-dynamic';

const ISO_DIA = /^\d{4}-\d{2}-\d{2}$/;
const POR_PAGINA = 50;
const RE_SEM_VINCULOS = /parte_cod|pedido_num|pedido_cod|os_num|os_cod|maquina/i;
const RE_SEM_NUMERO_N = /numero_n/i; // sql/notas-fiscais-ordem.sql ausente

export async function GET(req: NextRequest) {
  const guarda = await protegerRota(req, [{ modulo: 'estoque', acao: 'notas' }]);
  if (guarda.resposta) return guarda.resposta;

  const sp = req.nextUrl.searchParams;
  const conta = parseConta(sp.get('conta'));
  const tipo = sp.get('tipo') || '';
  const de = ISO_DIA.test(sp.get('de') || '') ? sp.get('de')! : '';
  const ate = ISO_DIA.test(sp.get('ate') || '') ? sp.get('ate')! : '';
  const q = sp.get('q') || '';
  const campoRaw = sp.get('campo') || 'auto';
  const campo: CampoBusca = ehCampoBusca(campoRaw) ? campoRaw : 'auto';
  const situacao = sp.get('situacao') || ''; // completa | incompleta | sem_documento
  const ordem = parseOrdem(sp.get('ordem')); // ex.: numero.asc (cabeçalho clicável)
  const pagina = Math.max(1, parseInt(sp.get('pagina') || '1', 10) || 1);
  const offset = (pagina - 1) * POR_PAGINA;

  const montar = (cols: string, semVinculos = false, semNumeroN = false) => {
    let query = supabaseAdmin.from('notas_fiscais_docs').select(cols, { count: 'exact' });
    if (conta) query = query.eq('conta_omie', conta);
    if (ehTipoNota(tipo)) query = query.eq('tipo', tipo);
    if (de) query = query.gte('data_emissao', de);
    if (ate) query = query.lte('data_emissao', ate);
    const or = filtroBusca(q, campo, { semVinculos });
    if (or) query = query.or(or);
    if (situacao === 'completa') query = query.not('pdf_path', 'is', null).not('xml_path', 'is', null);
    else if (situacao === 'incompleta') query = query.or('pdf_path.is.null,xml_path.is.null');
    else if (situacao === 'sem_documento') query = query.gte('tentativas', 8);
    const col = colunaBanco(ordem, { semVinculos, semNumeroN });
    query = query.order(col, { ascending: ordem.dir === 'asc', nullsFirst: false });
    if (col !== 'data_emissao') query = query.order('data_emissao', { ascending: false, nullsFirst: false });
    return query
      .order('id', { ascending: false })
      .range(offset, offset + POR_PAGINA - 1);
  };

  try {
    let vinculosFaltando = false;
    let semNumeroN = false;
    const [res0, cob, rodada] = await Promise.all([montar(COLS_VINCULOS), cobertura(conta), ultimaRodada()]);
    let res = res0;
    // migrations opcionais ausentes: repete a consulta sem o que falta (até 2 vezes)
    for (let i = 0; i < 2 && res.error; i++) {
      const msg = res.error.message || '';
      if (!vinculosFaltando && RE_SEM_VINCULOS.test(msg)) vinculosFaltando = true;      // sem pedido/OS/máquina
      else if (!semNumeroN && RE_SEM_NUMERO_N.test(msg)) semNumeroN = true;             // nº ordena como texto
      else break;
      res = await montar(vinculosFaltando ? COLS : COLS_VINCULOS, vinculosFaltando, semNumeroN);
    }
    if (res.error) throw new Error(res.error.message);
    return NextResponse.json({
      notas: res.data || [],
      total: res.count || 0,
      pagina,
      porPagina: POR_PAGINA,
      totalPaginas: Math.max(1, Math.ceil((res.count || 0) / POR_PAGINA)),
      cobertura: cob,
      ultimaRodada: rodada,
      podeIndexar: guarda.user.isAdmin,
      campo,
      ordem,
      vinculosFaltando,
      numeroComoTexto: semNumeroN,
    });
  } catch (e) {
    const msg = (e as Error).message || '';
    if (migracaoFaltando(msg)) {
      return NextResponse.json({ erro: 'Cache de notas ainda não instalado no banco (aplicar sql/notas-fiscais-cache.sql).', migracaoFaltando: true }, { status: 503 });
    }
    return NextResponse.json({ erro: msg }, { status: 500 });
  }
}
