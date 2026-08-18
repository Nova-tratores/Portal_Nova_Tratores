// GET /api/frota/veiculo-historico?placa=XXX
// Histórico COMPLETO do veículo pra Ficha da Visão geral:
//  - REQUISIÇÕES com a placa (todas, MENOS os abastecimentos)
//  - ORDENS DE SERVIÇO do Pós onde a placa foi usada no Projeto (ex. "CARGO-AQJ3H59")
//  - PENDÊNCIAS registradas (abertas e resolvidas)
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

const TIPOS_ABASTECIMENTO = ['Veicular Abastecimento', 'Trator Abastecimento', 'Quadri Abastecimento'];

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!temModuloFrota(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  const placa = String(req.nextUrl.searchParams.get('placa') || '').trim().toUpperCase();
  if (!placa) return NextResponse.json({ error: 'Passe ?placa=' }, { status: 400 });

  const { data: veiculo } = await supabase
    .from('frota_veiculos')
    .select('id, placa, id_placa')
    .eq('placa', placa)
    .maybeSingle();

  const [reqs, ordens, pend] = await Promise.all([
    // requisições do carro — SEM os abastecimentos
    veiculo?.id_placa != null
      ? supabase
          .from('Requisicao')
          .select('id, titulo, tipo, status, data, hodometro, valor_despeza')
          .eq('veiculo', String(veiculo.id_placa))
          .not('tipo', 'in', `("${TIPOS_ABASTECIMENTO.join('","')}")`)
          .order('id', { ascending: false })
      : Promise.resolve({ data: [], error: null } as any),
    // OSs com Projeto preenchido (o filtro pela placa é feito abaixo, normalizado)
    supabase
      .from('Ordem_Servico')
      .select('Id_Ordem, Projeto, Status, Data, Nome_Cliente')
      .not('Projeto', 'is', null)
      .order('Id_Ordem', { ascending: false }),
    supabase
      .from('frota_pendencias')
      .select('id, origem, titulo, descricao, componente_id, data_ocorrencia, status, aberta_por, aberta_em, resolvida_por, resolvida_em, resolucao, vinculo_tipo, vinculo_ref, km, responsavel')
      .eq('placa', placa)
      .order('aberta_em', { ascending: false }),
  ]);

  const norm = (s: string) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const placaN = norm(placa);
  const ordensDoCarro = (ordens.data || []).filter((o: any) => norm(o.Projeto).includes(placaN));

  return NextResponse.json({
    requisicoes: reqs.error ? [] : reqs.data || [],
    ordens: ordensDoCarro,
    pendencias: pend.error ? [] : pend.data || [],
  });
}
