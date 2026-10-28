"use client";
// Radar de tratores dentro da OS de revisão (José, 27/10/2026: "liga lá no bloco de revisões no POS"
// e "espelhar essas informações e a localização do trator"). Fica no bloco do cheque de revisão: se o
// chassi da OS é de um trator novo vendido, mostra a entrega técnica e o certificado da Mahindra
// (motor, bomba, horas na entrega, pagamento, PDFs), onde o trator fica (mapa + Google Maps), as
// ligações dos 30/60/90 dias e, na OS da 50 h, a previsão da 300 h (dias da entrega até a 50 h × 6).
// Dados: GET /api/revisoes/vendidos/da-os.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { authHeaders } from "@/lib/auth/client";
import MapaLocais, { type PontoMapa } from "@/components/comum/MapaLocais";
import { previsao300, ROTULO_RESULTADO, type Contato, type Revisao50 } from "@/lib/revisoes/contatos-radar";
import type { CertificadoResumo } from "@/lib/mahindra/portal-dealer-server";
import { pdfDoCertificado } from "@/lib/mahindra/certificados";
import VisualizadorDocumento, { type DocumentoVisualizavel } from "@/components/comum/VisualizadorDocumento";

interface Resp {
  horasOS: number | null;
  trator: {
    chave: string; modelo: string; cliente: string | null; dataVenda: string; dias: number;
    entrega: { data: string; origem: "mahindra" | "nota"; dias: number };
    revisao50: Revisao50 | null; previsao300: { diasAte50: number; horasDia: number; data300: string; diasFaltam: number } | null;
    certificado: CertificadoResumo | null;
    locais: PontoMapa[]; endereco: string | null;
  } | null;
  contatos: Contato[];
}

