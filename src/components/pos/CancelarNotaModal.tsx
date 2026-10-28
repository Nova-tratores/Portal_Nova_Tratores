"use client";
// Cancelar a nota da OS e refazer (José, 15/10/2026), em dois passos:
//   1) Cancelar a NFS-e — direto no sistema nacional (certificado da empresa);
//   2) Duplicar a OS — OS nova no Omie (reaproveita a cópia se já existir), a
//      antiga é cancelada lá (o título sai junto) e esta OS do portal passa a
//      apontar para a nova, voltando para "Cobrando Cliente".
// O pedido de peças (PPV) e a NF-e dele não mudam.
import { useRef, useState } from "react";
import { authHeaders } from "@/lib/auth/client";
import CronometroEstimado, { useSegundos } from "@/components/comum/CronometroEstimado";

interface Resultado { ok: boolean; erro?: string; antiga?: string; nova?: string; nfse?: string; avisos?: string[]; proximo?: string; antigo?: string; novo?: string; nf?: string }
type Etapa = "cancelar" | "confirmar" | "duplicar" | "fim";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function CancelarNotaModal({ osId, numeroOS, nfse, valor = 0, etapaInicial = "cancelar", tipo = "os", ppvId, onFechar, onFeito }: {
  osId: string; numeroOS: string; nfse: string | null; valor?: number;
  /** "pedido" = NF-e de peças (numeroOS = nº do pedido, nfse = nº da NF-e) */
  tipo?: "os" | "pedido"; ppvId?: string;
  /** "duplicar" = a nota já foi cancelada: abre direto no 2º passo */
  etapaInicial?: "cancelar" | "duplicar";
  onFechar: () => void; onFeito: () => void;
}) {
  const [etapa, setEtapa] = useState<Etapa>(etapaInicial);
  const [motivo, setMotivo] = useState("1");
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState<null | "cancelar" | "duplicar">(null);
  const [res, setRes] = useState<Resultado | null>(null);
  const [cancelada, setCancelada] = useState(etapaInicial === "duplicar");
  const textoOk = texto.replace(/\s+/g, " ").trim().length >= 15;
  const ped = tipo === "pedido";
  const MOTIVOS: [string, string][] = [["1", "Erro na emissão"], ["2", ped ? "Venda não realizada" : "Serviço não prestado"], ["9", "Outros"]];
  const T = ped
    ? { titulo: "Corrigir a nota de peças", doc: `Pedido nº ${numeroOS}`, nota: "NF-e", passo2: "Duplicar o pedido", acaoDup: "duplicar", url: "/api/ppv/pedidos/refaturar" }
    : { titulo: "Corrigir a nota de serviço", doc: `OS nº ${numeroOS}`, nota: "NFS-e", passo2: "Duplicar a OS", acaoDup: "duplicar_os", url: `/api/pos/ordens/${encodeURIComponent(osId)}/refaturar` };

  const chamar = async (corpo: Record<string, unknown>): Promise<Resultado> => {
    // o Omie pode demorar: depois de 90 s a janela solta e o resultado aparece no bloco
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 90_000);
    try {
      const r = await fetch(T.url, {
        method: "POST", headers: { ...(await authHeaders()), "Content-Type": "application/json" }, body: JSON.stringify(ped ? { ...corpo, id: ppvId } : corpo), signal: ctl.signal,
      });
      return await r.json().catch(() => ({ ok: false, erro: "Resposta inválida do servidor." }));
    } catch {
      onFeito();
      return { ok: false, erro: "O Omie está demorando e o servidor continua trabalhando. Feche esta janela e confira o bloco de faturamento em 1 minuto — NÃO repita agora." };
    } finally { clearTimeout(t); }
  };
  // trava contra clique duplo: o 2º "cancelar" chegava ao sistema nacional junto com o 1º e voltava "já cancelada" (OS-0596)
  const ocupado = useRef(false);
  const cancelar = async () => {
    if (ocupado.current) return;
    ocupado.current = true;
    try { await cancelarAgora(); } finally { ocupado.current = false; }
  };
  const duplicar = async () => {
    if (ocupado.current) return;
    ocupado.current = true;
    try { await duplicarAgora(); } finally { ocupado.current = false; }
  };
  const cancelarAgora = async () => {
    setEnviando("cancelar");
    const j = await chamar({ acao: "cancelar", motivo, texto });
    setEnviando(null); setRes(j);
    if (j.ok) { setCancelada(true); setEtapa("duplicar"); onFeito(); } else setEtapa("fim");
  };
  const duplicarAgora = async () => {
    setEnviando("duplicar");
    const j = await chamar({ acao: T.acaoDup });
    setEnviando(null); setRes(j); setEtapa("fim");
    if (j.ok) onFeito();
  };

  const btn: React.CSSProperties = { padding: "12px 18px", borderRadius: 10, border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" };
  const passo = (n: number, titulo: string, ativo: boolean, feito: boolean) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
      <span style={{ width: 26, height: 26, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800,
        background: feito ? "#22c55e" : ativo ? "#0f172a" : "#e2e8f0", color: feito || ativo ? "#fefefe" : "#64748b" }}>{feito ? <i className="fas fa-check" /> : n}</span>
      <span style={{ fontSize: 13, fontWeight: ativo ? 800 : 600, color: ativo ? "#0f172a" : "#64748b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{titulo}</span>
    </div>
  );

  return (
    <div onClick={() => !enviando && onFechar()} style={{ position: "fixed", inset: 0, zIndex: 68000, background: "rgba(15,23,42,.55)", backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "6vh 16px", overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fefefe", color: "#1e293b", borderRadius: 16, width: "100%", maxWidth: 580, boxShadow: "0 30px 70px rgba(0,0,0,.35)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "18px 22px", background: "linear-gradient(135deg, #f1f5f9, #fefefe 70%)", borderBottom: "1px solid #e2e8f0" }}>
          <span style={{ width: 44, height: 44, borderRadius: 12, background: "#0f172a", color: "#fefefe", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}><i className="fas fa-file-pen" /></span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 17, fontWeight: 800 }}>{T.titulo}</div>
            <div style={{ fontSize: 12.5, color: "#64748b" }}>{T.doc}{nfse ? ` · ${T.nota} nº ${nfse}` : ""}</div>
          </div>
          <button onClick={onFechar} disabled={!!enviando} title="Fechar" style={{ background: "#fefefe", border: "1px solid #e2e8f0", borderRadius: 10, width: 36, height: 36, cursor: "pointer", color: "#475569", fontSize: 18 }}>×</button>
        </div>
        <div style={{ display: "flex", gap: 10, padding: "14px 22px", borderBottom: "1px solid #f1f5f9" }}>
          {passo(1, `Cancelar a ${T.nota}`, etapa === "cancelar" || etapa === "confirmar", cancelada)}
          <span style={{ width: 24, height: 2, background: "#e2e8f0", alignSelf: "center" }} />
          {passo(2, T.passo2, etapa === "duplicar", etapa === "fim" && !!res?.ok && !!(res.nova || res.novo))}
        </div>

        <div style={{ padding: "18px 22px 22px" }}>
          {enviando ? (
            <div style={{ textAlign: "center", padding: "24px 0" }}>
              <i className="fas fa-spinner fa-spin" style={{ fontSize: 28, color: "#0f172a" }} />
              <div style={{ fontSize: 15, fontWeight: 800, marginTop: 12 }}>{enviando === "cancelar" ? (ped ? "Cancelando o pedido e a NF-e no Omie…" : "Cancelando no sistema nacional…") : (ped ? "Duplicando o pedido no Omie…" : "Duplicando a OS no Omie…")}</div>
              <div style={{ fontSize: 12.5, color: "#64748b", marginTop: 4, marginBottom: 12 }}>Não feche esta janela.</div>
              <Cronometro estimativa={enviando === "cancelar" ? (ped ? 30 : 15) : 60} />
            </div>
          ) : etapa === "cancelar" ? (
            <>
              <div style={{ fontSize: 13.5, color: "#334155", lineHeight: 1.6, marginBottom: 14 }}>
                {ped ? <>
                  O pedido nº {numeroOS} será <b>cancelado no Omie</b>: o Omie cancela a NF-e{nfse ? ` ${nfse}` : ""} na SEFAZ, cancela o título a receber e <b>devolve as peças ao estoque</b>. Depois você escolhe <b>duplicar o pedido</b> para emitir a nota certa.
                  <div style={{ marginTop: 6, color: "#b45309" }}><i className="fas fa-clock" /> A SEFAZ só aceita o cancelamento até 24 h depois da emissão.</div>
                  <div style={{ marginTop: 4, color: "#64748b" }}>A nota de serviço da OS não muda.</div>
                </> : <>
                  A NFS-e{nfse ? ` nº ${nfse}` : ""} será <b>cancelada direto no sistema nacional</b>, com o certificado da empresa. Depois você escolhe <b>duplicar a OS</b> para emitir a nota certa.
                  <div style={{ marginTop: 6, color: "#64748b" }}>O pedido de peças e a NF-e dele não mudam.</div>
                </>}
              </div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 6 }}>Motivo</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                {MOTIVOS.map(([v, t]) => (
                  <button key={v} type="button" onClick={() => setMotivo(v)} style={{ padding: "8px 14px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                    border: motivo === v ? "1.5px solid #0f172a" : "1px solid #cbd5e1", background: motivo === v ? "#0f172a" : "#fefefe", color: motivo === v ? "#fefefe" : "#334155" }}>{t}</button>
                ))}
              </div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 6 }}>{ped ? "Explique (fica no histórico do pedido)" : "Explique (vai para o sistema nacional)"}</label>
              <textarea value={texto} onChange={(e) => setTexto(e.target.value.slice(0, 255))} rows={3} placeholder="Ex.: nota emitida com o valor da hora errado; será emitida uma nova com o valor correto."
                style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10, border: "1px solid #cbd5e1", fontSize: 13.5, fontFamily: "inherit", resize: "vertical", marginBottom: 4 }} />
              <div style={{ fontSize: 11.5, color: textoOk ? "#64748b" : "#b45309", marginBottom: 14 }}>{texto.trim().length}/255 · mínimo 15 letras</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setEtapa("confirmar")} disabled={!textoOk} style={{ ...btn, flex: 1, background: textoOk ? "#dc2626" : "#94a3b8", color: "#fefefe", cursor: textoOk ? "pointer" : "not-allowed" }}>Continuar</button>
                <button onClick={onFechar} style={{ ...btn, background: "#f1f5f9", color: "#334155" }}>Voltar</button>
              </div>
            </>
          ) : etapa === "confirmar" ? (
            <>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 16 }}>
                <span style={{ width: 42, height: 42, borderRadius: 12, flexShrink: 0, background: "#fee2e2", color: "#dc2626", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}><i className="fas fa-triangle-exclamation" /></span>
                <div>
                  <div style={{ fontSize: 16.5, fontWeight: 800 }}>Cancelar a {T.nota}{nfse ? ` nº ${nfse}` : ""}?</div>
                  <div style={{ fontSize: 13, color: "#475569", marginTop: 4, lineHeight: 1.55 }}>O cancelamento {ped ? "na SEFAZ" : "no sistema nacional"} <b>não pode ser desfeito</b>.</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={cancelar} style={{ ...btn, flex: 1, background: "#dc2626", color: "#fefefe" }}><i className="fas fa-ban" /> Sim, cancelar a nota</button>
                <button onClick={() => setEtapa("cancelar")} style={{ ...btn, background: "#f1f5f9", color: "#334155" }}>Voltar</button>
              </div>
            </>
          ) : etapa === "duplicar" ? (
            <>
              <div style={{ borderRadius: 12, padding: "12px 14px", background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#14532d", fontSize: 13.5, marginBottom: 14 }}>
                <b><i className="fas fa-circle-check" /> {T.nota}{nfse ? ` ${nfse}` : ""} cancelada{ped ? " (pedido cancelado no Omie)" : " no sistema nacional"}.</b>
              </div>
              <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 6 }}>Próximo passo: {ped ? `duplicar o pedido ${numeroOS}` : `duplicar a OS ${numeroOS}`}</div>
              <div style={{ fontSize: 13.5, color: "#334155", lineHeight: 1.6 }}>Ao duplicar:</div>
              {ped ? (
                <ul style={{ margin: "6px 0 14px 18px", padding: 0, fontSize: 13.5, color: "#334155", lineHeight: 1.65 }}>
                  <li>o Omie cria um <b>pedido novo</b> com as mesmas peças (se a cópia já existir, ela é usada), com consumo final e CST 60;</li>
                  <li>o pedido novo fica ligado à OS (nº do pedido do cliente);</li>
                  <li>este PPV passa a apontar para o pedido novo e volta para <b>Enviado Omie</b>: ajuste o que precisar e <b>fature de novo</b>.</li>
                </ul>
              ) : (
                <ul style={{ margin: "6px 0 14px 18px", padding: 0, fontSize: 13.5, color: "#334155", lineHeight: 1.65 }}>
                  <li>o Omie cria uma <b>OS nova</b> com os mesmos serviços (se a cópia já existir, ela é usada);</li>
                  <li>a OS {numeroOS} é <b>cancelada no Omie</b> e o título a receber{valor ? ` de ${brl(valor)}` : ""} sai do financeiro;</li>
                  <li>esta OS do portal passa a apontar para a nova e volta para <b>Cobrando Cliente</b>: ajuste o que precisar e <b>fature de novo</b>;</li>
                  <li>o pedido de peças e a NF-e dele continuam iguais.</li>
                </ul>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={duplicar} style={{ ...btn, flex: 1, background: "#0369A1", color: "#fefefe", boxShadow: "0 6px 14px rgba(3,105,161,.3)" }}><i className="fas fa-clone" /> {T.passo2}</button>
                <button onClick={onFechar} style={{ ...btn, background: "#f1f5f9", color: "#334155" }}>Depois</button>
              </div>
            </>
          ) : (
            <>
              <div style={{ borderRadius: 12, padding: "14px 16px", fontSize: 13.5, lineHeight: 1.55, marginBottom: 14,
                background: res?.ok ? "#f0fdf4" : "#fef2f2", border: `1px solid ${res?.ok ? "#bbf7d0" : "#fecaca"}`, color: res?.ok ? "#14532d" : "#7f1d1d" }}>
                {res?.ok && (res.nova || res.novo) ? (
                  ped ? (
                    <>
                      <div style={{ fontWeight: 800, marginBottom: 4 }}><i className="fas fa-circle-check" /> Pronto: pedido novo nº {res.novo}</div>
                      <div>O pedido {res.antigo} ficou cancelado. Este PPV voltou para <b>Enviado Omie</b> — ajuste o que precisar e fature de novo.</div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontWeight: 800, marginBottom: 4 }}><i className="fas fa-circle-check" /> Pronto: OS nova nº {res.nova}</div>
                      <div>A OS {res.antiga} foi cancelada no Omie. Esta OS voltou para <b>Cobrando Cliente</b> — ajuste o que precisar e fature de novo.</div>
                    </>
                  )
                ) : (
                  <><div style={{ fontWeight: 800, marginBottom: 4 }}><i className="fas fa-triangle-exclamation" /> Não concluiu</div>{res?.erro}</>
                )}
              </div>
              {(res?.avisos || []).map((a) => <div key={a} style={{ fontSize: 12.5, color: "#92400e", background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 10, padding: "8px 12px", marginBottom: 8 }}>{a}</div>)}
              <div style={{ display: "flex", gap: 8 }}>
                {!res?.ok && cancelada && <button onClick={() => setEtapa("duplicar")} style={{ ...btn, flex: 1, background: "#0369A1", color: "#fefefe" }}>Tentar {ped ? "duplicar o pedido" : "duplicar"} de novo</button>}
                <button onClick={onFechar} style={{ ...btn, flex: cancelada && !res?.ok ? undefined : 1, background: "#334155", color: "#fefefe" }}>Fechar</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Cronometro({ estimativa }: { estimativa: number }) {
  const segundos = useSegundos();
  return <CronometroEstimado segundos={segundos} estimativa={estimativa} cor="#0f172a" />;
}
