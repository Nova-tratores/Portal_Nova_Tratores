"use client";
import { useEffect, useState } from "react";
import ClienteAutocomplete from "./ClienteAutocomplete";
import ProjetoAutocomplete from "./ProjetoAutocomplete";
import TecnicoSelect from "./TecnicoSelect";
import StarsRating from "./StarsRating";
import { inserirRegistro, atualizarRegistro } from "@/lib/feedbacks/api";
import type {
  FeedbackRegistro, Melhoria, NPS, PrioridadeRFM, StatusCliente, TipoFeedback,
} from "@/lib/feedbacks/types";

interface Props {
  tipo: TipoFeedback;
  aberto: boolean;
  registro?: FeedbackRegistro | null;   // null/undefined = novo
  prefill?: Partial<FeedbackRegistro>;   // preencher campos ao abrir (ex: vindo de oportunidade)
  onFechar: () => void;
  onSalvo: (r: FeedbackRegistro) => void;
}

const STATUS_CLIENTE_OPCOES: StatusCliente[] = ["Satisfeito", "Neutro", "Insatisfeito", "Aguardando"];
const NPS_OPCOES: NPS[] = ["Sim", "Talvez", "Não"];
const MELHORIA_OPCOES: Melhoria[] = ["Prazo", "Atendimento", "Preço", "Qualidade Técnica"];
const PRIORIDADE_RFM_OPCOES: PrioridadeRFM[] = ["Urgente", "Normal", "Inativo"];

interface FormState {
  nome: string;
  telefone: string;
  trator: string;
  tecnico: string;
  codigo_omie: string;
  data_contato: string;
  // CRM
  servico: string;
  data_servico: string;
  status_cliente: StatusCliente | "";
  nota: number | null;
  feedback: string;
  nps: NPS | "";
  melhoria: Melhoria | "";
  // RFM
  ultimo_servico: string;
  motivo: string;
  prioridade: PrioridadeRFM | "";
  acao: string;
  sem_resposta: boolean;
  revisao_confirmada: string;
}

const STATE_VAZIO: FormState = {
  nome: "", telefone: "", trator: "", tecnico: "", codigo_omie: "", data_contato: "",
  servico: "", data_servico: "", status_cliente: "", nota: null, feedback: "", nps: "", melhoria: "",
  ultimo_servico: "", motivo: "", prioridade: "", acao: "", sem_resposta: false, revisao_confirmada: "",
};

function paraForm(r?: FeedbackRegistro | null, prefill?: Partial<FeedbackRegistro>): FormState {
  const src = { ...STATE_VAZIO, ...(r || {}), ...(prefill || {}) } as Record<string, unknown>;
  return {
    nome: (src.nome as string) || "",
    telefone: (src.telefone as string) || "",
    trator: (src.trator as string) || "",
    tecnico: (src.tecnico as string) || "",
    codigo_omie: (src.codigo_omie as string) || "",
    data_contato: (src.data_contato as string) || "",
    servico: (src.servico as string) || "",
    data_servico: (src.data_servico as string) || "",
    status_cliente: (src.status_cliente as StatusCliente | "") || "",
    nota: (src.nota as number | null) ?? null,
    feedback: (src.feedback as string) || "",
    nps: (src.nps as NPS | "") || "",
    melhoria: (src.melhoria as Melhoria | "") || "",
    ultimo_servico: (src.ultimo_servico as string) || "",
    motivo: (src.motivo as string) || "",
    prioridade: (src.prioridade as PrioridadeRFM | "") || "",
    acao: (src.acao as string) || "",
    sem_resposta: (src.sem_resposta as boolean) || false,
    revisao_confirmada: (src.revisao_confirmada as string) || "",
  };
}

function formParaPayload(tipo: TipoFeedback, form: FormState): Partial<FeedbackRegistro> {
  const base: Partial<FeedbackRegistro> = {
    tipo,
    nome: form.nome.trim(),
    telefone: form.telefone.trim() || null,
    trator: form.trator.trim() || null,
    tecnico: form.tecnico || null,
    codigo_omie: form.codigo_omie || null,
    data_contato: form.data_contato || null,
  };
  if (tipo === "crm") {
    return {
      ...base,
      servico: form.servico.trim() || null,
      data_servico: form.data_servico || null,
      status_cliente: form.status_cliente || null,
      nota: form.nota,
      feedback: form.feedback.trim() || null,
      nps: form.nps || null,
      melhoria: form.melhoria || null,
    };
  }
  return {
    ...base,
    ultimo_servico: form.ultimo_servico || null,
    motivo: form.motivo.trim() || null,
    prioridade: form.prioridade || null,
    acao: form.acao.trim() || null,
    sem_resposta: form.sem_resposta,
    revisao_confirmada: form.revisao_confirmada.trim() || null,
  };
}

