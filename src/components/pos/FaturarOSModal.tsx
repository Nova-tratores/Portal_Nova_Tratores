"use client";
// Janela de faturamento da OS (emite NFS-e no Omie) — molde do FaturarModal do PPV,
// com o que a OS precisa a mais: forma de pagamento → parcelas, pedidos de peças
// para faturar junto e a conferência do valor que vai na nota (o do OMIE).
// Nada é emitido até o "Sim, emitir". A prévia usa o ValidarOS do Omie (não emite).
import { useEffect, useMemo, useState } from "react";
import { authHeaders } from "@/lib/auth/client";
import { parcelasDoPagamento } from "@/lib/pagamento/parcelas";

interface PPVPrevia {
  id: string; pedidoOmie: string; tipo: string; status: string; empresa: string;
  faturadoEm: string | null; valor: number; motivoFora: string | null;
}
interface Previa {
  ok: boolean; erro?: string;
  os?: { id: string; cliente: string; numeroOmie: string; status: string };
  totalOmie?: number; valorPortal?: number; divergente?: boolean;
  servicos?: Array<{ descricao: string; quantidade: number; valorUnitario: number }>;
  formaPagamento?: string | null; opcoesPagamento?: string[]; hoje?: string;
  validacao?: { ok: boolean; msg: string | null };
  ppvs?: PPVPrevia[]; podeFaturarPecas?: boolean;
}
interface Resultado {
  success?: boolean; tipo?: string; mensagem?: string; error?: string; nfseNumero?: string | null;
  pecas?: Array<{ id: string; pedidoOmie?: string; ok: boolean; erro?: string | null; nf?: string | null }>;
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const FASES_ANTES_DA_EXECUCAO = /^(Orçamento|Execução)/i;

export default function FaturarOSModal({ open, osId, onClose, onFaturado }: {
  open: boolean;
  osId: string;
  onClose: () => void;
  onFaturado: () => void; // recarrega o drawer (a OS vai pra Concluída no servidor)
}) {
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [forma, setForma] = useState<string | null>(null);
  const [ppvsMarcados, setPpvsMarcados] = useState<Set<string>>(new Set());
  const [conferiValor, setConferiValor] = useState(false);
  const [faturando, setFaturando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  useEffect(() => {
    // o bloco só monta esta janela quando ela abre: o estado já nasce limpo
    if (!open) return;
    let cancel = false;
    (async () => {
      try {
        const r = await fetch(`/api/pos/ordens/${encodeURIComponent(osId)}/faturar/simular`, { method: "POST", headers: await authHeaders() });
        const j: Previa = await r.json().catch(() => ({ ok: false, erro: "Resposta inválida do servidor." }));
        if (cancel) return;
        if (!r.ok && !j.erro) j.erro = (j as unknown as { error?: string }).error || `Erro ${r.status}`;
        setPrevia(j);
        setForma(j.formaPagamento || null); // sem escolha na cobrança = nada marcado (obriga escolher)
        setPpvsMarcados(new Set((j.ppvs || []).filter((p) => !p.motivoFora && j.podeFaturarPecas).map((p) => p.id)));
      } catch {
        if (!cancel) setPrevia({ ok: false, erro: "Falha de conexão ao preparar o faturamento." });
      }
      if (!cancel) setCarregando(false);
    })();
    return () => { cancel = true; };
  }, [open, osId]);

  const plano = useMemo(
    () => (previa?.ok && forma && previa.totalOmie && previa.hoje ? parcelasDoPagamento(forma, previa.totalOmie, previa.hoje) : null),
    [previa, forma],
  );

  if (!open) return null;

  const pecasJunto = (previa?.ppvs || []).filter((p) => ppvsMarcados.has(p.id));
  const podeEmitir = !!previa?.ok && !!previa.validacao?.ok && !!plano && (!previa.divergente || conferiValor) && !faturando;

  const faturar = async () => {
    if (!previa?.ok || !plano) return;
    setFaturando(true);
    try {
      const r = await fetch(`/api/pos/ordens/${encodeURIComponent(osId)}/faturar`, {
        method: "POST",
        headers: { ...(await authHeaders()), "Content-Type": "application/json" },
        body: JSON.stringify({ forma, ppvIds: [...ppvsMarcados], totalConfirmado: previa.totalOmie }),
      });
      const j: Resultado = await r.json().catch(() => ({}));
      if (!j.tipo && !j.error && !j.mensagem) {
        // conexão caiu no meio (proxy): pode ter faturado — o servidor confere sozinho
        setResultado({ tipo: "desconhecido", mensagem: "A conexão caiu enquanto o Omie processava. NÃO tente de novo: o portal confere no Omie em alguns minutos e atualiza esta OS." });
      } else {
        setResultado(j);
      }
      if (j.tipo === "faturada" || j.tipo === "ja_faturada" || j.tipo === "desconhecido") onFaturado();
    } catch {
      setResultado({ tipo: "desconhecido", mensagem: "Sem resposta do servidor. NÃO tente de novo agora: o portal confere no Omie e atualiza esta OS." });
      onFaturado();
    }
    setFaturando(false);
  };

  const btn: React.CSSProperties = { padding: "11px 16px", borderRadius: 4, border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer" };
  const caixa = (cor: "verm" | "ambar" | "verde" | "cinza"): React.CSSProperties => ({
    borderRadius: 4, padding: "12px 14px", fontSize: 13, lineHeight: 1.5, marginBottom: 12,
    background: { verm: "#fef2f2", ambar: "#fffbeb", verde: "#f0fdf4", cinza: "#f8fafc" }[cor],
    border: `1px solid ${{ verm: "#fecaca", ambar: "#fcd34d", verde: "#bbf7d0", cinza: "#e2e8f0" }[cor]}`,
    color: { verm: "#7f1d1d", ambar: "#92400e", verde: "#14532d", cinza: "#334155" }[cor],
  });
  const titulo = (t: string) => <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.6, textTransform: "uppercase", color: "#64748b", margin: "14px 0 6px" }}>{t}</div>;

  return (
    <div onClick={() => !faturando && onClose()} style={{ position: "fixed", inset: 0, zIndex: 68000, background: "rgba(0,0,0,.5)", backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "6vh 16px", overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", color: "#1e293b", borderRadius: 4, width: "100%", maxWidth: 560, boxShadow: "0 24px 60px rgba(0,0,0,.3)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: "1px solid #eef0f3" }}>
          <i className="fas fa-file-invoice-dollar" style={{ color: "#0369A1" }} />
          <div style={{ flex: 1, fontSize: 16, fontWeight: 700 }}>Faturar OS (NFS-e){previa?.os ? ` · Omie nº ${previa.os.numeroOmie}` : ""}</div>
          <button onClick={onClose} disabled={faturando} style={{ background: "#f1f5f9", border: "none", borderRadius: 4, width: 30, height: 30, cursor: "pointer", color: "#475569", fontSize: 17 }}>×</button>
        </div>

        <div style={{ padding: "16px 18px 18px" }}>
          {carregando && <div style={{ padding: 20, textAlign: "center", color: "#64748b", fontSize: 13 }}><i className="fas fa-spinner fa-spin" /> Conferindo a OS no Omie…</div>}

          {/* ---------- resultado ---------- */}
          {resultado && (
            <>
              {resultado.tipo === "faturada" || resultado.tipo === "ja_faturada" ? (
                <div style={caixa("verde")}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}><i className="fas fa-check-circle" /> {resultado.tipo === "ja_faturada" ? "A OS já estava faturada no Omie — o portal registrou." : "OS faturada. A nota foi para a prefeitura."}</div>
                  <div>{resultado.nfseNumero ? `NFS-e nº ${resultado.nfseNumero}.` : "O número e o PDF da NFS-e aparecem aqui assim que a prefeitura devolver (o portal confere sozinho)."} A OS foi para Concluída.</div>
                </div>
              ) : resultado.tipo === "desconhecido" ? (
                <div style={caixa("ambar")}><div style={{ fontWeight: 700, marginBottom: 4 }}><i className="fas fa-hourglass-half" /> Conferindo no Omie</div>{resultado.mensagem}</div>
              ) : (
                <div style={caixa("verm")}><div style={{ fontWeight: 700, marginBottom: 4 }}><i className="fas fa-exclamation-circle" /> Não foi faturada</div>{resultado.mensagem || resultado.error}</div>
              )}
              {(resultado.pecas || []).length > 0 && (
                <div style={caixa(resultado.pecas!.every((p) => p.ok) ? "cinza" : "ambar")}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>Pedidos de peças</div>
                  {resultado.pecas!.map((p) => (
                    <div key={p.id}>{p.ok ? "✔" : "✖"} {p.id}{p.pedidoOmie ? ` (PV ${p.pedidoOmie})` : ""}: {p.ok ? (p.nf ? `NF-e ${p.nf}` : "enviado à SEFAZ") : p.erro}</div>
                  ))}
                  {!resultado.pecas!.every((p) => p.ok) && <div style={{ marginTop: 6 }}>A OS continua faturada. Os pedidos que falharam podem ser faturados de novo pelo bloco de faturamento da OS.</div>}
                </div>
              )}
              <button onClick={onClose} style={{ ...btn, width: "100%", background: "#334155", color: "#fff" }}>Fechar</button>
            </>
          )}

          {/* ---------- erro da prévia ---------- */}
          {!resultado && previa && !previa.ok && (
            <>
              <div style={caixa("verm")}><div style={{ fontWeight: 700, marginBottom: 4 }}>Não dá para faturar agora</div>{previa.erro}</div>
              <button onClick={onClose} style={{ ...btn, width: "100%", background: "#f1f5f9", color: "#334155" }}>Fechar</button>
            </>
          )}

          {/* ---------- prévia ---------- */}
          {!resultado && previa?.ok && (
            <>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{previa.os?.cliente}</div>
              <div style={{ fontSize: 12.5, color: "#64748b" }}>OS {previa.os?.id} · fase atual: {previa.os?.status}</div>
              {FASES_ANTES_DA_EXECUCAO.test(previa.os?.status || "") && (
                <div style={{ ...caixa("ambar"), marginTop: 10 }}>⚠ A OS ainda está em <strong>{previa.os?.status}</strong>. Faturar agora leva a OS para Concluída mesmo sem o serviço finalizado.</div>
              )}

              {titulo("Serviços na nota (Omie)")}
              <div style={{ border: "1px solid #e2e8f0", borderRadius: 4 }}>
                {(previa.servicos || []).map((s, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, padding: "7px 10px", fontSize: 12.5, borderTop: i ? "1px solid #f1f5f9" : "none" }}>
                    <span style={{ flex: 1 }}>{s.descricao || "Serviço"}</span>
                    <span style={{ color: "#64748b" }}>{s.quantidade} × {brl(s.valorUnitario)}</span>
                  </div>
                ))}
                <div style={{ display: "flex", padding: "8px 10px", fontWeight: 800, fontSize: 14, borderTop: "1px solid #e2e8f0", background: "#f8fafc" }}>
                  <span style={{ flex: 1 }}>Total da NFS-e</span><span>{brl(previa.totalOmie || 0)}</span>
                </div>
              </div>
              {previa.divergente && (
                <div style={{ ...caixa("ambar"), marginTop: 10 }}>
                  O valor da OS no <strong>portal</strong> é {brl(previa.valorPortal || 0)}, mas a nota sai com o valor do <strong>Omie</strong> ({brl(previa.totalOmie || 0)}).
                  <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, fontWeight: 700, cursor: "pointer" }}>
                    <input type="checkbox" checked={conferiValor} onChange={(e) => setConferiValor(e.target.checked)} /> Conferi: pode sair com {brl(previa.totalOmie || 0)}
                  </label>
                </div>
              )}

              {titulo("Forma de pagamento")}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {(previa.opcoesPagamento || []).map((op) => (
                  <button key={op} type="button" onClick={() => setForma(op)}
                    style={{ padding: "6px 12px", borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: "pointer", border: forma === op ? "1px solid #0369A1" : "1px solid #cbd5e1", background: forma === op ? "#0369A1" : "#fff", color: forma === op ? "#fff" : "#334155" }}>
                    {op}
                  </button>
                ))}
              </div>
              {!forma && <div style={{ fontSize: 12, color: "#b45309", marginTop: 6 }}>Escolha a forma de pagamento combinada com o cliente.</div>}
              {plano && (
                <div style={{ fontSize: 12.5, color: "#334155", marginTop: 8 }}>
                  {plano.parcelas.map((p) => (
                    <div key={p.nParcela}>{p.nParcela}ª parcela · {p.dDtVenc} · <strong>{brl(p.nValor)}</strong></div>
                  ))}
                  <div style={{ fontSize: 11.5, color: "#64748b", marginTop: 2 }}>Vencimentos contados a partir de hoje.</div>
                </div>
              )}

              {(previa.ppvs || []).length > 0 && (
                <>
                  {titulo("Pedidos de peças desta OS")}
                  {(previa.ppvs || []).map((p) => {
                    const bloqueado = !!p.motivoFora || !previa.podeFaturarPecas;
                    return (
                      <label key={p.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, padding: "5px 0", opacity: bloqueado ? 0.6 : 1, cursor: bloqueado ? "default" : "pointer" }}>
                        <input type="checkbox" disabled={bloqueado} checked={ppvsMarcados.has(p.id)}
                          onChange={(e) => setPpvsMarcados((prev) => { const n = new Set(prev); if (e.target.checked) n.add(p.id); else n.delete(p.id); return n; })} />
                        <span>
                          <strong>Faturar também</strong> {p.id}{p.pedidoOmie ? ` · PV ${p.pedidoOmie}` : ""} · {p.empresa || "Nova Tratores"} · {brl(p.valor)}
                          {p.motivoFora && <span style={{ color: "#64748b" }}> — {p.motivoFora}</span>}
                          {!p.motivoFora && !previa.podeFaturarPecas && <span style={{ color: "#64748b" }}> — sem permissão de faturar PPV</span>}
                        </span>
                      </label>
                    );
                  })}
                </>
              )}

