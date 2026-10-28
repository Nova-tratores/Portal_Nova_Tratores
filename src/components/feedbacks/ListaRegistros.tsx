"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import RegistroCard from "./RegistroCard";
import ModalFeedback from "./ModalFeedback";
import ModalHistoricoCliente from "./ModalHistoricoCliente";
import ModalConfirmarCaveira from "./ModalConfirmarCaveira";
import { atualizarRegistro, buscarUltimasOSPorCliente, listarRegistros, listarClientesInfo, type UltimaOS } from "@/lib/feedbacks/api";
import { marcarNaoContatar, reativarContato } from "@/lib/feedbacks/caveira";
import { clienteKey, TAG_NAO_CONTATAR, type ClienteInfo, type FeedbackRegistro, type StatusAtendimento, type TipoFeedback } from "@/lib/feedbacks/types";
import { useAuditLog } from "@/hooks/useAuditLog";
import { useRouter } from "next/navigation";
import { ESTILO_FBN } from "./estiloNovo";
import { corTipo } from "@/lib/feedbacks/cores";
import { useAuth } from "@/hooks/useAuth";
import { usePermissoes } from "@/hooks/usePermissoes";

interface Props {
  tipo: TipoFeedback;
}

interface Filtros {
  busca: string;
  tecnico: string;
  dataDe: string;
  dataAte: string;
  // Atendimento ("pendentes" = tudo menos concluído; é o padrão da tela)
  statusAtendimento: "pendentes" | "todos" | "aberto" | "em_andamento" | "concluido" | "sem_resposta" | "atrasados" | "arquivado";
  // CRM-only
  notaMin: number;
  statusCrm: string;
  // RFM-only
  prioridade: string;
  semResposta: "todos" | "sim" | "nao";
}

const FILTROS_VAZIO: Filtros = {
  busca: "", tecnico: "", dataDe: "", dataAte: "",
  statusAtendimento: "pendentes",
  notaMin: 0, statusCrm: "",
  prioridade: "", semResposta: "todos",
};

function dataReferencia(r: FeedbackRegistro): string | null {
  return r.data_contato || r.data_servico || r.ultimo_servico || r.criado_em;
}

