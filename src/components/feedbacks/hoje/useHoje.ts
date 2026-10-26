"use client";
// Lógica da tela "Hoje" (página de teste /feedbacks/crm/teste/hoje — José, 23/10/2026, "Caminho B"):
// carrega as quatro fontes (atendimentos, oportunidades, revisões, retornos), monta a fila única por
// cliente (lib/feedbacks/hoje) e executa o desfecho escolhido em TODOS os motivos marcados.
// SEGURANÇA: "Dados de exemplo" é o padrão; com dados reais as ações só SIMULAM até ligar "Gravar de
// verdade". Gravações pelos caminhos que já existem: atendimento → atualizarRegistro (como useFila);
// oportunidade → PATCH /api/feedbacks/oportunidades (como a tela de Oportunidades); revisão →
// POST /api/feedbacks/crm/revisoes; nota ≤ 6 / insatisfeito → POST /api/feedbacks/crm/alerta.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { atualizarRegistro } from "@/lib/feedbacks/api";
import { authHeaders } from "@/lib/auth/client";
import { useAuditLog } from "@/hooks/useAuditLog";
import {
  contadores, cotaDoDia, feitosHoje, montarClientes, planoDesfecho, hojeSP, COTA_PADRAO,
  type ClienteHoje, type DesfechoHoje, type Grupo, type ItemPlano, type Motivo,
} from "@/lib/feedbacks/hoje";
import { montarPainel, type ChamadaHoje } from "@/lib/feedbacks/hoje-painel";
import { linkWhatsApp, mensagemPesquisa, precisaAlerta, MAX_TENTATIVAS_LIGACAO } from "@/lib/feedbacks/fila";
import { mensagemRevisao, montarFilaRevisoes, type ContatoRevisao, type TratorRevisao } from "@/lib/feedbacks/previsao-revisao";
import { lerAreas, regrasDaFuncao } from "@/lib/feedbacks/atendimento/areas";
import { clienteKey, type FeedbackRegistro, type Melhoria, type NPS, type Oportunidade, type RegraOportunidade, type StatusCliente, type Tentativa } from "@/lib/feedbacks/types";
import { dadosHojeExemplo } from "./exemplosHoje";

export interface Toast { id: number; texto: string; tipo: "ok" | "sim" | "erro" }

export interface Pesquisa { nota: number | null; status_cliente: StatusCliente | null; nps: NPS | null; melhoria: Melhoria | null; comentario: string }
export interface DadosDesfecho {
  desfecho: DesfechoHoje;
  /** ids dos motivos "fecha" marcados na lista de confirmação */
  marcados: Set<string>;
  pesquisa: Pesquisa | null;
  retorno: string | null;
  servicoEm: string | null;
  motivoRecusa: string;
  obs: string;
}

interface Base {
  registros: FeedbackRegistro[];
  oportunidades: Oportunidade[];
  cadastro: Record<string, { telefone: string | null; email: string | null; cidade: string | null }>;
  tags: Record<string, string[]>;
  chamadas: ChamadaHoje[];
  nomes: Record<string, string>;
  areas: Record<string, unknown> | null;
}
const VAZIO: Base = { registros: [], oportunidades: [], cadastro: {}, tags: {}, chamadas: [], nomes: {}, areas: null };

/** Pseudo-regra de cada fonte, para "Minha área" (lib/feedbacks/atendimento/areas). */
export function regrasDoMotivo(m: Motivo): RegraOportunidade[] {
  if (m.regra) return [m.regra];
  if (m.fonte === "registro") return m.registro?.tipo === "crm" ? ["R4_followup"] : ["R2_sem_os"];
  return ["R1_revisao"];
}

const ROT_DESFECHO: Record<DesfechoHoje, string> = {
  servico_agendado: "Serviço agendado", vendeu: "Vendeu", retornar: "Retornar depois", recusou: "Recusou", sem_resposta: "Não atendeu",
  numero_errado: "Número errado", whatsapp: "Mensagem no WhatsApp", so_pesquisa: "Pesquisa de pós-serviço",
};

export interface OpcoesHoje {
  /** Tela de verdade (/feedbacks): grava direto, sem a chave "Gravar de verdade" da página de teste. */
  gravarSempre?: boolean;
  /** Vai no audit_log (detalhes.tela). */
  tela?: string;
  /** Lê as revisões Mahindra (pesado). Padrão: sim. */
  comRevisoes?: boolean;
  /** Mostra "Abrir no cockpit" (quem não tem feedbacks:atendimento não abre o cockpit). Padrão: sim. */
  podeCockpit?: boolean;
}

