// GET /api/frota/motoristas/rh — lista MESCLADA: funcionários do RH (Supabase
// próprio, sem salário) × frota_motoristas (CNH, flag motorista).
//
// Merge por pessoa_id (autoritativo, persistido no PATCH) → CPF normalizado.
// NUNCA por nome. Sobras do portal (usuários antigos da Rota Exata) entram com
// origem 'portal' (badge FORA DO RH). O CPF cru não sai daqui — só mascarado.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { autenticar } from '@/lib/auth/server';
import { podeFrota } from '@/lib/frota/server';
import { listarFuncionariosRH, rhConfigurado } from '@/lib/frota/rh';
import { montarMotoristaRH, normalizarCpf, type LinhaLocalMotorista } from '@/lib/frota/motoristas';
import type { MotoristaRH } from '@/lib/frota/tipos';

export const runtime = 'nodejs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);

const COLS = 'id, re_id, nome, cpf, email, telefone, cargo, cnh, cnh_categoria, cnh_validade, ativo, gestor, e_motorista, pessoa_id';
const COLS_SEM_MIGRACAO = 'id, re_id, nome, cpf, email, telefone, cargo, cnh, cnh_validade, ativo, gestor, e_motorista, pessoa_id';

async function listarLocais(): Promise<LinhaLocalMotorista[]> {
  // cnh_categoria só existe após sql/frota-motoristas-rh.sql — fallback gracioso
  const r1 = await supabase.from('frota_motoristas').select(COLS);
  if (!r1.error) return (r1.data || []) as LinhaLocalMotorista[];
  const r2 = await supabase.from('frota_motoristas').select(COLS_SEM_MIGRACAO);
  if (r2.error) throw new Error(r2.error.message);
  return (r2.data || []) as LinhaLocalMotorista[];
}

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!podeFrota(auth, 'motoristas')) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  try {
    const [funcionarios, locais, resp] = await Promise.all([
      listarFuncionariosRH(), // cacheado 5 min; [] se env não configurada
      listarLocais(),
      supabase.from('frota_responsaveis').select('motorista_id').is('fim', null).not('motorista_id', 'is', null),
    ]);
    const respSet = new Set((resp.data || []).map((r) => r.motorista_id as string));

    const porPessoa = new Map<string, LinhaLocalMotorista>();
    const porCpf = new Map<string, LinhaLocalMotorista>();
    for (const l of locais) {
      if (l.pessoa_id) porPessoa.set(l.pessoa_id, l);
      const d = normalizarCpf(l.cpf);
      if (d.length === 11 && !porCpf.has(d)) porCpf.set(d, l);
    }

    const hoje = new Date();
    const usados = new Set<string>();
    const out: MotoristaRH[] = [];

    for (const f of funcionarios) {
      let local = porPessoa.get(f.id) || null;
      if (!local) {
        const cand = porCpf.get(normalizarCpf(f.cpf));
        // não "rouba" linha já vinculada a OUTRO funcionário do RH
        if (cand && !usados.has(cand.id) && (!cand.pessoa_id || cand.pessoa_id === f.id)) local = cand;
      }
      if (local) {
        if (usados.has(local.id)) local = null; // homônimo de CPF? o primeiro venceu
        else usados.add(local.id);
      }
      out.push(montarMotoristaRH(f, local, !!local && respSet.has(local.id), hoje));
    }
    for (const l of locais) {
      if (usados.has(l.id)) continue;
      out.push(montarMotoristaRH(null, l, respSet.has(l.id), hoje));
    }

    out.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));

    return NextResponse.json({
      ok: true,
      rh_configurado: rhConfigurado(),
      aviso: rhConfigurado()
        ? undefined
        : 'Configure RH_SUPABASE_URL e RH_SUPABASE_SERVICE_KEY (Supabase do RH) no .env.local e no Railway — mostrando só os dados locais (Rota Exata).',
      motoristas: out,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
