"use client";
// Conferência de preço (PPV, Orçamento, Faturar): consulta /api/ppv/conferir-precos e
// mostra os itens com preço diferente do cadastro, abaixo do custo ou sem custo.
// Regras em lib/ppv/conferencia-precos.ts.
import { useEffect, useMemo, useState } from "react";
import { authHeaders } from "@/lib/auth/client";
import type { ItemConferido, ItemParaConferir, ResumoConferencia } from "@/lib/ppv/conferencia-precos";

export interface ResultadoConferencia { itens: ItemConferido[]; resumo: ResumoConferencia }

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Consulta a conferência sempre que a lista de itens muda (com 600 ms de folga). */
export function useConferenciaPrecos(itens: ItemParaConferir[], ativo = true) {
  const [resultado, setResultado] = useState<ResultadoConferencia | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [versao, setVersao] = useState(0);
  const assinatura = useMemo(
    () => JSON.stringify(itens.filter((i) => i.codigo?.trim()).map((i) => [i.codigo.trim(), i.conta || "", Number(i.preco) || 0, Number(i.quantidade) || 0])),
    [itens],
  );

  useEffect(() => {
    if (!ativo) return;
    const lista = JSON.parse(assinatura) as [string, string, number, number][];
    let cancel = false;
    const t = setTimeout(async () => {
      if (lista.length === 0) { setResultado(null); return; }
      setCarregando(true);
      try {
        const r = await fetch("/api/ppv/conferir-precos", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await authHeaders()) },
          body: JSON.stringify({ itens: lista.map(([codigo, conta, preco, quantidade]) => ({ codigo, conta: conta || undefined, preco, quantidade })) }),
        });
        const j = await r.json().catch(() => null);
        if (!cancel) setResultado(r.ok && j?.itens ? j : null);
        if (!r.ok) console.error("[conferir-precos]", j?.error);
      } catch (e) {
        if (!cancel) { console.error("[conferir-precos]", e); setResultado(null); }
      }
      if (!cancel) setCarregando(false);
    }, 600);
    return () => { cancel = true; clearTimeout(t); };
  }, [assinatura, ativo, versao]);

  const porCodigo = useMemo(() => {
    const m = new Map<string, ItemConferido>();
    for (const i of resultado?.itens || []) m.set(`${i.codigo.toUpperCase()}|${i.conta || ""}`, i);
    for (const i of resultado?.itens || []) if (!m.has(i.codigo.toUpperCase())) m.set(i.codigo.toUpperCase(), i);
    return m;
  }, [resultado]);

  /** Item conferido de um código (e conta, quando houver). */
  const doItem = (codigo: string, conta?: string | null) =>
    porCodigo.get(`${codigo.trim().toUpperCase()}|${conta || ""}`) ?? porCodigo.get(codigo.trim().toUpperCase()) ?? null;

  return { resultado, carregando, doItem, recarregar: () => setVersao((v) => v + 1) };
}

/** Aviso curto embaixo do preço de uma linha. */
export function AvisoPrecoLinha({ item, onAtualizar, desabilitado }: { item: ItemConferido | null; onAtualizar?: (preco: number) => void; desabilitado?: boolean }) {
  if (!item) return null;
  const dif = item.avisos.includes("diferente_cadastro") && item.precoCadastro !== null;
  const abaixo = item.avisos.includes("abaixo_custo");
  if (!dif && !abaixo) return null;
  return (
    <div style={{ marginTop: 3, fontSize: 11, lineHeight: 1.35, textAlign: "right" }}>
      {dif && (
        <span style={{ color: "#b45309", fontWeight: 600 }} title="Preço de venda atual no cadastro (Omie)">
          cadastro {brl(item.precoCadastro!)}
          {onAtualizar && (
            <button type="button" disabled={desabilitado} onClick={() => onAtualizar(item.precoCadastro!)}
              style={{ marginLeft: 6, padding: "1px 6px", borderRadius: 4, border: "1px solid #f59e0b", background: "#fffbeb", color: "#92400e", fontSize: 11, fontWeight: 700, cursor: desabilitado ? "not-allowed" : "pointer" }}>
              usar
            </button>
          )}
        </span>
      )}
      {abaixo && <div style={{ color: "#b91c1c", fontWeight: 700 }}>abaixo do custo ({brl(item.custo!)})</div>}
    </div>
  );
}