export default function ModalFeedback({ tipo, aberto, registro, prefill, onFechar, onSalvo }: Props) {
  const [form, setForm] = useState<FormState>(() => paraForm(registro, prefill));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (aberto) {
      setForm(paraForm(registro, prefill));
      setErro(null);
    }
  }, [aberto, registro, prefill]);

  if (!aberto) return null;

  const upd = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
  };

  const editando = Boolean(registro?.id);

  async function handleSalvar() {
    if (!form.nome.trim()) {
      setErro("Nome do cliente é obrigatório");
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      const payload = formParaPayload(tipo, form);
      const r = editando
        ? await atualizarRegistro(registro!.id, payload)
        : await inserirRegistro(payload);
      onSalvo(r);
      onFechar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  }

  const titulo = `${editando ? "Editar" : "Novo"} ${tipo === "crm" ? "feedback CRM" : "registro RFM"}`;
  const corCabec = tipo === "crm" ? "#dc2626" : "#f59e0b";

  return (
    <div style={overlayStyle} onClick={onFechar}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <header
          style={{
            padding: "18px 24px",
            borderBottom: "1px solid var(--portal-border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: corCabec,
            color: "#fff",
            borderRadius: "14px 14px 0 0",
          }}
        >
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.85, textTransform: "uppercase", letterSpacing: 0.8 }}>
              ● Integrado ao Omie
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 800, margin: "4px 0 0" }}>{titulo}</h2>
          </div>
          <button onClick={onFechar} style={btnFecharStyle}>✕</button>
        </header>

        {/* Body */}
        <div style={bodyStyle}>
          {erro && <div style={erroStyle}>{erro}</div>}

          {/* Identificação do cliente — comum */}
          <section>
            <Label>Cliente *</Label>
            <ClienteAutocomplete
              valor={form.nome}
              onChange={(v) => upd("nome", v)}
              onSelecionar={(c) => {
                setForm((f) => ({
                  ...f,
                  nome: c.razao_social || c.nome_fantasia || "",
                  telefone: c.telefone || f.telefone,
                  codigo_omie: c.id_omie,
                }));
              }}
            />
          </section>

          <Row>
            <Field label="Telefone">
              <input type="text" value={form.telefone} onChange={(e) => upd("telefone", e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Código Omie">
              <input type="text" value={form.codigo_omie} readOnly style={{ ...inputStyle, background: "#fafafa", color: "var(--portal-text-muted)" }} />
            </Field>
          </Row>

          <Field label="Equipamento (modelo / chassi)">
            <ProjetoAutocomplete
              valor={form.trator}
              onChange={(v) => upd("trator", v)}
              onSelecionar={(p) => upd("trator", p.Nome_Projeto)}
            />
          </Field>

          <Row>
            <Field label="Técnico">
              <TecnicoSelect valor={form.tecnico} onChange={(v) => upd("tecnico", v)} />
            </Field>
            <Field label="Data do contato">
              <input type="date" value={form.data_contato} onChange={(e) => upd("data_contato", e.target.value)} style={inputStyle} />
            </Field>
          </Row>

          {tipo === "crm" ? (
            <>
              <Field label="Serviço realizado">
                <input type="text" value={form.servico} onChange={(e) => upd("servico", e.target.value)} style={inputStyle} />
              </Field>

              <Row>
                <Field label="Data do serviço">
                  <input type="date" value={form.data_servico} onChange={(e) => upd("data_servico", e.target.value)} style={inputStyle} />
                </Field>
                <Field label="Status do cliente">
                  <select value={form.status_cliente} onChange={(e) => upd("status_cliente", e.target.value as StatusCliente | "")} style={inputStyle}>
                    <option value="">—</option>
                    {STATUS_CLIENTE_OPCOES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
              </Row>

              <Field label="Nota (1-10)">
                <StarsRating valor={form.nota} onChange={(v) => upd("nota", v)} />
              </Field>

              <Field label="Feedback do cliente">
                <textarea value={form.feedback} onChange={(e) => upd("feedback", e.target.value)} rows={3} style={{ ...inputStyle, resize: "vertical", minHeight: 72 }} />
              </Field>

              <Row>
                <Field label="Recomendaria? (NPS)">
                  <select value={form.nps} onChange={(e) => upd("nps", e.target.value as NPS | "")} style={inputStyle}>
                    <option value="">—</option>
                    {NPS_OPCOES.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </Field>
                <Field label="Ponto de melhoria">
                  <select value={form.melhoria} onChange={(e) => upd("melhoria", e.target.value as Melhoria | "")} style={inputStyle}>
                    <option value="">—</option>
                    {MELHORIA_OPCOES.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </Field>
              </Row>
            </>
          ) : (
            <>
              <Row>
                <Field label="Último serviço">
                  <input type="date" value={form.ultimo_servico} onChange={(e) => upd("ultimo_servico", e.target.value)} style={inputStyle} />
                </Field>
                <Field label="Prioridade">
                  <select value={form.prioridade} onChange={(e) => upd("prioridade", e.target.value as PrioridadeRFM | "")} style={inputStyle}>
                    <option value="">—</option>
                    {PRIORIDADE_RFM_OPCOES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </Field>
              </Row>

              <Field label="Motivo do contato">
                <textarea value={form.motivo} onChange={(e) => upd("motivo", e.target.value)} rows={2} style={{ ...inputStyle, resize: "vertical", minHeight: 56 }} />
              </Field>

              <Field label="Ação tomada / planejada">
                <textarea value={form.acao} onChange={(e) => upd("acao", e.target.value)} rows={2} style={{ ...inputStyle, resize: "vertical", minHeight: 56 }} />
              </Field>

              <Row>
                <Field label="Revisão confirmada (se aplicável)">
                  <input type="text" value={form.revisao_confirmada} onChange={(e) => upd("revisao_confirmada", e.target.value)} placeholder="ex: 50h, 300h" style={inputStyle} />
                </Field>
                <Field label="Sem resposta?">
                  <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 13, color: "var(--portal-text)" }}>
                    <input type="checkbox" checked={form.sem_resposta} onChange={(e) => upd("sem_resposta", e.target.checked)} />
                    Cliente não respondeu
                  </label>
                </Field>
              </Row>
            </>
          )}
        </div>

        {/* Footer */}
        <footer style={footerStyle}>
          <button onClick={onFechar} style={btnGhostStyle} disabled={salvando}>Cancelar</button>
          <button onClick={handleSalvar} disabled={salvando} style={{ ...btnPrimaryStyle, opacity: salvando ? 0.6 : 1, cursor: salvando ? "wait" : "pointer" }}>
            {salvando ? "Salvando…" : (editando ? "Salvar alterações" : "Cadastrar")}
          </button>
        </footer>
      </div>
    </div>
  );
}

// -------------------- helpers visuais --------------------
function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--portal-text-secondary)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
      {children}
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}
function Row({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 0 }}>
      {children}
    </div>
  );
}

