"use client";
import { useEffect, useRef, useState } from "react";
import ClienteAutocomplete from "./ClienteAutocomplete";
import ProjetoAutocomplete from "./ProjetoAutocomplete";
import TecnicoSelect from "./TecnicoSelect";
import StarsRating from "./StarsRating";
import PainelDadosCliente, { type PainelDadosClienteHandle } from "./PainelDadosCliente";
import LogAcoesCliente from "./LogAcoesCliente";
import { inserirRegistro, atualizarRegistro, buscarUltimasOSPorCliente, registrarEquipamentoCliente, type UltimaOS } from "@/lib/feedbacks/api";
import { corTipo, gradTipo } from "@/lib/feedbacks/cores";
import { useAuditLog } from "@/hooks/useAuditLog";
import {
  clienteKey,
  type FeedbackRegistro, type Melhoria, type NPS, type PrioridadeRFM, type StatusCliente, type TipoFeedback,
} from "@/lib/feedbacks/types";

interface Props {
  tipo: TipoFeedback;
  aberto: boolean;
  registro?: FeedbackRegistro | null;   // null/undefined = novo
  prefill?: Partial<FeedbackRegistro>;   // preencher campos ao abrir (ex: vindo de oportunidade)
  onFechar: () => void;
  onSalvo: (r: FeedbackRegistro) => void;
  // 💀 Caveira (não contatar) — disparada de dentro do modal. Só no modo edição.
  onCaveira?: (r: FeedbackRegistro) => void;
  clienteNaoContatar?: boolean;
}

const STATUS_CLIENTE_OPCOES: StatusCliente[] = ["Satisfeito", "Neutro", "Insatisfeito", "Aguardando"];
const NPS_OPCOES: NPS[] = ["Sim", "Talvez", "Não"];
const MELHORIA_OPCOES: Melhoria[] = ["Prazo", "Atendimento", "Preço", "Qualidade Técnica"];
const PRIORIDADE_RFM_OPCOES: PrioridadeRFM[] = ["Urgente", "Normal", "Inativo"];

interface FormState {
  nome: string;
  telefone: string;
  email: string;
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
  nome: "", telefone: "", email: "", trator: "", tecnico: "", codigo_omie: "", data_contato: "",
  servico: "", data_servico: "", status_cliente: "", nota: null, feedback: "", nps: "", melhoria: "",
  ultimo_servico: "", motivo: "", prioridade: "", acao: "", sem_resposta: false, revisao_confirmada: "",
};

// Normaliza data da OS (ISO ou DD/MM/YYYY) para o formato YYYY-MM-DD do <input type="date">.
function isoDate(s: string | null | undefined): string {
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return "";
}

function fmtDataBR(s: string | null | undefined): string {
  const iso = isoDate(s);
  if (!iso) return s || "—";
  const [y, mo, d] = iso.split("-");
  return `${d}/${mo}/${y}`;
}

