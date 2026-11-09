// Controlador de fases do POS e do PPV (José, 09/11/2026) — regras em lib/fases/quadro.ts.
// GET  /api/fases/quadro                          → { pos: Fase[], ppv: Fase[], podeEditar, migracaoFaltando? }
// PUT  /api/fases/quadro { listas: { pos?, ppv? } } → salva um ou os dois quadros (pós-vendas/admin)
//      Remover fase com OS/PPV dentro → 409 { erro, ocupadas: [{ modulo, chave, n }] }.
import { NextRequest, NextResponse } from "next/server";
import { autenticar } from "@/lib/auth/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { registrarAuditLog } from "@/lib/server/audit-notify";
import { TBL_OS, TBL_PEDIDOS } from "@/lib/pos/constants";
import {
  diferenca, normalizarLista, podeEditarFases, resumoDiferenca, temMudanca, validarLista,
  type FaseQuadro, type ModuloFases,
} from "@/lib/fases/quadro";

const MODULOS: ModuloFases[] = ["pos", "ppv"];
const faltaTabela = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "42P01" || e.code === "PGRST205" || /fases_quadro/.test(e.message || ""));

async function rotulosAntigos(): Promise<Record<string, string>> {
  const { data } = await supabaseAdmin.from("fases_rotulos").select("chave, rotulo");
  const r: Record<string, string> = {};
  for (const x of data || []) r[String(x.chave)] = String(x.rotulo);
  return r;
}

async function lerListas(): Promise<{ listas: Record<ModuloFases, FaseQuadro[]>; migracaoFaltando: boolean }> {
  const antigos = await rotulosAntigos();
  const { data, error } = await supabaseAdmin.from("fases_quadro").select("modulo, fases");
  if (error && !faltaTabela(error)) throw new Error(error.message);
  const salvo = new Map((data || []).map((r) => [String(r.modulo), r.fases]));
  const listas = {} as Record<ModuloFases, FaseQuadro[]>;
  for (const m of MODULOS) listas[m] = normalizarLista(salvo.get(m), antigos);
  return { listas, migracaoFaltando: faltaTabela(error) };
}

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Faça login." }, { status: 401 });
  try {
    const { listas, migracaoFaltando } = await lerListas();
    return NextResponse.json({ ...listas, podeEditar: podeEditarFases(auth), ...(migracaoFaltando ? { migracaoFaltando } : {}) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** Quantas OS/PPVs estão em cada fase (só as que vão sair). */
async function contarOcupadas(modulo: ModuloFases, chaves: string[]): Promise<{ modulo: ModuloFases; chave: string; n: number }[]> {
  const out: { modulo: ModuloFases; chave: string; n: number }[] = [];
  for (const chave of chaves) {
    const q = modulo === "pos"
      ? supabaseAdmin.from(TBL_OS).select("Id_Ordem", { count: "exact", head: true }).eq("Status", chave)
      : supabaseAdmin.from(TBL_PEDIDOS).select("id_pedido", { count: "exact", head: true }).eq("status", chave);
    const { count, error } = await q;
    if (error) throw new Error(error.message);
    if ((count || 0) > 0) out.push({ modulo, chave, n: count || 0 });
  }
  return out;
}

export async function PUT(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Faça login." }, { status: 401 });
  if (!podeEditarFases(auth)) return NextResponse.json({ error: "Só o pós-vendas pode mexer nas fases." }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const pedidas = (body?.listas || {}) as Partial<Record<ModuloFases, unknown>>;
  const modulos = MODULOS.filter((m) => Array.isArray(pedidas[m]));
  if (!modulos.length) return NextResponse.json({ error: "Nada para salvar." }, { status: 400 });

  let atuais: Record<ModuloFases, FaseQuadro[]>;
  try { atuais = (await lerListas()).listas; } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }

  const novas = {} as Partial<Record<ModuloFases, FaseQuadro[]>>;
  const ocupadas: { modulo: ModuloFases; chave: string; n: number }[] = [];
  for (const m of modulos) {
    // não usa normalizarLista aqui: ela devolveria as fixas em silêncio; a validação avisa
    const lista = (pedidas[m] as FaseQuadro[]).map((f) => ({ chave: String(f?.chave ?? "").trim(), ...(f?.rotulo ? { rotulo: String(f.rotulo).trim() } : {}) }));
    const erro = validarLista(lista);
    if (erro) return NextResponse.json({ error: `${m.toUpperCase()}: ${erro}` }, { status: 400 });
    novas[m] = normalizarLista(lista);
    const removidas = diferenca(atuais[m], novas[m]!).removidas;
    try { ocupadas.push(...(await contarOcupadas(m, removidas))); } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
  }
  if (ocupadas.length) {
    const txt = ocupadas.map((o) => `"${o.chave}" tem ${o.n} ${o.modulo === "pos" ? "OS" : "PPV"}`).join("; ");
    return NextResponse.json({ error: `Não dá para remover: ${txt}. Mude ${ocupadas.length > 1 ? "elas" : "ela"} de fase antes.`, ocupadas }, { status: 409 });
  }

  const agora = new Date().toISOString();
  const { error } = await supabaseAdmin.from("fases_quadro").upsert(
    modulos.map((m) => ({ modulo: m, fases: novas[m], atualizado_por: auth.email, atualizado_em: agora })),
  );
  if (error) {
    if (faltaTabela(error)) return NextResponse.json({ error: "Falta rodar o SQL sql/fases-quadro.sql no Supabase (projeto do portal)." }, { status: 503 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  for (const m of modulos) {
    const d = diferenca(atuais[m], novas[m]!);
    if (!temMudanca(d)) continue;
    await registrarAuditLog({
      userId: auth.userId, userName: auth.email || "", sistema: m, acao: "editar_fases",
      entidade: "fases", entidadeId: m, entidadeLabel: `Fases do ${m.toUpperCase()}`,
      detalhes: { mudancas: resumoDiferenca(d, atuais[m]) },
    });
  }
  return NextResponse.json({ ok: true, ...novas });
}