function aplicarFiltros(rows: FeedbackRegistro[], f: Filtros, tipo: TipoFeedback): FeedbackRegistro[] {
  const q = f.busca.trim().toLowerCase();
  return rows.filter((r) => {
    if (q) {
      const hay = [r.nome, r.trator, r.tecnico, r.codigo_omie, r.feedback, r.motivo].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (f.tecnico && r.tecnico !== f.tecnico) return false;
    const dRef = dataReferencia(r);
    if (f.dataDe && dRef && dRef < f.dataDe) return false;
    if (f.dataAte && dRef && dRef > f.dataAte) return false;
    // Filtro de status de atendimento
    if (f.statusAtendimento === "atrasados") {
      // aberto há mais de 24h
      if (r.status_atendimento !== "aberto" && r.status_atendimento !== "em_andamento") return false;
      if (!r.aberto_em) return false;
      const horas = (Date.now() - new Date(r.aberto_em).getTime()) / (1000 * 60 * 60);
      if (horas < 24) return false;
    } else if (f.statusAtendimento === "pendentes") {
      // Padrão da tela: esconde concluídos e arquivados (o que ainda precisa de ação fica visível).
      if (r.status_atendimento === "concluido" || r.status_atendimento === "arquivado") return false;
    } else if (f.statusAtendimento !== "todos") {
      if (r.status_atendimento !== f.statusAtendimento) return false;
    }
    if (tipo === "crm") {
      if (f.statusCrm && r.status_cliente !== f.statusCrm) return false;
      if (f.notaMin > 0 && (r.nota ?? 0) < f.notaMin) return false;
    } else {
      if (f.prioridade && r.prioridade !== f.prioridade) return false;
      if (f.semResposta === "sim" && !r.sem_resposta) return false;
      if (f.semResposta === "nao" && r.sem_resposta) return false;
    }
    return true;
  });
}

export default function ListaRegistros({ tipo }: Props) {
  const router = useRouter();
  const { userProfile: perfilAuth } = useAuth();
  const { pode } = usePermissoes(perfilAuth?.id);
  const podeCockpit = pode("feedbacks", "atendimento");
  const [rows, setRows] = useState<FeedbackRegistro[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VAZIO);
  const [filtrosVisivel, setFiltrosVisivel] = useState(false);

  const [modalAberto, setModalAberto] = useState(false);
  const [registroEdit, setRegistroEdit] = useState<FeedbackRegistro | null>(null);
  // Última OS (oficina) por nome de cliente — preenche o "último técnico" no card.
  const [ultimasOS, setUltimasOS] = useState<Record<string, UltimaOS>>({});
  // Cliente cujo histórico (OS/PV/requisições) está aberto no modal.
  const [histAlvo, setHistAlvo] = useState<{ nome: string; codigoOmie: string | null } | null>(null);
  // Info/tags por cliente (feedback_clientes_info) — ícones e caveira.
  const [infoPorKey, setInfoPorKey] = useState<Record<string, ClienteInfo>>({});
  // Caveira: registro alvo da confirmação expressiva (marcar/inativar).
  const [caveiraAlvo, setCaveiraAlvo] = useState<FeedbackRegistro | null>(null);
  const [caveiraProcessando, setCaveiraProcessando] = useState(false);
  const { log } = useAuditLog();

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const data = await listarRegistros(tipo);
      setRows(data);
      // Busca a última OS por cliente em paralelo (best-effort — não bloqueia a lista).
      buscarUltimasOSPorCliente(data.map((r) => r.nome))
        .then(setUltimasOS)
        .catch(() => { /* silencioso: card só não mostra a última OS */ });
      // Info/tags dos clientes (best-effort).
      listarClientesInfo()
        .then((infos) => {
          const m: Record<string, ClienteInfo> = {};
          for (const i of infos) m[i.cliente_key] = i;
          setInfoPorKey(m);
        })
        .catch(() => { /* sem tags — cards só não mostram ícones */ });
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [tipo]);

  useEffect(() => { void carregar(); }, [carregar]);

  const tagsDe = useCallback(
    (r: FeedbackRegistro): string[] => (infoPorKey[clienteKey(r.codigo_omie, r.nome)]?.tags as string[] | undefined) || [],
    [infoPorKey]
  );

  const filtradas = useMemo(() => {
    const base = aplicarFiltros(rows, filtros, tipo);
    // No padrão "pendentes", esconde também os clientes marcados como "não contatar" (caveira).
    if (filtros.statusAtendimento !== "pendentes") return base;
    return base.filter((r) => !tagsDe(r).includes(TAG_NAO_CONTATAR));
  }, [rows, filtros, tipo, tagsDe]);

  const tecnicosUnicos = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.tecnico) set.add(r.tecnico);
    return Array.from(set).sort();
  }, [rows]);

  const titulo = tipo === "crm" ? "CRM · clientes atendidos há pouco" : "RFM · clientes que sumiram";
  const corDoTipo = corTipo(tipo);

  function abrirNovo() {
    setRegistroEdit(null);
    setModalAberto(true);
  }
  function abrirEdit(r: FeedbackRegistro) {
    // Atendimento em aberto + permissão do cockpit → liga por lá (ficha completa).
    // Concluído/arquivado (ou sem permissão) → modal de edição como sempre.
    const emAberto = r.status_atendimento === "aberto" || r.status_atendimento === "em_andamento" || r.status_atendimento === "sem_resposta";
    if (emAberto && podeCockpit) {
      router.push(`/feedbacks/atendimento/${encodeURIComponent(clienteKey(r.codigo_omie, r.nome))}?registro=${r.id}`);
      return;
    }
    setRegistroEdit(r);
    setModalAberto(true);
  }
  function handleSalvo(salvo: FeedbackRegistro) {
    setRows((prev) => {
      const idx = prev.findIndex((x) => x.id === salvo.id);
      if (idx === -1) return [salvo, ...prev];
      const novo = [...prev];
      novo[idx] = salvo;
      return novo;
    });
  }
  // Muda o status de atendimento direto no card (concluir, reabrir, sem-resposta).
  // - concluido: registra concluido_em; outros status limpam.
  // - sem_resposta: liga a flag sem_resposta (badge/filtro); demais desligam.
  async function handleMudarAtendimento(r: FeedbackRegistro, novo: StatusAtendimento) {
    try {
      const payload: Partial<FeedbackRegistro> = {
        status_atendimento: novo,
        concluido_em: novo === "concluido" ? new Date().toISOString() : null,
        sem_resposta: novo === "sem_resposta",
      };
      const salvo = await atualizarRegistro(r.id, payload);
      handleSalvo(salvo);
      const acaoLog = novo === "concluido" ? "atendimento_concluido"
        : novo === "sem_resposta" ? "atendimento_sem_resposta"
        : "atendimento_reaberto";
      void log({
        sistema: "feedbacks", acao: acaoLog, entidade: "cliente",
        entidade_id: clienteKey(r.codigo_omie, r.nome), entidade_label: r.nome,
        detalhes: { status: novo },
      });
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }
  // Arquiva o atendimento com justificativa (cliente que não vale a pena).
  async function handleArquivar(r: FeedbackRegistro) {
    const motivo = prompt(`Motivo para arquivar o atendimento de "${r.nome}":`);
    if (motivo === null) return; // cancelou
    try {
      const salvo = await atualizarRegistro(r.id, {
        status_atendimento: "arquivado",
        arquivado_motivo: motivo || "(sem motivo)",
      });
      handleSalvo(salvo);
      void log({
        sistema: "feedbacks", acao: "atendimento_arquivado", entidade: "cliente",
        entidade_id: clienteKey(r.codigo_omie, r.nome), entidade_label: r.nome,
        detalhes: { motivo: motivo || "(sem motivo)" },
      });
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }
  // 💀 Caveira: marcar abre a confirmação expressiva (pode inativar no Omie);
  // se já estiver marcado, o clique reativa o contato.
  function handleCaveira(r: FeedbackRegistro) {
    const jaMarcado = ((infoPorKey[clienteKey(r.codigo_omie, r.nome)]?.tags as string[] | undefined) || []).includes(TAG_NAO_CONTATAR);
    if (jaMarcado) { void handleReativar(r); return; }
    setCaveiraAlvo(r);
  }

  // Marca "não contatar" no Portal e, opcionalmente, inativa o cadastro no Omie. Auditado.
  async function aplicarNaoContatar(r: FeedbackRegistro, inativarOmie: boolean) {
    const key = clienteKey(r.codigo_omie, r.nome);
    const atual = (infoPorKey[key]?.tags as string[] | undefined) || [];
    setCaveiraProcessando(true);
    try {
      const salvo = await marcarNaoContatar({ clienteKey: key, codigoOmie: r.codigo_omie, nome: r.nome, tagsAtuais: atual }, inativarOmie, log);
      setInfoPorKey((prev) => ({ ...prev, [key]: salvo }));
      setCaveiraAlvo(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setCaveiraProcessando(false);
    }
  }

  // Reativa o contato: remove a tag e (se houver código) reativa o cadastro no Omie. Auditado.
  async function handleReativar(r: FeedbackRegistro) {
    const key = clienteKey(r.codigo_omie, r.nome);
    const atual = (infoPorKey[key]?.tags as string[] | undefined) || [];
    const temOmie = !!r.codigo_omie;
    const msg = temOmie
      ? `Reativar contato com "${r.nome}"?\n\nRemove "Não contatar" e reativa o cadastro no Omie.`
      : `Reativar contato com "${r.nome}"?\n\nRemove a marca "Não contatar".`;
    if (!confirm(msg)) return;
    try {
      const salvo = await reativarContato({ clienteKey: key, codigoOmie: r.codigo_omie, nome: r.nome, tagsAtuais: atual }, log);
      setInfoPorKey((prev) => ({ ...prev, [key]: salvo }));
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  // atalhos de situação com a contagem (respeitam a busca e os outros filtros)
  // José, 23/10/2026: os atalhos antigos se sobrepunham ("Para atender 19", "Em atendimento 19",
  // "Atrasados 19") e confundiam. Agora cada cliente cai em UM só: a soma dos três "a fazer" dá o
  // total "A fazer", e "Já resolvidos" soma concluídos + arquivados.
  const A_FAZER: { k: Filtros["statusAtendimento"]; rot: string; ico: string; cor: string; dica: string }[] = [
    { k: "aberto", rot: "Ninguém ligou ainda", ico: "fa-inbox", cor: corDoTipo, dica: "Entrou na lista e ainda não teve nenhuma ligação." },
    { k: "em_andamento", rot: "Já começou", ico: "fa-headset", cor: "#2563eb", dica: "Alguém já ligou ou está cuidando, mas ainda não terminou." },
    { k: "sem_resposta", rot: "Não atende", ico: "fa-phone-slash", cor: "#d97706", dica: "Tentaram 3 vezes e o cliente não atendeu — vale tentar pelo WhatsApp." },
  ];
  const FEITOS: { k: Filtros["statusAtendimento"]; rot: string; ico: string; cor: string; dica: string }[] = [
    { k: "concluido", rot: "Concluídos", ico: "fa-circle-check", cor: "#16a34a", dica: "Conversou com o cliente e registrou o que ele disse." },
    { k: "arquivado", rot: "Arquivados", ico: "fa-box-archive", cor: "#64748b", dica: "Tirado da lista sem conversar (telefone errado, cliente pediu, etc.), com o motivo." },
  ];
  const contar = (k: Filtros["statusAtendimento"]) => aplicarFiltros(rows, { ...filtros, statusAtendimento: k }, tipo).length;

  return (
    <div className="fbn" style={{ ["--c" as string]: corDoTipo }}>
      <style>{ESTILO_FBN}</style>
      {/* Topo: título, busca e ações */}
      <div className="fbn-topo">
        <h1 className="fbn-titulo">
          <span className="fbn-ico"><i className={`fa-solid ${tipo === "crm" ? "fa-comments" : "fa-user-clock"}`} /></span>
          {titulo}
          <span className="fbn-conta">{filtradas.length} de {rows.length}</span>
        </h1>
        <label className="fbn-busca">
          <i className="fa-solid fa-magnifying-glass" />
          <input
            type="text"
            value={filtros.busca}
            onChange={(e) => setFiltros((f) => ({ ...f, busca: e.target.value }))}
            placeholder="Buscar cliente, equipamento, técnico, código Omie ou o que o cliente disse"
          />
          {filtros.busca && <button type="button" className="fbn-acao cinza" style={{ height: 26, padding: "0 8px", border: 0 }} onClick={() => setFiltros((f) => ({ ...f, busca: "" }))} aria-label="Limpar a busca"><i className="fa-solid fa-xmark" /></button>}
        </label>
        <button type="button" onClick={() => setFiltrosVisivel((v) => !v)} className={`fbn-btn ${filtrosVisivel ? "on" : ""}`}>
          <i className="fa-solid fa-sliders" /> Filtros
        </button>
        <button type="button" onClick={abrirNovo} className="fbn-btn cheio">
          <i className="fa-solid fa-plus" /> Novo {tipo === "crm" ? "feedback" : "registro"}
        </button>
      </div>

      {/* O que é esta lista (José: "tem que deixar mais claro o que é CRM, RFM e tudo mais") */}
      <div className="fbn-explica">
        <span className="fbn-ico p"><i className={`fa-solid ${tipo === "crm" ? "fa-comments" : "fa-user-clock"}`} /></span>
        {tipo === "crm" ? (
          <div><b>CRM = pesquisa depois do serviço.</b> Ligar para quem fez serviço com a gente há poucos dias (o melhor é de 3 a 7 dias) e perguntar se ficou bom: nota de 0 a 10, se indicaria e o que melhorar. Nota baixa avisa o gerente.</div>
        ) : (
          <div><b>RFM = cliente que sumiu.</b> Clientes que já fizeram serviço ou compraram e não aparecem há muito tempo. Ligar para saber por que pararam de vir e trazer de volta (revisão, peças, manutenção).</div>
        )}
      </div>

      {/* Atalhos por situação do atendimento */}
      <div className="fbn-chips">
        <span className="fbn-grupo">A fazer</span>
        <button type="button" className={`fbn-chip ${filtros.statusAtendimento === "pendentes" ? "on" : ""}`} style={{ ["--k" as string]: corDoTipo }}
          title="Todos que ainda precisam de contato (a soma dos três ao lado)" onClick={() => setFiltros((f) => ({ ...f, statusAtendimento: "pendentes" }))}>
          <i className="fa-solid fa-list-check" /> Todos a fazer <span className="n">{contar("pendentes")}</span>
        </button>
        {A_FAZER.map((a) => (
          <button key={a.k} type="button" title={a.dica} className={`fbn-chip ${filtros.statusAtendimento === a.k ? "on" : ""}`} style={{ ["--k" as string]: a.cor }}
            onClick={() => setFiltros((f) => ({ ...f, statusAtendimento: a.k }))}>
            <i className={`fa-solid ${a.ico}`} /> {a.rot} <span className="n">{contar(a.k)}</span>
          </button>
        ))}
        <span className="fbn-sep" />
        <span className="fbn-grupo">Já resolvidos</span>
        {FEITOS.map((a) => (
          <button key={a.k} type="button" title={a.dica} className={`fbn-chip ${filtros.statusAtendimento === a.k ? "on" : ""}`} style={{ ["--k" as string]: a.cor }}
            onClick={() => setFiltros((f) => ({ ...f, statusAtendimento: a.k }))}>
            <i className={`fa-solid ${a.ico}`} /> {a.rot} <span className="n">{contar(a.k)}</span>
          </button>
        ))}
        <span className="fbn-sep" />
        <button type="button" className={`fbn-chip ${filtros.statusAtendimento === "todos" ? "on" : ""}`} style={{ ["--k" as string]: "#475569" }}
          onClick={() => setFiltros((f) => ({ ...f, statusAtendimento: "todos" }))}>
          <i className="fa-solid fa-list" /> Tudo <span className="n">{contar("todos")}</span>
        </button>
      </div>

      {/* Filtros avançados */}
      {filtrosVisivel && (
        <div className="fbn-filtros">
          <FiltroCampo label="Técnico">
            <select value={filtros.tecnico} onChange={(e) => setFiltros((f) => ({ ...f, tecnico: e.target.value }))} className="fbn-campo">
              <option value="">Todos</option>
              {tecnicosUnicos.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </FiltroCampo>
          <FiltroCampo label="Data de">
            <input type="date" value={filtros.dataDe} onChange={(e) => setFiltros((f) => ({ ...f, dataDe: e.target.value }))} className="fbn-campo" />
          </FiltroCampo>
          <FiltroCampo label="Data até">
            <input type="date" value={filtros.dataAte} onChange={(e) => setFiltros((f) => ({ ...f, dataAte: e.target.value }))} className="fbn-campo" />
          </FiltroCampo>

          {tipo === "crm" ? (
            <>
              <FiltroCampo label="Como o cliente está">
                <select value={filtros.statusCrm} onChange={(e) => setFiltros((f) => ({ ...f, statusCrm: e.target.value }))} className="fbn-campo">
                  <option value="">Todos</option>
                  <option value="Satisfeito">Satisfeito</option>
                  <option value="Neutro">Neutro</option>
                  <option value="Insatisfeito">Insatisfeito</option>
                  <option value="Aguardando">Aguardando</option>
                </select>
              </FiltroCampo>
              <FiltroCampo label={`Nota mínima: ${filtros.notaMin || "qualquer"}`}>
                <input type="range" min={0} max={10} value={filtros.notaMin}
                  onChange={(e) => setFiltros((f) => ({ ...f, notaMin: Number(e.target.value) }))}
                  style={{ width: "100%", accentColor: corDoTipo }}
                />
              </FiltroCampo>
            </>
          ) : (
            <>
              <FiltroCampo label="Prioridade">
                <select value={filtros.prioridade} onChange={(e) => setFiltros((f) => ({ ...f, prioridade: e.target.value }))} className="fbn-campo">
                  <option value="">Todas</option>
                  <option value="Urgente">Urgente</option>
                  <option value="Normal">Normal</option>
                  <option value="Inativo">Inativo</option>
                </select>
              </FiltroCampo>
              <FiltroCampo label="Sem resposta">
                <select value={filtros.semResposta} onChange={(e) => setFiltros((f) => ({ ...f, semResposta: e.target.value as "todos" | "sim" | "nao" }))} className="fbn-campo">
                  <option value="todos">Todos</option>
                  <option value="sim">Só sem resposta</option>
                  <option value="nao">Só com resposta</option>
                </select>
              </FiltroCampo>
            </>
          )}

          <button type="button" onClick={() => setFiltros(FILTROS_VAZIO)} className="fbn-btn" style={{ alignSelf: "end" }}>
            <i className="fa-solid fa-eraser" /> Limpar filtros
          </button>
        </div>
      )}

      {erro && <div className="fbn-erro">Erro: {erro}</div>}

      {/* Lista */}
      {loading ? (
        <div className="fbn-vazio"><i className="fa-solid fa-circle-notch fa-spin" /> Carregando…</div>
      ) : filtradas.length === 0 ? (
        <div className="fbn-vazio">
          {rows.length === 0
            ? `Nenhum registro de ${tipo.toUpperCase()} cadastrado ainda.`
            : "Nenhum cliente nesta situação com esses filtros."}
        </div>
      ) : (
        <div className="fbn-grade">
          {filtradas.map((r) => (
            <RegistroCard
              key={r.id}
              registro={r}
              ultimaOS={ultimasOS[(r.nome || "").trim()] || null}
              onEditar={abrirEdit}
              onMudarAtendimento={handleMudarAtendimento}
              onArquivar={handleArquivar}
              onVerHistorico={(reg) => setHistAlvo({ nome: reg.nome, codigoOmie: reg.codigo_omie })}
              clienteTags={tagsDe(r)}
            />
          ))}
        </div>
      )}

      <ModalFeedback
        tipo={tipo}
        aberto={modalAberto}
        registro={registroEdit}
        onFechar={() => setModalAberto(false)}
        onSalvo={handleSalvo}
        onCaveira={handleCaveira}
        clienteNaoContatar={registroEdit ? tagsDe(registroEdit).includes(TAG_NAO_CONTATAR) : false}
      />

      <ModalHistoricoCliente
        aberto={!!histAlvo}
        nome={histAlvo?.nome || ""}
        codigoOmie={histAlvo?.codigoOmie ?? null}
        onFechar={() => setHistAlvo(null)}
      />

      <ModalConfirmarCaveira
        aberto={!!caveiraAlvo}
        nome={caveiraAlvo?.nome || ""}
        codigoOmie={caveiraAlvo?.codigo_omie ?? null}
        processando={caveiraProcessando}
        onFechar={() => { if (!caveiraProcessando) setCaveiraAlvo(null); }}
        onApenasNaoContatar={() => { if (caveiraAlvo) void aplicarNaoContatar(caveiraAlvo, false); }}
        onInativarOmie={() => { if (caveiraAlvo) void aplicarNaoContatar(caveiraAlvo, true); }}
      />

    </div>
  );
}

function FiltroCampo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="fbn-rot">{label}</div>
      {children}
    </div>
  );
}
