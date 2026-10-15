"use client";
// "Cancelar nota e refazer" (José, 15/10/2026): cancela a NFS-e da OS no sistema
// nacional, cancela a OS no Omie e liga uma cópia nova para faturar de novo.
// O PPV e a NF-e das peças ficam como estão. Confirmação em dois passos.
import { useState } from "react";
import { authHeaders } from "@/lib/auth/client";

const MOTIVOS: [string, string][] = [["1", "Erro na emissão"], ["2", "Serviço não prestado"], ["9", "Outros"]];
interface Resultado { ok: boolean; erro?: string; antiga?: string; nova?: string; nfse?: string; avisos?: string[]; pendenteOmie?: string }

export default function CancelarNotaModal({ osId, numeroOS, nfse, onFechar, onFeito }: {
  osId: string; numeroOS: string; nfse: string | null; onFechar: () => void; onFeito: () => void;
}) {
  const [motivo, setMotivo] = useState("1");
  const [texto, setTexto] = useState("");
  const [confirmar, setConfirmar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [res, setRes] = useState<Resultado | null>(null);
  const textoOk = texto.replace(/\s+/g, " ").trim().length >= 15;

  const enviar = async () => {
    setEnviando(true);
    try {
      const r = await fetch(`/api/pos/ordens/${encodeURIComponent(osId)}/refaturar`, {
        method: "POST", headers: { ...(await authHeaders()), "Content-Type": "application/json" },
        body: JSON.stringify({ motivo, texto }),
      });
      const j: Resultado = await r.json().catch(() => ({ ok: false, erro: "Resposta inválida do servidor." }));
      setRes(j);
      if (j.ok || j.pendenteOmie) onFeito();
    } catch { setRes({ ok: false, erro: "Sem resposta do servidor. NÃO tente de novo: confira no Omie e no sistema nacional se a nota foi cancelada." }); }
    setEnviando(false);
  };

  const btn: React.CSSProperties = { padding: "12px 18px", borderRadius: 10, border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" };
  return (
    <div onClick={() => !enviando && onFechar()} style={{ position: "fixed", inset: 0, zIndex: 68000, background: "rgba(15,23,42,.55)", backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "6vh 16px", overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fefefe", color: "#1e293b", borderRadius: 16, width: "100%", maxWidth: 560, boxShadow: "0 30px 70px rgba(0,0,0,.35)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "18px 22px", background: "linear-gradient(135deg, #fee2e2, #fefefe 70%)", borderBottom: "1px solid #fecaca" }}>
          <span style={{ width: 44, height: 44, borderRadius: 12, background: "#dc2626", color: "#fefefe", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}><i className="fas fa-file-circle-xmark" /></span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 17, fontWeight: 800 }}>Cancelar nota e refazer</div>
            <div style={{ fontSize: 12.5, color: "#64748b" }}>OS nº {numeroOS}{nfse ? ` · NFS-e nº ${nfse}` : ""}</div>
          </div>
          <button onClick={onFechar} disabled={enviando} style={{ background: "#fefefe", border: "1px solid #e2e8f0", borderRadius: 10, width: 36, height: 36, cursor: "pointer", color: "#475569", fontSize: 18 }}>×</button>
        </div>

        <div style={{ padding: "18px 22px 22px" }}>
          {enviando ? (
            <div style={{ textAlign: "center", padding: "24px 0" }}>
              <i className="fas fa-spinner fa-spin" style={{ fontSize: 28, color: "#dc2626" }} />
              <div style={{ fontSize: 15, fontWeight: 800, marginTop: 12 }}>Cancelando no sistema nacional…</div>
              <div style={{ fontSize: 12.5, color: "#64748b", marginTop: 4 }}>Depois o portal acerta o Omie. Não feche esta janela.</div>
            </div>
          ) : res ? (
            <>
              <div style={{ borderRadius: 12, padding: "14px 16px", fontSize: 13.5, lineHeight: 1.55, marginBottom: 14,
                background: res.ok ? "#f0fdf4" : res.pendenteOmie ? "#fffbeb" : "#fef2f2", border: `1px solid ${res.ok ? "#bbf7d0" : res.pendenteOmie ? "#fcd34d" : "#fecaca"}`,
                color: res.ok ? "#14532d" : res.pendenteOmie ? "#92400e" : "#7f1d1d" }}>
                {res.ok ? (
                  <>
                    <div style={{ fontWeight: 800, marginBottom: 4 }}><i className="fas fa-circle-check" /> NFS-e {res.nfse} cancelada</div>
                    <div>A OS {res.antiga} foi cancelada no Omie e a OS nova é a <b>nº {res.nova}</b>. A OS voltou para <b>Cobrando Cliente</b>: ajuste o que precisar e fature de novo.</div>
                    <div style={{ marginTop: 4 }}>O pedido de peças e a NF-e dele continuam como estavam.</div>
                  </>
                ) : (
                  <><div style={{ fontWeight: 800, marginBottom: 4 }}><i className="fas fa-triangle-exclamation" /> {res.pendenteOmie ? "Falta acertar o Omie" : "Não foi cancelada"}</div>{res.erro}</>
                )}
              </div>
              {(res.avisos || []).map((a) => <div key={a} style={{ fontSize: 12.5, color: "#92400e", background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 10, padding: "8px 12px", marginBottom: 8 }}>{a}</div>)}
              <button onClick={onFechar} style={{ ...btn, width: "100%", background: "#334155", color: "#fefefe" }}>Fechar</button>
            </>
          ) : !confirmar ? (
            <>
              <div style={{ fontSize: 13.5, color: "#334155", lineHeight: 1.6, marginBottom: 14 }}>
                O portal vai:
                <ol style={{ margin: "6px 0 0 18px", padding: 0 }}>
                  <li><b>Cancelar a NFS-e{nfse ? ` nº ${nfse}` : ""} no sistema nacional</b> (com o certificado da empresa);</li>
                  <li>Cancelar a OS {numeroOS} no Omie (o título a receber dela sai junto) e criar uma <b>OS nova</b> com os mesmos serviços;</li>
                  <li>Ligar a OS nova a esta OS do portal, que volta para <b>Cobrando Cliente</b> para você ajustar e faturar de novo.</li>
                </ol>
                <div style={{ marginTop: 8 }}>O pedido de peças (PPV) e a NF-e dele <b>não mudam</b>.</div>
              </div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 6 }}>Motivo</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                {MOTIVOS.map(([v, t]) => (
                  <button key={v} type="button" onClick={() => setMotivo(v)} style={{ padding: "8px 14px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                    border: motivo === v ? "1.5px solid #dc2626" : "1px solid #cbd5e1", background: motivo === v ? "#fef2f2" : "#fefefe", color: motivo === v ? "#b91c1c" : "#334155" }}>{t}</button>
                ))}
              </div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 6 }}>Explique (vai para o sistema nacional)</label>
              <textarea value={texto} onChange={(e) => setTexto(e.target.value.slice(0, 255))} rows={3} placeholder="Ex.: nota emitida com o valor da hora errado; será emitida uma nova com o valor correto."
                style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10, border: "1px solid #cbd5e1", fontSize: 13.5, fontFamily: "inherit", resize: "vertical", marginBottom: 4 }} />
              <div style={{ fontSize: 11.5, color: textoOk ? "#64748b" : "#b45309", marginBottom: 14 }}>{texto.trim().length}/255 · mínimo 15 letras</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setConfirmar(true)} disabled={!textoOk} style={{ ...btn, flex: 1, background: textoOk ? "#dc2626" : "#94a3b8", color: "#fefefe", cursor: textoOk ? "pointer" : "not-allowed" }}>Continuar</button>
                <button onClick={onFechar} style={{ ...btn, background: "#f1f5f9", color: "#334155" }}>Voltar</button>
              </div>
            </>
          ) : (
            <>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 14 }}>
                <span style={{ width: 42, height: 42, borderRadius: 12, flexShrink: 0, background: "#fee2e2", color: "#dc2626", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}><i className="fas fa-triangle-exclamation" /></span>
                <div>
                  <div style={{ fontSize: 16.5, fontWeight: 800 }}>Tem certeza?</div>
                  <div style={{ fontSize: 13, color: "#475569", marginTop: 4, lineHeight: 1.55 }}>
                    A NFS-e{nfse ? ` nº ${nfse}` : ""} será <b>cancelada de verdade</b> no sistema nacional. Não dá para desfazer.
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={enviar} style={{ ...btn, flex: 1, background: "#dc2626", color: "#fefefe" }}><i className="fas fa-file-circle-xmark" /> Sim, cancelar a nota</button>
                <button onClick={() => setConfirmar(false)} style={{ ...btn, background: "#f1f5f9", color: "#334155" }}>Voltar</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
