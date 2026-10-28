"use client";
// Opção 1 · Fila "próximo cliente": um cliente por vez, grande, com tudo para a ligação e os
// botões grandes. Ao lado, os próximos 5. Pular manda o cliente para o fim da fila (só na tela).
import { useMemo, useState } from "react";
import type { ItemFila } from "@/lib/feedbacks/fila";
import type { Fila } from "./useFila";
import FichaCliente, { COR_ACAO, ICO_ACAO, rotuloDias } from "./FichaCliente";
import AcoesAtendimento from "./AcoesAtendimento";

export default function OpcaoProximo({ fila }: { fila: Fila }) {
  const [selId, setSelId] = useState<number | null>(null);
  const [pulados, setPulados] = useState<number[]>([]);

  const ordem = useMemo(() => {
    const p = new Set(pulados);
    return [...fila.itens.filter((it) => !p.has(it.registro.id)), ...pulados.map((id) => fila.itens.find((it) => it.registro.id === id)).filter((x): x is ItemFila => !!x)];
  }, [fila.itens, pulados]);

  const idx = Math.max(0, ordem.findIndex((it) => it.registro.id === selId));
  const atual = ordem[idx] ?? null;
  const proximos = ordem.slice(idx + 1, idx + 6);
  const ir = (i: number) => setSelId(ordem[(i + ordem.length) % ordem.length]?.registro.id ?? null);
  const pular = () => {
    if (!atual) return;
    const prox = ordem[idx + 1]?.registro.id ?? null;
    setPulados((p) => [...p.filter((x) => x !== atual.registro.id), atual.registro.id]);
    setSelId(prox);
  };

  if (!atual) return <div className="fbn-vazio">{fila.escopo === "agora" ? "Ninguém para atender agora. Bom trabalho." : "Nenhum cliente nesta situação."}</div>;

  return (
    <VistaProximo atual={atual} posicao={idx} total={ordem.length} proximos={proximos} fila={fila}
      onAnterior={() => ir(idx - 1)} onProximo={() => ir(idx + 1)} onPular={pular} onEscolher={(id) => setSelId(id)}
      onFeito={() => setSelId(proximos[0]?.registro.id ?? null)} />
  );
}

/** Desenho da opção 1 (separado para a prévia estática). */
export function VistaProximo({ atual, posicao, total, proximos, fila, onAnterior, onProximo, onPular, onEscolher, onFeito }: {
  atual: ItemFila; posicao: number; total: number; proximos: ItemFila[];
  fila: Pick<Fila, "acoes" | "ocupado" | "abrirHistorico" | "gravar" | "escopo" | "contagem" | "tagsDe">;
  onAnterior: () => void; onProximo: () => void; onPular: () => void; onEscolher: (id: number) => void; onFeito?: () => void;
}) {
  const faltam = fila.contagem.agora;
  return (
    <div className="fbf-o1">
      <div className="fbn-card fbf-o1-card">
        <div className="fbf-o1-nav">
          <span className="fbf-falta">
            <i className="fa-solid fa-list-ol" style={{ color: "var(--c)" }} />
            <span>{fila.escopo === "agora" ? <>Faltam <b>{faltam}</b> para hoje · este é o <b>{posicao + 1}º</b></> : <>Cliente <b>{posicao + 1}</b> de <b>{total}</b></>}</span>
          </span>
          <span style={{ display: "flex", gap: 6 }}>
            <button type="button" className="fbn-acao cinza" onClick={onAnterior} disabled={total < 2} aria-label="Anterior"><i className="fa-solid fa-chevron-left" /></button>
            <button type="button" className="fbn-acao" onClick={onPular} disabled={total < 2} title="Manda este cliente para o fim da fila (só nesta tela)"><i className="fa-solid fa-forward" /> Pular</button>
            <button type="button" className="fbn-acao" onClick={onProximo} disabled={total < 2}>Próximo <i className="fa-solid fa-chevron-right" /></button>
          </span>
        </div>
        <FichaCliente item={atual} tags={fila.tagsDe(atual.registro)} onHistorico={() => fila.abrirHistorico(atual.registro)} grande />
        <div style={{ paddingTop: 12, borderTop: "1px solid var(--b)" }}>
          <AcoesAtendimento item={atual} fila={fila} grande onFeito={onFeito} />
        </div>
      </div>

      <aside className="fbf-prox">
        <h3>Depois deste</h3>
        {proximos.length === 0 && <div className="fbn-vazio" style={{ padding: "24px 14px" }}>Ninguém depois deste.</div>}
        {proximos.map((it, i) => (
          <button key={it.registro.id} type="button" className="fbf-mini" onClick={() => onEscolher(it.registro.id)}>
            <span className="n">{posicao + i + 2}</span>
            <span className="x">
              <div>{it.registro.nome}</div>
              <small><i className={`fa-solid ${ICO_ACAO[it.acao]}`} style={{ color: COR_ACAO[it.acao] }} /> {it.oQueFazer} · {rotuloDias(it)}</small>
            </span>
          </button>
        ))}
      </aside>
    </div>
  );
}
