import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/pos/supabase';
import { STATUS_FINALIZADOS } from '@/lib/garantias/constants';
import { sanitizarFiltro } from '@/lib/busca-segura';

// GET /api/garantias/buscar-os?q=...
// Procura OS por id_ordem, cliente ou chassi. Filtra fora as que já têm
// garantia ativa. Pra uso no fluxo de "criar garantia manualmente".
export async function GET(req: NextRequest) {
  const q = String(req.nextUrl.searchParams.get('q') || '').trim();
  if (q.length < 2) return NextResponse.json({ resultados: [] });

  // 1) Busca por id_ordem (LIKE) + cliente (ILIKE) — Ordem_Servico
  const { data: ordens } = await supabase
    .from('Ordem_Servico')
    .select('Id_Ordem, Os_Cliente, Projeto, Data, Tipo_Servico, Os_Tecnico, Os_Tecnico2')
    .or(`Id_Ordem.ilike.%${sanitizarFiltro(q)}%,Os_Cliente.ilike.%${sanitizarFiltro(q)}%`)
    .order('Data', { ascending: false })
    .limit(30);

  // 2) Busca por chassi em Ordem_Servico_Tecnicos
  let porChassi: Array<{ Id_Ordem: string; Os_Cliente: string | null; Projeto: string | null; Data: string | null; Tipo_Servico: string | null; Os_Tecnico: string | null; Os_Tecnico2: string | null }> = [];
  if (q.length >= 3 && /[A-Za-z]/.test(q)) {
    const { data: tecs } = await supabase
      .from('Ordem_Servico_Tecnicos')
      .select('Ordem_Servico, Chassis')
      .ilike('Chassis', `%${q}%`)
      .limit(20);
    const idsExtras = (tecs || []).map((t) => t.Ordem_Servico).filter(Boolean);
    if (idsExtras.length > 0) {
      const { data: extras } = await supabase
        .from('Ordem_Servico')
        .select('Id_Ordem, Os_Cliente, Projeto, Data, Tipo_Servico, Os_Tecnico, Os_Tecnico2')
        .in('Id_Ordem', idsExtras);
      porChassi = (extras || []) as typeof porChassi;
    }
  }

  // Merge sem duplicar
  const todasOrdens = [...(ordens || []), ...porChassi];
  const dedup = Array.from(new Map(todasOrdens.map((o) => [o.Id_Ordem, o])).values());

  if (dedup.length === 0) return NextResponse.json({ resultados: [] });

  // 3) Filtra fora as que já têm garantia ativa
  const ids = dedup.map((o) => o.Id_Ordem);
  const { data: ativas } = await supabase
    .from('garantias')
    .select('id_ordem, numero, status')
    .in('id_ordem', ids);
  const garantiasPorOs = new Map<string, { numero: string; status: string; ativa: boolean }>();
  for (const g of ativas || []) {
    const ativa = !STATUS_FINALIZADOS.includes(g.status);
    // Se já tem registro, mantém o "ativa" se existir
    const existente = garantiasPorOs.get(g.id_ordem);
    if (!existente || (ativa && !existente.ativa)) {
      garantiasPorOs.set(g.id_ordem, { numero: g.numero, status: g.status, ativa });
    }
  }

  // 4) Busca chassis pra exibir no resultado
  const { data: tecsAll } = await supabase
    .from('Ordem_Servico_Tecnicos')
    .select('Ordem_Servico, Chassis')
    .in('Ordem_Servico', ids);
  const chassisPorOs = new Map<string, string>();
  for (const t of tecsAll || []) {
    if (t.Ordem_Servico) chassisPorOs.set(t.Ordem_Servico, t.Chassis || '');
  }

  const resultados = dedup
    .map((o) => {
      const g = garantiasPorOs.get(o.Id_Ordem);
      return {
        id_ordem: o.Id_Ordem,
        cliente: o.Os_Cliente || '',
        projeto: o.Projeto || '',
        chassis: chassisPorOs.get(o.Id_Ordem) || '',
        data: o.Data || '',
        tipo_servico: o.Tipo_Servico || '',
        tecnico: o.Os_Tecnico || '',
        tecnico2: o.Os_Tecnico2 || '',
        garantia_existente: g ? { numero: g.numero, status: g.status, ativa: g.ativa } : null,
        disponivel: !g || !g.ativa,
      };
    })
    .sort((a, b) => (b.data || '').localeCompare(a.data || ''))
    .slice(0, 20);

  return NextResponse.json({ resultados });
}
