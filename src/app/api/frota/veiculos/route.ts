// GET /api/frota/veiculos — a frota inteira, com responsável atual, foto e
// resumo de multas. Tudo local (espelhos) — nenhuma chamada à Rota Exata aqui.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { autenticar } from '@/lib/auth/server';
import { temModuloFrota } from '@/lib/frota/server';

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

  const [veiculos, responsaveis, placasFoto, multas] = await Promise.all([
    supabase.from('frota_veiculos').select('*').order('placa'),
    supabase.from('frota_responsaveis').select('veiculo_id, motorista_nome').is('fim', null),
    supabase.from('Placas').select('IdPlaca, imagem_url'),
    supabase
      .from('frota_multas')
      .select('veiculo_id, valor, status_interno')
      .not('status_interno', 'in', '("paga","descontada","arquivada")'),
  ]);
  if (veiculos.error) return NextResponse.json({ error: veiculos.error.message }, { status: 500 });

  const respPorVeiculo = new Map<string, string>();
  for (const r of responsaveis.data || []) {
    if (r.motorista_nome) respPorVeiculo.set(r.veiculo_id, r.motorista_nome);
  }
  const fotoPorIdPlaca = new Map<number, string>();
  for (const p of placasFoto.data || []) {
    if (p.imagem_url) fotoPorIdPlaca.set(Number(p.IdPlaca), p.imagem_url);
  }
  const multasPorVeiculo = new Map<string, { n: number; total: number }>();
  for (const m of multas.data || []) {
    if (!m.veiculo_id) continue;
    const e = multasPorVeiculo.get(m.veiculo_id) || { n: 0, total: 0 };
    e.n++;
    e.total += Number(m.valor) || 0;
    multasPorVeiculo.set(m.veiculo_id, e);
  }

  const lista = (veiculos.data || []).map((v) => ({
    ...v,
    imagem_url: v.id_placa != null ? fotoPorIdPlaca.get(Number(v.id_placa)) || null : null,
    responsavel_nome: respPorVeiculo.get(v.id) || null,
    multas_abertas: multasPorVeiculo.get(v.id)?.n || 0,
    valor_multas_abertas: multasPorVeiculo.get(v.id)?.total || 0,
  }));

  return NextResponse.json({ veiculos: lista });
}
