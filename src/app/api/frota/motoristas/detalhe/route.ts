// GET /api/frota/motoristas/detalhe?rh_id=&portal_id= — a Ficha do Motorista:
// dados do RH (menos salário, CPF mascarado) + vínculos da frota (veículos
// como responsável, multas por motorista) + documentos do RH (links assinados).
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { autenticar } from '@/lib/auth/server';
import { podeFrota } from '@/lib/frota/server';
import { buscarFuncionarioRH, listarDocumentosRH } from '@/lib/frota/rh';
import { montarMotoristaRH, normalizarCpf, type LinhaLocalMotorista } from '@/lib/frota/motoristas';
import type { MotoristaDetalhe } from '@/lib/frota/tipos';

export const runtime = 'nodejs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);

const COLS = 'id, re_id, nome, cpf, email, telefone, cargo, cnh, cnh_categoria, cnh_validade, ativo, gestor, e_motorista, pessoa_id';
const COLS_SEM_MIGRACAO = COLS.replace('cnh_categoria, ', '');

async function buscarLocal(filtro: { id?: string; pessoaId?: string }): Promise<LinhaLocalMotorista | null> {
  for (const cols of [COLS, COLS_SEM_MIGRACAO]) {
    let q = supabase.from('frota_motoristas').select(cols);
    q = filtro.id ? q.eq('id', filtro.id) : q.eq('pessoa_id', filtro.pessoaId!);
    const { data, error } = await q.maybeSingle();
    if (!error) return (data as unknown as LinhaLocalMotorista) || null;
  }
  return null;
}

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!podeFrota(auth, 'motoristas')) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const rhId = searchParams.get('rh_id') || null;
  const portalId = searchParams.get('portal_id') || null;
  if (!rhId && !portalId) return NextResponse.json({ error: 'rh_id ou portal_id obrigatório' }, { status: 400 });

  try {
    const [rhFunc, localPorId] = await Promise.all([
      rhId ? buscarFuncionarioRH(rhId) : Promise.resolve(null),
      portalId ? buscarLocal({ id: portalId }) : Promise.resolve(null),
    ]);
    const local = localPorId || (rhId ? await buscarLocal({ pessoaId: rhId }) : null);
    if (!rhFunc && !local) return NextResponse.json({ error: 'Motorista não encontrado' }, { status: 404 });

    // vínculos da frota (só existem com linha local)
    const cpfDigitos = normalizarCpf(rhFunc?.cpf ?? local?.cpf);
    const cpfFormatado =
      cpfDigitos.length === 11
        ? `${cpfDigitos.slice(0, 3)}.${cpfDigitos.slice(3, 6)}.${cpfDigitos.slice(6, 9)}-${cpfDigitos.slice(9)}`
        : null;

    const [respR, multasIdR, multasCpfR, documentos] = await Promise.all([
      local
        ? supabase
            .from('frota_responsaveis')
            .select('veiculo_id, inicio, fim, frota_veiculos(placa, modelo, descricao)')
            .eq('motorista_id', local.id)
            .order('inicio', { ascending: false })
            .limit(30)
        : Promise.resolve({ data: [] as any[] }),
      local
        ? supabase
            .from('frota_multas')
            .select('id, placa, dt_multa, descricao, pontos, valor, status_interno')
            .eq('motorista_id', local.id)
        : Promise.resolve({ data: [] as any[] }),
      cpfDigitos.length === 11
        ? supabase
            .from('frota_multas')
            .select('id, placa, dt_multa, descricao, pontos, valor, status_interno')
            .in('motorista_cpf', cpfFormatado ? [cpfDigitos, cpfFormatado] : [cpfDigitos])
        : Promise.resolve({ data: [] as any[] }),
      rhId ? listarDocumentosRH(rhId) : Promise.resolve([]),
    ]);

    // responsável em aberto?
    const responsavel = (respR.data || []).some((r: any) => r.fim === null);

    // multas: merge por id (motorista_id ∪ CPF nos 2 formatos)
    const multasMap = new Map<string, any>();
    for (const m of [...(multasIdR.data || []), ...(multasCpfR.data || [])]) multasMap.set(m.id, m);
    const multas = [...multasMap.values()].sort((a, b) => String(b.dt_multa || '').localeCompare(String(a.dt_multa || '')));

    const detalhe: MotoristaDetalhe = {
      motorista: montarMotoristaRH(rhFunc, local, responsavel),
      rh: rhFunc
        ? {
            rg: rhFunc.rg,
            data_nascimento: rhFunc.data_nascimento,
            sexo: rhFunc.sexo,
            estado_civil: rhFunc.estado_civil,
            endereco: rhFunc.endereco,
            bairro: rhFunc.bairro,
            cidade: rhFunc.cidade,
            estado: rhFunc.estado,
            cep: rhFunc.cep,
            atualizado_em: rhFunc.atualizado_em,
          }
        : null,
      veiculos: (respR.data || []).map((r: any) => ({
        veiculo_id: r.veiculo_id,
        placa: r.frota_veiculos?.placa || '(?)',
        modelo: r.frota_veiculos?.modelo || r.frota_veiculos?.descricao || null,
        inicio: r.inicio,
        fim: r.fim,
      })),
      multas: multas.map((m) => ({
        id: m.id,
        placa: m.placa,
        dt_multa: m.dt_multa,
        descricao: m.descricao,
        pontos: m.pontos,
        valor: m.valor != null ? Number(m.valor) : null,
        status_interno: m.status_interno ?? null,
      })),
      multas_total: {
        qtd: multas.length,
        valor: multas.reduce((s, m) => s + (Number(m.valor) || 0), 0),
        pontos: multas.reduce((s, m) => s + (Number(m.pontos) || 0), 0),
      },
      documentos_rh: documentos,
    };

    return NextResponse.json({ ok: true, ...detalhe });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
