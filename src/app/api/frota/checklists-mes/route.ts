// GET /api/frota/checklists-mes?mes=YYYY-MM
// Pendências do checklist mensal: cruza os técnicos que têm veículo atribuído
// (tecnico_veiculos, NT Mecânico) com os checklists feitos no mês (veiculo_checklist).
// Quem não fez = pendente. Suspeito = score baixo. Tudo no mesmo Supabase.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { autenticar } from '@/lib/auth/server';
import { temModuloFrota } from '@/lib/frota/server';
import { resolverPlaca, extrairPlacaDeNumPlaca, formatarPlaca } from '@/lib/frota/placa';

export const runtime = 'nodejs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);

const norm = (s: string | null | undefined) =>
  String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

function classificar(status: string | null, score: number | null): 'ok' | 'suspeito' | 'em_andamento' | 'pendente' {
  const s = (status || '').toLowerCase();
  if (s === 'suspeito' || (score != null && score < 50)) return 'suspeito';
  if (s === 'completo') return 'ok';
  if (s === 'em_andamento' || s === 'pendente') return 'em_andamento';
  return 'em_andamento';
}

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!temModuloFrota(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  const mes = req.nextUrl.searchParams.get('mes') || new Date().toISOString().slice(0, 7);

  const [atrib, chks, veics, resp] = await Promise.all([
    supabase.from('tecnico_veiculos').select('tecnico_nome, placa, descricao'),
    supabase.from('veiculo_checklist').select('id, tecnico_nome, placa, status, score_confianca, km, fim_em').eq('mes_referencia', mes),
    supabase.from('frota_veiculos').select('id, placa, placa_exibicao, modelo, ativo, tipo_registro'),
    supabase.from('frota_responsaveis').select('veiculo_id').is('fim', null),
  ]);

  // checklist por técnico (normalizado) e por placa canônica — dois caminhos de match
  const porTecnico = new Map<string, any>();
  const porPlaca = new Map<string, any>();
  for (const c of chks.data || []) {
    if (c.tecnico_nome) porTecnico.set(norm(c.tecnico_nome), c);
    const p = resolverPlaca(extrairPlacaDeNumPlaca(c.placa));
    if (p) porPlaca.set(p, c);
  }

  const veicPorPlaca = new Map<string, any>();
  for (const v of veics.data || []) veicPorPlaca.set(v.placa, v);
  const idsComResp = new Set((resp.data || []).map((r) => r.veiculo_id));
  const placasTecnico = new Set((atrib.data || []).map((tv) => resolverPlaca(extrairPlacaDeNumPlaca(tv.placa))).filter(Boolean));

  // 1) Veículos atribuídos a técnicos (NT Mecânico)
  const itens = (atrib.data || []).map((tv) => {
    const placaCanon = resolverPlaca(extrairPlacaDeNumPlaca(tv.placa));
    const chk = porTecnico.get(norm(tv.tecnico_nome)) || porPlaca.get(placaCanon) || null;
    const v = veicPorPlaca.get(placaCanon);
    return {
      origem: 'tecnico',
      tecnico_nome: tv.tecnico_nome || '—',
      placa: placaCanon ? formatarPlaca(placaCanon) : (tv.placa || '—'),
      placa_key: placaCanon || '',
      descricao: v?.modelo || tv.descricao || '',
      status: chk ? classificar(chk.status, chk.score_confianca) : 'pendente',
      score: chk?.score_confianca ?? null,
      km: chk?.km ?? null,
      fim_em: chk?.fim_em ?? null,
      checklist_id: chk?.id ?? null,
    };
  });

  // 2) Veículos SEM responsável (Frota) e que não são de técnico — qualquer usuário
  //    do Frota faz pelo portal. Se não fez no mês, entra como pendente.
  for (const v of veics.data || []) {
    if (!v.ativo || v.tipo_registro !== 'veiculo') continue;
    if (idsComResp.has(v.id)) continue;      // tem responsável na Frota
    if (placasTecnico.has(v.placa)) continue; // é de um técnico
    const chk = porPlaca.get(v.placa) || null;
    itens.push({
      origem: 'nao_vinculado',
      tecnico_nome: chk?.tecnico_nome || '(sem responsável)',
      placa: v.placa_exibicao || formatarPlaca(v.placa),
      placa_key: v.placa || '',
      descricao: v.modelo || '',
      status: chk ? classificar(chk.status, chk.score_confianca) : 'pendente',
      score: chk?.score_confianca ?? null,
      km: chk?.km ?? null,
      fim_em: chk?.fim_em ?? null,
      checklist_id: chk?.id ?? null,
    });
  }

  // pendentes primeiro, depois suspeitos, em andamento, ok
  const ordem = { pendente: 0, suspeito: 1, em_andamento: 2, ok: 3 } as Record<string, number>;
  itens.sort((a, b) => (ordem[a.status] - ordem[b.status]) || a.tecnico_nome.localeCompare(b.tecnico_nome));

  const resumo = {
    total: itens.length,
    pendente: itens.filter((i) => i.status === 'pendente').length,
    suspeito: itens.filter((i) => i.status === 'suspeito').length,
    em_andamento: itens.filter((i) => i.status === 'em_andamento').length,
    ok: itens.filter((i) => i.status === 'ok').length,
  };

  return NextResponse.json({ mes, resumo, itens });
}
