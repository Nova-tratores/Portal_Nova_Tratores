"use client";

// Bloco "Cheque de revisão" na OS (abaixo do Plano de Revisão). Mostra o
// estado do cheque, deixa editar os dados, abre/imprime o cheque, manda o
// link de assinatura pro cliente por WhatsApp e mostra a assinatura quando
// chega. Tudo via /api/pos/ordens/[id]/cheque.
//
// Abaixo do cheque principal fica "Revisões anteriores": as revisões que
// vieram antes da desta OS e nunca tiveram cheque enviado podem ser geradas
// daqui (cheque ATRASADO, prop `horas`) — com os dados da OS daquela revisão
// quando ela existe, senão com data/horímetro em branco pra preencher.
import { useCallback, useEffect, useState } from "react";
import { authHeaders } from "@/lib/auth/client";
import { CAMPOS_CHEQUE, HORAS_CHEQUE, type DadosCheque, type RevisaoAnterior } from "@/lib/revisoes/cheque";

interface Cheque {
  id: string; os_id: string; chassis: string; horas: number; pagina: number | null; dados: DadosCheque; token: string;
  assinatura_cliente_url: string | null; assinado_em: string | null; assinado_nome: string | null; assinatura_tecnico_url: string | null;
  assinado_ip?: string | null;
  assinado_geo?: { lat: number; lng: number; precisao_m?: number | null } | null;
  assinado_dispositivo?: { modelo?: string | null; plataforma?: string | null; versao?: string | null } | null;
  atrasado?: boolean; os_ref?: string | null;
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

const box: React.CSSProperties = { border: "1px solid #f1b6a9", borderLeft: "5px solid #E8462B", background: "#fff7f5", borderRadius: 8, padding: "10px 12px", marginBottom: 12, fontSize: 13 };
const btn: React.CSSProperties = { padding: "6px 10px", fontSize: 12, fontWeight: 700, borderRadius: 6, border: "1px solid #E8462B", background: "#fff", color: "#E8462B", cursor: "pointer" };
const btnCheio: React.CSSProperties = { ...btn, background: "#E8462B", color: "#fff" };
const inp: React.CSSProperties = { width: "100%", padding: "5px 7px", fontSize: 12, border: "1px solid #d1d5db", borderRadius: 5 };

/**
 * `horas` ausente = cheque PRINCIPAL da OS (cria na 1ª vez e mostra as
 * revisões anteriores). `horas` presente = cheque ATRASADO daquelas horas.
 */
export default function ChequeRevisaoBloco({ osId, podeEditar, horas: horasAlvo, aoApagar }: { osId: string; podeEditar: boolean; horas?: number; aoApagar?: () => void }) {
  const [r, setR] = useState<Resp | null>(null);
  const [erro, setErro] = useState("");
  const [codigo, setCodigo] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState<DadosCheque | null>(null);
  const [horas, setHoras] = useState<number>(0);
  const [salvando, setSalvando] = useState(false);
  const url = `/api/pos/ordens/${encodeURIComponent(osId)}/cheque${horasAlvo ? `?h=${horasAlvo}` : ""}`;

  const carregar = useCallback(async () => {
    setCarregando(true); setErro(""); setCodigo("");
    try {
      const res = await fetch(url, { headers: await authHeaders() });
      const j = await res.json();
      if (!res.ok) { setCodigo(j.codigo || ""); throw new Error(j.error || "falha ao carregar o cheque"); }
      setR(j); setForm(j.cheque.dados); setHoras(j.cheque.horas);
    } catch (e) { setErro(e instanceof Error ? e.message : "erro"); } finally { setCarregando(false); }
  }, [url]);
  useEffect(() => { carregar(); }, [carregar]);

  const patch = async (body: Record<string, unknown>) => {
    setSalvando(true); setErro("");
    try {
      const res = await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json", ...(await authHeaders()) }, body: JSON.stringify(body) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "falha ao salvar");
      setR(j); setForm(j.cheque.dados); setHoras(j.cheque.horas); setEditando(false);
    } catch (e) { setErro(e instanceof Error ? e.message : "erro"); } finally { setSalvando(false); }
  };

  const apagar = async () => {
    if (!horasAlvo || !confirm(`Apagar o cheque atrasado das ${horasAlvo} horas? (dá pra gerar de novo depois)`)) return;
    setSalvando(true); setErro("");
    try {
      const res = await fetch(`/api/pos/ordens/${encodeURIComponent(osId)}/cheque`, { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) }, body: JSON.stringify({ acao: "apagar_atrasado", horas: horasAlvo }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "falha ao apagar");
      aoApagar?.();
    } catch (e) { setErro(e instanceof Error ? e.message : "erro"); } finally { setSalvando(false); }
  };

  if (carregando) return <div style={box}>Cheque de revisão{horasAlvo ? ` das ${horasAlvo} horas` : ""}: carregando…</div>;
  if (!r) {
    return (
      <div style={box}>
        <b style={{ color: "#E8462B" }}>Cheque de revisão</b> — <span style={{ color: "#991b1b" }}>{erro}</span>
        {codigo === "tabela_ausente" && <div style={{ fontSize: 12, color: "#6b7280" }}>Falta aplicar a migration sql/revisao-cheques.sql no Supabase.</div>}
        {codigo === "nao_e_revisao" && <div style={{ fontSize: 12, color: "#6b7280" }}>Escolha o Plano de Revisão (ou escreva &quot;Revisão de N horas&quot; na solicitação) e salve a OS.</div>}
        {codigo === "sem_chassi" && <div style={{ fontSize: 12, color: "#6b7280" }}>Coloque o chassi no Projeto da OS e salve.</div>}
        {codigo === "nao_mahindra" && <div style={{ fontSize: 12, color: "#6b7280" }}>Confira o chassi no cadastro de tratores (tela Revisões) — pode estar com erro de digitação (ex.: &quot;V5&quot; no lugar de &quot;VS&quot;).</div>}
        <div style={{ marginTop: 6 }}><button type="button" style={btn} onClick={carregar}>Tentar de novo</button></div>
      </div>
    );
  }

  const c = r.cheque;
  const assinado = !!c.assinado_em;
  const atrasado = !!horasAlvo;
  const faltaDados = atrasado && (!c.dados.dataRevisao || !c.dados.horimetro);

  return (
    <div style={atrasado ? { ...box, background: "#fffaf0", borderColor: "#f5d0a9", borderLeftColor: "#d97706" } : box}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <b style={{ color: atrasado ? "#b45309" : "#E8462B" }}>{atrasado ? "Cheque ATRASADO das" : "Cheque de revisão das"} {c.horas} horas</b>
        <span style={{ color: "#6b7280", fontSize: 12 }}>
          página {c.pagina ?? "—"} do talão · chassi {c.chassis}
          {atrasado && (c.os_ref ? ` · dados da ${c.os_ref}` : " · sem OS daquela revisão")}
        </span>
        <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: assinado ? "#047857" : "#b45309", background: assinado ? "#ecfdf5" : "#fffbeb", border: `1px solid ${assinado ? "#a7f3d0" : "#fde68a"}`, borderRadius: 999, padding: "2px 10px" }}>
          {assinado ? `Assinado pelo cliente em ${fmt(c.assinado_em)}` : "Aguardando assinatura do cliente"}
        </span>
      </div>
      {faltaDados && (
        <div style={{ fontSize: 12, color: "#92400E", background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 6, padding: "5px 8px", marginTop: 6 }}>
          Não achei OS dessa revisão pra este chassi: preencha a <b>data da revisão</b>, o <b>horímetro</b> e a <b>OS</b> em &quot;Editar dados&quot; antes de mandar pra Mahindra.
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
        <a href={r.linkCheque} target="_blank" rel="noreferrer" style={{ ...btnCheio, textDecoration: "none" }}>Abrir cheque / PDF</a>
        {podeEditar && <button type="button" style={btn} onClick={() => setEditando((v) => !v)}>{editando ? "Fechar edição" : "Editar dados"}</button>}
        {podeEditar && <button type="button" style={btn} disabled={salvando} onClick={() => { if (confirm(`Refazer os dados do cheque a partir da ${atrasado && c.os_ref ? c.os_ref : "OS"} e do cadastro do trator? As edições manuais serão perdidas.`)) patch({ acao: "repreencher" }); }}>Refazer da OS</button>}
        {podeEditar && atrasado && <button type="button" style={{ ...btn, marginLeft: "auto", borderColor: "#9ca3af", color: "#6b7280" }} disabled={salvando} onClick={apagar}>Apagar</button>}
      </div>
      {!assinado && !atrasado && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>A assinatura do cliente é pedida no bloco &quot;Assinatura do cliente&quot; logo abaixo (o mesmo link vale pra qualquer serviço) e entra no cheque automaticamente.</div>}
      {atrasado && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>Este cheque usa a assinatura do cliente desta OS{c.os_ref ? ` (ou da ${c.os_ref}, se ele assinou lá)` : ""}. Na tela Revisões ele aparece na revisão de {c.horas}h deste chassi, pronto pra anexar.</div>}

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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(220px, 100%), 1fr))", gap: 8 }}>
            {!atrasado && (
              <label style={{ fontSize: 11, color: "#374151" }}>Revisão
                <select value={horas} onChange={(e) => setHoras(Number(e.target.value))} style={inp}>
                  {HORAS_CHEQUE.map((h) => <option key={h} value={h}>{h} horas</option>)}
                </select>
              </label>
            )}
            {CAMPOS_CHEQUE.map(({ chave, rotulo }) => (
              <label key={chave} style={{ fontSize: 11, color: "#374151" }}>{rotulo}
                <input value={form[chave]} onChange={(e) => setForm({ ...form, [chave]: e.target.value })} style={{ ...inp, ...(atrasado && !form[chave] && ["dataRevisao", "horimetro", "os"].includes(chave) ? { borderColor: "#f59e0b", background: "#fffbeb" } : {}) }} />
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

      {!atrasado && <RevisoesAnteriores osId={osId} podeEditar={podeEditar} horasAtual={c.horas} />}
    </div>
  );
}

/** Revisões anteriores à da OS: enviada ✓ / cheque existente / pendente → "Gerar cheque". */
function RevisoesAnteriores({ osId, podeEditar, horasAtual }: { osId: string; podeEditar: boolean; horasAtual: number }) {
  const [lista, setLista] = useState<RevisaoAnterior[] | null>(null);
  const [erro, setErro] = useState("");
  const [gerando, setGerando] = useState<number | null>(null);
  const [versao, setVersao] = useState(0);

  const carregar = useCallback(async () => {
    setErro("");
    try {
      const res = await fetch(`/api/pos/ordens/${encodeURIComponent(osId)}/cheque?anteriores=1`, { headers: await authHeaders() });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "falha ao listar as revisões anteriores");
      setLista(j.anteriores || []);
    } catch (e) { setErro(e instanceof Error ? e.message : "erro"); setLista([]); }
  }, [osId]);
  useEffect(() => { carregar(); }, [carregar, horasAtual]);

  const gerar = async (h: number) => {
    setGerando(h); setErro("");
    try {
      const res = await fetch(`/api/pos/ordens/${encodeURIComponent(osId)}/cheque`, { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) }, body: JSON.stringify({ acao: "gerar_atrasado", horas: h }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "falha ao gerar");
      await carregar(); setVersao((v) => v + 1);
    } catch (e) { setErro(e instanceof Error ? e.message : "erro"); } finally { setGerando(null); }
  };

  if (!lista || lista.length === 0) return null;
  const pendentes = lista.filter((a) => a.situacao === "pendente");
  const atrasadosDaqui = lista.filter((a) => a.situacao === "cheque" && a.chequeOsId === osId);

  return (
    <div style={{ marginTop: 12, borderTop: "1px dashed #f1b6a9", paddingTop: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <b style={{ color: "#374151", fontSize: 12.5 }}>Revisões anteriores deste trator</b>
        {pendentes.length > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: "#b45309", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 999, padding: "1px 8px" }}>{pendentes.length} sem cheque enviado</span>}
        {pendentes.length === 0 && <span style={{ fontSize: 11, color: "#047857" }}>todas com cheque ✓</span>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
        {lista.map((a) => (
          <div key={a.horas} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 12, padding: "4px 8px", background: "#fff", border: "1px solid #f3e8e4", borderRadius: 6 }}>
            <b style={{ width: 60 }}>{a.horas} h</b>
            {a.situacao === "enviada" && <span style={{ color: "#047857" }}>✓ cheque já enviado pra Mahindra</span>}
            {a.situacao === "cheque" && a.chequeOsId === osId && <span style={{ color: "#b45309" }}>cheque atrasado gerado nesta OS (abaixo)</span>}
            {a.situacao === "cheque" && a.chequeOsId !== osId && <span style={{ color: "#1d4ed8" }}>cheque gerado na {a.chequeOsId} — ainda não enviado</span>}
            {a.situacao === "pendente" && (
              <>
                <span style={{ color: "#991b1b" }}>sem cheque{a.osRef ? ` — achei a ${a.osRef.id}${a.osRef.data ? ` de ${a.osRef.data}` : ""}${a.osRef.horimetro ? `, ${a.osRef.horimetro}` : ""}` : " — não achei OS dessa revisão (vai sair com data/horímetro pra preencher)"}</span>
                {podeEditar && (
                  <button type="button" style={{ ...btn, marginLeft: "auto", padding: "4px 9px" }} disabled={gerando !== null} onClick={() => gerar(a.horas)}>
                    {gerando === a.horas ? "Gerando…" : `Gerar cheque das ${a.horas} h`}
                  </button>
                )}
              </>
            )}
          </div>
        ))}
      </div>
      {erro && <div style={{ color: "#991b1b", fontSize: 12, marginTop: 6 }}>{erro}</div>}
      {atrasadosDaqui.length > 0 && (
        <div style={{ marginTop: 10 }}>
          {atrasadosDaqui.map((a) => (
            <ChequeRevisaoBloco key={`${a.horas}-${versao}`} osId={osId} podeEditar={podeEditar} horas={a.horas} aoApagar={() => { carregar(); setVersao((v) => v + 1); }} />
          ))}
        </div>
      )}
    </div>
  );
}