export function useHoje(exemplo: boolean, funcaoUsuario: string | null | undefined, opcoes: OpcoesHoje = {}) {
  const { gravarSempre = false, tela = "hoje-teste", comRevisoes = true, podeCockpit = true } = opcoes;
  const [base, setBase] = useState<Base>(VAZIO);
  const [tratores, setTratores] = useState<TratorRevisao[]>([]);
  const [contatos, setContatos] = useState<Record<string, ContatoRevisao>>({});
  const [tabelaContato, setTabelaContato] = useState(true);
  const [carregando, setCarregando] = useState(true);
  const [carregandoRev, setCarregandoRev] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [geradoEm, setGeradoEm] = useState<number>(() => Date.now());
  const [tentLocais, setTentLocais] = useState<Record<string, Tentativa[]>>({});
  const [gravar, setGravar] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [historico, setHistorico] = useState<{ nome: string; codigoOmie: string | null } | null>(null);
  // filtros
  const [grupos, setGrupos] = useState<Set<Grupo>>(new Set());
  const [minhaArea, setMinhaArea] = useState(false);
  const [soAcao, setSoAcao] = useState<"" | "whatsapp" | "urgente">("");
  const [busca, setBusca] = useState("");
  const [tecnico, setTecnico] = useState("");
  const [cota, setCota] = useState(COTA_PADRAO);
  const { log } = useAuditLog();
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const avisar = useCallback((texto: string, t: Toast["tipo"] = "ok") => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), texto, tipo: t });
    toastTimer.current = setTimeout(() => setToast(null), 5200);
  }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  // ── leitura ───────────────────────────────────────────────────────────────
  const carregar = useCallback(async (opts: { forcarRev?: boolean; silencioso?: boolean } = {}) => {
    const { forcarRev = false, silencioso = false } = opts;
    setErro(null);
    setGeradoEm(Date.now());
    if (exemplo) {
      const d = dadosHojeExemplo();
      setBase({ registros: d.registros, oportunidades: d.oportunidades, cadastro: d.cadastro, tags: d.tags, chamadas: d.chamadas, nomes: d.nomes, areas: null });
      setTratores(d.tratores); setContatos(d.contatos); setTabelaContato(true); setAvisos([]); setTentLocais({});
      setCarregando(false); setCarregandoRev(false);
      return;
    }
    if (!silencioso) { setCarregando(true); setCarregandoRev(true); }
    const h = await authHeaders();
    const rev = !comRevisoes ? (setCarregandoRev(false), Promise.resolve([] as string[])) : fetch(`/api/feedbacks/crm/revisoes${forcarRev ? "?forcar=1" : ""}`, { headers: h })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.erro || `erro ${r.status}`); return j; })
      .then((j) => { setTratores(j.tratores || []); setContatos(j.contatos || {}); setTabelaContato(j.tabelaContato !== false); return (j.avisos || []) as string[]; })
      .catch((e) => [`Revisões não carregaram: ${e instanceof Error ? e.message : String(e)}`])
      .finally(() => setCarregandoRev(false));
    try {
      const r = await fetch("/api/feedbacks/crm/hoje", { headers: h });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro || `erro ${r.status}`);
      setBase({
        registros: j.registros || [], oportunidades: [...(j.oportunidades || []), ...(j.atendidasRecentes || [])], cadastro: j.cadastro || {},
        tags: j.tags || {}, chamadas: j.chamadas || [], nomes: j.nomes || {}, areas: j.areas ?? null,
      });
      const avRev = await rev;
      setAvisos([...(j.avisos || []), ...avRev]);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setCarregando(false);
    }
  }, [exemplo, comRevisoes]);
  useEffect(() => {
    let vivo = true;
    Promise.resolve().then(() => { if (vivo) void carregar(); });
    return () => { vivo = false; };
  }, [carregar]);

  // ── fila ──────────────────────────────────────────────────────────────────
  const revisoes = useMemo(() => montarFilaRevisoes(tratores, contatos, geradoEm), [tratores, contatos, geradoEm]);
  const emLigacao = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of base.chamadas) if (!c.encerrada_em && c.cliente_key) m[c.cliente_key] = (c.atendente_nome || "alguém").trim();
    return m;
  }, [base.chamadas]);
  const clientes = useMemo(() => montarClientes({
    registros: base.registros, oportunidades: base.oportunidades, revisoes, cadastro: base.cadastro, tags: base.tags, emLigacao, tentativasLocais: tentLocais,
  }, geradoEm), [base, revisoes, emLigacao, tentLocais, geradoEm]);

  const area = useMemo(() => regrasDaFuncao(funcaoUsuario, lerAreas(base.areas)), [funcaoUsuario, base.areas]);
  const tecnicos = useMemo(() => [...new Set(clientes.flatMap((c) => c.tecnicos))].sort((a, b) => a.localeCompare(b, "pt-BR")), [clientes]);

  /** Busca + técnico (antes dos chips, para os chips contarem). */
  const basicos = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return clientes.filter((c) => {
      if (tecnico && !c.tecnicos.includes(tecnico)) return false;
      if (minhaArea && area && !c.motivos.some((m) => regrasDoMotivo(m).some((r) => area.regras.includes(r)))) return false;
      if (soAcao === "whatsapp" && c.acao !== "whatsapp") return false;
      if (soAcao === "urgente" && !c.urgente) return false;
      if (q) {
        const hay = [c.nome, c.telefone, c.cidade, c.email, ...c.motivos.map((m) => m.selo), ...c.tecnicos].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [clientes, busca, tecnico, minhaArea, area, soAcao]);
  const porGrupo = useMemo(() => {
    const c: Record<Grupo, number> = { pos_servico: 0, reativacao: 0, revisoes: 0, pecas: 0, cadastro: 0, retornos: 0 };
    for (const x of basicos) for (const g of x.grupos) c[g]++;
    return c;
  }, [basicos]);
  const filtrados = useMemo(() => (grupos.size ? basicos.filter((c) => c.grupos.some((g) => grupos.has(g))) : basicos), [basicos, grupos]);
  const fila = useMemo(() => cotaDoDia(filtrados, cota), [filtrados, cota]);

  const feitos = useMemo(() => feitosHoje({ registros: base.registros, oportunidades: base.oportunidades, revisoes }, geradoEm), [base, revisoes, geradoEm]);
  const numeros = useMemo(() => contadores(clientes, cota, { registros: base.registros, feitosHojeKeys: feitos }, geradoEm), [clientes, cota, base.registros, feitos, geradoEm]);
  const painel = useMemo(() => montarPainel({ registros: base.registros, oportunidades: base.oportunidades, chamadas: base.chamadas, nomes: base.nomes }, geradoEm), [base, geradoEm]);

  // ── gravação ──────────────────────────────────────────────────────────────
  const simulando = exemplo || (!gravar && !gravarSempre);

  const gravarRegistro = useCallback(async (r: FeedbackRegistro, payload: Partial<FeedbackRegistro>, acaoLog: string) => {
    if (simulando) { setBase((b) => ({ ...b, registros: b.registros.map((x) => (x.id === r.id ? { ...x, ...payload, atualizado_em: new Date().toISOString() } : x)) })); return; }
    const salvo = await atualizarRegistro(r.id, payload);
    setBase((b) => ({ ...b, registros: b.registros.map((x) => (x.id === r.id ? { ...x, ...salvo } : x)) }));
    void log({ sistema: "feedbacks", acao: acaoLog, entidade: "cliente", entidade_id: clienteKey(r.codigo_omie, r.nome), entidade_label: r.nome, detalhes: { ...payload, tela } as Record<string, unknown> });
  }, [simulando, log, tela]);

  const gravarOportunidade = useCallback(async (o: Oportunidade, payload: { status: "atendida" | "dispensada"; dispensada_motivo?: string }) => {
    const local = { ...payload, ...(payload.status === "atendida" ? { atendida_em: new Date().toISOString() } : {}) };
    if (simulando) { setBase((b) => ({ ...b, oportunidades: b.oportunidades.map((x) => (x.id === o.id ? { ...x, ...local } : x)) })); return; }
    const res = await fetch(`/api/feedbacks/oportunidades?id=${o.id}`, { method: "PATCH", headers: { "Content-Type": "application/json", ...(await authHeaders()) }, body: JSON.stringify(payload) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.erro || j.error || `oportunidade ${o.id}: erro ${res.status}`);
    setBase((b) => ({ ...b, oportunidades: b.oportunidades.map((x) => (x.id === o.id ? { ...x, ...j } : x)) }));
  }, [simulando]);

  const gravarRevisao = useCallback(async (t: TratorRevisao, atual: ContatoRevisao, mudar: (c: ContatoRevisao) => ContatoRevisao) => {
    const novo = { ...mudar({ ...atual, revisao: t.previsao.revisaoOferta }), atualizado_em: new Date().toISOString() };
    if (simulando) { setContatos((p) => ({ ...p, [t.id]: novo })); return; }
    if (!tabelaContato) throw new Error("a tabela do atendimento das revisões ainda não existe (sql/feedbacks-rfm-revisoes.sql)");
    const resp = await fetch("/api/feedbacks/crm/revisoes", { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) }, body: JSON.stringify(novo) });
    const j = await resp.json().catch(() => ({}));
    if (!resp.ok) { if (j.migracaoFaltando) setTabelaContato(false); throw new Error(j.erro || `revisão: erro ${resp.status}`); }
    setContatos((p) => ({ ...p, [t.id]: { ...novo, ...j.contato } }));
  }, [simulando, tabelaContato]);

  /** Mensagem pronta do WhatsApp para o motivo mais forte. */
  const mensagemDe = useCallback((c: ClienteHoje): string => {
    const pos = c.motivos.find((m) => m.registro?.tipo === "crm");
    if (pos?.registro) return mensagemPesquisa(pos.registro);
    const rev = c.motivos.find((m) => m.revisao);
    if (rev?.revisao) return mensagemRevisao(rev.revisao.trator);
    const reg = c.motivos.find((m) => m.registro);
    if (reg?.registro) return mensagemPesquisa(reg.registro);
    const nome = (c.nome || "").split(/[\s(]/)[0];
    const primeiro = nome ? nome.charAt(0).toUpperCase() + nome.slice(1).toLowerCase() : "";
    return `Olá${primeiro ? `, ${primeiro}` : ""}! Aqui é da Nova Tratores. Faz um tempo que não falamos — está tudo certo com suas máquinas? Se precisar de revisão, peça ou orçamento, é só responder esta mensagem.`;
  }, []);

  /** Executa o desfecho em todos os motivos do plano (os "fecha" só se marcados). */
  const executar = useCallback(async (c: ClienteHoje, d: DadosDesfecho): Promise<boolean> => {
    const temPesquisa = !!d.pesquisa && (d.pesquisa.nota != null || !!d.pesquisa.status_cliente);
    const plano = planoDesfecho(c, d.desfecho, temPesquisa).filter((it) => it.efeito !== "mantem" && (it.efeito !== "fecha" || d.marcados.has(it.motivo.id)));
    if (d.desfecho === "whatsapp") {
      const link = linkWhatsApp(c.telefone, mensagemDe(c));
      if (!link) { avisar("Este cliente não tem um celular válido.", "erro"); return false; }
      if (!exemplo) window.open(link, "_blank", "noopener");
    }
    setOcupado(c.key);
    const agoraIso = new Date().toISOString();
    const hoje = hojeSP();
    const canal: Tentativa["canal"] = d.desfecho === "whatsapp" ? "wpp" : d.desfecho === "numero_errado" ? "outro" : "telefone";
    const obsTent = d.desfecho === "numero_errado" ? "número errado" : d.obs.trim() || undefined;
    const rot = ROT_DESFECHO[d.desfecho];
    const texto = [d.obs.trim(), d.motivoRecusa.trim() ? `motivo: ${d.motivoRecusa.trim()}` : ""].filter(Boolean).join(" · ");
    const erros: string[] = [];
    let ok = 0;
    for (const it of plano) {
      const m = it.motivo;
      try {
        if (m.fonte === "registro" && m.registro) {
          const r = m.registro;
          if (it.efeito === "fecha") {
            const comum: Partial<FeedbackRegistro> = { status_atendimento: "concluido", concluido_em: agoraIso, data_contato: hoje, sem_resposta: false };
            if (r.tipo === "crm" && d.pesquisa) {
              await gravarRegistro(r, { ...comum, status_cliente: d.pesquisa.status_cliente, nota: d.pesquisa.nota, nps: d.pesquisa.nps, melhoria: d.pesquisa.melhoria, feedback: d.pesquisa.comentario.trim() || r.feedback || null }, "atendimento_concluido");
              if (!simulando && precisaAlerta({ nota: d.pesquisa.nota, status_cliente: d.pesquisa.status_cliente })) {
                void (async () => { try { await fetch("/api/feedbacks/crm/alerta", { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) }, body: JSON.stringify({ id: r.id }) }); } catch { /* sem aviso */ } })();
              }
            } else {
              await gravarRegistro(r, {
                ...comum, acao: [rot, d.servicoEm ? `para ${d.servicoEm.split("-").reverse().join("/")}` : ""].filter(Boolean).join(" ") || r.acao,
                motivo: d.desfecho === "recusou" ? (d.motivoRecusa.trim() || r.motivo) : (texto || r.motivo),
                revisao_confirmada: d.desfecho === "servico_agendado" ? (d.servicoEm || "Serviço agendado") : r.revisao_confirmada,
              }, "atendimento_concluido");
            }
          } else if (it.efeito === "retorno" && d.retorno) {
            await gravarRegistro(r, { proximo_contato_em: d.retorno, status_atendimento: r.status_atendimento === "aberto" ? "em_andamento" : r.status_atendimento, feedback: texto ? [r.feedback, texto].filter(Boolean).join(" · ") : r.feedback } as Partial<FeedbackRegistro>, "atendimento_remarcado");
          } else if (it.efeito === "tentativa") {
            const tent = [...(Array.isArray(r.tentativas) ? r.tentativas : []), { data: agoraIso, canal, ...(obsTent ? { observacao: obsTent } : {}) }];
            const payload: Partial<FeedbackRegistro> = { tentativas: tent };
            if (canal === "telefone" && tent.filter((t) => t.canal === "telefone").length >= MAX_TENTATIVAS_LIGACAO) { payload.status_atendimento = "sem_resposta"; payload.sem_resposta = true; }
            else if (r.status_atendimento === "aberto") payload.status_atendimento = "em_andamento";
            await gravarRegistro(r, payload, "atendimento_tentativa");
          }
        } else if (m.fonte === "oportunidade" && m.oportunidade) {
          if (it.efeito === "fecha") await gravarOportunidade(m.oportunidade, { status: "atendida" });
        } else if (m.fonte === "revisao" && m.revisao) {
          const t = m.revisao.trator, atual = m.revisao.contato;
          if (it.efeito === "fecha") {
            await gravarRevisao(t, atual, (x) => ({
              ...x, status: d.desfecho === "servico_agendado" ? "agendada" : "nao_quer", data_agendada: d.desfecho === "servico_agendado" ? d.servicoEm : null,
              motivo: (d.desfecho === "recusou" ? d.motivoRecusa : texto).trim() || rot, concluido_em: agoraIso, proximo_contato_em: null,
            }));
          } else if (it.efeito === "retorno" && d.retorno) {
            await gravarRevisao(t, atual, (x) => ({ ...x, proximo_contato_em: d.retorno }));
          } else if (it.efeito === "tentativa") {
            await gravarRevisao(t, atual, (x) => ({ ...x, tentativas: [...x.tentativas, { data: agoraIso, canal }] }));
          }
        }
        ok++;
      } catch (e) {
        erros.push(`${m.selo}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    // Tentativa que não tem onde ficar (cliente só com oportunidades do robô): guarda nesta tela para ele voltar amanhã.
    if ((d.desfecho === "sem_resposta" || d.desfecho === "whatsapp" || d.desfecho === "numero_errado") && !c.motivos.some((m) => m.fonte !== "oportunidade")) {
      setTentLocais((p) => ({ ...p, [c.key]: [...(p[c.key] || []), { data: agoraIso, canal }] }));
    }
    setOcupado(null);
    setGeradoEm(Date.now());
    if (erros.length) { avisar(`Gravou ${ok} de ${plano.length}. Não gravou: ${erros.join(" | ")}`, "erro"); return false; }
    avisar(simulando
      ? `Simulação — nada foi gravado. (${c.nome}: ${rot}${plano.length ? `, ${plano.length} motivo(s)` : ""})`
      : `Gravado: ${c.nome} — ${rot} (${plano.length} motivo(s)).`, simulando ? "sim" : "ok");
    return true;
  }, [avisar, exemplo, simulando, gravarRegistro, gravarOportunidade, gravarRevisao, mensagemDe]);

  const alternarGrupo = useCallback((g: Grupo) => setGrupos((s) => { const n = new Set(s); if (n.has(g)) n.delete(g); else n.add(g); return n; }), []);

  return {
    exemplo, podeCockpit, carregando, carregandoRev, erro, avisos, recarregar: carregar, geradoEm, tabelaContato,
    clientes, basicos, filtrados, fila, porGrupo, numeros, painel, feitos, area, tecnicos,
    grupos, setGrupos, alternarGrupo, minhaArea, setMinhaArea, soAcao, setSoAcao, busca, setBusca, tecnico, setTecnico, cota, setCota,
    gravar, setGravar, simulando, ocupado, toast, fecharToast: () => setToast(null), avisar,
    historico, abrirHistorico: (c: Pick<ClienteHoje, "nome" | "codigo_omie">) => { if (exemplo) { avisar("Cliente de exemplo: o histórico só abre com os dados reais.", "sim"); return; } setHistorico({ nome: c.nome, codigoOmie: c.codigo_omie }); },
    fecharHistorico: () => setHistorico(null),
    executar, mensagemDe, oportunidadesAbertas: base.oportunidades.filter((o) => o.status === "aberta"),
  };
}

export type Hoje = ReturnType<typeof useHoje>;
export type { ItemPlano };
