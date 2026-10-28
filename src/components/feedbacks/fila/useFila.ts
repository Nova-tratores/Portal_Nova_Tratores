"use client";
// Lógica comum das 3 opções da PÁGINA DE TESTE do CRM/RFM (/feedbacks/crm/teste — José, 23/10/2026:
// "a forma que a gente vê o CRM, RFM, a forma de filtrar, de concluir e tudo mais tá ruim").
// Carrega os registros reais, monta a fila (lib/feedbacks/fila) e faz as ações do atendimento.
// SEGURANÇA: por padrão as ações só mudam a tela ("simulação"); só gravam no banco com
// "Gravar de verdade" ligado.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { atualizarRegistro, listarClientesInfo, listarRegistros } from "@/lib/feedbacks/api";
import { linkWhatsApp, mensagemPesquisa, montarFila, precisaAlerta, MAX_TENTATIVAS_LIGACAO, type ItemFila } from "@/lib/feedbacks/fila";
import { clienteKey, TAG_NAO_CONTATAR, type ClienteInfo, type FeedbackRegistro, type Melhoria, type NPS, type PrioridadeRFM, type StatusCliente, type Tentativa, type TipoFeedback } from "@/lib/feedbacks/types";
import { useAuditLog } from "@/hooks/useAuditLog";
import { authHeaders } from "@/lib/auth/client";
import { registrosExemplo } from "./exemplos";

export type Escopo = "agora" | "esperando" | "concluidos";

export interface DadosConcluirCrm {
  status_cliente: StatusCliente | null;
  nota: number | null;
  nps: NPS | null;
  melhoria: Melhoria | null;
  feedback: string;
}
export interface DadosConcluirRfm {
  motivo: string;
  acao: string;
  prioridade: PrioridadeRFM | null;
}

export interface Toast { id: number; texto: string; tipo: "ok" | "sim" | "erro" }

const hojeISO = () => new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD no fuso local
const DIA = 86_400_000;

/** Em qual "monte" o item está. */
export function escopoDe(it: ItemFila): Escopo {
  if (it.acao === "concluido") return "concluidos";
  if (it.acao === "ligar" || it.acao === "whatsapp") return "agora";
  return "esperando";
}