// -------------------- estilos --------------------
const overlayStyle: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)",
  display: "flex", alignItems: "center", justifyContent: "center",
  zIndex: 9999, padding: 16, fontFamily: "Inter, sans-serif",
};
const modalStyle: React.CSSProperties = {
  background: "#fff", width: "100%", maxWidth: 760, maxHeight: "92vh",
  borderRadius: 14, display: "flex", flexDirection: "column",
  boxShadow: "0 25px 60px rgba(0,0,0,0.3)", overflow: "hidden",
};
const bodyStyle: React.CSSProperties = { padding: 24, overflowY: "auto", flex: 1 };
const footerStyle: React.CSSProperties = {
  padding: "14px 24px", borderTop: "1px solid var(--portal-border)",
  display: "flex", justifyContent: "flex-end", gap: 10, background: "#fafafa",
};
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 14px",
  border: "1.5px solid var(--portal-border)", borderRadius: 10,
  fontSize: 13, background: "var(--portal-bg-card)", color: "var(--portal-text)",
  fontFamily: "Inter, sans-serif", outline: "none",
};
const btnFecharStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)", color: "#fff", border: "none",
  width: 32, height: 32, borderRadius: 8, fontSize: 16, cursor: "pointer", fontWeight: 700,
};
const btnGhostStyle: React.CSSProperties = {
  padding: "10px 22px", background: "#fff",
  border: "1.5px solid var(--portal-border)", color: "var(--portal-text-secondary)",
  borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer",
  fontFamily: "Inter, sans-serif",
};
const btnPrimaryStyle: React.CSSProperties = {
  padding: "10px 26px",
  background: "linear-gradient(135deg, #dc2626, #b91c1c)",
  color: "#fff", border: "none", borderRadius: 10,
  fontSize: 13, fontWeight: 700,
  boxShadow: "0 2px 8px rgba(185,28,28,0.25)",
  fontFamily: "Inter, sans-serif",
};
const erroStyle: React.CSSProperties = {
  background: "#fee2e2", color: "#991b1b", padding: "10px 14px",
  borderRadius: 10, fontSize: 13, marginBottom: 14,
};
