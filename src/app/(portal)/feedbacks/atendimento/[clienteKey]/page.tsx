"use client";
// Cockpit de atendimento (Fase 1): ficha de leitura em 3 colunas + a LIGAÇÃO
// (iniciar, cronômetro, notas com autosave, desfecho). Deep-links:
//   ?oportunidade=<id>  → inicia a ligação já com esse motivo
//   ?registro=<id>      → inicia a ligação sobre esse atendimento aberto
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { authHeaders } from "@/lib/auth/client";
import Cockpit, { COR_ATENDIMENTO } from "@/components/feedbacks/atendimento/Cockpit";
import PainelLigacao from "@/components/feedbacks/atendimento/PainelLigacao";
import Toast, { type ToastMsg } from "@/components/feedbacks/atendimento/Toast";
import ModalFeedback from "@/components/feedbacks/ModalFeedback";
import ModalPerfilCliente from "@/components/feedbacks/ModalPerfilCliente";
import CorrigirCadastro from "@/components/feedbacks/atendimento/CorrigirCadastro";
import { PainelBloqueado } from "@/components/feedbacks/atendimento/Bloqueado";
import ModalConfirmarCaveira from "@/components/feedbacks/ModalConfirmarCaveira";
import { marcarNaoContatar, reativarContato } from "@/lib/feedbacks/caveira";
import { useAuditLog } from "@/hooks/useAuditLog";
import { buscarClienteInfo, listarRegistros, upsertClienteInfo } from "@/lib/feedbacks/api";
import { useAuth } from "@/hooks/useAuth";
import { dadosDoContexto, montarRoteiro } from "@/lib/feedbacks/atendimento/roteiro";
import { TAG_CLIENTE_SENSIVEL } from "@/lib/feedbacks/atendimento/retorno";
import { useChamada } from "@/lib/feedbacks/atendimento/use-chamada";
import { telefonesDoContexto } from "@/lib/feedbacks/atendimento/use-telefones-whatsapp";
import { DESFECHO_POR_VALOR, type PayloadEncerrar } from "@/lib/feedbacks/atendimento/chamada";
import type { ContextoAtendimento } from "@/lib/feedbacks/atendimento/contexto";
import type { ClienteInfo, FeedbackRegistro, TipoFeedback } from "@/lib/feedbacks/types";

