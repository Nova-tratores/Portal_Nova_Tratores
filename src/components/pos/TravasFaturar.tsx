"use client";
// "Antes de faturar" (José, 22/10/2026): aparece depois do clique em Faturar (o botão não fica travado) e só
// deixa seguir para a janela de faturar com: previsão de faturamento = hoje, projeto preenchido e localização do
// cliente confirmada. O servidor recusa o faturamento sem elas (lib/pos/travas-faturar.ts).
// Estilo POS NewPortal (docs/estilo-pos-newportal.md).
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { authHeaders } from "@/lib/auth/client";
import type { Trava, ChaveTrava } from "@/lib/pos/travas-faturar";
import LocalizacaoClienteModal from "./LocalizacaoClienteModal";

export interface AjusteOS { previsaoFaturamento?: string; projeto?: string }

const ICONE: Record<ChaveTrava, string> = { previsao: "fa-calendar-day", projeto: "fa-tractor", localizacao: "fa-location-dot" };
const hojeSP = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

async function lerTravas(osId: string): Promise<{ travas: Trava[]; ok: boolean; erro: string }> {
  try {
    const r = await fetch(`/api/pos/ordens/${encodeURIComponent(osId)}/faturar/travas`, { headers: await authHeaders(), cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { travas: [], ok: false, erro: j.error || `Erro ${r.status}` };
    return { travas: j.travas || [], ok: !!j.ok, erro: "" };
  } catch { return { travas: [], ok: false, erro: "Sem conexão — tente de novo." }; }
}

export default function TravasFaturar({ osId, documento, onOk, onCancelar, ajustarOS }: {
  osId: string;
  /** CPF/CNPJ do cliente (sugere as máquinas dele no projeto) */
  documento?: string;
  onOk: () => void;
  onCancelar: () => void;
  /** grava na OS do drawer (estado da tela + salvar), para a tela não sobrescrever depois */
  ajustarOS?: (c: AjusteOS) => Promise<boolean>;
}) {
  const [travas, setTravas] = useState<Trava[] | null>(null);
  const [erro, setErro] = useState("");
  const [fazendo, setFazendo] = useState<ChaveTrava | null>(null);
  const [verMapa, setVerMapa] = useState(false);
  const [escolherProjeto, setEscolherProjeto] = useState(false);
  const okRef = useRef(onOk);
  useEffect(() => { okRef.current = onOk; }, [onOk]);

  const aplicar = useCallback((r: { travas: Trava[]; ok: boolean; erro: string }) => {
    setErro(r.erro);
    setTravas(r.travas);
    if (r.ok) okRef.current();
  }, []);
  const carregar = useCallback(async () => aplicar(await lerTravas(osId)), [osId, aplicar]);

  useEffect(() => {
    let vivo = true;
    lerTravas(osId).then((r) => { if (vivo) aplicar(r); });
    return () => { vivo = false; };
  }, [osId, aplicar]);

  const ajustar = async (chave: ChaveTrava, c: AjusteOS) => {
    if (!ajustarOS) { setErro("Abra a OS para ajustar."); return; }
    setFazendo(chave);
    const ok = await ajustarOS(c).catch(() => false);
    setFazendo(null);
    if (ok) await carregar();
  };

  if (!travas) return null; // carregando: rápido, sem piscar janela
  if (!erro && travas.every((t) => t.ok)) return null;
  const faltam = travas.filter((t) => !t.ok).length;

  return createPortal(
    <div className="tvf-fundo" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancelar(); }}>
      <style>{ESTILO}</style>
      <div className="tvf-janela" role="dialog" aria-label="Antes de faturar">
        <div className="tvf-topo">
          <span className="tvf-ico"><i className="fas fa-list-check" /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="tvf-titulo">Antes de faturar</div>
            <div className="tvf-sub">{faltam ? `Falta${faltam > 1 ? "m" : ""} ${faltam} ${faltam > 1 ? "itens" : "item"} para liberar o faturamento` : "Tudo certo"}</div>
          </div>
          <button type="button" className="tvf-x" onClick={onCancelar} aria-label="Fechar"><i className="fas fa-xmark" /></button>
        </div>
        <div className="tvf-lista">
          {erro && <div className="tvf-erro">{erro}</div>}
          {travas.map((t) => (
            <div key={t.chave} className={`tvf-item${t.ok ? " ok" : ""}`}>
              <span className="tvf-item-ico"><i className={`fas ${t.ok ? "fa-check" : ICONE[t.chave]}`} /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="tvf-item-t">{t.titulo}</div>
                <div className="tvf-item-d">{t.detalhe}</div>
                {!t.ok && t.chave === "projeto" && escolherProjeto && (
                  <EscolherProjeto documento={documento} ocupado={fazendo === "projeto"} onEscolher={(nome) => void ajustar("projeto", { projeto: nome })} />
                )}
              </div>
              {!t.ok && t.chave === "previsao" && (
                <button type="button" className="tvf-btn" disabled={!!fazendo} onClick={() => void ajustar("previsao", { previsaoFaturamento: hojeSP() })}>
                  {fazendo === "previsao" ? "Salvando…" : "Colocar hoje"}
                </button>
              )}
              {!t.ok && t.chave === "projeto" && !escolherProjeto && (
                <button type="button" className="tvf-btn" disabled={!!fazendo} onClick={() => setEscolherProjeto(true)}>Escolher máquina</button>
              )}
              {!t.ok && t.chave === "localizacao" && (
                <button type="button" className="tvf-btn" onClick={() => setVerMapa(true)}>Ver no mapa</button>
              )}
            </div>
          ))}
        </div>
        <div className="tvf-rodape">
          <span className="tvf-nota">Os ajustes são gravados na OS.</span>
          <button type="button" className="tvf-btn-sec" onClick={onCancelar}>Fechar</button>
          <button type="button" className="tvf-btn-sec" onClick={() => void carregar()}><i className="fas fa-rotate" /> Conferir de novo</button>
        </div>
      </div>
      {verMapa && <LocalizacaoClienteModal osId={osId} onClose={() => setVerMapa(false)} onConfirmada={() => void carregar()} />}
    </div>,
    document.body,
  );
}

