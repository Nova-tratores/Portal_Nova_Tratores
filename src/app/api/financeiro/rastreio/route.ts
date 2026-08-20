// RASTREIO DE NOTAS — GET /api/financeiro/rastreio?q=<nota|#req|boleto|texto>
//
// Busca o termo em TODAS as pontas (conta a pagar, requisição, faturamento,
// NF entrada/saída, títulos Omie do DRE, pasta do cliente), agrupa em FICHAS
// por documento (chave NF-e > nº+CNPJ > nº+fornecedor + arestas diretas +
// vínculos manuais) e devolve cada ficha com seções e anexos resolvidos.
//
// Fases: A) consultas primárias paralelas · B) 1 rodada de enriquecimento
// pelos ids achados · C) vínculos manuais (portal_doc_vinculos) + docs que só
// existem via vínculo. Pós-filtro mesmoNumero derruba os falsos positivos do
// ilike '%n%' (zeros à esquerda tratados dos dois lados).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { exigirPermissao } from '@/lib/ajustes/permissao-server';
import { sanitizarFiltro } from '@/lib/busca-segura';
import { normalizarTermo, mesmoNumero, type TermoNormalizado } from '@/lib/financeiro/rastreio/normalizar';
import { agruparResultados, requisicaoIdsDe, type DocsBrutos, type VinculoRow } from '@/lib/financeiro/rastreio/agrupar';
import type { AnexoFicha, DocumentoFicha, RefDoc, RespostaRastreio } from '@/lib/financeiro/rastreio/tipos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const LIMIT = 20;
const LIMIT_TEXTO = 10;

const COLS_FP = 'id, fornecedor, valor, data_vencimento, motivo, metodo, status, status_envio, numero_NF, nfe_chave, nfe_serie, nfe_data_emissao, nfe_cnpj_emitente, nfe_xml_url, anexo_nf, anexo_boleto, anexo_requisicao, comprovante_pagamento, is_requisicao, requisicao_ids, qtd_parcelas, parcelas_vencimentos, omie_cod_lancamento, omie_empresa, criado_por, created_at, autonomo_sem_nota';
const COLS_REQ = 'id, titulo, tipo, setor, status, data, solicitante, fornecedor, numero_nota, valor_despeza, foto_nf, boleto_fornecedor, recibo_fornecedor, ordem_servico, origem';
const COLS_CHAMADO = 'id, nom_cliente, cnpj_cliente, valor_servico, num_nf_servico, num_nf_peca, anexo_nf_servico, anexo_nf_peca, anexo_boleto, anexo_boleto_2, anexo_boleto_3, comprovante_pagamento, comprovante_pagamento_p1, comprovante_pagamento_p2, comprovante_pagamento_p3, comprovante_pagamento_p4, comprovante_pagamento_p5, forma_pagamento, qtd_parcelas, vencimento_boleto, datas_parcelas, status, setor, setor_destino, origem, omie_num_os, omie_num_pedido, omie_empresa, created_at';
const COLS_NE = 'numero_nf, serie, ncod_nf, nome_emitente, emitente, valor_nf, data_emissao, conta_omie, complemento, parcelas, contas_pagar';
const COLS_NS = 'n_cod_nf, numero, numero_int, serie, tipo, chave_nfe, cliente_nome, cliente_doc, valor_nf, data_emissao, cancelada, conta_omie';
const COLS_TITULO = 'codigo_lancamento, numero_documento, numero_documento_fiscal, numero_boleto, numero_parcela, valor_documento, data_vencimento, status_titulo, conta_omie';

type Rows = any[];
const rowsDe = async (p: PromiseLike<{ data: unknown }> | null): Promise<Rows> => {
  if (!p) return [];
  try {
    const { data } = await p;
    return (data as Rows) || [];
  } catch {
    return [];
  }
};

