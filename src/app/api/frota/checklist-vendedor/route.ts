// Checklist mensal COMPLETO feito pelo vendedor no app de vendas (vendas-pwa):
// os mesmos 20 itens com foto do NT Mecânico / portal, gravados nas mesmas
// tabelas (veiculo_checklist / _itens). Assim o carro do vendedor aparece em
// Frota → Checklists igual ao do técnico (fotos, score, PDF, pendências).
//
// Login: o token do Supabase Auth do app de vendas (mesmo projeto do portal).
// Quem pode: vendedor ATIVO (`vendedores.auth_uid`) e só nos carros em que ele
// é o responsável atual na Frota (frota_responsaveis, nome casado com mesmaPessoa).
//
//   GET                     -> { vendedor, carros: [{ placa, placa_fmt, modelo, status }] }
//   GET  ?placa=XXX         -> checklist do mês + itens + perguntas
//   POST { action:'iniciar', placa, km, loc }
//   POST multipart action=salvar_item (checklist_id, item_key, resposta, observacao, foto)
//   POST { action:'concluir', checklist_id, loc }
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { resolverPlaca, extrairPlacaDeNumPlaca, formatarPlaca } from '@/lib/frota/placa';
import { mesmaPessoa } from '@/lib/frota/responsavel';
import { corsVendas } from '@/lib/vendas-app/cors';
import {
  estadoDoMes, iniciarChecklist, salvarItemChecklist, concluirChecklist, checklistPorId, mesAtual, type Resultado,
} from '@/lib/frota/checklist-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Vendedor = { id: number; nome: string };
type Carro = { placa: string; placa_fmt: string; modelo: string };

function json(req: NextRequest, body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: corsVendas(req) });
}
const responder = (req: NextRequest, r: Resultado) => json(req, r.body, r.status);

export function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsVendas(req) });
}

async function validarTokenVendedor(req: NextRequest): Promise<Vendedor | null> {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return null;
  const { data: v } = await supabaseAdmin.from('vendedores').select('id, nome, ativo').eq('auth_uid', data.user.id).maybeSingle();
  if (!v || v.ativo === false) return null;
  return { id: Number(v.id), nome: String(v.nome || '') };
}

/** Carros ativos em que o vendedor é o responsável atual na Frota. */
async function carrosDoVendedor(vend: Vendedor): Promise<Carro[]> {
  const { data: resp } = await supabaseAdmin.from('frota_responsaveis').select('veiculo_id, motorista_nome').is('fim', null);
  const ids = (resp || []).filter((r) => mesmaPessoa(r.motorista_nome, vend.nome)).map((r) => r.veiculo_id);
  if (ids.length === 0) return [];
  const { data: veics } = await supabaseAdmin.from('frota_veiculos').select('id, placa, modelo, ativo, tipo_registro').in('id', ids);
  return (veics || [])
    .filter((v) => v.ativo !== false && v.tipo_registro === 'veiculo')
    .map((v) => ({ placa: v.placa, placa_fmt: formatarPlaca(v.placa), modelo: v.modelo || '' }));
}

async function doVendedor(vend: Vendedor, placa: string): Promise<boolean> {
  return (await carrosDoVendedor(vend)).some((c) => c.placa === placa);
}

// O app manda a placa como vem do SupaPlacas ("VOYAGE-SEB9J47") ou limpa.
const placaCanon = (s: unknown) => resolverPlaca(extrairPlacaDeNumPlaca(String(s || ''))) || resolverPlaca(String(s || ''));

const NAO_E_SEU = 'Este carro não está em seu nome na Frota. Peça ao responsável da frota para conferir.';

export async function GET(req: NextRequest) {
  const vend = await validarTokenVendedor(req);
  if (!vend) return json(req, { error: 'Entre no app com seu usuário de vendedor.' }, 401);

  const placaParam = req.nextUrl.searchParams.get('placa');
  if (placaParam) {
    const placa = placaCanon(placaParam);
    if (!placa) return json(req, { error: 'Placa inválida' }, 400);
    if (!(await doVendedor(vend, placa))) return json(req, { error: NAO_E_SEU }, 403);
    return responder(req, await estadoDoMes(placa));
  }

  const carros = await carrosDoVendedor(vend);
  const status: Record<string, string> = {};
  if (carros.length) {
    const { data } = await supabaseAdmin.from('veiculo_checklist').select('placa, status')
      .eq('mes_referencia', mesAtual()).in('placa', carros.map((c) => c.placa));
    for (const c of data || []) status[c.placa] = c.status;
  }
  return json(req, {
    vendedor: vend,
    mes: mesAtual(),
    carros: carros.map((c) => ({ ...c, status: status[c.placa] || 'nao_iniciado' })),
  });
}

export async function POST(req: NextRequest) {
  const vend = await validarTokenVendedor(req);
  if (!vend) return json(req, { error: 'Entre no app com seu usuário de vendedor.' }, 401);

  // ── salvar_item (multipart, com foto) ──
  if ((req.headers.get('content-type') || '').includes('multipart/form-data')) {
    const fd = await req.formData();
    if (fd.get('action') !== 'salvar_item') return json(req, { error: 'Ação inválida' }, 400);
    const chk = await checklistPorId(String(fd.get('checklist_id') || ''));
    if (!chk) return json(req, { error: 'Checklist não encontrado' }, 404);
    if (!(await doVendedor(vend, chk.placa))) return json(req, { error: NAO_E_SEU }, 403);
    return responder(req, await salvarItemChecklist(fd));
  }

  const body = await req.json().catch(() => ({}));

  if (body.action === 'iniciar') {
    const placa = placaCanon(body.placa);
    if (!placa) return json(req, { error: 'Placa inválida' }, 400);
    if (!(await doVendedor(vend, placa))) return json(req, { error: NAO_E_SEU }, 403);
    return responder(req, await iniciarChecklist({ placa, nome: vend.nome, km: body.km, loc: body.loc }));
  }

  if (body.action === 'concluir') {
    const chk = await checklistPorId(String(body.checklist_id || ''));
    if (!chk) return json(req, { error: 'Checklist não encontrado' }, 404);
    if (!(await doVendedor(vend, chk.placa))) return json(req, { error: NAO_E_SEU }, 403);
    return responder(req, await concluirChecklist(chk.id, body.loc));
  }

  return json(req, { error: 'Ação inválida' }, 400);
}
