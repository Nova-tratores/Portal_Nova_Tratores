/* eslint-disable @typescript-eslint/no-explicit-any */
// /api/inteligencia-vendas/empresas — CNPJ na Receita (ideias 16 e 18).
//   GET   empresas rurais NOVAS da região (iv_cnpj origem 'receita', carga pelo
//         script scripts/iv-cnpj-novos.ts) + quanto da carteira já tem CNAE
//   POST  {acao:'enriquecer'} consulta na BrasilAPI até 30 CNPJs de clientes
//         que ainda não têm CNAE e grava em iv_cnpj (origem 'cliente')
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { paginar } from '@/lib/db/paginar';
import { carregarBase, erroIV, guardarIV, logIV, migracaoFaltando } from '@/lib/inteligencia-vendas/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

async function lerCnpjs(): Promise<{ linhas: any[]; semTabela: boolean }> {
  const { data, error } = await paginar<any>((de, ate) => supabaseAdmin.from('iv_cnpj').select('*').order('cnpj').range(de, ate) as any);
  if (error) {
    if (migracaoFaltando(error)) return { linhas: [], semTabela: true };
    throw new Error(error.message);
  }
  return { linhas: data, semTabela: false };
}

export async function GET(req: Request) {
  const g = await guardarIV(req, 'empresas');
  if (g.resposta) return g.resposta;
  try {
    const [{ linhas, semTabela }, { clientes }] = await Promise.all([lerCnpjs(), carregarBase()]);
    const docsClientes = new Set(clientes.filter((c) => c.doc.length === 14).map((c) => c.doc));
    const consultados = new Set(linhas.map((l) => l.cnpj));
    const novas = linhas.filter((l) => l.origem === 'receita')
      .map((l) => ({ ...l, jaCliente: docsClientes.has(l.cnpj) }))
      .sort((a, b) => String(b.data_inicio || '').localeCompare(String(a.data_inicio || '')));
    const daCarteira = linhas.filter((l) => docsClientes.has(l.cnpj));
    const porCnae = new Map<string, { cnae: string; descricao: string; clientes: number }>();
    for (const l of daCarteira) {
      const k = String(l.cnae_codigo || '—');
      const r = porCnae.get(k) || { cnae: k, descricao: String(l.cnae_descricao || ''), clientes: 0 };
      r.clientes++;
      porCnae.set(k, r);
    }
    return NextResponse.json({
      semTabela,
      novas,
      carteira: {
        cnpjs: docsClientes.size,
        consultados: [...docsClientes].filter((d) => consultados.has(d)).length,
        porCnae: [...porCnae.values()].sort((a, b) => b.clientes - a.clientes).slice(0, 25),
        prestadores: daCarteira.filter((l) => /^0161/.test(String(l.cnae_codigo || '').replace(/\D/g, '')))
          .map((l) => ({ cnpj: l.cnpj, nome: l.razao_social, cnae: l.cnae_descricao, municipio: l.municipio })),
      },
    });
  } catch (e) {
    return erroIV(e, 'empresas GET');
  }
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

// A BrasilAPI devolve 403 para pedido sem User-Agent de navegador (Cloudflare).
// Reserva: Minha Receita (mesmos campos, mesma base da Receita).
const CABECALHO = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36', Accept: 'application/json' };
async function consultarCnpj(cnpj: string): Promise<any> {
  let limite = 0;
  for (const url of [`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, `https://minhareceita.org/${cnpj}`]) {
    try {
      const r = await fetch(url, { headers: CABECALHO, signal: AbortSignal.timeout(15_000) });
      if (r.ok) return await r.json();
      if (r.status === 429) limite++;
      if (r.status === 404) throw new Error('CNPJ não encontrado na Receita');
    } catch (e: any) {
      if (/não encontrado/.test(String(e?.message))) throw e;
    }
  }
  if (limite === 2) return 'limite';
  throw new Error('Receita indisponível agora (BrasilAPI e Minha Receita)');
}

export async function POST(req: Request) {
  const g = await guardarIV(req, 'empresas');
  if (g.resposta) return g.resposta;
  try {
    const b = await req.json().catch(() => ({}));
    if (b.acao !== 'enriquecer') return NextResponse.json({ error: 'ação inválida' }, { status: 400 });
    const [{ linhas, semTabela }, { clientes }] = await Promise.all([lerCnpjs(), carregarBase()]);
    if (semTabela) return NextResponse.json({ error: 'Migration sql/inteligencia-vendas.sql não aplicada', migracaoFaltando: true }, { status: 503 });
    // consulta que deu erro volta pra fila
    const feitos = new Set(linhas.filter((l) => !l.erro).map((l) => l.cnpj));
    // Prioridade: quem tem oportunidade ou compra mais, primeiro.
    const pendentes = clientes.filter((c) => c.doc.length === 14 && !feitos.has(c.doc));
    const fila = [...pendentes].sort((a, b) => b.score - a.score || b.pecas12m - a.pecas12m).slice(0, 30);
    let ok = 0, falhas = 0;
    for (const c of fila) {
      let reg: Record<string, any>;
      try {
        const j: any = await consultarCnpj(c.doc);
        if (j === 'limite') break; // limite das APIs: para e tenta no próximo clique
        reg = {
          cnpj: c.doc, razao_social: j.razao_social || null, nome_fantasia: j.nome_fantasia || null,
          cnae_codigo: j.cnae_fiscal ? String(j.cnae_fiscal).padStart(7, '0') : null, cnae_descricao: j.cnae_fiscal_descricao || null,
          cnaes_secundarios: j.cnaes_secundarios || null, data_inicio: j.data_inicio_atividade || null,
          situacao: j.descricao_situacao_cadastral || null, porte: j.porte || j.descricao_porte || null,
          municipio: j.municipio || null, uf: j.uf || null, municipio_ibge: Number(j.codigo_municipio_ibge) || null,
          telefone: j.ddd_telefone_1 || null, origem: 'cliente', erro: null,
        };
        ok++;
      } catch (e: any) {
        reg = { cnpj: c.doc, origem: 'cliente', erro: String(e?.message || e).slice(0, 200) };
        falhas++;
      }
      const { error } = await supabaseAdmin.from('iv_cnpj').upsert({ ...reg, consultado_em: new Date().toISOString() }, { onConflict: 'cnpj' });
      if (error) throw error;
      await espera(400);
    }
    // a base usa o CNAE nas regras: força recarregar na próxima leitura
    await carregarBase(true);
    await logIV(g.auth!, { acao: 'cnpj_enriquecer', detalhes: { ok, falhas } });
    return NextResponse.json({ ok, falhas, restantes: Math.max(0, pendentes.length - ok - falhas) });
  } catch (e) {
    return erroIV(e, 'empresas POST');
  }
}