const dataBR = (iso: string | null | undefined) => (iso ? new Date(iso.slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR") : "—");
const hojeISO = () => new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
const linha: React.CSSProperties = { display: "flex", gap: 6, flexWrap: "wrap", fontSize: 12.5, color: "#374151" };
const rot: React.CSSProperties = { color: "#6b7280", minWidth: 120 };

export default function RadarTratorOS({ osId }: { osId: string }) {
  const [r, setR] = useState<Resp | null>(null);
  const [verMapa, setVerMapa] = useState(true);
  const [doc, setDoc] = useState<DocumentoVisualizavel | null>(null);
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const res = await fetch(`/api/revisoes/vendidos/da-os?os=${encodeURIComponent(osId)}`, { headers: await authHeaders() });
        const j = await res.json();
        if (vivo && res.ok && j.ok) setR(j);
      } catch { /* sem radar: o bloco não aparece */ }
    })();
    return () => { vivo = false; };
  }, [osId]);

  const t = r?.trator;
  if (!t) return null;
  const c = t.certificado;
  const ult = r.contatos[0];
  const desta50 = r.horasOS === 50;
  // OS da 50 h ainda aberta: quando seria a 300 h se ela for concluída hoje
  const seHoje = desta50 && !t.revisao50?.feita ? previsao300(t.entrega.data, hojeISO(), hojeISO()) : null;

  return (
    <div style={{ marginTop: 12, borderTop: "1px dashed #c7d2fe", paddingTop: 10, display: "grid", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <b style={{ color: "#1d4ed8", fontSize: 12.5 }}>Radar de tratores novos · {t.modelo}</b>
        <a href="/feedbacks/tratores" target="_blank" rel="noreferrer" style={{ marginLeft: "auto", fontSize: 12, color: "#1d4ed8" }}>ver no radar</a>
      </div>

      <div style={{ display: "grid", gap: 3 }}>
        <div style={linha}><span style={rot}>Entrega técnica</span>
          {t.entrega.origem === "mahindra"
            ? <b>{dataBR(t.entrega.data)}{c?.responsavel ? ` · ${c.responsavel}` : ""}{c?.horasEntrega != null ? ` · ${c.horasEntrega} h` : ""} · {t.entrega.dias} dias com o cliente</b>
            : <span style={{ color: "#b45309" }}>sem certificado no portal da Mahindra — contando da nota de {dataBR(t.dataVenda)}</span>}
        </div>
        <div style={linha}><span style={rot}>Venda (nota)</span><span>{dataBR(t.dataVenda)} · {t.dias} dias</span></div>
        {c && (c.motor || c.bombaInjetora) && <div style={linha}><span style={rot}>Motor · bomba</span><span style={{ fontFamily: "monospace" }}>{c.motor || "—"} · {c.bombaInjetora || "—"}</span></div>}
        {c?.banco && <div style={linha}><span style={rot}>Pagamento</span><span>{c.banco}{c.linhaCredito && c.linhaCredito !== "N/A" ? ` · ${c.linhaCredito}` : ""}</span></div>}
        {c && (
          <div style={linha}><span style={rot}>Certificado Mahindra</span>
            <a href={c.link} target="_blank" rel="noreferrer" style={{ color: "#1d4ed8" }}>nº {c.itemId} ({c.status || "—"})</a>
          </div>
        )}
        {c && c.documentos.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
            {c.documentos.map((d) => {
              const principal = d === pdfDoCertificado(c.documentos);
              return (
                <button key={d.url} type="button" onClick={() => setDoc({ titulo: `${d.tipo} · ${t.modelo}`, url: d.url, nome: `${d.tipo} ${c.chassi.slice(-6)}` })}
                  style={{ fontSize: 12, padding: "5px 10px", borderRadius: 6, cursor: "pointer", border: `1px solid ${principal ? "#1d4ed8" : "#d1d5db"}`, background: principal ? "#1d4ed8" : "#fff", color: principal ? "#fff" : "#374151" }}>
                  <i className="fas fa-file-pdf" /> {/certificado/i.test(d.tipo) ? "Certificado de garantia" : d.tipo}
                </button>
              );
            })}
          </div>
        )}
        <div style={linha}><span style={rot}>Ligações</span>
          <span>{r.contatos.length > 0
            ? `${r.contatos.length} (última: ${ROTULO_RESULTADO[ult.resultado].toLowerCase()} em ${new Date(ult.criado_em).toLocaleDateString("pt-BR")}${ult.user_nome ? ` por ${ult.user_nome}` : ""})`
            : "nenhuma registrada"}</span>
        </div>
      </div>

      {t.previsao300 && (
        <div style={{ padding: "8px 10px", borderRadius: 8, background: "#ecfdf5", border: "1px solid #a7f3d0", fontSize: 12.5, color: "#065f46" }}>
          Revisão de 300 h prevista para <b>{dataBR(t.previsao300.data300)}</b>
          {t.previsao300.diasFaltam >= 0 ? ` (daqui a ${t.previsao300.diasFaltam} dias)` : ` (passou há ${-t.previsao300.diasFaltam} dias)`}
          {" — "}levou {t.previsao300.diasAte50} dias da entrega até a 50 h, ≈ {String(t.previsao300.horasDia).replace(".", ",")} h por dia.
        </div>
      )}
      {seHoje && (
        <div style={{ padding: "8px 10px", borderRadius: 8, background: "#eff6ff", border: "1px solid #bfdbfe", fontSize: 12.5, color: "#1e3a8a" }}>
          Quando esta 50 h for concluída, o radar calcula a 300 h pelo tempo desde a entrega.
          Se concluir hoje ({seHoje.diasAte50} dias de uso, ≈ {String(seHoje.horasDia).replace(".", ",")} h por dia), a 300 h fica para <b>{dataBR(seHoje.data300)}</b>.
        </div>
      )}

      <div>
        <button type="button" onClick={() => setVerMapa((v) => !v)} style={{ fontSize: 12, padding: "4px 10px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer" }}>
          {verMapa ? "Esconder" : "Mostrar"} onde o trator fica
        </button>
        {verMapa && <div style={{ marginTop: 8 }}><MapaLocais locais={t.locais} endereco={t.endereco} altura={220} /></div>}
      </div>
      {doc && createPortal(<div style={{ position: "relative", zIndex: 90000 }} onClick={(e) => e.stopPropagation()}><VisualizadorDocumento key={doc.url} doc={doc} onClose={() => setDoc(null)} /></div>, document.body)}
    </div>
  );
}
