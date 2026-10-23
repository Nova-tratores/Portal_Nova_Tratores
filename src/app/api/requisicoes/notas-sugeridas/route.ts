// Notas de entrada do Omie que parecem ser de requisições sem nº de nota.
// GET  → { sugestoes: [{ reqIds, nota, motivos }] } (só confiança alta; cache de 5 min).
//        reqIds com mais de uma = a nota cobre várias requisições (a soma delas dá o valor).
// POST → { notaId, reqIds } confirmada: grava nº da nota e CNPJ (e o fornecedor, se estava vazio)
//        em cada requisição e limpa o cache. A pessoa sempre confirma (José, 23/10/2026).
import { NextRequest, NextResponse } from 'next/server';
import { protegerRota, autorDe } from '@/lib/ajustes/permissao-server';
import { supabase } from '@/lib/pos/supabase';
import { esquecerCacheNotas, sugestoesDeNota } from '@/lib/requisicoes/casar-nota-server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: 'requisicoes' }]);
  if (g.resposta) return g.resposta;
  try {
    const sugestoes = await sugestoesDeNota({ forcar: req.nextUrl.searchParams.get('forcar') === '1' });
    return NextResponse.json({ sugestoes });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'falha ao procurar as notas' }, { status: 500 });
  }
}

/** PDF da nota de entrada guardado pelo portal (notas_fiscais_docs → bucket notas-fiscais); null se ainda não tem. */
async function pdfDaNota(notaEntradaId: number): Promise<Blob | null> {
  const { data } = await supabase.from('notas_fiscais_docs').select('pdf_path')
    .eq('origem_tabela', 'notas_entrada').eq('origem_id', String(notaEntradaId)).not('pdf_path', 'is', null).limit(1).maybeSingle();
  if (!data?.pdf_path) return null;
  const { data: arq, error } = await supabase.storage.from('notas-fiscais').download(data.pdf_path);
  return error ? null : arq;
}

export async function POST(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: 'requisicoes', acao: 'editar' }]);
  if (g.resposta) return g.resposta;
  const body = await req.json().catch(() => ({}));
  const notaId = Number(body?.notaId);
  const reqIds: number[] = Array.isArray(body?.reqIds) ? body.reqIds.map(Number).filter(Boolean) : [];
  if (!notaId || !reqIds.length) return NextResponse.json({ error: 'notaId e reqIds obrigatórios' }, { status: 400 });

  // confere na hora (não confia no que veio do navegador): a sugestão tem de existir igualzinha
  const mesmo = (a: number[], b: number[]) => a.length === b.length && a.every((x) => b.includes(x));
  const sug = (await sugestoesDeNota({ forcar: true })).find((s) => s.nota.id === notaId && mesmo(s.reqIds, reqIds));
  if (!sug) return NextResponse.json({ error: 'Essa sugestão não vale mais (a requisição ou a nota mudou). Atualize a tela.' }, { status: 409 });

  const { data: atuais } = await supabase.from('Requisicao').select('id,fornecedor,numero_nota,foto_nf').in('id', reqIds);
  if ((atuais || []).length !== reqIds.length) return NextResponse.json({ error: 'requisição não encontrada' }, { status: 404 });
  if ((atuais || []).some((r) => String(r.numero_nota || '').replace(/\D/g, ''))) return NextResponse.json({ error: 'Uma dessas requisições já tem nº de nota.' }, { status: 409 });

  const cnpj = sug.nota.cnpj;
  const cnpjFmt = cnpj.length === 14 ? cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : cnpj;
  // PDF da nota (guardado pelo portal no bucket privado notas-fiscais) vai como anexo da
  // requisição que ainda não tem nota anexada — copiado para o bucket das requisições
  const pdfNota = await pdfDaNota(sug.nota.id).catch(() => null);
  const porReq: Record<number, Record<string, string>> = {};
  for (const r of atuais || []) {
    const dados: Record<string, string> = { numero_nota: sug.nota.numero, fornecedor_cnpj: cnpjFmt };
    if (!String(r.fornecedor || '').trim()) dados.fornecedor = sug.nota.nome;
    if (pdfNota && !r.foto_nf) {
      const caminho = `${r.id}-foto_nf-${Date.now()}.pdf`;
      const up = await supabase.storage.from('requisicoes').upload(caminho, pdfNota, { contentType: 'application/pdf' });
      if (!up.error) dados.foto_nf = caminho;
    }
    const { error } = await supabase.from('Requisicao').update(dados).eq('id', r.id);
    if (error) return NextResponse.json({ error: error.message, gravadas: Object.keys(porReq).map(Number) }, { status: 500 });
    porReq[r.id] = dados;
  }

  await supabase.from('audit_log').insert(reqIds.map((id) => ({
    user_id: g.user.id, user_nome: autorDe(g.user),
    sistema: 'requisicoes', acao: 'vincular_nota', entidade: 'requisicao', entidade_id: String(id),
    detalhes: { nota_id: sug.nota.id, numero: sug.nota.numero, cnpj, valor_nota: sug.nota.valor, reqs_da_nota: reqIds, motivos: sug.motivos },
  }))).then(() => undefined, () => undefined);
  esquecerCacheNotas();
  return NextResponse.json({ ok: true, porReq });
}