/** máquinas (projetos do Omie) do cliente + busca livre */
function EscolherProjeto({ documento, ocupado, onEscolher }: { documento?: string; ocupado: boolean; onEscolher: (nome: string) => void }) {
  const [termo, setTermo] = useState("");
  const [lista, setLista] = useState<string[] | null>(null);

  // sugestões: chassi das máquinas do cliente → projeto com aquele chassi
  useEffect(() => {
    let vivo = true;
    (async () => {
      const nomes = new Set<string>();
      try {
        if (documento) {
          const j = await fetch(`/api/clientes/maquinas?doc=${encodeURIComponent(documento)}`).then((r) => r.json());
          const chassis = ((j.maquinas || []) as Array<{ chassis?: string }>).map((m) => String(m.chassis || "").trim().slice(-7)).filter((c) => c.length >= 5).slice(0, 6);
          for (const c of chassis) {
            const ps = await fetch(`/api/pos/buscas/projetos?termo=${encodeURIComponent(c)}`).then((r) => r.json()).catch(() => []);
            for (const p of (ps as Array<{ nome: string }>).slice(0, 3)) nomes.add(p.nome);
          }
        }
      } catch { /* só a busca */ }
      if (vivo) setLista([...nomes]);
    })();
    return () => { vivo = false; };
  }, [documento]);

  useEffect(() => {
    if (termo.trim().length < 3) return;
    let vivo = true;
    const t = setTimeout(async () => {
      const ps = await fetch(`/api/pos/buscas/projetos?termo=${encodeURIComponent(termo.trim())}`).then((r) => r.json()).catch(() => []);
      if (vivo) setLista((ps as Array<{ nome: string }>).map((p) => p.nome).slice(0, 12));
    }, 300);
    return () => { vivo = false; clearTimeout(t); };
  }, [termo]);

  return (
    <div className="tvf-proj">
      <input className="tvf-input" value={termo} onChange={(e) => setTermo(e.target.value)} placeholder="buscar por chassi ou modelo" autoFocus />
      {lista === null ? <div className="tvf-item-d">Procurando as máquinas do cliente…</div>
        : lista.length === 0 ? <div className="tvf-item-d">{termo.trim().length >= 3 ? "Nada encontrado." : "Nenhuma máquina do cliente achada — busque acima."}</div>
          : lista.map((n) => (
            <button key={n} type="button" className="tvf-proj-op" disabled={ocupado} onClick={() => onEscolher(n)}><i className="fas fa-tractor" /> {n}</button>
          ))}
    </div>
  );
}

