// Tipos de atendimento da OS.
// GET    → { tipos, podeGerenciar, migracaoFaltando? }  (módulo pos)
// POST   → { nome } cria (ou reativa) um tipo          (pos:tipos_atendimento)
// DELETE ?id= → desativa (fixos não)                    (pos:tipos_atendimento)
// Sem a migration sql/pos-tipos-atendimento.sql o GET devolve TIPOS_PADRAO.
import { NextRequest, NextResponse } from "next/server";
import { autenticar } from "@/lib/auth/server";
import { permite } from "@/lib/permissoes/explicitas";
import { supabase } from "@/lib/pos/supabase";
import { registrarAuditLog } from "@/lib/server/audit-notify";
import { TIPOS_PADRAO, montarLista, validarNomeTipo, limparNome, chaveTipo, ehFixo } from "@/lib/pos/tipos-atendimento";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TBL = "pos_tipos_atendimento";
const MSG_MIGRACAO = "Falta aplicar a migration sql/pos-tipos-atendimento.sql no banco.";

function tabelaFaltando(e: { code?: string; message?: string } | null): boolean {
  return !!e && (e.code === "42P01" || e.code === "PGRST205" || /does not exist|schema cache/i.test(e.message || ""));
}

async function lerAtivos() {
  const { data, error } = await supabase.from(TBL).select("id, nome, ordem, criado_em").eq("ativo", true)
    .order("ordem").order("criado_em");
  return { data: (data || []) as { id: string; nome: string }[], error };
}

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!permite(auth.modulos, auth.isAdmin, "pos")) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  const podeGerenciar = permite(auth.modulos, auth.isAdmin, "pos", "tipos_atendimento");
  const { data, error } = await lerAtivos();
  if (error) {
    if (tabelaFaltando(error)) {
      return NextResponse.json({ tipos: montarLista(TIPOS_PADRAO.map((nome) => ({ id: null, nome }))), podeGerenciar, migracaoFaltando: true });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ tipos: montarLista(data), podeGerenciar });
}

export async function POST(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!permite(auth.modulos, auth.isAdmin, "pos", "tipos_atendimento")) {
    return NextResponse.json({ error: "Você não tem a permissão \"Cadastrar tipos de atendimento\"." }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const nome = limparNome(body?.nome);
  const { data: ativos, error: e1 } = await lerAtivos();
  if (e1) return NextResponse.json({ error: tabelaFaltando(e1) ? MSG_MIGRACAO : e1.message, migracaoFaltando: tabelaFaltando(e1) }, { status: tabelaFaltando(e1) ? 503 : 500 });
  const lista = montarLista(ativos);
  const erroNome = validarNomeTipo(nome, lista.map((t) => t.nome));
  if (erroNome) return NextResponse.json({ error: erroNome }, { status: 400 });

  // reativa um desativado com o mesmo nome (mantém o id), senão cria
  const { data: inativos } = await supabase.from(TBL).select("id, nome").eq("ativo", false);
  const antigo = (inativos || []).find((t: { nome: string }) => chaveTipo(t.nome) === chaveTipo(nome));
  const ordem = 100 + lista.length;
  const r = antigo
    ? await supabase.from(TBL).update({ ativo: true, nome, ordem, desativado_por: null, desativado_em: null }).eq("id", antigo.id).select("id, nome").single()
    : await supabase.from(TBL).insert({ nome, ordem, criado_por: auth.email || "Sistema" }).select("id, nome").single();
  if (r.error) {
    const dup = r.error.code === "23505";
    return NextResponse.json({ error: dup ? `"${nome}" já existe.` : r.error.message }, { status: dup ? 400 : 500 });
  }
  await registrarAuditLog({ userName: auth.email || "Sistema", sistema: "pos", acao: "tipo_atendimento_criar", entidade: "tipo_atendimento", entidadeId: r.data.id, entidadeLabel: nome }).catch(() => {});
  return NextResponse.json({ tipo: { id: r.data.id, nome, fixo: false } });
}

export async function DELETE(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!permite(auth.modulos, auth.isAdmin, "pos", "tipos_atendimento")) {
    return NextResponse.json({ error: "Você não tem a permissão \"Cadastrar tipos de atendimento\"." }, { status: 403 });
  }
  const id = req.nextUrl.searchParams.get("id") || "";
  if (!id) return NextResponse.json({ error: "Informe o tipo." }, { status: 400 });
  const { data: linha, error } = await supabase.from(TBL).select("id, nome").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: tabelaFaltando(error) ? MSG_MIGRACAO : error.message }, { status: 500 });
  if (!linha) return NextResponse.json({ error: "Tipo não encontrado." }, { status: 404 });
  if (ehFixo(linha.nome)) return NextResponse.json({ error: `"${linha.nome}" é fixo e não pode ser removido.` }, { status: 400 });
  const u = await supabase.from(TBL).update({ ativo: false, desativado_por: auth.email || "Sistema", desativado_em: new Date().toISOString() }).eq("id", id);
  if (u.error) return NextResponse.json({ error: u.error.message }, { status: 500 });
  await registrarAuditLog({ userName: auth.email || "Sistema", sistema: "pos", acao: "tipo_atendimento_remover", entidade: "tipo_atendimento", entidadeId: id, entidadeLabel: linha.nome }).catch(() => {});
  return NextResponse.json({ ok: true });
}
