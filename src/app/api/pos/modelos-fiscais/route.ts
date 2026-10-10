// Modelos fiscais dos itens de serviço da OS (faturamento pelo portal).
// GET  → modelos + vínculos (quem fatura OS ou gerencia modelos).
// POST → cria/atualiza { id?, nome, descricao, campos, padrao }   (pos:modelos_fiscais)
// DELETE ?id= → desativa o modelo e tira os vínculos              (pos:modelos_fiscais)
import { NextRequest, NextResponse } from "next/server";
import { autenticar } from "@/lib/auth/server";
import { podeFaturarOS, podeGerenciarModelos } from "@/lib/pos/faturamento";
import { listarModelos, listarVinculos, salvarModelo, desativarModelo, ModelosFiscaisFaltando } from "@/lib/pos/modelos-fiscais-db";
import { registrarAuditLog } from "@/lib/server/audit-notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function erro(e: unknown) {
  if (e instanceof ModelosFiscaisFaltando) return NextResponse.json({ error: e.message, migracaoFaltando: true }, { status: 503 });
  return NextResponse.json({ error: e instanceof Error ? e.message : "Erro interno" }, { status: 500 });
}

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!podeGerenciarModelos(auth) && !podeFaturarOS(auth)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  try {
    const [modelos, vinculos] = await Promise.all([listarModelos(), listarVinculos()]);
    return NextResponse.json({ modelos, vinculos, podeGerenciar: podeGerenciarModelos(auth) });
  } catch (e) { return erro(e); }
}

export async function POST(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!podeGerenciarModelos(auth)) return NextResponse.json({ error: "Você não tem a permissão \"Modelos fiscais\"." }, { status: 403 });
  try {
    const body = await req.json().catch(() => ({}));
    const r = await salvarModelo({ id: body?.id || null, nome: body?.nome, descricao: body?.descricao, campos: body?.campos, padrao: body?.padrao === true }, auth.email || "Sistema");
    if (!r.ok) return NextResponse.json({ error: r.erros.join(" ") }, { status: 400 });
    await registrarAuditLog({ userName: auth.email || "Sistema", sistema: "pos", acao: body?.id ? "modelo_fiscal_editar" : "modelo_fiscal_criar", entidade: "modelo_fiscal", entidadeId: r.modelo.id, entidadeLabel: r.modelo.nome, detalhes: { campos: r.modelo.campos, padrao: r.modelo.padrao } }).catch(() => {});
    return NextResponse.json({ modelo: r.modelo });
  } catch (e) { return erro(e); }
}

export async function DELETE(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!podeGerenciarModelos(auth)) return NextResponse.json({ error: "Você não tem a permissão \"Modelos fiscais\"." }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id") || "";
  if (!id) return NextResponse.json({ error: "Informe o modelo." }, { status: 400 });
  try {
    await desativarModelo(id, auth.email || "Sistema");
    await registrarAuditLog({ userName: auth.email || "Sistema", sistema: "pos", acao: "modelo_fiscal_desativar", entidade: "modelo_fiscal", entidadeId: id }).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (e) { return erro(e); }
}
