// Navegador: as telas do Financeiro pedem a recobrança pela rota (que grava o card e cria o
// ticket no bloco do setor). Devolve a mensagem pronta para o alert.
import { authHeaders } from "@/lib/auth/client";

export type RespostaRecobranca = { ok: boolean; mensagem: string; numero?: number };

export async function pedirRecobranca(id: number, opts: { moverParaVencido?: boolean } = {}): Promise<RespostaRecobranca> {
  try {
    const r = await fetch("/api/financeiro/recobranca", {
      method: "POST",
      headers: { ...(await authHeaders()), "Content-Type": "application/json" },
      body: JSON.stringify({ id, mover_para_vencido: opts.moverParaVencido !== false }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.ok) return { ok: false, mensagem: "Erro ao pedir recobrança: " + (j?.error || `HTTP ${r.status}`) };
    const quem = j.responsavel?.nome || "o setor";
    return {
      ok: true,
      numero: j.recobrancas,
      mensagem: j.jaExistia
        ? `Já existe o ticket #${j.ticket.numero} aberto com ${quem} (bloco ${j.bloco}) para este card — nada foi duplicado.`
        : `Ticket #${j.ticket.numero} criado para ${quem} (bloco ${j.bloco}).`,
    };
  } catch (e) {
    return { ok: false, mensagem: "Erro ao pedir recobrança: " + (e instanceof Error ? e.message : String(e)) };
  }
}