/** `exemplo`: usa clientes inventados (exemplos.ts) e nunca grava nem abre o WhatsApp. */
export function useFila(tipo: TipoFeedback, exemplo = false) {
  const [rows, setRows] = useState<FeedbackRegistro[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [infoPorKey, setInfoPorKey] = useState<Record<string, ClienteInfo>>({});
  const [busca, setBusca] = useState("");
  const [tecnico, setTecnico] = useState("");
  const [escopo, setEscopo] = useState<Escopo>("agora");
  const [gravar, setGravar] = useState(false);
  const [ocupado, setOcupado] = useState<number | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [historico, setHistorico] = useState<{ nome: string; codigoOmie: string | null } | null>(null);
  const { log } = useAuditLog();
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const avisar = useCallback((texto: string, t: Toast["tipo"] = "ok") => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), texto, tipo: t });
    toastTimer.current = setTimeout(() => setToast(null), 4200);
  }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    if (exemplo) { setRows(registrosExemplo(tipo)); setInfoPorKey({}); setLoading(false); return; }
    try {
      setRows(await listarRegistros(tipo));
      listarClientesInfo()
        .then((infos) => { const m: Record<string, ClienteInfo> = {}; for (const i of infos) m[i.cliente_key] = i; setInfoPorKey(m); })
        .catch(() => { /* sem tags: só não mostra os selos */ });
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [tipo, exemplo]);
  useEffect(() => { void Promise.resolve().then(carregar); }, [carregar]);

  const tagsDe = useCallback((r: FeedbackRegistro): string[] => (infoPorKey[clienteKey(r.codigo_omie, r.nome)]?.tags as string[] | undefined) || [], [infoPorKey]);

  const fila = useMemo(() => montarFila(rows), [rows]);

  const tecnicos = useMemo(() => Array.from(new Set(rows.map((r) => r.tecnico).filter((t): t is string => !!t))).sort(), [rows]);

  /** Fila com busca + técnico (todas as situações). Quem está como "não contatar" sai do que está em aberto. */
  const base = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return fila.filter((it) => {
      const r = it.registro;
      if (tecnico && r.tecnico !== tecnico) return false;
      if (q) {
        const hay = [r.nome, r.telefone, r.trator, r.tecnico, r.codigo_omie, r.servico, r.feedback, r.motivo].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (it.acao !== "concluido" && tagsDe(r).includes(TAG_NAO_CONTATAR)) return false;
      return true;
    });
  }, [fila, busca, tecnico, tagsDe]);

  const contagem = useMemo(() => {
    const c: Record<Escopo, number> = { agora: 0, esperando: 0, concluidos: 0 };
    for (const it of base) c[escopoDe(it)]++;
    return c;
  }, [base]);

  const itens = useMemo(() => {
    const l = base.filter((it) => escopoDe(it) === escopo);
    if (escopo === "concluidos") {
      l.sort((a, b) => String(b.registro.concluido_em || b.registro.atualizado_em || "").localeCompare(String(a.registro.concluido_em || a.registro.atualizado_em || "")));
    }
    return l;
  }, [base, escopo]);

  // ── gravação (de verdade ou simulada) ─────────────────────────────────────
  const aplicar = useCallback(async (r: FeedbackRegistro, payload: Partial<FeedbackRegistro>, acaoLog: string, frase: string): Promise<boolean> => {
    if (!gravar || exemplo) {
      setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, ...payload } : x)));
      avisar(`Simulação — nada foi gravado. (${frase})`, "sim");
      return true;
    }
    setOcupado(r.id);
    try {
      const salvo = await atualizarRegistro(r.id, payload);
      setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, ...salvo } : x)));
      void log({ sistema: "feedbacks", acao: acaoLog, entidade: "cliente", entidade_id: clienteKey(r.codigo_omie, r.nome), entidade_label: r.nome, detalhes: { ...payload, tela: "crm-teste" } as Record<string, unknown> });
      avisar(`Gravado: ${frase}.`, "ok");
      return true;
    } catch (e) {
      avisar(`Não gravou: ${e instanceof Error ? e.message : String(e)}`, "erro");
      return false;
    } finally {
      setOcupado(null);
    }
  }, [gravar, exemplo, avisar, log]);

  const concluirCrm = useCallback(async (r: FeedbackRegistro, d: DadosConcluirCrm) => {
    const payload: Partial<FeedbackRegistro> = {
      status_cliente: d.status_cliente, nota: d.nota, nps: d.nps, melhoria: d.melhoria, feedback: d.feedback.trim() || null,
      status_atendimento: "concluido", concluido_em: new Date().toISOString(), data_contato: hojeISO(), sem_resposta: false,
    };
    const ok = await aplicar(r, payload, "atendimento_concluido", `${r.nome} concluído`);
    if (ok && gravar && precisaAlerta({ nota: d.nota, status_cliente: d.status_cliente })) {
      // Aviso ao gerente do pós-vendas (rota nova; se ainda não existir, só não avisa).
      void (async () => {
        try {
          await fetch("/api/feedbacks/crm/alerta", { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) }, body: JSON.stringify({ id: r.id }) });
        } catch { /* sem aviso */ }
      })();
    }
    return ok;
  }, [aplicar, gravar]);

  const concluirRfm = useCallback((r: FeedbackRegistro, d: DadosConcluirRfm) => aplicar(r, {
    motivo: d.motivo.trim() || null, acao: d.acao.trim() || null, prioridade: d.prioridade,
    status_atendimento: "concluido", concluido_em: new Date().toISOString(), data_contato: hojeISO(), sem_resposta: false,
  }, "atendimento_concluido", `${r.nome} concluído`), [aplicar]);

  const tentar = useCallback((r: FeedbackRegistro, canal: Tentativa["canal"]) => {
    const tent = [...(Array.isArray(r.tentativas) ? r.tentativas : []), { data: new Date().toISOString(), canal }];
    const payload: Partial<FeedbackRegistro> = { tentativas: tent };
    if (canal === "telefone" && tent.filter((t) => t.canal === "telefone").length >= MAX_TENTATIVAS_LIGACAO) {
      payload.status_atendimento = "sem_resposta";
      payload.sem_resposta = true;
    } else if (r.status_atendimento === "aberto") {
      payload.status_atendimento = "em_andamento";
    }
    return payload;
  }, []);

  const naoAtendeu = useCallback((r: FeedbackRegistro) => {
    const payload = tentar(r, "telefone");
    const n = payload.tentativas!.length;
    return aplicar(r, payload, "atendimento_tentativa", payload.status_atendimento === "sem_resposta" ? `${n}ª tentativa — vai para o WhatsApp` : `${n}ª tentativa — volta amanhã`);
  }, [aplicar, tentar]);

  const whatsapp = useCallback((r: FeedbackRegistro) => {
    const link = linkWhatsApp(r.telefone, mensagemPesquisa(r));
    if (!link) { avisar("Este cliente não tem um celular válido.", "erro"); return Promise.resolve(false); }
    if (!exemplo) window.open(link, "_blank", "noopener");
    return aplicar(r, tentar(r, "wpp"), "atendimento_tentativa", "mensagem no WhatsApp anotada");
  }, [aplicar, tentar, avisar, exemplo]);

  const remarcar = useCallback((r: FeedbackRegistro, data: string) => aplicar(r, { proximo_contato_em: data } as Partial<FeedbackRegistro>, "atendimento_remarcado",
    `retornar em ${data.split("-").reverse().join("/")}`), [aplicar]);

  const arquivar = useCallback((r: FeedbackRegistro, motivo: string) => aplicar(r, { status_atendimento: "arquivado", arquivado_motivo: motivo.trim() || "(sem motivo)" },
    "atendimento_arquivado", `${r.nome} arquivado`), [aplicar]);

  const reabrir = useCallback((r: FeedbackRegistro) => aplicar(r, { status_atendimento: "aberto", concluido_em: null }, "atendimento_reaberto", `${r.nome} reaberto`), [aplicar]);

  return {
    tipo, rows, loading, erro, recarregar: carregar,
    busca, setBusca, tecnico, setTecnico, escopo, setEscopo, tecnicos,
    base, itens, contagem, tagsDe,
    gravar, setGravar, ocupado, toast, fecharToast: () => setToast(null),
    historico, abrirHistorico: (r: FeedbackRegistro) => { if (exemplo) { avisar("Cliente de exemplo: o histórico só abre com os dados reais.", "sim"); return; } setHistorico({ nome: r.nome, codigoOmie: r.codigo_omie }); }, fecharHistorico: () => setHistorico(null),
    acoes: { concluirCrm, concluirRfm, naoAtendeu, whatsapp, remarcar, arquivar, reabrir },
  };
}

export type Fila = ReturnType<typeof useFila>;

/** Concluído nos últimos N dias (quadro). */
export function concluidoRecente(it: ItemFila, dias = 30, agora = Date.now()): boolean {
  if (it.registro.status_atendimento !== "concluido") return false;
  const t = Date.parse(it.registro.concluido_em || it.registro.atualizado_em || "");
  return Number.isFinite(t) && agora - t <= dias * DIA;
}