function paraForm(r?: FeedbackRegistro | null, prefill?: Partial<FeedbackRegistro>): FormState {
  const src = { ...STATE_VAZIO, ...(r || {}), ...(prefill || {}) } as Record<string, unknown>;
  return {
    nome: (src.nome as string) || "",
    telefone: (src.telefone as string) || "",
    email: (src.email as string) || "",
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
    email: form.email.trim() || null,
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
      sem_resposta: form.sem_resposta,
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

export default function ModalFeedback({ tipo, aberto, registro, prefill, onFechar, onSalvo, onCaveira, clienteNaoContatar }: Props) {
  const [form, setForm] = useState<FormState>(() => paraForm(registro, prefill));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Última OS do cliente — usada pra pré-preencher técnico/último serviço.
  const [ultimaOS, setUltimaOS] = useState<UltimaOS | null>(null);
  // Painel "Log" (histórico de ações) — toggle no rodapé, igual ao POS.
  const [showLog, setShowLog] = useState(false);
  const { log } = useAuditLog();
  // Painel de dados do cliente (coluna direita) — salvo junto pelo botão único.
  const painelRef = useRef<PainelDadosClienteHandle>(null);
  // Id do registro já salvo nesta sessão do modal (evita inserir duplicado em retry).
  const savedIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (aberto) {
      setForm(paraForm(registro, prefill));
      setErro(null);
      setUltimaOS(null);
      setShowLog(false);
      savedIdRef.current = registro?.id ?? null;
      const nome = registro?.nome || prefill?.nome || "";
      if (nome) {
        // Pré-preenche técnico (CRM/RFM) e último serviço (RFM) com a última OS
        // do cliente — só quando o campo está vazio (não sobrescreve o já salvo).
        buscarUltimasOSPorCliente([nome])
          .then((mapa) => {
            const os = mapa[nome.trim()];
            if (!os) return;
            setUltimaOS(os);
            setForm((f) => ({
              ...f,
              tecnico: f.tecnico || os.tecnico || "",
              ultimo_servico: tipo === "rfm" ? (f.ultimo_servico || isoDate(os.data)) : f.ultimo_servico,
            }));
          })
          .catch(() => { /* sem OS — segue sem pré-preencher */ });
      }
    }
  }, [aberto, registro, prefill, tipo]);

  if (!aberto) return null;

  const upd = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
  };

  const editando = Boolean(registro?.id);

  // Botão único: salva o atendimento (esquerda) E os dados do cliente (direita).
  async function handleSalvar() {
    if (!form.nome.trim()) {
      setErro("Nome do cliente é obrigatório");
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      // 1) Dados do cliente (Omie/mapa/tags) — idempotente, então roda primeiro
      //    e pode ser repetido em retry sem efeito colateral.
      const painelRes = await painelRef.current?.salvar();

      // 2) Atendimento. Usa o id já salvo (se houver) pra não inserir duplicado num retry.
      const payload = formParaPayload(tipo, form) as Partial<FeedbackRegistro>;
      // Salvar NÃO conclui o atendimento — concluir é ação explícita (botão "Concluir"
      // no card). Só marca "sem resposta" se o usuário marcou o checkbox.
      if ((registro?.status_atendimento === "aberto" || registro?.status_atendimento === "em_andamento") && form.sem_resposta) {
        payload.status_atendimento = "sem_resposta";
      }
      const idExistente = savedIdRef.current;
      const r = idExistente
        ? await atualizarRegistro(idExistente, payload)
        : await inserirRegistro(payload);
      const novo = !idExistente;
      savedIdRef.current = r.id;
      onSalvo(r);

      // Log do atendimento (mesma chave do cliente, agrupa com cadastro/tags).
      const acaoLog = payload.status_atendimento === "sem_resposta" ? "atendimento_sem_resposta" : "atendimento_salvo";
      void log({
        sistema: "feedbacks", acao: acaoLog, entidade: "cliente",
        entidade_id: clienteKey(form.codigo_omie || null, form.nome), entidade_label: form.nome,
        detalhes: { tipo, novo, status: payload.status_atendimento ?? r.status_atendimento ?? null },
      });

      // Registra o equipamento/trator preenchido na pasta do cliente (sem duplicar).
      if (form.trator.trim()) {
        void registrarEquipamentoCliente(
          clienteKey(form.codigo_omie || null, form.nome), form.codigo_omie || null, form.nome, form.trator,
        );
      }

      // 3) Se os dados do cliente falharam, mantém o modal aberto pra tentar de novo
      //    (o atendimento já foi salvo; novo clique só atualiza, sem duplicar).
      if (painelRes && !painelRes.ok) {
        setErro("Atendimento salvo. Dados do cliente falharam: " + painelRes.erros.join(" · "));
        return;
      }
      onFechar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  }

  const titulo = `${editando ? "Editar" : "Novo"} ${tipo === "crm" ? "feedback CRM" : "registro RFM"}`;
  const corCabec = corTipo(tipo);
  const headerBg = gradTipo(tipo);

  return (
    <div style={overlayStyle} onClick={onFechar}>
      <div style={wrapperStyle} onClick={(e) => e.stopPropagation()}>
      <div style={{ ...modalStyle, ...(showLog ? { borderTopRightRadius: 0, borderBottomRightRadius: 0 } : {}) }}>
        {/* Header */}
        <header
          style={{
            padding: "18px 24px",
            borderBottom: "1px solid var(--portal-border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: headerBg,
            color: "#fff",
            borderRadius: showLog ? "14px 0 0 0" : "14px 14px 0 0",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.85, textTransform: "uppercase", letterSpacing: 0.8 }}>
              ● Integrado ao Omie
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 800, margin: "4px 0 0" }}>{titulo}</h2>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
            {form.nome && (
              <button
                type="button"
                onClick={() => setShowLog((v) => !v)}
                title="Histórico de ações deste cliente"
                style={{ background: showLog ? "rgba(255,255,255,0.32)" : "rgba(255,255,255,0.18)", color: "#fff", border: "none", borderRadius: 8, padding: "7px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
              >
                <i className="fas fa-history" /> Log
              </button>
            )}
            <button onClick={onFechar} style={btnFecharStyle}>✕</button>
          </div>
        </header>

        {/* Body — dividido ao meio: esquerda atendimento, direita dados do cliente */}
        <div style={splitBody}>
          {/* Coluna ESQUERDA — atendimento */}
          <div style={colLeft}>
          {erro && <div style={erroStyle}>{erro}</div>}
          <div style={colTitulo}>📝 Atendimento</div>

          {/* Identificação do cliente */}
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
                  email: c.email || f.email,
                  codigo_omie: c.id_omie,
                }));
              }}
            />
          </section>

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
              {ultimaOS && (ultimaOS.tecnico || ultimaOS.data) && (
                <div style={hintOSStyle}>
                  Última OS: {ultimaOS.tecnico || "técnico não informado"}
                  {ultimaOS.data ? ` · ${fmtDataBR(ultimaOS.data)}` : ""}
                  {ultimaOS.tipo ? ` · ${ultimaOS.tipo}` : ""}
                </div>
              )}
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

              <Field label="Sem resposta?">
                <CampoSemResposta abertoEm={registro?.aberto_em} checked={form.sem_resposta} onChange={(v) => upd("sem_resposta", v)} />
              </Field>
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

              <Field label="O que foi conversado com o cliente">
                <textarea value={form.acao} onChange={(e) => upd("acao", e.target.value)} rows={2} style={{ ...inputStyle, resize: "vertical", minHeight: 56 }} />
              </Field>

              <Row>
                <Field label="Serviço confirmado">
                  <input type="text" value={form.revisao_confirmada} onChange={(e) => upd("revisao_confirmada", e.target.value)} placeholder="Preencha se gerou serviço (ex: revisão 300h, troca de óleo...)" style={inputStyle} />
                </Field>
                <Field label="Sem resposta?">
                  <CampoSemResposta abertoEm={registro?.aberto_em} checked={form.sem_resposta} onChange={(v) => upd("sem_resposta", v)} />
                </Field>
              </Row>
            </>
          )}
          </div>

          {/* Coluna DIREITA — dados do cliente (Omie + mapa + tags) */}
          <div style={colRight}>
            <PainelDadosCliente ref={painelRef} codigoOmie={form.codigo_omie || null} nome={form.nome} cor={corCabec} mostrarBotaoSalvar={false} />
          </div>
        </div>

        {/* Footer */}
        <footer style={footerStyle}>
          {editando && onCaveira ? (
            <button
              onClick={() => onCaveira(registro!)}
              type="button"
              disabled={salvando}
              title={clienteNaoContatar ? "Reativar contato com este cliente" : "Marcar cliente como 'não contatar' (não vale a pena)"}
              style={{ ...btnCaveiraStyle, background: clienteNaoContatar ? "#d1fae5" : "#1f2937", color: clienteNaoContatar ? "#065f46" : "#fff" }}
            >
              {clienteNaoContatar ? "Reativar contato" : "Não contatar"}
            </button>
          ) : <span />}
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onFechar} style={btnGhostStyle} disabled={salvando}>Cancelar</button>
            <button onClick={handleSalvar} disabled={salvando} style={{ ...btnPrimaryStyle, opacity: salvando ? 0.6 : 1, cursor: salvando ? "wait" : "pointer" }}>
              {salvando ? "Salvando…" : "Salvar atendimento + dados"}
            </button>
          </div>
        </footer>
      </div>

      {/* Histórico de ações (log) — painel lateral à direita, igual ao POS */}
      <LogAcoesCliente codigoOmie={form.codigo_omie || null} nome={form.nome} visible={showLog} />
      </div>
    </div>
  );
}

