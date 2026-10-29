// Nomes das fases do POS e do PPV (lápis do pós-vendas, José 29/10/2026) — regras em lib/fases/fases.ts.
// GET   /api/fases/rotulos            → { rotulos: {chave: nome}, podeEditar, migracaoFaltando? }  (todo logado)
// PATCH /api/fases/rotulos {chave, rotulo}  → renomeia (pós-vendas/admin); rotulo vazio = volta ao nome original
import { NextRequest, NextResponse } from "next/server";
import { autenticar } from "@/lib/auth/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { registrarAuditLog } from "@/lib/server/audit-notify";
import { ehFase, podeRenomearFases, validarRotulo } from "@/lib/fases/fases";

const faltaTabela = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "42P01" || e.code === "PGRST205" || /fases_rotulos/.test(e.message || ""));

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Faça login." }, { status: 401 });
  const podeEditar = podeRenomearFases(auth);
  const { data, error } = await supabaseAdmin.from("fases_rotulos").select("chave, rotulo");
  if (error) {
    if (faltaTabela(error)) return NextResponse.json({ rotulos: {}, podeEditar, migracaoFaltando: true });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const rotulos: Record<string, string> = {};
  for (const r of data || []) rotulos[String(r.chave)] = String(r.rotulo);
  return NextResponse.json({ rotulos, podeEditar });
}

export async function PATCH(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Faça login." }, { status: 401 });
  if (!podeRenomearFases(auth)) return NextResponse.json({ error: "Só o pós-vendas pode renomear as fases." }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const chave = String(body?.chave || "");
  const rotulo = String(body?.rotulo ?? "").trim();
  if (!ehFase(chave)) return NextResponse.json({ error: "Fase desconhecida." }, { status: 400 });

  const { data: antes } = await supabaseAdmin.from("fases_rotulos").select("rotulo").eq("chave", chave).maybeSingle();
  // vazio (ou igual à própria fase) = volta ao nome original
  const resultado = !rotulo || rotulo === chave
    ? await supabaseAdmin.from("fases_rotulos").delete().eq("chave", chave)
    : (() => {
        const erro = validarRotulo(chave, rotulo);
        if (erro) return { error: { message: erro, code: "VALIDACAO" } };
        return supabaseAdmin.from("fases_rotulos").upsert({ chave, rotulo, atualizado_por: auth.email, atualizado_em: new Date().toISOString() });
      })();
  const { error } = await resultado;
  if (error) {
    if (faltaTabela(error)) return NextResponse.json({ error: "Falta rodar o SQL sql/fases-rotulos.sql no Supabase." }, { status: 503 });
    return NextResponse.json({ error: error.message }, { status: (error as { code?: string }).code === "VALIDACAO" ? 400 : 500 });
  }
  await registrarAuditLog({
    userId: auth.userId, userName: auth.email || "", sistema: "pos", acao: "renomear_fase",
    entidade: "fase", entidadeId: chave, entidadeLabel: chave,
    detalhes: { de: antes?.rotulo || chave, para: rotulo || chave },
  });
  return NextResponse.json({ ok: true });
}
