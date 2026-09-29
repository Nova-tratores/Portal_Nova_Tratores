"use client";

// Bloco "Cheque de revisão" na OS (abaixo do Plano de Revisão). Mostra o
// estado do cheque, deixa editar os dados, abre/imprime o cheque, manda o
// link de assinatura pro cliente por WhatsApp e mostra a assinatura quando
// chega. Tudo via /api/pos/ordens/[id]/cheque.
import { useCallback, useEffect, useState } from "react";
import { authHeaders } from "@/lib/auth/client";
import { CAMPOS_CHEQUE, HORAS_CHEQUE, type DadosCheque } from "@/lib/revisoes/cheque";

interface Cheque {
  id: string; os_id: string; chassis: string; horas: number; pagina: number | null; dados: DadosCheque; token: string;
  assinatura_cliente_url: string | null; assinado_em: string | null; assinado_nome: string | null; assinatura_tecnico_url: string | null;
  assinado_ip?: string | null;
  assinado_geo?: { lat: number; lng: number; precisao_m?: number | null } | null;
  assinado_dispositivo?: { modelo?: string | null; plataforma?: string | null; versao?: string | null } | null;
}

/** Linha-resumo da prova da assinatura: quem, quando, onde, em qual aparelho. */
export function ProvaAssinatura({ c }: { c: Pick<Cheque, "assinado_em" | "assinado_nome" | "assinado_ip" | "assinado_geo" | "assinado_dispositivo"> }) {
  if (!c.assinado_em) return null;
  const g = c.assinado_geo, d = c.assinado_dispositivo;
  const aparelho = d ? [d.modelo, d.plataforma && d.versao ? `${d.plataforma} ${d.versao}` : d.plataforma].filter(Boolean).join(" · ") : "";
  return (
    <div style={{ fontSize: 11, color: "#4b5563", lineHeight: 1.5 }}>
      <div><b>Assinado por</b> {c.assinado_nome || "—"} <b>em</b> {new Date(c.assinado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}{c.assinado_ip ? ` · IP ${c.assinado_ip}` : ""}</div>
      <div>
        <b>Local:</b>{" "}
        {g ? <a href={`https://www.google.com/maps?q=${g.lat},${g.lng}`} target="_blank" rel="noreferrer" style={{ color: "#1d4ed8", textDecoration: "underline" }}>{g.lat.toFixed(5)}, {g.lng.toFixed(5)}{g.precisao_m ? ` (±${g.precisao_m} m)` : ""}</a> : <span style={{ color: "#b45309" }}>não informado</span>}
        {" · "}<b>Aparelho:</b> {aparelho || <span style={{ color: "#b45309" }}>não informado</span>}
      </div>
    </div>
  );
}
interface Resp { cheque: Cheque; linkCheque: string; linkAssinar: string; mensagemWhatsApp: string; assinaturaTecnicoUrl: string | null; }

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "");

