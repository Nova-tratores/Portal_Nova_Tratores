// GET /api/frota/checklists-mes?mes=YYYY-MM
// Pendências do checklist mensal: cruza os técnicos que têm veículo atribuído
// (tecnico_veiculos, NT Mecânico) com os checklists feitos no mês (veiculo_checklist).
// Quem não fez = pendente. Suspeito = score baixo. A regra mora em
// src/lib/frota/checklists-mes.ts (a aba Hoje usa a mesma).
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { autenticar } from '@/lib/auth/server';
import { temModuloFrota } from '@/lib/frota/server';
import { listarChecklistsMes } from '@/lib/frota/checklists-mes';

export const runtime = 'nodejs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!temModuloFrota(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  const mes = req.nextUrl.searchParams.get('mes') || new Date().toISOString().slice(0, 7);
  const { itens, resumo } = await listarChecklistsMes(supabase, mes);
  return NextResponse.json({ mes, resumo, itens });
}
