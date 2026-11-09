"use client";
// Fases do POS e do PPV (controlador, 09/11/2026) — uma leitura por página, compartilhada entre as telas.
// Salvar avisa as outras instâncias pelo evento abaixo. Antes de carregar: as fases de sempre.
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { fetchAuth } from "@/lib/auth/client";
import { listaPadrao, nomeDaFase, type FaseQuadro, type ModuloFases } from "@/lib/fases/quadro";

interface Estado { pos: FaseQuadro[]; ppv: FaseQuadro[]; podeEditar: boolean; carregado: boolean; migracaoFaltando: boolean }
const EVENTO = "fases-quadro-mudou";
let estado: Estado = { pos: listaPadrao(), ppv: listaPadrao(), podeEditar: false, carregado: false, migracaoFaltando: false };
let pedido: Promise<void> | null = null;

function publicar(novo: Estado) {
  estado = novo;
  window.dispatchEvent(new Event(EVENTO));
}

export function recarregarFasesQuadro(): Promise<void> {
  pedido = fetchAuth("/api/fases/quadro")
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      if (j) publicar({ pos: j.pos || listaPadrao(), ppv: j.ppv || listaPadrao(), podeEditar: !!j.podeEditar, carregado: true, migracaoFaltando: !!j.migracaoFaltando });
    })
    .catch(() => { /* sem rede: ficam as fases de sempre */ });
  return pedido;
}

/** Salva um ou os dois quadros. Devolve a mensagem de erro ou null. */
export async function salvarFasesQuadro(listas: Partial<Record<ModuloFases, FaseQuadro[]>>): Promise<string | null> {
  const r = await fetchAuth("/api/fases/quadro", {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listas }),
  }).catch(() => null);
  if (!r) return "Sem conexão. Tente de novo.";
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return j.error || "Não deu para salvar as fases.";
  await recarregarFasesQuadro();
  return null;
}

const assinar = (f: () => void) => { window.addEventListener(EVENTO, f); return () => window.removeEventListener(EVENTO, f); };
const ler = () => estado;

export function useFasesQuadro(): Estado {
  const e = useSyncExternalStore(assinar, ler, ler);
  useEffect(() => { if (!pedido) void recarregarFasesQuadro(); }, []);
  return e;
}

/** Atalho para as telas: chaves em ordem + nome mostrado de um quadro. */
export function useFasesDo(modulo: ModuloFases) {
  const e = useFasesQuadro();
  const lista = e[modulo];
  return useMemo(() => {
    const mapa = new Map(lista.map((f) => [f.chave, nomeDaFase(f)]));
    return {
      lista,
      chaves: lista.map((f) => f.chave),
      /** nome da fase (o salvo; sem ele, `curto` ou a própria chave) */
      nome: (chave: string, curto?: string) => {
        const f = lista.find((x) => x.chave === chave);
        if (f?.rotulo) return f.rotulo;
        return curto || mapa.get(chave) || chave;
      },
      podeEditar: e.podeEditar,
    };
  }, [lista, e.podeEditar]);
}
