// =============================================================================
// ALERTA DE ESTOQUE RESERVADO — quando um PPV entra em "Orçamento Aprovado"
// (checkbox de reserva), confere cada peça dele: estoque real = estoque −
// reservados (todas as reservas ativas). Ficou no limite (≤ LIMITE_ALERTA) ou
// estourou → notificação no sininho do portal pros admins (módulo 'ppv').
// Best-effort: nunca derruba a mudança de fase.
// =============================================================================
import { createClient } from "@supabase/supabase-js";
import { filtrarDestinatarios } from "@/lib/notif/prefs";

const LIMITE_ALERTA = 2; // estoque real ≤ isto → avisa

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  { auth: { persistSession: false } },
);

/* eslint-disable @typescript-eslint/no-explicit-any */

const qtdMov = (m: any) => {
  let q = Math.abs(Number(m.Qtde) || 0);
  if (String(m.TipoMovimento || "").toLowerCase().includes("devolu")) q = -q;
  return q;
};

export async function avisarEstoqueNoLimite(ppvId: string): Promise<void> {
  try {
    // 1) Peças DESTE pedido
    const { data: movsPpv } = await supabase
      .from("movimentacoes").select("CodProduto, Qtde, TipoMovimento").eq("Id_PPV", ppvId);
    const codigos = [...new Set((movsPpv || []).map((m) => String(m.CodProduto || "").trim()).filter(Boolean))];
    if (!codigos.length) return;

    // 2) Reservas ativas (todos os pedidos em Orçamento Aprovado)
    const { data: peds } = await supabase
      .from("pedidos").select("id_pedido").eq("status", "Orçamento Aprovado").limit(1000);
    const ids = (peds || []).map((p) => String(p.id_pedido || "").trim()).filter(Boolean);
    const reservados: Record<string, number> = {};
    if (ids.length) {
      const { data: movs } = await supabase
        .from("movimentacoes").select("CodProduto, Qtde, TipoMovimento")
        .in("Id_PPV", ids).in("CodProduto", codigos);
      for (const m of movs || []) {
        const cod = String(m.CodProduto || "").trim();
        reservados[cod] = (reservados[cod] || 0) + qtdMov(m);
      }
    }

    // 3) Estoque atual das peças
    const { data: prods } = await supabase
      .from("produtos").select("codigo, descricao, estoque").in("codigo", codigos);

    const alertas: string[] = [];
    for (const p of prods || []) {
      const cod = String(p.codigo || "").trim();
      const estoque = Number(p.estoque) || 0;
      const res = Math.max(0, reservados[cod] || 0);
      const real = estoque - res;
      if (res > 0 && real <= LIMITE_ALERTA) {
        alertas.push(`${p.descricao || cod} (cód ${cod}): estoque ${estoque}, reservados ${res} → real ${real}${real < 0 ? " (ESTOUROU)" : ""}`);
      }
    }
    if (!alertas.length) return;

    // 4) Sininho dos admins (respeita silenciamento do módulo 'ppv')
    const { data: admins } = await supabase
      .from("portal_permissoes")
      .select("user_id, categoria, notif_silenciado")
      .eq("is_admin", true);
    const destinos = filtrarDestinatarios("ppv", admins || []);
    if (!destinos.length) return;
    await supabase.from("portal_notificacoes").insert(
      destinos.map((user_id) => ({
        user_id,
        tipo: "ppv",
        titulo: `⚠ Estoque no limite — reserva do ${ppvId}`,
        descricao: alertas.slice(0, 4).join(" · ").slice(0, 400),
        link: "/ppv",
      })),
    );
  } catch (e) {
    console.error(`[estoque-reserva] ${ppvId} falhou (ignorado):`, e instanceof Error ? e.message : e);
  }
}
