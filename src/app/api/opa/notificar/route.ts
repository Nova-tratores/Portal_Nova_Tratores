import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { autenticar } from "@/lib/auth/server";
import { destinoDoLocal, novoResponsavel, type Departamento, type LigacaoLocal } from "@/lib/opa/departamentos";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Roteia o Opa e avisa (05/11/2026, decisão do José):
//   • o departamento é OCULTO e vem do território (portal_opas.local → opa_local_departamento);
//   • o gestor do departamento vira o Responsável e é o ÚNICO avisado no sino;
//   • local sem departamento → departamento padrão ("Geral");
//   • nada configurado (ou sql/opa-departamentos.sql não aplicada) → aviso para TODOS, como antes.
// evento 'novo' = Opa criado agora; 'local' = o território mudou no Editar (avisa só se o gestor mudou).
// Os dados do Opa vêm do banco, nunca do corpo; quem chamou vem do login.
const semTabela = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "42P01" || e.code === "PGRST205" || e.code === "42703" || /does not exist|schema cache/i.test(e.message || ""));

async function avisarTodos(titulo: string, descricao: string | null, exceto: string) {
  const { data: users } = await supabase.from("portal_permissoes").select("user_id");
  const ids = [...new Set((users || []).map((u) => u.user_id).filter(Boolean))].filter((id) => id !== exceto);
  if (!ids.length) return 0;
  const { error } = await supabase.from("portal_notificacoes").insert(ids.map((user_id) => ({
    user_id, tipo: "opa", titulo: `Novo Opa: ${titulo}`, descricao: descricao || null, link: "/opa", icone: "🚨",
  })));
  if (error) throw new Error(error.message);
  return ids.length;
}

export async function POST(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "nao autenticado" }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const opaId = String(body?.opa_id || "");
    const evento: "novo" | "local" = body?.evento === "local" ? "local" : "novo";
    if (!opaId) return NextResponse.json({ error: "opa_id obrigatório" }, { status: 400 });

    // ── o Opa (com as colunas do roteamento; sem a migration, só o básico) ──
    const { data: opa, error: eOpa } = await supabase.from("portal_opas")
      .select("id, titulo, descricao, local, responsavel, departamento_id, status").eq("id", opaId).maybeSingle();
    if (semTabela(eOpa)) {
      const r = await supabase.from("portal_opas").select("id, titulo, descricao, status").eq("id", opaId).maybeSingle();
      if (r.error || !r.data) return NextResponse.json({ error: r.error?.message || "Opa não encontrado" }, { status: 404 });
      const enviadas = evento === "novo" ? await avisarTodos(r.data.titulo, r.data.descricao, auth.userId) : 0;
      return NextResponse.json({ ok: true, enviadas, roteado: false, motivo: "migracao_faltando" });
    }
    if (eOpa) return NextResponse.json({ error: eOpa.message }, { status: 500 });
    if (!opa) return NextResponse.json({ error: "Opa não encontrado" }, { status: 404 });

    // ── configuração dos departamentos ──
    const [deps, ligs] = await Promise.all([
      supabase.from("opa_departamentos").select("id, nome, gestor_id, gestor_nome, padrao, ativo, ordem"),
      supabase.from("opa_local_departamento").select("local_id, departamento_id"),
    ]);
    if (semTabela(deps.error) || semTabela(ligs.error)) {
      const enviadas = evento === "novo" ? await avisarTodos(opa.titulo, opa.descricao, auth.userId) : 0;
      return NextResponse.json({ ok: true, enviadas, roteado: false, motivo: "migracao_faltando" });
    }
    if (deps.error || ligs.error) return NextResponse.json({ error: (deps.error || ligs.error)!.message }, { status: 500 });
    const departamentos = (deps.data || []) as Departamento[];
    const destino = destinoDoLocal(opa.local, (ligs.data || []) as LigacaoLocal[], departamentos);

    // ── grava departamento + responsável (o gestor anterior sai se era ele o responsável) ──
    const anterior = departamentos.find((d) => d.id === opa!.departamento_id) || null;
    const gestorAnterior = anterior ? (anterior.gestor_nome || null) : null;
    const responsavel = novoResponsavel(opa.responsavel, gestorAnterior, destino.gestorNome);
    const mudouDepto = (opa.departamento_id || null) !== (destino.departamento?.id || null);
    const mudouResp = (opa.responsavel || null) !== responsavel;
    if (mudouDepto || mudouResp) {
      const { error } = await supabase.from("portal_opas").update({
        departamento_id: destino.departamento?.id || null,
        departamento: destino.departamento?.nome || null,
        responsavel,
      }).eq("id", opa.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // ── aviso ──
    let enviadas = 0;
    if (destino.gestorId) {
      // só o gestor; quem abriu/editou não se avisa; troca de local só avisa se o gestor mudou
      const gestorMudou = evento === "novo" || !anterior || anterior.gestor_id !== destino.gestorId || mudouDepto;
      if (destino.gestorId !== auth.userId && gestorMudou && opa.status !== "resolvido") {
        const { error } = await supabase.from("portal_notificacoes").insert({
          user_id: destino.gestorId,
          tipo: "opa",
          titulo: evento === "novo" ? `Novo Opa para você: ${opa.titulo}` : `Opa passou para você: ${opa.titulo}`,
          descricao: [destino.departamento?.nome ? `Departamento ${destino.departamento.nome}` : null, opa.descricao].filter(Boolean).join(" — ") || null,
          link: "/opa",
          icone: "🚨",
        });
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        enviadas = 1;
      }
    } else if (evento === "novo") {
      enviadas = await avisarTodos(opa.titulo, opa.descricao, auth.userId);   // nada configurado: como antes
    }

    return NextResponse.json({
      ok: true, enviadas, roteado: !!destino.gestorId, motivo: destino.motivo,
      departamento: destino.departamento?.nome || null, responsavel,
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "erro" }, { status: 500 });
  }
}
