"use client";
// Estado da LIGAÇÃO no cockpit: descobre se há chamada aberta (minha ou de
// outro), inicia/retoma, cronômetro, autosave das notas (debounce 1,5 s, com
// nova tentativa em erro), encerra, cancela e avisa ao sair da página.
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { cancelarChamadaApi, encerrarChamadaApi, iniciarChamadaApi, salvarAoVivo, situacaoChamadaApi } from "./chamada-client";
import type { Chamada, MotivoNegativa } from "./chamada-db";
import type { PayloadEncerrar } from "./chamada";
import { segundosDesde } from "./tempo";

export type Situacao = "carregando" | "livre" | "minha" | "de_outro" | "erro";
export type EstadoSalvar = "ocioso" | "sujo" | "salvando" | "salvo" | "erro";

export interface EstadoChamada {
  situacao: Situacao;
  chamada: Chamada | null;
  motivos: MotivoNegativa[];
  erro: string | null;
  salvar: EstadoSalvar;
  salvoEm: string | null;
  segundos: number;
  ocupado: boolean; // iniciar/encerrar/cancelar em andamento
  registroAbertoEm: string | null; // aberto_em do registro da chamada (regra das 24 h)
}

const DEBOUNCE_MS = 1500;
const RETRY_MS = 5000;

export function useChamada(clienteKey: string) {
  const { userProfile } = useAuth();
  const [estado, setEstado] = useState<EstadoChamada>({
    situacao: "carregando", chamada: null, motivos: [], erro: null, salvar: "ocioso", salvoEm: null, segundos: 0, ocupado: false, registroAbertoEm: null,
  });
  const patch = useCallback((p: Partial<EstadoChamada> | ((e: EstadoChamada) => Partial<EstadoChamada>)) => {
    setEstado((e) => ({ ...e, ...(typeof p === "function" ? p(e) : p) }));
  }, []);

  // ---- situação inicial --------------------------------------------------
  const recarregar = useCallback(async () => {
    if (!clienteKey) return;
    try {
      const s = await situacaoChamadaApi(clienteKey);
      patch({
        situacao: s.aberta ? (s.minha ? "minha" : "de_outro") : "livre",
        chamada: s.aberta,
        motivos: s.motivos,
        erro: null,
        segundos: segundosDesde(s.aberta?.iniciada_em),
        registroAbertoEm: s.registro_aberto_em ?? null,
      });
    } catch (e) {
      patch({ situacao: "erro", erro: e instanceof Error ? e.message : "falha ao consultar a ligação" });
    }
  }, [clienteKey, patch]);

  useEffect(() => { void recarregar(); }, [recarregar]);

  // ---- cronômetro --------------------------------------------------------
  useEffect(() => {
    if (estado.situacao !== "minha" || !estado.chamada) return;
    const ini = estado.chamada.iniciada_em;
    const t = setInterval(() => patch({ segundos: segundosDesde(ini) }), 1000);
    return () => clearInterval(t);
  }, [estado.situacao, estado.chamada, patch]);

  // ---- aviso ao sair com ligação aberta ----------------------------------
  useEffect(() => {
    if (estado.situacao !== "minha") return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [estado.situacao]);

  // ---- autosave ----------------------------------------------------------
  const pendente = useRef<{ notas_ao_vivo?: string | null; telefone_usado?: string | null; oportunidade_id?: number | null }>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chamadaId = estado.chamada?.id ?? null;

  const flush = useCallback(async () => {
    if (!chamadaId) return;
    const campos = pendente.current;
    if (Object.keys(campos).length === 0) return;
    pendente.current = {};
    patch({ salvar: "salvando" });
    try {
      const gravou = await salvarAoVivo(chamadaId, campos);
      if (!gravou) throw new Error("ligação não está mais aberta");
      patch((e) => ({ salvar: Object.keys(pendente.current).length ? "sujo" : "salvo", salvoEm: new Date().toISOString(), chamada: e.chamada ? { ...e.chamada, ...campos } as Chamada : e.chamada }));
    } catch {
      // devolve o que não gravou e tenta de novo daqui a pouco
      pendente.current = { ...campos, ...pendente.current };
      patch({ salvar: "erro" });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), RETRY_MS);
    }
  }, [chamadaId, patch]);

  const agendar = useCallback((campos: typeof pendente.current) => {
    pendente.current = { ...pendente.current, ...campos };
    patch((e) => ({ salvar: "sujo", chamada: e.chamada ? ({ ...e.chamada, ...campos } as Chamada) : e.chamada }));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), DEBOUNCE_MS);
  }, [flush, patch]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const setNotas = useCallback((notas: string) => agendar({ notas_ao_vivo: notas }), [agendar]);
  const setTelefone = useCallback((tel: string) => agendar({ telefone_usado: tel || null }), [agendar]);
  const setOportunidade = useCallback((id: number | null) => agendar({ oportunidade_id: id }), [agendar]);

  // ---- ações -------------------------------------------------------------
  const iniciar = useCallback(async (args: { oportunidade_id?: number | null; registro_id?: number | null; telefone?: string | null } = {}) => {
    if (!clienteKey) return;
    patch({ ocupado: true, erro: null });
    try {
      const r = await iniciarChamadaApi({ cliente_key: clienteKey, ...args });
      patch({ situacao: "minha", chamada: r.chamada, segundos: segundosDesde(r.chamada?.iniciada_em), ocupado: false, salvar: "ocioso", registroAbertoEm: r.registro_aberto_em ?? null });
      return r;
    } catch (e) {
      const err = e as Error & { http?: number };
      patch({ ocupado: false, erro: err.message });
      if (err.http === 409) await recarregar();
      throw e;
    }
  }, [clienteKey, patch, recarregar]);

  const encerrar = useCallback(async (payload: PayloadEncerrar) => {
    if (!chamadaId) throw new Error("sem ligação aberta");
    if (timer.current) clearTimeout(timer.current);
    await flush();
    patch({ ocupado: true, erro: null });
    try {
      const r = await encerrarChamadaApi(chamadaId, payload);
      patch({ situacao: "livre", chamada: null, ocupado: false, segundos: 0, salvar: "ocioso" });
      return r;
    } catch (e) {
      patch({ ocupado: false, erro: (e as Error).message });
      throw e;
    }
  }, [chamadaId, flush, patch]);

  const cancelar = useCallback(async () => {
    if (!chamadaId) return;
    if (timer.current) clearTimeout(timer.current);
    patch({ ocupado: true, erro: null });
    try {
      await cancelarChamadaApi(chamadaId);
      pendente.current = {};
      patch({ situacao: "livre", chamada: null, ocupado: false, segundos: 0, salvar: "ocioso" });
    } catch (e) {
      patch({ ocupado: false, erro: (e as Error).message });
      throw e;
    }
  }, [chamadaId, patch]);

  return { estado, usuarioId: userProfile?.id ?? null, recarregar, iniciar, encerrar, cancelar, setNotas, setTelefone, setOportunidade };
}
