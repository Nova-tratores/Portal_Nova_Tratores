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

    const [respR, multasTodasR, usosR, respTodosR, documentos] = await Promise.all([
      local
        ? supabase
            .from('frota_responsaveis')
            .select('veiculo_id, inicio, fim, frota_veiculos(placa, modelo, descricao)')
            .eq('motorista_id', local.id)
            .order('inicio', { ascending: false })
            .limit(30)
        : Promise.resolve({ data: [] as any[] }),
      supabase
        .from('frota_multas')
        .select('id, placa, veiculo_id, dt_multa, descricao, pontos, valor, status_interno, responsavel_id, motorista_id, motorista_cpf'),
      supabase.from('vw_frota_uso_diario').select('veiculo_id, data, pessoa_nome'),
      supabase.from('frota_responsaveis').select('veiculo_id, motorista_id, inicio, fim'),
      rhId ? listarDocumentosRH(rhId) : Promise.resolve([]),
    ]);

    // responsável em aberto?
    const responsavel = (respR.data || []).some((r: any) => r.fim === null);

    // Multas da pessoa pela MESMA cadeia de atribuição da tela Frota > Multas:
    // motorista definido na mão (responsavel_id) > uso diário (por nome) >
    // responsável fixo vigente na data > carimbo antigo da Rota Exata (id/CPF).
    // Antes só id/CPF da RE contavam — multa manual não aparecia na ficha.
    const chave = (s: unknown) =>
      String(s ?? '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();
    const meuNome = chave(local?.nome || rhFunc?.nome);
    const usoPorDia = new Map<string, string>();
    for (const u of usosR.data || []) {
      if (u.pessoa_nome) usoPorDia.set(`${u.veiculo_id}|${u.data}`, String(u.pessoa_nome));
    }
    const fixoEm = (veiculoId: string | null, d: string): string | null => {
      if (!veiculoId) return null;
      const r = (respTodosR.data || []).find(
        (x: any) => x.veiculo_id === veiculoId && x.inicio <= d && (x.fim === null || x.fim >= d),
      );
      return r?.motorista_id ?? null;
    };
    const minha = (m: any): boolean => {
      if (m.responsavel_id) return !!local && m.responsavel_id === local.id;
      const d = String(m.dt_multa || '').slice(0, 10);
      const uso = m.veiculo_id && d ? usoPorDia.get(`${m.veiculo_id}|${d}`) : null;
      if (uso) return !!meuNome && chave(uso) === meuNome;
      const fixo = d ? fixoEm(m.veiculo_id, d) : null;
      if (fixo) return !!local && fixo === local.id;
      if (local && m.motorista_id === local.id) return true;
      const cpfM = String(m.motorista_cpf || '').replace(/\D/g, '');
      return cpfDigitos.length === 11 && cpfM === cpfDigitos;
    };
    const multas = ((multasTodasR.data || []) as any[])
      .filter(minha)
      .sort((a, b) => String(b.dt_multa || '').localeCompare(String(a.dt_multa || '')));

    const abertas = multas.filter((m) => !['paga', 'descontada', 'arquivada'].includes(m.status_interno || ''));
    const detalhe: MotoristaDetalhe = {
      motorista: montarMotoristaRH(rhFunc, local, responsavel, new Date(), {
        n: abertas.length,
        valor: abertas.reduce((s, m) => s + (Number(m.valor) || 0), 0),
        pontos: abertas.reduce((s, m) => s + (Number(m.pontos) || 0), 0),
      }),
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
        // janela dos pontos na CNH (12 meses da infração, fora arquivadas)
        pontos_12m: multas
          .filter(
            (m) =>
              m.status_interno !== 'arquivada' &&
              String(m.dt_multa || '').slice(0, 10) >= new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10),
          )
          .reduce((s, m) => s + (Number(m.pontos) || 0), 0),
      },
      documentos_rh: documentos,
    };

    return NextResponse.json({ ok: true, ...detalhe });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