export default function ChequeRevisaoBloco({ osId, podeEditar }: { osId: string; podeEditar: boolean }) {
  const [r, setR] = useState<Resp | null>(null);
  const [erro, setErro] = useState("");
  const [codigo, setCodigo] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState<DadosCheque | null>(null);
  const [horas, setHoras] = useState<number>(0);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro(""); setCodigo("");
    try {
      const res = await fetch(`/api/pos/ordens/${encodeURIComponent(osId)}/cheque`, { headers: await authHeaders() });
      const j = await res.json();
      if (!res.ok) { setCodigo(j.codigo || ""); throw new Error(j.error || "falha ao carregar o cheque"); }
      setR(j); setForm(j.cheque.dados); setHoras(j.cheque.horas);
    } catch (e) { setErro(e instanceof Error ? e.message : "erro"); } finally { setCarregando(false); }
  }, [osId]);
  useEffect(() => { carregar(); }, [carregar]);

  const patch = async (body: Record<string, unknown>) => {
    setSalvando(true); setErro("");
    try {
      const res = await fetch(`/api/pos/ordens/${encodeURIComponent(osId)}/cheque`, { method: "PATCH", headers: { "Content-Type": "application/json", ...(await authHeaders()) }, body: JSON.stringify(body) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "falha ao salvar");
      setR(j); setForm(j.cheque.dados); setHoras(j.cheque.horas); setEditando(false);
    } catch (e) { setErro(e instanceof Error ? e.message : "erro"); } finally { setSalvando(false); }
  };

  const box: React.CSSProperties = { border: "1px solid #f1b6a9", borderLeft: "5px solid #E8462B", background: "#fff7f5", borderRadius: 8, padding: "10px 12px", marginBottom: 12, fontSize: 13 };
  const btn: React.CSSProperties = { padding: "6px 10px", fontSize: 12, fontWeight: 700, borderRadius: 6, border: "1px solid #E8462B", background: "#fff", color: "#E8462B", cursor: "pointer" };
  const btnCheio: React.CSSProperties = { ...btn, background: "#E8462B", color: "#fff" };
  const inp: React.CSSProperties = { width: "100%", padding: "5px 7px", fontSize: 12, border: "1px solid #d1d5db", borderRadius: 5 };

  if (carregando) return <div style={box}>Cheque de revisão: carregando…</div>;
  if (!r) {
    return (
      <div style={box}>
        <b style={{ color: "#E8462B" }}>Cheque de revisão</b> — <span style={{ color: "#991b1b" }}>{erro}</span>
        {codigo === "tabela_ausente" && <div style={{ fontSize: 12, color: "#6b7280" }}>Falta aplicar a migration sql/revisao-cheques.sql no Supabase.</div>}
        {codigo === "nao_e_revisao" && <div style={{ fontSize: 12, color: "#6b7280" }}>Escolha o Plano de Revisão (ou escreva &quot;Revisão de N horas&quot; na solicitação) e salve a OS.</div>}
        {codigo === "sem_chassi" && <div style={{ fontSize: 12, color: "#6b7280" }}>Coloque o chassi no Projeto da OS e salve.</div>}
        <div style={{ marginTop: 6 }}><button type="button" style={btn} onClick={carregar}>Tentar de novo</button></div>
      </div>
    );
  }

  const c = r.cheque;
  const assinado = !!c.assinado_em;

  return (
    <div style={box}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <b style={{ color: "#E8462B" }}>Cheque de revisão das {c.horas} horas</b>
        <span style={{ color: "#6b7280", fontSize: 12 }}>página {c.pagina ?? "—"} do talão · chassi {c.chassis}</span>
        <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: assinado ? "#047857" : "#b45309", background: assinado ? "#ecfdf5" : "#fffbeb", border: `1px solid ${assinado ? "#a7f3d0" : "#fde68a"}`, borderRadius: 999, padding: "2px 10px" }}>
          {assinado ? `Assinado pelo cliente em ${fmt(c.assinado_em)}` : "Aguardando assinatura do cliente"}
        </span>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
        <a href={r.linkCheque} target="_blank" rel="noreferrer" style={{ ...btnCheio, textDecoration: "none" }}>Abrir cheque / PDF</a>
        {podeEditar && <button type="button" style={btn} onClick={() => setEditando((v) => !v)}>{editando ? "Fechar edição" : "Editar dados"}</button>}
        {podeEditar && <button type="button" style={btn} disabled={salvando} onClick={() => { if (confirm("Refazer os dados do cheque a partir da OS e do cadastro do trator? As edições manuais serão perdidas.")) patch({ acao: "repreencher" }); }}>Refazer da OS</button>}
      </div>
      {!assinado && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>A assinatura do cliente é pedida no bloco &quot;Assinatura do cliente&quot; logo abaixo (o mesmo link vale pra qualquer serviço) e entra no cheque automaticamente.</div>}

      {(assinado || r.assinaturaTecnicoUrl) && (
        <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap" }}>
          {assinado && c.assinatura_cliente_url && (
            <div style={{ textAlign: "center" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.assinatura_cliente_url} alt="Assinatura do cliente" style={{ height: 56, maxWidth: 220, objectFit: "contain", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 6, padding: 4 }} />
              <div style={{ fontSize: 11, color: "#6b7280" }}>Cliente{c.assinado_nome ? ` · ${c.assinado_nome}` : ""}</div>
            </div>
          )}
          {assinado && <div style={{ flexBasis: "100%" }}><ProvaAssinatura c={c} /></div>}
          {r.assinaturaTecnicoUrl && (
            <div style={{ textAlign: "center" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={r.assinaturaTecnicoUrl} alt="Assinatura do técnico" style={{ height: 56, maxWidth: 220, objectFit: "contain", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 6, padding: 4 }} />
              <div style={{ fontSize: 11, color: "#6b7280" }}>Técnico · {c.dados.tecnico}</div>
            </div>
          )}
        </div>
      )}

      {editando && form && (
        <div style={{ marginTop: 10, padding: 10, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 6 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 }}>
            <label style={{ fontSize: 11, color: "#374151" }}>Revisão
              <select value={horas} onChange={(e) => setHoras(Number(e.target.value))} style={inp}>
                {HORAS_CHEQUE.map((h) => <option key={h} value={h}>{h} horas</option>)}
              </select>
            </label>
            {CAMPOS_CHEQUE.map(({ chave, rotulo }) => (
              <label key={chave} style={{ fontSize: 11, color: "#374151" }}>{rotulo}
                <input value={form[chave]} onChange={(e) => setForm({ ...form, [chave]: e.target.value })} style={inp} />
              </label>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button type="button" style={btnCheio} disabled={salvando} onClick={() => patch({ dados: form, horas })}>{salvando ? "Salvando…" : "Salvar dados do cheque"}</button>
            <button type="button" style={btn} onClick={() => { setEditando(false); setForm(c.dados); setHoras(c.horas); }}>Cancelar</button>
          </div>
        </div>
      )}

      {erro && <div style={{ color: "#991b1b", fontSize: 12, marginTop: 6 }}>{erro}</div>}
    </div>
  );
}
