// Códigos do "Nº do Contrato de Venda" (OS no formato Omie, José 14/10/2026).
//   GET  → lista = padrão (planilha) + tabela pos_codigos_contrato (editados/novos)
//   POST { codigo, quando, antigo? } → adiciona ou edita (antigo = renomear)
// Sem a tabela (sql/pos-codigos-contrato.sql) o GET devolve só o padrão.
import { NextRequest, NextResponse } from "next/server";
import { autenticar } from "@/lib/auth/server";
import { supabase } from "@/lib/pos/supabase";
import { CODIGOS_INTERNOS } from "@/lib/pos/omie-espelho";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function lerTabela() {
  const { data, error } = await supabase.from("pos_codigos_contrato").select("codigo, quando, ativo");
  return { linhas: data || [], semTabela: !!error };
}

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const { linhas, semTabela } = await lerTabela();
  const mapa = new Map(CODIGOS_INTERNOS.map((c) => [c.codigo, { codigo: c.codigo, quando: c.quando }]));
  for (const l of linhas) {
    if (l.ativo === false) mapa.delete(String(l.codigo));
    else mapa.set(String(l.codigo), { codigo: String(l.codigo), quando: String(l.quando || "") });
  }
  return NextResponse.json({ codigos: [...mapa.values()].sort((a, b) => a.codigo.localeCompare(b.codigo, "pt-BR")), semTabela });
}

export async function POST(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!auth.isAdmin && !auth.modulos.includes("pos")) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const codigo = String(body.codigo || "").trim().slice(0, 20); // o Omie aceita até 20 caracteres
  const quando = String(body.quando || "").trim();
  const antigo = String(body.antigo || "").trim();
  if (!codigo) return NextResponse.json({ error: "Informe o código." }, { status: 400 });
  const agora = new Date().toISOString();
  if (antigo && antigo !== codigo) {
    // renomear = desativa o antigo e cria o novo
    const { error } = await supabase.from("pos_codigos_contrato").upsert({ codigo: antigo, ativo: false, criado_por: auth.email, atualizado_em: agora });
    if (error) return NextResponse.json({ error: "Rode sql/pos-codigos-contrato.sql para poder editar os códigos." }, { status: 503 });
  }
  const { error } = await supabase.from("pos_codigos_contrato").upsert({ codigo, quando, ativo: true, criado_por: auth.email, atualizado_em: agora });
  if (error) return NextResponse.json({ error: "Rode sql/pos-codigos-contrato.sql para poder adicionar os códigos." }, { status: 503 });
  return NextResponse.json({ ok: true, codigo });
}
