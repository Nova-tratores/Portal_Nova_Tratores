"use client";
// Cliente marcado como "Não contatar": tudo que é vermelho nesta ficha vem
// daqui. A marcação pode ser pedido do cliente OU decisão da loja (não
// incomodar / não atender mais) — a mensagem não assume o motivo.

export const VERMELHO = "#dc2626";
export const VERMELHO_ESCURO = "#991b1b";
export const VERMELHO_FUNDO = "#fee2e2";

export const TEXTO_BLOQUEIO =
  "Este cliente está marcado como NÃO CONTATAR. Pode ser pedido do próprio cliente ou decisão da loja (não incomodar, ou não voltar a atender). Não ligue nem envie mensagem sem autorização de quem fez a marcação.";

/** Faixa vermelha fina — usada no topo de cada coluna. */
export function FaixaBloqueio({ texto = "CONTATO BLOQUEADO · NÃO CONTATAR" }: { texto?: string }) {
  return (
    <div style={{ background: VERMELHO, color: "#fff", fontWeight: 900, fontSize: 12, letterSpacing: 1.5, textAlign: "center", padding: "6px 10px", borderRadius: 8, textTransform: "uppercase" }}>
      🚫 {texto}
    </div>
  );
}

/** Banner grande no topo da ficha. */
export function BannerBloqueio({ mostrarTudo, onAlternar }: { mostrarTudo: boolean; onAlternar: () => void }) {
  return (
    <div style={{ background: VERMELHO_FUNDO, border: `2px solid ${VERMELHO}`, borderRadius: 14, padding: "12px 16px", marginBottom: 12, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
      <div style={{ fontSize: 28 }}>🚫</div>
      <div style={{ flex: 1, minWidth: 240 }}>
        <div style={{ color: VERMELHO_ESCURO, fontWeight: 900, fontSize: 16, letterSpacing: 1 }}>CONTATO BLOQUEADO · NÃO CONTATAR</div>
        <div style={{ color: VERMELHO_ESCURO, fontSize: 12, marginTop: 2, lineHeight: 1.45 }}>{TEXTO_BLOQUEIO}</div>
      </div>
      <button type="button" onClick={onAlternar} style={{ fontSize: 12, fontWeight: 700, padding: "6px 12px", borderRadius: 999, border: `1px solid ${VERMELHO_ESCURO}`, background: "transparent", color: VERMELHO_ESCURO, cursor: "pointer" }}>
        {mostrarTudo ? "Esconder detalhes" : "Mostrar ficha completa mesmo assim"}
      </button>
    </div>
  );
}

/** Coluna direita no lugar do painel de ligação. */
export function PainelBloqueado({ onReativar, motivosAbertos }: { onReativar?: () => void; motivosAbertos: number }) {
  return (
    <section style={{ background: VERMELHO_FUNDO, border: `2px solid ${VERMELHO}`, borderRadius: 16, padding: 16 }}>
      <FaixaBloqueio texto="NÃO CONTATAR" />
      <p style={{ color: VERMELHO_ESCURO, fontSize: 13, lineHeight: 1.5, margin: "12px 0 0", fontWeight: 600 }}>{TEXTO_BLOQUEIO}</p>
      {motivosAbertos > 0 && (
        <p style={{ color: VERMELHO_ESCURO, fontSize: 12, margin: "10px 0 0" }}>
          Há {motivosAbertos} motivo{motivosAbertos > 1 ? "s" : ""} automático{motivosAbertos > 1 ? "s" : ""} na fila para este cliente — eles ficam ignorados enquanto a marcação existir.
        </p>
      )}
      <div style={{ marginTop: 14, fontSize: 12, color: VERMELHO_ESCURO }}>Sem botão de ligar nem WhatsApp. Se precisar anotar algo, use “Registrar” no atendimento aberto.</div>
      {onReativar && (
        <button type="button" onClick={onReativar} style={{ marginTop: 14, width: "100%", fontSize: 13, fontWeight: 800, padding: "10px 12px", borderRadius: 12, border: `2px solid ${VERMELHO_ESCURO}`, background: "#fff", color: VERMELHO_ESCURO, cursor: "pointer" }}>
          ✅ Liberar contato (tirar a marcação)
        </button>
      )}
    </section>
  );
}