const ESTILO = `
.tvf-fundo { position: fixed; inset: 0; z-index: 10040; background: rgba(15,23,42,.45); display: flex; align-items: center; justify-content: center; padding: 16px; }
.tvf-janela { background: var(--surface, #fefefe); border: 1px solid var(--border, #e2e8f0); border-radius: 16px; width: min(620px, 100%); max-height: 100%; display: flex; flex-direction: column; overflow: hidden; color: var(--portal-text, #0f172a); }
.tvf-topo { display: flex; align-items: center; gap: 12px; padding: 16px 18px; border-bottom: 1px solid var(--border, #e2e8f0); }
.tvf-ico { width: 40px; height: 40px; border-radius: 11px; display: grid; place-items: center; font-size: 16px; color: #b45309; background: color-mix(in srgb, #b45309 9%, var(--surface, #fefefe)); border: 1px solid color-mix(in srgb, #b45309 18%, transparent); flex-shrink: 0; }
.tvf-titulo { font-size: 18px; font-weight: 500; }
.tvf-sub { font-size: 13.5px; color: #64748b; }
.tvf-x { width: 36px; height: 36px; border-radius: 10px; border: 1px solid var(--border, #e2e8f0); background: transparent; color: #475569; cursor: pointer; }
.tvf-lista { padding: 14px 18px; display: flex; flex-direction: column; gap: 10px; overflow: auto; }
.tvf-item { display: flex; gap: 12px; align-items: flex-start; border: 1px solid var(--border, #e2e8f0); border-radius: 14px; padding: 12px 14px; }
.tvf-item-ico { width: 32px; height: 32px; border-radius: 9px; display: grid; place-items: center; font-size: 14px; color: #b45309; background: color-mix(in srgb, #b45309 9%, var(--surface, #fefefe)); border: 1px solid color-mix(in srgb, #b45309 18%, transparent); flex-shrink: 0; }
.tvf-item.ok .tvf-item-ico { color: #15803d; background: color-mix(in srgb, #15803d 9%, var(--surface, #fefefe)); border-color: color-mix(in srgb, #15803d 18%, transparent); }
.tvf-item-t { font-size: 15px; }
.tvf-item-d { font-size: 13px; color: #64748b; margin-top: 2px; line-height: 1.4; }
.tvf-item.ok .tvf-item-t { color: #475569; }
.tvf-btn { border: none; background: #0369A1; color: #fefefe; border-radius: 10px; padding: 8px 14px; font: inherit; font-size: 13.5px; cursor: pointer; white-space: nowrap; align-self: center; }
.tvf-btn:disabled { background: #e2e8f0; color: #94a3b8; cursor: default; }
.tvf-btn-sec { border: 1px solid var(--border, #cbd5e1); background: var(--surface, #fefefe); color: #0f172a; border-radius: 10px; padding: 8px 12px; font: inherit; font-size: 13.5px; cursor: pointer; display: inline-flex; gap: 6px; align-items: center; }
.tvf-rodape { display: flex; gap: 8px; align-items: center; justify-content: flex-end; padding: 12px 18px; border-top: 1px solid var(--border, #e2e8f0); }
.tvf-nota { margin-right: auto; font-size: 12.5px; color: #94a3b8; }
.tvf-erro { font-size: 13px; color: #991b1b; background: #fef2f2; border: 1px solid #fecaca; border-radius: 10px; padding: 8px 10px; }
.tvf-proj { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
.tvf-input { border: 1px solid var(--border, #cbd5e1); border-radius: 10px; padding: 8px 12px; font: inherit; font-size: 14px; color: inherit; background: var(--surface, #fefefe); }
.tvf-proj-op { text-align: left; border: 1px solid var(--border, #e2e8f0); background: var(--surface, #fefefe); border-radius: 10px; padding: 8px 10px; font: inherit; font-size: 13.5px; color: inherit; cursor: pointer; display: flex; gap: 8px; align-items: center; }
.tvf-proj-op i { color: #0369A1; }
.tvf-proj-op:hover { border-color: #0369A1; }
`;