// Checkbox "Cliente não respondeu" com a regra das 24h: só libera marcar
// depois de 24h do início do atendimento (aberto_em). Se o registro não foi
// aberto via fluxo de atendimento (aberto_em nulo), libera direto.
function CampoSemResposta({
  abertoEm, checked, onChange,
}: { abertoEm: string | null | undefined; checked: boolean; onChange: (v: boolean) => void }) {
  let horasDesdeAberto: number | null = null;
  if (abertoEm) {
    const d = new Date(abertoEm);
    if (!isNaN(d.getTime())) {
      horasDesdeAberto = (Date.now() - d.getTime()) / (1000 * 60 * 60);
    }
  }
  const bloqueado = horasDesdeAberto !== null && horasDesdeAberto < 24;
  const restantes = bloqueado ? Math.ceil(24 - (horasDesdeAberto || 0)) : 0;
  return (
    <>
      <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 13, color: bloqueado ? "var(--portal-text-muted)" : "var(--portal-text)" }}>
        <input type="checkbox" checked={checked} disabled={bloqueado} onChange={(e) => onChange(e.target.checked)} />
        Cliente não respondeu
      </label>
      {bloqueado && (
        <div style={{ fontSize: 11, color: "#92400e", marginTop: 4, fontStyle: "italic" }}>
          Disponível em {restantes}h (após 24h do início do atendimento)
        </div>
      )}
    </>
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
// Agrupa modal + painel de log lado a lado (igual ao container do POS).
const wrapperStyle: React.CSSProperties = {
  display: "flex", alignItems: "stretch", maxHeight: "92vh", maxWidth: "100%",
};
const modalStyle: React.CSSProperties = {
  background: "#fff", flex: "1 1 1080px", maxWidth: 1080, minWidth: 0, maxHeight: "92vh",
  borderRadius: 14, display: "flex", flexDirection: "column",
  boxShadow: "0 25px 60px rgba(0,0,0,0.3)", overflow: "hidden",
};
// Corpo dividido em duas colunas (atendimento | dados do cliente).
const splitBody: React.CSSProperties = {
  display: "flex", flex: 1, minHeight: 0, alignItems: "stretch",
};
const colLeft: React.CSSProperties = {
  flex: "1 1 0", minWidth: 0, padding: 24, overflowY: "auto",
  borderRight: "1px solid var(--portal-border)",
};
const colRight: React.CSSProperties = {
  flex: "1 1 0", minWidth: 0, padding: 20, overflowY: "auto", background: "#f8fafc",
};
const colTitulo: React.CSSProperties = {
  fontSize: 13, fontWeight: 800, color: "var(--portal-text)", marginBottom: 14,
};
const footerStyle: React.CSSProperties = {
  padding: "14px 24px", borderTop: "1px solid var(--portal-border)",
  display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, background: "#fafafa", flexWrap: "wrap",
};
const btnCaveiraStyle: React.CSSProperties = {
  padding: "10px 18px", border: "none", borderRadius: 10,
  fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "Inter, sans-serif",
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
const hintOSStyle: React.CSSProperties = {
  fontSize: 11, color: "var(--portal-text-muted)", marginTop: 5, fontStyle: "italic",
};