              {!previa.validacao?.ok && (
                <div style={{ ...caixa("verm"), marginTop: 12 }}><div style={{ fontWeight: 700, marginBottom: 4 }}>O Omie recusou a validação desta OS</div>{previa.validacao?.msg} — corrija no Omie e abra esta janela de novo.</div>
              )}

              <div style={{ ...caixa("cinza"), marginTop: 14 }}>
                Vai emitir: <strong>NFS-e de {brl(previa.totalOmie || 0)}</strong>
                {pecasJunto.length > 0 && <> + <strong>{pecasJunto.length} NF-e de peças</strong> ({pecasJunto.map((p) => p.pedidoOmie ? `PV ${p.pedidoOmie}` : p.id).join(", ")})</>}
                . Notas fiscais reais; cancelar depois só pelo Omie.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={faturar} disabled={!podeEmitir}
                  style={{ ...btn, flex: 1, background: podeEmitir ? "#0369A1" : "#94a3b8", color: "#fff", cursor: faturando ? "wait" : podeEmitir ? "pointer" : "not-allowed" }}>
                  {faturando ? "Faturando… (não feche)" : "Sim, emitir"}
                </button>
                <button onClick={onClose} disabled={faturando} style={{ ...btn, background: "#f1f5f9", color: "#334155" }}>Não</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
