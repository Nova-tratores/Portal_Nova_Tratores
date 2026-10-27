import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/pos/supabase";
import { TBL_LEMBRETES } from "@/lib/pos/constants";
import { protegerRota, autorDe } from "@/lib/ajustes/permissao-server";

// Login é OPCIONAL por enquanto: as telas ainda chamam sem token. Com token, a autoria vem do login
// (José, 26/10/2026). Quando todas as telas mandarem authHeaders(), trocar por protegerRota obrigatório.
async function autorDoLogin(req: NextRequest): Promise<string | null> {
  if (!req.headers.get("authorization")) return null;
  const g = await protegerRota(req, [{ modulo: "pos" }, { modulo: "requisicoes" }]).catch(() => null);
  return g?.user ? autorDe(g.user) : null;
}

const erroBanco = (msg: string, code?: string) => {
  if (code === "PGRST116") return NextResponse.json({ erro: "Lembrete não encontrado." }, { status: 404 });
  if (code === "42703" || code === "PGRST204") return NextResponse.json({ erro: `Falta aplicar sql/requisicoes-cobranca.sql (${msg})` }, { status: 503 });
  return NextResponse.json({ erro: msg }, { status: 500 });
};

// PATCH /api/pos/lembretes/[id] — atualizar lembrete
// Aceita também (José, 26/10/2026): lembrar_em (adiar, 'YYYY-MM-DD' ou null), responsavel, conclusao_nota, concluido_em_ordem.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });
  const autor = await autorDoLogin(req);
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.lembrete !== undefined) {
    const t = String(body.lembrete || "").trim();
    if (!t) return NextResponse.json({ erro: "O lembrete não pode ficar vazio." }, { status: 400 });
    updates.lembrete = t;
  }
  if (body.cliente_chaves !== undefined) updates.cliente_chaves = body.cliente_chaves;
  if (body.cliente_nomes !== undefined) updates.cliente_nomes = body.cliente_nomes;
  if (body.ativo !== undefined) updates.ativo = body.ativo;
  if (body.lembrar_em !== undefined) {
    if (body.lembrar_em !== null && !/^\d{4}-\d{2}-\d{2}$/.test(String(body.lembrar_em))) return NextResponse.json({ erro: "lembrar_em deve ser AAAA-MM-DD." }, { status: 400 });
    updates.lembrar_em = body.lembrar_em || null;
  }
  if (body.responsavel !== undefined) updates.responsavel = body.responsavel ? String(body.responsavel).trim() : null;
  if (body.conclusao_nota !== undefined) updates.conclusao_nota = body.conclusao_nota ? String(body.conclusao_nota).trim().slice(0, 500) : null;
  // valor a cobrar / crédito (José, 27/10/2026): 0 ou vazio tira o valor
  if (body.valor !== undefined) {
    const v = Math.round((Number(body.valor) || 0) * 100) / 100;
    if (v < 0) return NextResponse.json({ erro: "O valor não pode ser negativo." }, { status: 400 });
    updates.valor = v > 0 ? v : null;
    if (v <= 0) updates.valor_tipo = null;
  }
  if (body.valor_tipo !== undefined && !(body.valor !== undefined && !(Number(body.valor) > 0))) {
    if (body.valor_tipo !== null && body.valor_tipo !== "cobrar" && body.valor_tipo !== "credito") return NextResponse.json({ erro: "valor_tipo deve ser cobrar ou credito." }, { status: 400 });
    updates.valor_tipo = body.valor_tipo;
  }

  if (body.concluido !== undefined) {
    // lembrete do robô de cobrança só fecha resolvendo a cobrança (senão o robô reabre)
    if (body.concluido) {
      const { data: atual } = await supabase.from(TBL_LEMBRETES).select("*").eq("id", id).maybeSingle();
      if (atual?.tipo === "cobranca_requisicao" && atual?.requisicao_id) {
        const { data: rq } = await supabase.from("Requisicao").select("cobranca_status, valor_cobrado_cliente").eq("id", atual.requisicao_id).maybeSingle();
        const semValor = !rq?.valor_cobrado_cliente || String(rq.valor_cobrado_cliente).trim() === "";
        if (rq && semValor && rq.cobranca_status !== "nao_cobrada") {
          return NextResponse.json({ erro: "Este lembrete é da cobrança da requisição: preencha o valor cobrado ou marque como não cobrada (com motivo).", cobranca: true, requisicao_id: atual.requisicao_id }, { status: 409 });
        }
      }
    }
    updates.concluido = body.concluido;
    if (body.concluido) {
      updates.concluido_em = new Date().toISOString();
      updates.concluido_por = autor || body.concluido_por || "Sistema";
      updates.concluido_em_ordem = body.concluido_em_ordem || null;
    } else {
      updates.concluido_em = null;
      updates.concluido_por = null;
      updates.concluido_em_ordem = null;
      if (body.conclusao_nota === undefined) updates.conclusao_nota = null;
    }
  } else if (body.concluido_em_ordem !== undefined) {
    updates.concluido_em_ordem = body.concluido_em_ordem || null;
  }

  const { data, error } = await supabase
    .from(TBL_LEMBRETES)
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return erroBanco(error.message, error.code);
  return NextResponse.json(data);
}

// DELETE /api/pos/lembretes/[id] — excluir lembrete
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { error } = await supabase
    .from(TBL_LEMBRETES)
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ sucesso: true });
}
