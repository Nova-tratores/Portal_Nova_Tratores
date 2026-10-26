"use client";
// Lógica da aba "Revisões" do RFM na página de teste do CRM (José, 23/10/2026: "dividir o RFM em
// serviço geral, por tempo de serviço, e fazer uma aba para revisões"). Um item por TRATOR, com a
// previsão da próxima revisão (lib/feedbacks/previsao-revisao) e as mesmas ações do CRM.
// SEGURANÇA: por padrão tudo é simulação; só grava com "Gravar de verdade" E com a tabela
// feedback_revisoes_contato criada (sql/feedbacks-rfm-revisoes.sql). Sem ela a aba avisa.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { authHeaders } from "@/lib/auth/client";
import { linkWhatsApp, MAX_TENTATIVAS_LIGACAO, type ItemFila } from "@/lib/feedbacks/fila";
import {
  mensagemRevisao, montarFilaRevisoes,
  type ContatoRevisao, type DadosConcluirRevisao, type ItemRevisao, type TratorRevisao,
} from "@/lib/feedbacks/previsao-revisao";
import type { FeedbackRegistro, StatusAtendimento, Tentativa } from "@/lib/feedbacks/types";
import type { Escopo, Toast } from "./useFila";
import { contatosExemplo, tratoresExemplo } from "./exemplos";

/** id numérico do registro "de mentira" que as ações do CRM usam (tratores.ID é número; senão um hash). */
function numId(id: string): number {
  const n = Number(id);
  if (Number.isSafeInteger(n)) return n;
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h) + 1;
}

/** ItemRevisao no formato da fila do CRM (para reaproveitar AcoesAtendimento e o histórico). */
export function comoItemFila(it: ItemRevisao): ItemFila {
  const t = it.trator, c = it.contato;
  const status: StatusAtendimento = c.status === "aberto" ? (c.tentativas.length ? "em_andamento" : "aberto") : c.status === "arquivado" ? "arquivado" : "concluido";
  const registro = {
    id: numId(t.id), tipo: "rfm", nome: t.cliente, telefone: t.telefone, email: null, trator: `${t.modelo} · Chassi ${t.chassi}`, tecnico: null,
    codigo_omie: t.codigo_omie, data_contato: null, servico: `Revisão de ${t.previsao.revisaoOferta} h`, data_servico: null, status_cliente: null, nota: null,
    feedback: null, nps: null, melhoria: null, ultimo_servico: t.previsao.ultimaLeitura?.data ?? t.previsao.entrega, motivo: c.motivo, prioridade: null, acao: null,
    sem_resposta: false, revisao_confirmada: null, tentativas: c.tentativas, atendente_id: null, atendente_nome: null, aberto_em: null,
    concluido_em: c.concluido_em, status_atendimento: status, arquivado_motivo: c.status === "arquivado" ? c.motivo : null, origem_dados: "Revisões",
    criado_em: null, atualizado_em: c.atualizado_em ?? null, proximo_contato_em: c.proximo_contato_em,
  } as unknown as FeedbackRegistro;
  return { registro, pontos: it.pontos, acao: it.acao, oQueFazer: it.oQueFazer, porque: it.porque, dias: it.trator.previsao.dias, aPartirDe: it.aPartirDe };
}

const comTentativa = (canal: Tentativa["canal"]) => (c: ContatoRevisao): ContatoRevisao => ({ ...c, tentativas: [...c.tentativas, { data: new Date().toISOString(), canal }] });

export function escopoRev(it: ItemRevisao): Escopo {
  if (it.acao === "concluido") return "concluidos";
  if (it.acao === "ligar" || it.acao === "whatsapp") return "agora";
  return "esperando";
}

