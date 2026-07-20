// PATCH /api/frota/motoristas/[id] — edita o que é do PORTAL: CNH (número,
// categoria, validade) e a flag "é motorista". O resto do cadastro é do RH.
//
// [id] resolve em cascata: frota_motoristas.id → pessoa_id → rh_funcionarios.id
// (aí casa por CPF e PERSISTE o de-para em pessoa_id; sem match, CRIA a linha
// local com os dados do RH buscados server-side, re_id NULL).
// Campos que o sync da Rota Exata também escreve entram em campos_manuais —
// o humano venceu, o sync nunca mais os toca.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { autenticar } from '@/lib/auth/server';
import { podeFrota, logFrota } from '@/lib/frota/server';
import { buscarFuncionarioRH } from '@/lib/frota/rh';
import { normalizarCpf } from '@/lib/frota/motoristas';

export const runtime = 'nodejs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);

const EDITAVEIS = new Set(['cnh', 'cnh_categoria', 'cnh_validade', 'e_motorista']);
// o sync também escreve estes → editar trava contra o sync (campos_manuais)
const SINCADOS = new Set(['cnh', 'cnh_validade', 'e_motorista']);
const CATEGORIAS = new Set(['A', 'B', 'C', 'D', 'E', 'AB', 'AC', 'AD', 'AE']);

interface LinhaLocal {
  id: string;
  nome: string;
  cpf: string | null;
  pessoa_id: string | null;
  campos_manuais: string[] | null;
  cnh: string | null;
  cnh_validade: string | null;
  e_motorista: boolean;
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!podeFrota(auth, 'motoristas:editar')) {
    return NextResponse.json({ error: 'Sem permissão (frota:motoristas:editar)' }, { status: 403 });
  }
  const { id } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }

  // whitelist — o que vier fora dela é IGNORADO
  const upd: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (!EDITAVEIS.has(k)) continue;
    if (k === 'e_motorista') upd[k] = !!v;
    else upd[k] = typeof v === 'string' && v.trim() === '' ? null : v;
  }
  if (Object.keys(upd).length === 0) return NextResponse.json({ error: 'Nada pra salvar' }, { status: 400 });

  if (upd.cnh_categoria != null) {
    const cat = String(upd.cnh_categoria).toUpperCase().trim();
    if (!CATEGORIAS.has(cat)) {
      return NextResponse.json({ error: `Categoria inválida (${[...CATEGORIAS].join(', ')})` }, { status: 400 });
    }
    upd.cnh_categoria = cat;
  }
  if (upd.cnh_validade != null && !/^\d{4}-\d{2}-\d{2}$/.test(String(upd.cnh_validade))) {
    return NextResponse.json({ error: 'Validade da CNH deve ser YYYY-MM-DD' }, { status: 400 });
  }

  const SEL = 'id, nome, cpf, pessoa_id, campos_manuais, cnh, cnh_validade, e_motorista';
  try {
    // ── resolve a linha local em cascata ─────────────────────────────────────
    let local: LinhaLocal | null = null;
    {
      const { data } = await supabase.from('frota_motoristas').select(SEL).eq('id', id).maybeSingle();
      local = (data as LinhaLocal) || null;
    }
    if (!local) {
      const { data } = await supabase.from('frota_motoristas').select(SEL).eq('pessoa_id', id).maybeSingle();
      local = (data as LinhaLocal) || null;
    }
    let pessoaIdNovo: string | null = null;

    if (!local) {
      // trata como rh_funcionarios.id
      const rh = await buscarFuncionarioRH(id);
      if (!rh) return NextResponse.json({ error: 'Motorista não encontrado' }, { status: 404 });

      // casa por CPF (linha da Rota Exata ainda sem de-para)
      const cpfRh = normalizarCpf(rh.cpf);
      if (cpfRh.length === 11) {
        const { data: todos } = await supabase.from('frota_motoristas').select(SEL);
        const cand = ((todos || []) as LinhaLocal[]).find(
          (l) => normalizarCpf(l.cpf) === cpfRh && (!l.pessoa_id || l.pessoa_id === id),
        );
        if (cand) {
          local = cand;
          pessoaIdNovo = id; // persiste o de-para no primeiro match
        }
      }

      if (!local) {
        // funcionário do RH sem linha local — cria (dados vêm do RH, não do client)
        const { data: criado, error: errIns } = await supabase
          .from('frota_motoristas')
          .insert({
            re_id: null,
            nome: rh.nome,
            cpf: rh.cpf,
            email: rh.email,
            telefone: rh.telefone,
            cargo: rh.cargo,
            ativo: !['demitido', 'inativo'].includes(rh.status || ''),
            pessoa_id: id,
            e_motorista: false,
          })
          .select(SEL)
          .single();
        if (errIns) throw new Error(errIns.message);
        local = criado as LinhaLocal;
      }
    }

    // ── campos_manuais: união com o que foi editado agora ────────────────────
    const travados = new Set(local.campos_manuais || []);
    for (const k of Object.keys(upd)) if (SINCADOS.has(k)) travados.add(k);
    const payload: Record<string, unknown> = { ...upd, campos_manuais: [...travados] };
    if (pessoaIdNovo) payload.pessoa_id = pessoaIdNovo;

    const { error: errUpd } = await supabase.from('frota_motoristas').update(payload).eq('id', local.id);
    if (errUpd) throw new Error(errUpd.message);

    await logFrota(auth, {
      acao: 'editar',
      entidade: 'motorista',
      entidadeId: local.id,
      entidadeLabel: local.nome,
      detalhes: {
        alterados: Object.fromEntries(
          Object.entries(upd).map(([k, v]) => [k, { de: (local as unknown as Record<string, unknown>)[k] ?? null, para: v }]),
        ),
        campos_travados: [...travados],
      },
    });

    return NextResponse.json({ ok: true, id: local.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const dica = /campos_manuais|cnh_categoria/.test(msg)
      ? ' — rode a migração sql/frota-motoristas-rh.sql no Supabase'
      : '';
    return NextResponse.json({ error: msg + dica }, { status: 500 });
  }
}
