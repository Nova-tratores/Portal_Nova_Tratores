"use client";
// Nomes das fases (lápis do pós-vendas) — uma leitura por página, compartilhada entre o POS e o PPV.
// Renomear avisa as outras instâncias pelo evento abaixo.
import { useEffect, useSyncExternalStore } from "react";
import { fetchAuth } from "@/lib/auth/client";

interface Estado { rotulos: Record<string, string>; podeEditar: boolean; carregado: boolean }
const EVENTO = "fases-rotulos-mudou";
let estado: Estado = { rotulos: {}, podeEditar: false, carregado: false };
let pedido: Promise<void> | null = null;

function publicar(novo: Estado) {
  estado = novo;
  window.dispatchEvent(new Event(EVENTO));
}

export function recarregarRotulosFases(): Promise<void> {
  pedido = fetchAuth("/api/fases/rotulos")
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => { if (j) publicar({ rotulos: j.rotulos || {}, podeEditar: !!j.podeEditar, carregado: true }); })
    .catch(() => { /* sem rede: ficam os nomes de sempre */ });
  return pedido;
}

export async function renomearFase(chave: string, rotulo: string): Promise<string | null> {
  const r = await fetchAuth("/api/fases/rotulos", {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chave, rotulo }),
  }).catch(() => null);
  if (!r) return "Sem conexão. Tente de novo.";
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return j.error || "Não deu para renomear.";
  await recarregarRotulosFases();
  return null;
}

const assinar = (f: () => void) => { window.addEventListener(EVENTO, f); return () => window.removeEventListener(EVENTO, f); };
const ler = () => estado;
const lerServidor = () => estado;

export function useRotulosFases(): Estado {
  const e = useSyncExternalStore(assinar, ler, lerServidor);
  useEffect(() => { if (!pedido) void recarregarRotulosFases(); }, []);
  return e;
}