export function useFilaRevisoes(exemplo: boolean) {
  const [tratores, setTratores] = useState<TratorRevisao[]>([]);
  const [contatos, setContatos] = useState<Record<string, ContatoRevisao>>({});
  const [tabelaContato, setTabelaContato] = useState(true);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [vendedor, setVendedor] = useState("");
  const [escopo, setEscopo] = useState<Escopo>("agora");
  const [gravar, setGravar] = useState(false);
  const [ocupado, setOcupado] = useState<number | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [historico, setHistorico] = useState<{ nome: string; codigoOmie: string | null } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const avisar = useCallback((texto: string, t: Toast["tipo"] = "ok") => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), texto, tipo: t });
    toastTimer.current = setTimeout(() => setToast(null), 4200);
  }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const carregar = useCallback(async (forcar = false) => {
    setLoading(true);
    setErro(null);
    if (exemplo) {
      const t = tratoresExemplo();
      setTratores(t); setContatos(contatosExemplo(t)); setTabelaContato(true); setAvisos([]); setLoading(false);
      return;
    }
    try {
      const r = await fetch(`/api/feedbacks/crm/revisoes${forcar ? "?forcar=1" : ""}`, { headers: await authHeaders() });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro || `erro ${r.status}`);
      setTratores(j.tratores || []); setContatos(j.contatos || {}); setTabelaContato(j.tabelaContato !== false); setAvisos(j.avisos || []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [exemplo]);
  useEffect(() => {
    let vivo = true;
    Promise.resolve().then(() => { if (vivo) void carregar(); });
    return () => { vivo = false; };
  }, [carregar]);

  const fila = useMemo(() => montarFilaRevisoes(tratores, contatos), [tratores, contatos]);
  const vendedores = useMemo(() => Array.from(new Set(tratores.map((t) => t.vendedor).filter((v): v is string => !!v))).sort(), [tratores]);

  const base = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return fila.filter((it) => {
      const t = it.trator;
      if (vendedor && t.vendedor !== vendedor) return false;
      if (q && ![t.cliente, t.telefone, t.modelo, t.chassi, t.cidade, t.vendedor].filter(Boolean).join(" ").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [fila, busca, vendedor]);

  const contagem = useMemo(() => {
    const c: Record<Escopo, number> = { agora: 0, esperando: 0, concluidos: 0 };
    for (const it of base) c[escopoRev(it)]++;
    return c;
  }, [base]);
  const itens = useMemo(() => base.filter((it) => escopoRev(it) === escopo), [base, escopo]);

  const porNum = useMemo(() => new Map(tratores.map((t) => [numId(t.id), t])), [tratores]);
  const itemDe = useCallback((r: FeedbackRegistro) => fila.find((it) => it.trator.id === porNum.get(r.id)?.id) ?? null, [fila, porNum]);

  // ── gravação (de verdade ou simulada) ─────────────────────────────────────
  const aplicar = useCallback(async (r: FeedbackRegistro, mudar: (c: ContatoRevisao) => ContatoRevisao, frase: string): Promise<boolean> => {
    const it = itemDe(r);
    if (!it) return false;
    const novo = { ...mudar({ ...it.contato, revisao: it.trator.previsao.revisaoOferta }), atualizado_em: new Date().toISOString() };
    if (!gravar || exemplo) {
      setContatos((prev) => ({ ...prev, [it.trator.id]: novo }));
      avisar(`Simulação — nada foi gravado. (${frase})`, "sim");
      return true;
    }
    if (!tabelaContato) { avisar("A tabela do atendimento das revisões ainda não existe: rode sql/feedbacks-rfm-revisoes.sql. Por enquanto só dá para simular.", "erro"); return false; }
    setOcupado(r.id);
    try {
      const resp = await fetch("/api/feedbacks/crm/revisoes", { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) }, body: JSON.stringify(novo) });
      const j = await resp.json();
      if (!resp.ok) { if (j.migracaoFaltando) setTabelaContato(false); throw new Error(j.erro || `erro ${resp.status}`); }
      setContatos((prev) => ({ ...prev, [it.trator.id]: { ...novo, ...j.contato } }));
      avisar(`Gravado: ${frase}.`, "ok");
      return true;
    } catch (e) {
      avisar(`Não gravou: ${e instanceof Error ? e.message : String(e)}`, "erro");
      return false;
    } finally {
      setOcupado(null);
    }
  }, [itemDe, gravar, exemplo, tabelaContato, avisar]);

  const naoAtendeu = useCallback((r: FeedbackRegistro) => {
    const n = (itemDe(r)?.contato.tentativas.filter((t) => t.canal === "telefone").length ?? 0) + 1;
    return aplicar(r, comTentativa("telefone"), n >= MAX_TENTATIVAS_LIGACAO ? `${n}ª tentativa — vai para o WhatsApp` : `${n}ª tentativa — volta amanhã`);
  }, [aplicar, itemDe]);

  const whatsapp = useCallback((r: FeedbackRegistro) => {
    const it = itemDe(r);
    const link = it ? linkWhatsApp(it.trator.telefone, mensagemRevisao(it.trator)) : null;
    if (!link) { avisar("Este cliente não tem um celular válido.", "erro"); return Promise.resolve(false); }
    if (!exemplo) window.open(link, "_blank", "noopener");
    return aplicar(r, comTentativa("wpp"), "mensagem no WhatsApp anotada");
  }, [aplicar, itemDe, avisar, exemplo]);

  const remarcar = useCallback((r: FeedbackRegistro, data: string) => aplicar(r, (c) => ({ ...c, proximo_contato_em: data }), `retornar em ${data.split("-").reverse().join("/")}`), [aplicar]);
  const arquivar = useCallback((r: FeedbackRegistro, motivo: string) => aplicar(r, (c) => ({ ...c, status: "arquivado", motivo: motivo.trim() || "(sem motivo)", concluido_em: new Date().toISOString() }), `${r.nome} arquivado`), [aplicar]);
  const reabrir = useCallback((r: FeedbackRegistro) => aplicar(r, (c) => ({ ...c, status: "aberto", concluido_em: null, data_agendada: null }), `${r.nome} reaberto`), [aplicar]);
  const concluirRevisao = useCallback((r: FeedbackRegistro, d: DadosConcluirRevisao) => aplicar(r, (c) => ({
    ...c, status: d.status, data_agendada: d.status === "agendada" ? d.data_agendada : null, motivo: d.motivo.trim() || null, concluido_em: new Date().toISOString(), proximo_contato_em: null,
  }), d.status === "agendada" ? `revisão agendada${d.data_agendada ? ` para ${d.data_agendada.split("-").reverse().join("/")}` : ""}` : "não quer a revisão agora"), [aplicar]);

  return {
    tratores, loading, erro, avisos, tabelaContato, recarregar: () => carregar(true),
    busca, setBusca, vendedor, setVendedor, vendedores, escopo, setEscopo,
    fila, base, itens, contagem,
    gravar, setGravar, ocupado, toast, fecharToast: () => setToast(null),
    historico, fecharHistorico: () => setHistorico(null),
    abrirHistorico: (r: FeedbackRegistro) => { if (exemplo) { avisar("Cliente de exemplo: o histórico só abre com os dados reais.", "sim"); return; } setHistorico({ nome: r.nome, codigoOmie: r.codigo_omie }); },
    acoes: { naoAtendeu, whatsapp, remarcar, arquivar, reabrir, concluirRevisao },
  };
}

export type FilaRevisoes = ReturnType<typeof useFilaRevisoes>;