export default function CockpitAtendimentoPage() {
  const params = useParams<{ clienteKey: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const clienteKey = decodeURIComponent(params?.clienteKey || "");
  const [ctx, setCtx] = useState<ContextoAtendimento | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const [modal, setModal] = useState<{ tipo: TipoFeedback; registro: FeedbackRegistro | null } | null>(null);
  const [perfil, setPerfil] = useState<{ info: ClienteInfo | null } | null>(null);
  const [corrigindo, setCorrigindo] = useState(false);
  const [caveiraAberta, setCaveiraAberta] = useState(false);
  const [caveiraProcessando, setCaveiraProcessando] = useState(false);
  const { log } = useAuditLog();

  const lig = useChamada(clienteKey);
  const { userProfile } = useAuth();

  const carregar = useCallback(async () => {
    if (!clienteKey) return;
    setCarregando(true);
    setErro(null);
    try {
      const res = await fetch(`/api/feedbacks/atendimento/contexto?cliente_key=${encodeURIComponent(clienteKey)}`, { headers: await authHeaders(), cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.erro || `HTTP ${res.status}`);
      setCtx(data as ContextoAtendimento);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "erro ao carregar a ficha");
    } finally {
      setCarregando(false);
    }
  }, [clienteKey]);
  useEffect(() => { void carregar(); }, [carregar]);

  // Deep-link: inicia a ligação uma única vez, quando a situação ficar "livre".
  const autoIniciado = useRef(false);
  useEffect(() => {
    if (autoIniciado.current || lig.estado.situacao !== "livre") return;
    if (!ctx || ctx.identidade?.nao_contatar) return; // bloqueado: nunca inicia sozinho
    const op = search.get("oportunidade");
    const reg = search.get("registro");
    if (!op && !reg) return;
    autoIniciado.current = true;
    lig.iniciar({ oportunidade_id: op ? Number(op) : null, registro_id: reg ? Number(reg) : null })
      .then(() => setToast({ tipo: "ok", texto: "Ligação iniciada. Anote enquanto conversa." }))
      .catch((e) => setToast({ tipo: "erro", texto: (e as Error).message }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lig.estado.situacao, search, ctx]);

  const telefones = telefonesDoContexto(ctx);
  const id = ctx?.identidade;

  const iniciar = useCallback(async (telefone: string | null) => {
    await lig.iniciar({ telefone });
    setToast({ tipo: "ok", texto: "Ligação iniciada. Anote enquanto conversa." });
  }, [lig]);

  const encerrar = useCallback(async (payload: PayloadEncerrar, extras: { marcarSensivel: boolean }) => {
    const r = await lig.encerrar(payload);
    const nome = id?.nome || ctx?.nome || "cliente";
    if (extras.marcarSensivel) {
      // tag na pasta do cliente (best-effort — não segura o encerramento)
      try {
        const info = await buscarClienteInfo(clienteKey);
        const tags = info?.tags ?? [];
        if (!tags.includes(TAG_CLIENTE_SENSIVEL)) {
          await upsertClienteInfo({ cliente_key: clienteKey, codigo_omie: ctx?.codigo_omie ?? null, nome, tags: [...tags, TAG_CLIENTE_SENSIVEL] });
        }
      } catch { /* silencioso */ }
    }
    const d = DESFECHO_POR_VALOR[payload.desfecho];
    const msg = `${d.emoji} ${nome}: ${d.rotulo.toLowerCase()}${r.proximo_contato_em ? ` · ligar de novo em ${r.proximo_contato_em.split("-").reverse().join("/")}` : ""}`;
    router.push(`/feedbacks/atendimento?ok=${encodeURIComponent(msg)}`);
  }, [lig, id, ctx, router, clienteKey]);

  const cancelar = useCallback(async () => {
    await lig.cancelar();
    setToast({ tipo: "aviso", texto: "Ligação cancelada — nada foi registrado." });
    void carregar();
  }, [lig, carregar]);

  const abrirRegistro = useCallback(async (tipo: TipoFeedback, registroId?: number) => {
    let registro: FeedbackRegistro | null = null;
    if (registroId) {
      try { registro = (await listarRegistros(tipo)).find((r) => r.id === registroId) ?? null; } catch { /* prefill */ }
    }
    setModal({ tipo, registro });
  }, []);

  const abrirPerfil = useCallback(async () => {
    let info: ClienteInfo | null = null;
    try { info = await buscarClienteInfo(clienteKey); } catch { /* sem pasta */ }
    setPerfil({ info });
  }, [clienteKey]);

  const prefill: Partial<FeedbackRegistro> | undefined = ctx
    ? { nome: id?.nome || ctx.nome || "", telefone: telefones[0]?.numero ?? null, email: id?.email ?? null, codigo_omie: ctx.codigo_omie, trator: ctx.maquinas?.[0] ? [ctx.maquinas[0].modelo, ctx.maquinas[0].chassi].filter(Boolean).join(" — ") : null }
    : undefined;

  // 💀 Não contatar / reativar — mesma lib do CRM e da fila
  const pedirCaveira = useCallback(() => {
    if (!ctx) return;
    const nomeCli = ctx.identidade?.nome || ctx.nome || "";
    const tags = ctx.identidade?.tags ?? [];
    if (ctx.identidade?.nao_contatar) {
      const msg = ctx.codigo_omie ? `Reativar contato com "${nomeCli}"?\n\nRemove "Não contatar" e reativa o cadastro no Omie.` : `Reativar contato com "${nomeCli}"?\n\nRemove a marca "Não contatar".`;
      if (!confirm(msg)) return;
      reativarContato({ clienteKey, codigoOmie: ctx.codigo_omie, nome: nomeCli, tagsAtuais: tags }, log)
        .then(() => { setToast({ tipo: "ok", texto: "Contato reativado." }); void carregar(); })
        .catch((e) => setToast({ tipo: "erro", texto: (e as Error).message }));
      return;
    }
    setCaveiraAberta(true);
  }, [ctx, clienteKey, log, carregar]);
  const aplicarCaveira = useCallback(async (inativarOmie: boolean) => {
    if (!ctx) return;
    setCaveiraProcessando(true);
    try {
      await marcarNaoContatar({ clienteKey, codigoOmie: ctx.codigo_omie, nome: ctx.identidade?.nome || ctx.nome || "", tagsAtuais: ctx.identidade?.tags ?? [] }, inativarOmie, log);
      setCaveiraAberta(false);
      setToast({ tipo: "ok", texto: `Marcado como "Não contatar"${inativarOmie ? " e inativado no Omie" : ""}.` });
      void carregar();
    } catch (e) {
      setToast({ tipo: "erro", texto: (e as Error).message });
    } finally {
      setCaveiraProcessando(false);
    }
  }, [ctx, clienteKey, log, carregar]);

  const emLigacao = lig.estado.situacao === "minha";
  const roteiro = ctx
    ? montarRoteiro(ctx.roteiro, (ctx.motivos?.oportunidades ?? []).map((o) => o.regra), dadosDoContexto(ctx, userProfile?.nome))
    : [];

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: "12px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, fontSize: 12 }}>
        <Link href="/feedbacks/atendimento" style={{ color: COR_ATENDIMENTO, fontWeight: 700, textDecoration: "none" }}>← Fila de atendimento</Link>
        {ctx && <span style={{ opacity: 0.5 }}>ficha montada {new Date(ctx.gerado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>}
        {emLigacao && <span style={{ color: "#16a34a", fontWeight: 700 }}>● em ligação</span>}
        <button type="button" onClick={carregar} disabled={carregando} style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 999, border: `1px solid ${COR_ATENDIMENTO}`, background: "transparent", color: COR_ATENDIMENTO, cursor: "pointer" }}>
          {carregando ? "Atualizando…" : "↻ Atualizar"}
        </button>
      </div>

      {erro && <div style={{ background: "#fee2e2", color: "#991b1b", borderRadius: 10, padding: "8px 12px", fontSize: 12, marginBottom: 12 }}>{erro}</div>}

      <Cockpit
        ctx={ctx}
        carregando={carregando}
        onRecarregar={carregar}
        onRegistrar={abrirRegistro}
        onEditarPerfil={abrirPerfil}
        assuntoId={emLigacao ? (lig.estado.chamada?.oportunidade_id ?? null) : undefined}
        onEscolherAssunto={emLigacao ? lig.setOportunidade : undefined}
        roteiro={roteiro}
        onCorrigirCadastro={ctx?.codigo_omie ? () => setCorrigindo(true) : undefined}
        onNaoContatar={ctx ? pedirCaveira : undefined}
        painelDireito={
          id?.nao_contatar ? (
            <PainelBloqueado onReativar={pedirCaveira} motivosAbertos={ctx?.motivos?.oportunidades.length ?? 0} />
          ) : (
          <PainelLigacao
            estado={lig.estado}
            telefones={telefones}
            naoContatar={!!id?.nao_contatar}
            abertoEmDoRegistro={lig.estado.registroAbertoEm}
            onIniciar={iniciar}
            onSetTelefone={lig.setTelefone}
            onSetNotas={lig.setNotas}
            onEncerrar={encerrar}
            onCancelar={cancelar}
            onRegistrarSemLigar={(tipo) => abrirRegistro(tipo)}
            configRetorno={ctx?.config_retorno}
            humoresRecentes={ctx?.humores_recentes}
          />
          )
        }
      />

      <Toast msg={toast} onFechar={() => setToast(null)} />

      {modal && (
        <ModalFeedback tipo={modal.tipo} aberto registro={modal.registro} prefill={modal.registro ? undefined : prefill} clienteNaoContatar={!!id?.nao_contatar} onFechar={() => setModal(null)} onSalvo={() => { setModal(null); void carregar(); }} />
      )}
      <ModalConfirmarCaveira
        aberto={caveiraAberta}
        nome={id?.nome || ctx?.nome || ""}
        codigoOmie={ctx?.codigo_omie ?? null}
        processando={caveiraProcessando}
        onFechar={() => { if (!caveiraProcessando) setCaveiraAberta(false); }}
        onApenasNaoContatar={() => void aplicarCaveira(false)}
        onInativarOmie={() => void aplicarCaveira(true)}
      />
      {corrigindo && ctx?.codigo_omie && (
        <CorrigirCadastro
          codigoOmie={ctx.codigo_omie}
          nome={id?.nome || ctx.nome || ""}
          telefoneAtual={id?.telefones.find((t) => t.origem === "Cadastro Omie")?.numero ?? null}
          emailAtual={id?.email ?? null}
          emailInterno={!!id?.email_interno}
          onFechar={() => setCorrigindo(false)}
          onSalvo={() => { setCorrigindo(false); setToast({ tipo: "ok", texto: "Cadastro corrigido no Omie." }); void carregar(); }}
        />
      )}
      {perfil && (
        <ModalPerfilCliente aberto nome={id?.nome || ctx?.nome || ""} codigoOmie={ctx?.codigo_omie ?? null} info={perfil.info} onFechar={() => setPerfil(null)} onSalvo={() => { setPerfil(null); void carregar(); }} />
      )}
    </div>
  );
}
