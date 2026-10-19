/* eslint-disable @typescript-eslint/no-explicit-any */
// /api/inteligencia-vendas/concorrencia — radar de concorrentes e preços (ideia 12).
//   GET          registros manuais (iv_concorrentes) + perdas tiradas das
//                propostas do portal e do CRM dos vendedores
//   POST {..}    registra um anúncio / campanha / preço visto
//   DELETE ?id=  apaga
// Só o que a equipe viu, ouviu ou é público. Nada de raspagem de site.
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import type { Autenticado } from '@/lib/auth/server';
import { carregarFontes, emBanco, erroIV, guardarIV, logIV, migracaoFaltando, nomeDoUsuario, TTL_BASE } from '@/lib/inteligencia-vendas/server';
import { dataISO } from '@/lib/inteligencia-vendas/normalizar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const podeEditar = (a: Autenticado) =>
  a.isAdmin || a.modulos.includes('inteligencia-vendas') || a.modulos.includes('inteligencia-vendas:concorrencia:editar');

const MOTIVO_CRM: Record<string, string> = {
  preco: 'Preço', concorrencia: 'Concorrência', sem_orcamento: 'Sem orçamento', sem_interesse: 'Sem interesse',
  prazo: 'Prazo', produto_inadequado: 'Produto inadequado', sem_retorno: 'Sem retorno', outro: 'Outro',
};

function motivoDoNegocio(m: any): Record<string, any> {
  if (!m) return {};
  if (typeof m === 'object') return m;
  try { return JSON.parse(m); } catch { return { motivo: String(m) }; }
}

export async function GET(req: Request) {
  const g = await guardarIV(req, 'concorrencia');
  if (g.resposta) return g.resposta;
  try {
    let registros: any[] = [];
    let semTabela = false;
    const r = await supabaseAdmin.from('iv_concorrentes').select('*').order('data_ref', { ascending: false }).limit(3000);
    if (r.error) {
      if (migracaoFaltando(r.error)) semTabela = true;
      else throw r.error;
    } else registros = r.data || [];

    // perdas tiradas das propostas e do CRM: prontas no banco (iv_snapshot), recalculadas por trás
    const { valor: perdas } = await emBanco('concorrencia-perdas', TTL_BASE, () => montarPerdas());
    return NextResponse.json({ registros, perdas, semTabela, podeEditar: podeEditar(g.auth!) });
  } catch (e) {
    return erroIV(e, 'concorrencia GET');
  }
}

async function montarPerdas(): Promise<any[]> {
  {
    const f = await carregarFontes();
    const { data: motivos } = await supabaseAdmin.from('motivo_perda').select('id,nome');
    const nomeMotivo = new Map((motivos || []).map((m: any) => [m.id, m.nome]));
    const perdas: any[] = [];
    for (const p of f.propostas as any[]) {
      if (p.status !== 'Concluida- Não vendido.') continue;
      perdas.push({
        origem: 'proposta', id: p.id, cliente: p.Cliente || '', cidade: p.Cidade || '',
        oque: [p.Marca, p.Modelo].filter(Boolean).join(' '),
        motivo: nomeMotivo.get(p.motivo_perda_id) || 'Sem motivo registrado',
        concorrente: p.concorrente || '', valorConcorrente: p.concorrente_valor ?? null,
        data: dataISO(p.fechado_em || p.status_desde), vendedor: p.vendedor_nome || '',
      });
    }
    const vend = new Map(f.vendedores.map((v) => [v.id, v.nome]));
    const negocios = await supabaseAdmin.from('negocios').select('id,status,motivo_perda,cidade,maquina_marca,maquina_modelo,notas,updated_at,vendedor_id')
      .eq('status', 'fechamento_negativo').limit(1000);
    for (const n of (negocios.data || []) as any[]) {
      const mp = motivoDoNegocio(n.motivo_perda);
      const chave = String(mp.motivo || mp.key || '');
      perdas.push({
        origem: 'negocio', id: n.id, cliente: String(n.notas || '').slice(0, 60), cidade: n.cidade || '',
        oque: [n.maquina_marca, n.maquina_modelo].filter(Boolean).join(' '),
        motivo: MOTIVO_CRM[chave] || chave || 'Fechamento negativo',
        concorrente: mp.nome_concorrente || mp.campos?.nome_concorrente || '',
        valorConcorrente: Number(mp.valor_concorrente || mp.campos?.valor_concorrente) || null,
        data: dataISO(n.updated_at), vendedor: vend.get(n.vendedor_id) || '',
      });
    }
    perdas.sort((a, b) => String(b.data).localeCompare(String(a.data)));
    return perdas;
  }
}

export async function POST(req: Request) {
  const g = await guardarIV(req, 'concorrencia');
  if (g.resposta) return g.resposta;
  if (!podeEditar(g.auth!)) return NextResponse.json({ error: 'Sem permissão para registrar' }, { status: 403 });
  try {
    const b = await req.json();
    const t = (v: any, n = 300) => (typeof v === 'string' ? v.trim().slice(0, n) || null : null);
    const dados: Record<string, any> = {
      revenda: t(b.revenda, 120), marca: t(b.marca, 60), modelo: t(b.modelo, 80), ano: Number(b.ano) || null,
      condicao: ['novo', 'usado', 'seminovo'].includes(b.condicao) ? b.condicao : null,
      tipo: ['anuncio', 'campanha', 'evento', 'loja', 'outro'].includes(b.tipo) ? b.tipo : 'anuncio',
      preco: Number(b.preco) > 0 ? Number(b.preco) : null, condicoes: t(b.condicoes, 500), cidade: t(b.cidade, 80),
      fonte: t(b.fonte, 500), obs: t(b.obs, 1000),
    };
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(b.data_ref))) dados.data_ref = b.data_ref;
    if (!dados.revenda) return NextResponse.json({ error: 'Informe a revenda / concorrente' }, { status: 400 });
    const { data, error } = await supabaseAdmin.from('iv_concorrentes')
      .insert({ ...dados, criado_por: await nomeDoUsuario(g.auth!) }).select().single();
    if (error) throw error;
    await logIV(g.auth!, {
      acao: 'concorrente_registrado', entidade: 'iv_concorrentes', entidadeId: String(data.id),
      entidadeLabel: `${dados.revenda} ${dados.modelo || ''}`.trim(),
    });
    return NextResponse.json({ registro: data });
  } catch (e) {
    return erroIV(e, 'concorrencia POST');
  }
}

export async function DELETE(req: Request) {
  const g = await guardarIV(req, 'concorrencia');
  if (g.resposta) return g.resposta;
  if (!podeEditar(g.auth!)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  try {
    const id = Number(new URL(req.url).searchParams.get('id'));
    if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });
    const { error } = await supabaseAdmin.from('iv_concorrentes').delete().eq('id', id);
    if (error) throw error;
    await logIV(g.auth!, { acao: 'concorrente_apagado', entidade: 'iv_concorrentes', entidadeId: String(id) });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return erroIV(e, 'concorrencia DELETE');
  }
}
