// Checklist mensal de veículo NÃO-VINCULADO, feito pelo portal (mobile).
// Grava nas MESMAS tabelas do NT Mecânico (veiculo_checklist / _itens) e no mesmo
// bucket público `requisicoes`. Dedup por (placa, mês). Só quem tem o módulo Frota.
// A gravação mora em src/lib/frota/checklist-server.ts (o app de vendas usa a mesma,
// por /api/frota/checklist-vendedor).
//
//   GET  ?placa=XXX                 -> status do mês (checklist + itens) + perguntas
//   POST { action:'iniciar', ... }  -> cria/abre a linha do mês
//   POST multipart action=salvar_item -> salva um item (com foto)
//   POST { action:'concluir', ... } -> fecha, calcula score
import { NextRequest, NextResponse } from 'next/server';
import { autenticar } from '@/lib/auth/server';
import { temModuloFrota } from '@/lib/frota/server';
import { resolverPlaca } from '@/lib/frota/placa';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import {
  estadoDoMes, estaVinculado, iniciarChecklist, salvarItemChecklist, concluirChecklist, type Resultado,
} from '@/lib/frota/checklist-server';

export const runtime = 'nodejs';

const responder = (r: Resultado) => NextResponse.json(r.body, { status: r.status });

async function nomeDoUsuario(userId: string, email: string | null): Promise<string> {
  const { data } = await supabaseAdmin.from('financeiro_usu').select('nome').eq('id', userId).maybeSingle();
  return data?.nome || email || 'Usuário do portal';
}

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!temModuloFrota(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  const placa = resolverPlaca(req.nextUrl.searchParams.get('placa') || '');
  if (!placa) return NextResponse.json({ error: 'Passe ?placa=' }, { status: 400 });
  return responder(await estadoDoMes(placa));
}

export async function POST(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!temModuloFrota(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  // ── salvar_item (multipart, com foto) ──
  if ((req.headers.get('content-type') || '').includes('multipart/form-data')) {
    const fd = await req.formData();
    if (fd.get('action') !== 'salvar_item') return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
    return responder(await salvarItemChecklist(fd));
  }

  const body = await req.json().catch(() => ({}));

  if (body.action === 'iniciar') {
    const placa = resolverPlaca(body.placa || '');
    if (!placa) return NextResponse.json({ error: 'Placa inválida' }, { status: 400 });
    if (await estaVinculado(placa)) {
      return NextResponse.json({ error: 'Este veículo tem responsável — o checklist é feito por quem é responsável.' }, { status: 400 });
    }
    return responder(await iniciarChecklist({ placa, nome: await nomeDoUsuario(auth.userId, auth.email), km: body.km, loc: body.loc }));
  }

  if (body.action === 'concluir') return responder(await concluirChecklist(String(body.checklist_id || ''), body.loc));

  return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
}