export async function GET(req: NextRequest) {
  try {
    // módulo puro OU a ação granular financeiro:rastreio OU admin — o acesso
    // por QUALQUER financeiro:* deixaria quem só cria lançamento ver tudo
    await exigirPermissao(req, 'financeiro', 'rastreio');
  } catch (e) {
    const st = (e as { http?: number })?.http || 401;
    return NextResponse.json({ error: e instanceof Error ? e.message : 'não autenticado' }, { status: st });
  }

  const bruto = (req.nextUrl.searchParams.get('q') || '').trim();
  if (bruto.length < 2) return NextResponse.json({ error: 'Digite pelo menos 2 caracteres.' }, { status: 400 });
  const termo = normalizarTermo(bruto);
  if (termo.tipo === 'texto' && termo.texto.length < 3) {
    return NextResponse.json({ error: 'Termo curto demais — digite pelo menos 3 letras ou um número de documento.' }, { status: 400 });
  }

  const avisos: string[] = [];

  try {
    // ============================ FASE A ==================================
    const t = sanitizarFiltro(termo.texto);
    const chave = termo.chaveNfe;
    // O que vai no ilike: a MAIOR sequência de dígitos do termo ('1384/1547'
    // procura '%1547%' — a concatenação '13841547' não existe no banco).
    // Texto com dígitos ('1AA532734-3' é um nº de NF real): procura a string
    // bruta, que casa o campo mascarado como foi digitado.
    const textoComNumero = termo.tipo === 'texto' && termo.digitos.length >= 4;
    const nBusca = sanitizarFiltro(
      termo.tipo === 'chave_nfe' ? (termo.nNFDaChave || '')
        : textoComNumero ? termo.bruto
          : termo.numeroBusca,
    );
    const buscaNumero = !!nBusca && (termo.tipo === 'numero' || termo.tipo === 'chave_nfe' || termo.tipo === 'requisicao_id' || textoComNumero);
    const idReq = termo.requisicaoId ?? (termo.tipo === 'numero' && termo.digitos.length <= 7 ? Number(termo.numeroSemZeros) : null);

    const qs: Record<string, PromiseLike<{ data: unknown }> | null> = {
      fpChave: chave ? supabase.from('finan_pagar').select(COLS_FP).eq('nfe_chave', chave).limit(LIMIT) : null,
      fpNumero: buscaNumero && nBusca ? supabase.from('finan_pagar').select(COLS_FP).ilike('numero_NF', `%${nBusca}%`).limit(LIMIT) : null,
      fpTexto: termo.tipo === 'texto' ? supabase.from('finan_pagar').select(COLS_FP).ilike('fornecedor', `%${t}%`).order('id', { ascending: false }).limit(LIMIT_TEXTO) : null,
      fpReq: idReq ? supabase.from('finan_pagar').select(COLS_FP).or(`requisicao_ids.cs.[${idReq}],motivo.ilike.%#${idReq}%`).limit(LIMIT) : null,
      reqNumero: buscaNumero && nBusca ? supabase.from('Requisicao').select(COLS_REQ).ilike('numero_nota', `%${nBusca}%`).neq('status', 'lixeira').limit(LIMIT) : null,
      reqId: idReq ? supabase.from('Requisicao').select(COLS_REQ).eq('id', idReq).neq('status', 'lixeira').limit(1) : null,
      reqTexto: termo.tipo === 'texto' ? supabase.from('Requisicao').select(COLS_REQ).ilike('fornecedor', `%${t}%`).neq('status', 'lixeira').order('id', { ascending: false }).limit(LIMIT_TEXTO) : null,
      chamadoNumero: buscaNumero && nBusca ? supabase.from('Chamado_NF').select(COLS_CHAMADO).or(`num_nf_servico.ilike.%${nBusca}%,num_nf_peca.ilike.%${nBusca}%`).limit(LIMIT) : null,
      chamadoTexto: termo.tipo === 'texto' ? supabase.from('Chamado_NF').select(COLS_CHAMADO).ilike('nom_cliente', `%${t}%`).order('id', { ascending: false }).limit(LIMIT_TEXTO) : null,
      neNumero: buscaNumero && nBusca ? supabase.from('notas_entrada').select(COLS_NE).ilike('numero_nf', `%${nBusca}%`).limit(LIMIT) : null,
      neChave: chave ? supabase.from('notas_entrada').select(COLS_NE).filter('complemento->>cChaveNFe', 'eq', chave).limit(LIMIT) : null,
      nsNumero: buscaNumero && nBusca ? supabase.from('portal_nt_notas_saida').select(COLS_NS).eq('numero_int', Number(nBusca) || -1).limit(LIMIT) : null,
      nsChave: chave ? supabase.from('portal_nt_notas_saida').select(COLS_NS).eq('chave_nfe', chave).limit(LIMIT) : null,
      nsTexto: termo.tipo === 'texto' ? supabase.from('portal_nt_notas_saida').select(COLS_NS).ilike('cliente_nome', `%${t}%`).order('data_emissao', { ascending: false }).limit(LIMIT_TEXTO) : null,
      cpNumero: buscaNumero && nBusca ? supabase.from('contas_pagar').select(COLS_TITULO).or(`numero_documento_fiscal.ilike.%${nBusca}%,numero_documento.ilike.%${nBusca}%`).limit(LIMIT) : null,
      crNumero: buscaNumero && nBusca ? supabase.from('contas_receber').select(COLS_TITULO).or(`numero_documento_fiscal.ilike.%${nBusca}%,numero_documento.ilike.%${nBusca}%`).limit(LIMIT) : null,
      cpBoleto: termo.digitos.length >= 6 ? supabase.from('contas_pagar').select(COLS_TITULO).ilike('numero_boleto', `%${sanitizarFiltro(termo.numeroSemZeros || termo.digitos)}%`).limit(LIMIT) : null,
      crBoleto: termo.digitos.length >= 6 ? supabase.from('contas_receber').select(COLS_TITULO).ilike('numero_boleto', `%${sanitizarFiltro(termo.numeroSemZeros || termo.digitos)}%`).limit(LIMIT) : null,
      recChave: chave ? supabase.from('recebimentos_nfe').select('chave_nfe, numero_nfe').eq('chave_nfe', chave).limit(LIMIT) : null,
      pastaOs: buscaNumero && nBusca ? supabase.from('portal_nt_clientes_os').select('num_os, cod_os, empresa, num_nf, link_nf, nf_manual, nf_substituicoes, num_pedido_cli').ilike('num_nf', `%${nBusca}%`).limit(LIMIT) : null,
      pastaPv: buscaNumero && nBusca ? supabase.from('portal_nt_clientes_pv').select('num_pedido, cod_pedido, empresa, numero_nf, link_nf, nf_manual, nf_substituicoes').ilike('numero_nf', `%${nBusca}%`).limit(LIMIT) : null,
    };

    // fuzzy de boleto por valor+vencimento (linha digitável decodificada)
    if (termo.tipo === 'linha_digitavel' && termo.boleto?.vencimento && termo.boleto.valor != null) {
      const v = termo.boleto.valor;
      qs.cpFuzzy = supabase.from('contas_pagar').select(COLS_TITULO)
        .eq('data_vencimento', termo.boleto.vencimento)
        .gte('valor_documento', v - 0.01).lte('valor_documento', v + 0.01).limit(LIMIT);
      qs.crFuzzy = supabase.from('contas_receber').select(COLS_TITULO)
        .eq('data_vencimento', termo.boleto.vencimento)
        .gte('valor_documento', v - 0.01).lte('valor_documento', v + 0.01).limit(LIMIT);
      qs.fpFuzzy = supabase.from('finan_pagar').select(COLS_FP)
        .eq('data_vencimento', termo.boleto.vencimento).limit(LIMIT);
    }

    const nomes = Object.keys(qs);
    const resultados = await Promise.all(nomes.map((k) => rowsDe(qs[k])));
    const r: Record<string, Rows> = {};
    nomes.forEach((k, i) => { r[k] = resultados[i]; });

    // pós-filtros de número exato (ilike %n% acha "1234" buscando "234").
    // Compara pelo termo BRUTO — mesmoNumero entende nº composto ('1384/1547'
    // contém '1384') e máscara ('NF 1.234' = '1234')
    const alvoNum = termo.tipo === 'chave_nfe' ? termo.nNFDaChave : termo.bruto;
    const filtraNum = (rows: Rows, campos: string[]) =>
      rows.filter((row) => campos.some((c) => mesmoNumero(row[c], alvoNum)));
    if (buscaNumero) {
      r.fpNumero = filtraNum(r.fpNumero || [], ['numero_NF']);
      r.reqNumero = filtraNum(r.reqNumero || [], ['numero_nota']);
      r.chamadoNumero = filtraNum(r.chamadoNumero || [], ['num_nf_servico', 'num_nf_peca']);
      r.neNumero = filtraNum(r.neNumero || [], ['numero_nf']);
      r.cpNumero = filtraNum(r.cpNumero || [], ['numero_documento_fiscal', 'numero_documento']);
      r.crNumero = filtraNum(r.crNumero || [], ['numero_documento_fiscal', 'numero_documento']);
      r.pastaOs = filtraNum(r.pastaOs || [], ['num_nf']);
      r.pastaPv = filtraNum(r.pastaPv || [], ['numero_nf']);
    }
    // pós-filtro do fpReq: "#123" não pode casar linha cujo motivo só tem "#1234"
    if (idReq) r.fpReq = (r.fpReq || []).filter((row) => requisicaoIdsDe(row).includes(idReq));
    // fpFuzzy veio SÓ pelo vencimento (finan_pagar.valor é texto, não dá pra
    // filtrar no banco) — confere o VALOR aqui, senão toda conta do mesmo dia
    // entra como falso positivo
    if (r.fpFuzzy?.length && termo.boleto?.valor != null) {
      const alvoValor = termo.boleto.valor;
      const parseVal = (v: unknown) => parseFloat(String(v ?? '').replace(/\./g, '').replace(',', '.')) || parseFloat(String(v ?? '')) || 0;
      r.fpFuzzy = r.fpFuzzy.filter((row) => {
        if (Math.abs(parseVal(row.valor) - alvoValor) <= 0.01) return true;
        // parcelado: alguma parcela com o valor do boleto?
        return String(row.parcelas_vencimentos || '').split(',').some((p) => {
          const val = parseFloat(String(p.split('|')[1] || '').trim());
          return Number.isFinite(val) && Math.abs(val - alvoValor) <= 0.01;
        });
      });
    }
    if (r.fpFuzzy?.length || r.cpFuzzy?.length || r.crFuzzy?.length) {
      avisos.push('Alguns resultados de boleto foram casados por valor + vencimento (heurística).');
    }

    // ============================ FASE B ==================================
    const dedupe = <T,>(rows: T[], keyFn: (x: T) => string): T[] => {
      const m = new Map<string, T>();
      for (const row of rows) m.set(keyFn(row), row);
      return [...m.values()];
    };

    let fps: Rows = dedupe([...(r.fpChave || []), ...(r.fpNumero || []), ...(r.fpTexto || []), ...(r.fpReq || []), ...(r.fpFuzzy || [])], (x) => String(x.id));
    let reqs: Rows = dedupe([...(r.reqNumero || []), ...(r.reqId || []), ...(r.reqTexto || [])], (x) => String(x.id));
    let chamados: Rows = dedupe([...(r.chamadoNumero || []), ...(r.chamadoTexto || [])], (x) => String(x.id));
    let titulos: Rows = dedupe([
      ...(r.cpNumero || []).map((x) => ({ ...x, tipo: 'pagar' })),
      ...(r.cpBoleto || []).map((x) => ({ ...x, tipo: 'pagar' })),
      ...(r.cpFuzzy || []).map((x) => ({ ...x, tipo: 'pagar' })),
      ...(r.crNumero || []).map((x) => ({ ...x, tipo: 'receber' })),
      ...(r.crBoleto || []).map((x) => ({ ...x, tipo: 'receber' })),
      ...(r.crFuzzy || []).map((x) => ({ ...x, tipo: 'receber' })),
    ], (x) => `${x.tipo}:${x.codigo_lancamento}`);

    const enriquecimentos: PromiseLike<{ data: unknown }>[] = [];
    // requisições das contas a pagar achadas
    const idsReqDasFp = [...new Set(fps.flatMap((fp) => requisicaoIdsDe(fp)))]
      .filter((id) => !reqs.some((q) => Number(q.id) === id)).slice(0, 50);
    if (idsReqDasFp.length) enriquecimentos.push(supabase.from('Requisicao').select(COLS_REQ).in('id', idsReqDasFp));
    // títulos Omie das contas a pagar
    const codigosDasFp = [...new Set(fps.flatMap((fp) => String(fp.omie_cod_lancamento || '').split(',').map((s) => s.trim()).filter(Boolean)))]
      .filter((c) => !titulos.some((tt) => String(tt.codigo_lancamento) === c)).slice(0, 50).map(Number).filter(Number.isFinite);
    if (codigosDasFp.length) enriquecimentos.push(
      supabase.from('contas_pagar').select(COLS_TITULO).in('codigo_lancamento', codigosDasFp)
        .then((res: any) => ({ data: ((res.data as Rows) || []).map((x) => ({ ...x, tipo: 'pagar' })) })),
    );
    // contas a receber dos faturamentos — ilike + pós-filtro (o .in exato
    // perdia o título quando um dos lados tinha zeros à esquerda)
    const docsDosChamados = [...new Set(chamados.flatMap((c) => [c.num_nf_servico, c.num_nf_peca]).filter(Boolean))].slice(0, 10);
    for (const doc of docsDosChamados) {
      const nDoc = sanitizarFiltro(String(doc).replace(/\D/g, '').replace(/^0+/, ''));
      if (!nDoc) continue;
      enriquecimentos.push(
        supabase.from('contas_receber').select(COLS_TITULO).ilike('numero_documento_fiscal', `%${nDoc}%`).limit(10)
          .then((res: any) => ({
            data: ((res.data as Rows) || [])
              .filter((x) => mesmoNumero(x.numero_documento_fiscal, doc))
              .map((x) => ({ ...x, tipo: 'receber' })),
          })),
      );
    }
    // resolver boleto/título de volta pra conta a pagar do portal
    const codigosDosTitulosPagar = titulos.filter((tt) => tt.tipo === 'pagar').map((tt) => String(tt.codigo_lancamento)).slice(0, 20);
    for (const cod of codigosDosTitulosPagar) {
      if (fps.some((fp) => String(fp.omie_cod_lancamento || '').split(',').map((s) => s.trim()).includes(cod))) continue;
      enriquecimentos.push(supabase.from('finan_pagar').select(COLS_FP).ilike('omie_cod_lancamento', `%${sanitizarFiltro(cod)}%`).limit(5));
    }
    // contas a pagar das requisições achadas (lado requisição → fp)
    for (const q of reqs.slice(0, 10)) {
      if (fps.some((fp) => requisicaoIdsDe(fp).includes(Number(q.id)))) continue;
      enriquecimentos.push(supabase.from('finan_pagar').select(COLS_FP).or(`requisicao_ids.cs.[${Number(q.id)}],motivo.ilike.%#${Number(q.id)}%`).limit(5));
    }

    const extras = (await Promise.all(enriquecimentos.map((p) => rowsDe(p)))).flat();
    for (const row of extras) {
      if ('codigo_lancamento' in row) titulos.push(row);
      else if ('numero_nota' in row) reqs.push(row);
      else if ('id' in row && 'motivo' in row) {
        // pós-filtro dos fp vindos por motivo (evita #123 × #1234)
        const deReq = reqs.some((q) => requisicaoIdsDe(row).includes(Number(q.id)));
        const deTitulo = codigosDosTitulosPagar.some((cod) => String(row.omie_cod_lancamento || '').split(',').map((s: string) => s.trim()).includes(cod));
        if (deReq || deTitulo) fps.push(row);
      }
    }
    fps = dedupe(fps, (x) => String(x.id));
    reqs = dedupe(reqs, (x) => String(x.id));
    titulos = dedupe(titulos, (x) => `${x.tipo}:${x.codigo_lancamento}`);

    // ============================ FASE C ==================================
    // listas de notas viram mutáveis aqui: vínculo manual pode trazer notas
    // que a Fase A não achou
    let nfsEntrada: Rows = dedupe([...(r.neNumero || []), ...(r.neChave || [])], (x) => `${x.ncod_nf ?? x.numero_nf}-${x.conta_omie}`);
    let nfsSaida: Rows = dedupe([...(r.nsNumero || []), ...(r.nsChave || []), ...(r.nsTexto || [])], (x) => String(x.n_cod_nf));

    // TODOS os tipos vinculáveis entram nos refs — nota de entrada/saída fora
    // daqui tornava o vínculo manual com nota invisível na busca
    const refs: RefDoc[] = [
      ...fps.map((x) => ({ tipo: 'finan_pagar' as const, id: String(x.id) })),
      ...reqs.map((x) => ({ tipo: 'requisicao' as const, id: String(x.id) })),
      ...chamados.map((x) => ({ tipo: 'chamado_nf' as const, id: String(x.id) })),
      ...titulos.map((x) => ({ tipo: 'titulo_omie' as const, id: String(x.codigo_lancamento) })),
      ...nfsEntrada.filter((x) => x.ncod_nf != null).map((x) => ({ tipo: 'nota_entrada' as const, id: String(x.ncod_nf) })),
      ...nfsSaida.map((x) => ({ tipo: 'nota_saida' as const, id: String(x.n_cod_nf) })),
    ];
    let vinculos: VinculoRow[] = [];
    if (refs.length > 0 && refs.length <= 60) {
      const ors = refs.map((ref) => `and(tipo_a.eq.${ref.tipo},id_a.eq.${sanitizarFiltro(ref.id)}),and(tipo_b.eq.${ref.tipo},id_b.eq.${sanitizarFiltro(ref.id)})`).join(',');
      vinculos = await rowsDe(supabase.from('portal_doc_vinculos').select('*').or(ors).limit(100));
    } else if (refs.length > 60) {
      avisos.push('Resultado muito amplo — vínculos manuais não foram verificados; refine o termo.');
    }
    // docs que só existem do outro lado de um vínculo manual
    const carregarFaltantes = async (tipo: string, ids: string[]) => {
      if (!ids.length) return;
      if (tipo === 'finan_pagar') fps.push(...await rowsDe(supabase.from('finan_pagar').select(COLS_FP).in('id', ids.map(Number).filter(Number.isFinite))));
      if (tipo === 'requisicao') reqs.push(...await rowsDe(supabase.from('Requisicao').select(COLS_REQ).in('id', ids.map(Number).filter(Number.isFinite))));
      if (tipo === 'chamado_nf') chamados.push(...await rowsDe(supabase.from('Chamado_NF').select(COLS_CHAMADO).in('id', ids.map(Number).filter(Number.isFinite))));
      if (tipo === 'nota_entrada') nfsEntrada.push(...await rowsDe(supabase.from('notas_entrada').select(COLS_NE).in('ncod_nf', ids.map(Number).filter(Number.isFinite))));
      if (tipo === 'nota_saida') nfsSaida.push(...await rowsDe(supabase.from('portal_nt_notas_saida').select(COLS_NS).in('n_cod_nf', ids.map(Number).filter(Number.isFinite))));
      if (tipo === 'titulo_omie') {
        const nums = ids.map(Number).filter(Number.isFinite);
        const [cp, cr] = await Promise.all([
          rowsDe(supabase.from('contas_pagar').select(COLS_TITULO).in('codigo_lancamento', nums)),
          rowsDe(supabase.from('contas_receber').select(COLS_TITULO).in('codigo_lancamento', nums)),
        ]);
        titulos.push(...cp.map((x) => ({ ...x, tipo: 'pagar' })), ...cr.map((x) => ({ ...x, tipo: 'receber' })));
      }
    };
    const temRef = new Set(refs.map((ref) => `${ref.tipo}:${ref.id}`));
    const faltantes = new Map<string, Set<string>>();
    for (const v of vinculos) {
      for (const [tp, id] of [[v.tipo_a, v.id_a], [v.tipo_b, v.id_b]] as const) {
        if (!temRef.has(`${tp}:${id}`)) faltantes.set(tp, (faltantes.get(tp) || new Set()).add(id));
      }
    }
    await Promise.all([...faltantes.entries()].map(([tp, ids]) => carregarFaltantes(tp, [...ids])));
    fps = dedupe(fps, (x) => String(x.id));
    reqs = dedupe(reqs, (x) => String(x.id));
    chamados = dedupe(chamados, (x) => String(x.id));
    titulos = dedupe(titulos, (x) => `${x.tipo}:${x.codigo_lancamento}`);
    nfsEntrada = dedupe(nfsEntrada, (x) => `${x.ncod_nf ?? x.numero_nf}-${x.conta_omie}`);
    nfsSaida = dedupe(nfsSaida, (x) => String(x.n_cod_nf));

    // ========================= AGRUPAR + ANEXOS ===========================
    const docs: DocsBrutos = {
      contaPagar: fps,
      requisicoes: reqs,
      chamadosReceber: chamados,
      nfEntrada: nfsEntrada,
      nfSaida: nfsSaida,
      titulosOmie: titulos,
      pastaCliente: [
        ...(r.pastaOs || []).map((x) => ({ ...x, origem: 'os', substituidaPor: substituidaPor(x, alvoNum) })),
        ...(r.pastaPv || []).map((x) => ({ ...x, origem: 'pv', substituidaPor: substituidaPor(x, alvoNum) })),
      ],
    };

    const { fichas, totalDocs } = agruparResultados(docs, vinculos, termo);
    for (const f of fichas) f.anexos = montarAnexos(f);
    const fichasLimpa: DocumentoFicha[] = fichas.map(({ nosPorSecao: _n, ...resto }) => resto);

    if (termo.tipo === 'texto') avisos.push('Busca por texto mostra só os documentos da contraparte — busque pelo nº da nota pra ficha completa.');
    if (totalDocs >= LIMIT * 3) avisos.push('Muitos resultados — a lista pode estar truncada; refine o termo.');
    if ((r.recChave || []).length > 0) avisos.push('Chave também consta no recebimento de NF-e do estoque.');

    const resposta: RespostaRastreio = { termo, fichas: fichasLimpa, avisos };
    return NextResponse.json(resposta);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'erro na busca' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Anexos: resolve colunas CSV/paths pra URLs (Drive legado → url null)
// ---------------------------------------------------------------------------

const BASE_REQ = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/requisicoes/`;

function urlDeAnexoReq(valor: unknown): string | null {
  const v = String(valor || '').trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  if (v.startsWith('SupaAtualizarReq_Images/')) return null; // Drive legado
  return BASE_REQ + v.split('/').map(encodeURIComponent).join('/');
}

const splitCsv = (v: unknown) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);

// nf_substituicoes (jsonb da pasta do cliente): a NF buscada foi substituída?
function substituidaPor(row: any, alvoNum: string | null): string | null {
  if (!alvoNum) return null;
  const subs: any[] = Array.isArray(row?.nf_substituicoes) ? row.nf_substituicoes : [];
  for (const s of subs) {
    if (mesmoNumero(s?.num_antigo ?? s?.antiga ?? s?.de, alvoNum)) {
      return String(s?.num_novo ?? s?.nova ?? s?.para ?? '') || null;
    }
  }
  return null;
}

function montarAnexos(f: { secoes: any }): AnexoFicha[] {
  const anexos: AnexoFicha[] = [];
  const add = (origem: RefDoc, origemLabel: string, label: string, url: string | null) => {
    if (url === null || url) anexos.push({ origem, origemLabel, label, url });
  };

  for (const fp of f.secoes.contaPagar) {
    const origem: RefDoc = { tipo: 'finan_pagar', id: String(fp.id) };
    const ol = `Conta a pagar #${fp.id}`;
    if (fp.anexo_nf) add(origem, ol, 'Nota fiscal', fp.anexo_nf);
    splitCsv(fp.anexo_boleto).forEach((u, i, arr) => add(origem, ol, arr.length > 1 ? `Boleto ${i + 1}` : 'Boleto', u));
    splitCsv(fp.anexo_requisicao).forEach((u, i, arr) => add(origem, ol, arr.length > 1 ? `Requisição (PDF ${i + 1})` : 'Requisição (PDF)', u));
    if (fp.comprovante_pagamento) add(origem, ol, 'Comprovante de pagamento', fp.comprovante_pagamento);
    if (fp.nfe_xml_url) add(origem, ol, 'XML NF-e', fp.nfe_xml_url);
  }
  for (const q of f.secoes.requisicoes) {
    const origem: RefDoc = { tipo: 'requisicao', id: String(q.id) };
    const ol = `Requisição #${q.id}`;
    if (q.foto_nf) add(origem, ol, 'Nota fiscal', urlDeAnexoReq(q.foto_nf));
    if (q.boleto_fornecedor) add(origem, ol, 'Boleto', urlDeAnexoReq(q.boleto_fornecedor));
    if (q.recibo_fornecedor) add(origem, ol, 'Recibo / outros', urlDeAnexoReq(q.recibo_fornecedor));
  }
  for (const c of f.secoes.chamadosReceber) {
    const origem: RefDoc = { tipo: 'chamado_nf', id: String(c.id) };
    const ol = `Faturamento #${c.id}`;
    if (c.anexo_nf_servico) splitCsv(c.anexo_nf_servico).forEach((u, i, arr) => add(origem, ol, arr.length > 1 ? `NF serviço ${i + 1}` : 'NF serviço', u));
    if (c.anexo_nf_peca) splitCsv(c.anexo_nf_peca).forEach((u, i, arr) => add(origem, ol, arr.length > 1 ? `NF peça ${i + 1}` : 'NF peça', u));
    const boletos = [...splitCsv(c.anexo_boleto), ...splitCsv(c.anexo_boleto_2), ...splitCsv(c.anexo_boleto_3)];
    boletos.forEach((u, i) => add(origem, ol, boletos.length > 1 ? `Boleto ${i + 1}` : 'Boleto', u));
    if (c.comprovante_pagamento) add(origem, ol, 'Comprovante de pagamento', c.comprovante_pagamento);
    for (let p = 1; p <= 5; p++) {
      const u = c[`comprovante_pagamento_p${p}`];
      if (u) add(origem, ol, `Comprovante parcela ${p}`, u);
    }
  }
  for (const p of f.secoes.pastaCliente) {
    if (p.link_nf) {
      anexos.push({
        origem: { tipo: p.origem === 'os' ? 'nota_saida' : 'nota_saida', id: String(p.origem === 'os' ? p.num_os : p.num_pedido) },
        origemLabel: p.origem === 'os' ? `Pasta do cliente — OS ${p.num_os}` : `Pasta do cliente — PV ${p.num_pedido}`,
        label: 'NF (pasta do cliente)',
        url: p.link_nf,
      });
    }
  }
  // dedupe por URL (a mesma NF aparece na conta e na pasta)
  const vistos = new Set<string>();
  return anexos.filter((a) => {
    const k = a.url || `drive:${a.origemLabel}:${a.label}`;
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
}