/** Faixa de resumo com a lista dos itens com problema. */
export function PainelConferenciaPrecos({
  resultado, titulo, onAtualizarTodos, desabilitado, descricoes,
}: {
  resultado: ResultadoConferencia | null;
  titulo?: string;
  onAtualizarTodos?: (itens: ItemConferido[]) => void;
  desabilitado?: boolean;
  descricoes?: Record<string, string>;
}) {
  if (!resultado) return null;
  const { resumo } = resultado;
  const problemas = resultado.itens.filter((i) => i.avisos.includes("diferente_cadastro") || i.avisos.includes("abaixo_custo"));
  const semCusto = resultado.itens.filter((i) => i.avisos.includes("sem_custo") && !i.avisos.includes("sem_cadastro"));
  if (problemas.length === 0 && semCusto.length === 0) return null;
  const critico = resumo.abaixoCusto > 0;
  const paraAtualizar = problemas.filter((i) => i.avisos.includes("diferente_cadastro") && i.precoCadastro !== null);

  return (
    <div style={{ marginBottom: 12, borderRadius: 4, border: `1px solid ${critico ? "#fecaca" : "#fcd34d"}`, background: critico ? "#fef2f2" : "#fffbeb", padding: "10px 12px", fontSize: 12.5, color: critico ? "#7f1d1d" : "#78350f", lineHeight: 1.5 }}>
      {problemas.length > 0 && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <i className={`fas ${critico ? "fa-circle-exclamation" : "fa-triangle-exclamation"}`} />
            <strong style={{ flex: 1, minWidth: 200 }}>
              {titulo || "Conferência de preço"}:{" "}
              {resumo.diferentes > 0 && `${resumo.diferentes} item(ns) com preço diferente do cadastro`}
              {resumo.diferentes > 0 && resumo.abaixoCusto > 0 && " · "}
              {resumo.abaixoCusto > 0 && `${resumo.abaixoCusto} abaixo do custo`}
            </strong>
            {onAtualizarTodos && paraAtualizar.length > 0 && (
              <button type="button" disabled={desabilitado} onClick={() => onAtualizarTodos(paraAtualizar)}
                style={{ padding: "5px 10px", borderRadius: 4, border: "none", background: "#b45309", color: "#fff", fontSize: 12, fontWeight: 700, cursor: desabilitado ? "not-allowed" : "pointer" }}>
                Usar o preço do cadastro em {paraAtualizar.length === 1 ? "1 item" : `${paraAtualizar.length} itens`}
              </button>
            )}
          </div>
          <div style={{ marginTop: 6, display: "grid", gap: 2 }}>
            {problemas.map((i) => (
              <div key={`${i.codigo}|${i.conta}`} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 600 }}>{i.codigo}</span>
                {descricoes?.[i.codigo] && <span style={{ opacity: 0.8 }}>{descricoes[i.codigo]}</span>}
                <span>
                  lançado {brl(i.preco)}
                  {i.precoCadastro !== null && i.avisos.includes("diferente_cadastro") && <> · cadastro {brl(i.precoCadastro)}</>}
                  {i.avisos.includes("abaixo_custo") && <strong> · custo {brl(i.custo!)}</strong>}
                </span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 6 }}>
            {resumo.diferencaTotal !== 0 && <>Diferença para o cadastro: <strong>{brl(resumo.diferencaTotal)}</strong> {resumo.diferencaTotal > 0 ? "a menos" : "a mais"}. </>}
            {resumo.prejuizo > 0 && <>Prejuízo sobre o custo: <strong>{brl(resumo.prejuizo)}</strong>.</>}
          </div>
        </>
      )}
      {semCusto.length > 0 && (
        <div style={{ marginTop: problemas.length > 0 ? 6 : 0, color: "#78350f" }}>
          <i className="fas fa-circle-info" style={{ marginRight: 6 }} />
          {semCusto.length === 1 ? "1 peça" : `${semCusto.length} peças`} sem custo no sistema (encomenda?): {semCusto.map((i) => i.codigo).join(", ")}. Confira a margem com Peças.
        </div>
      )}
    </div>
  );
}
