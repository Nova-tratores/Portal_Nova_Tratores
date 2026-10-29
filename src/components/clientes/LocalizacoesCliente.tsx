"use client";
/* eslint-disable @typescript-eslint/no-explicit-any -- Leaflet vem via CDN (window.L), sem tipos */
// Localizações (fazendas) do cliente na Pasta Clientes, com mapinha (José, 29/10/2026: "a localização salva no POS antes
// de faturar tem que aparecer na pasta do cliente, com um mapinha, e conseguir alterar também"). Mesma tabela da trava do
// faturar: o que se cadastra aqui já vale para faturar a próxima OS do cliente.
import { useCallback, useEffect, useRef, useState } from "react";
import { authHeaders } from "@/lib/auth/client";
import { carregarLeaflet, pinIcon, round6, CENTRO_PADRAO } from "@/components/feedbacks/leaflet";
import CampoLinkMaps from "@/components/comum/CampoLinkMaps";

interface Loc { id: string; nome: string; lat: number; lng: number; origem: string; tecnico: string | null; os_id: string | null; confirmado_por: string; confirmado_em: string }
type Modo = { tipo: "ver" } | { tipo: "novo" } | { tipo: "mover"; id: string } | { tipo: "renomear"; id: string; nome: string };

const VERDE = "#059669", AZUL = "#2563eb";
const ORIGEM: Record<string, string> = { parada: "GPS do carro do técnico", cadastro: "ponto do cadastro", manual: "marcada no mapa", link: "link do Google Maps" };
const dataBR = (iso: string) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "");
const quem = (s: string) => (s || "").split("@")[0];

export default function LocalizacoesCliente({ doc, cliente }: { doc: string; cliente: string }) {
  const [lista, setLista] = useState<Loc[] | null>(null);
  const [semTabela, setSemTabela] = useState(false);
  const [versao, setVersao] = useState(0);
  const [modo, setModo] = useState<Modo>({ tipo: "ver" });
  const [pino, setPino] = useState<{ lat: number; lng: number } | null>(null);
  const [nome, setNome] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [grande, setGrande] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const mapa = useRef<any>(null);
  const LRef = useRef<any>(null);
  const camada = useRef<any>(null);
  const modoRef = useRef<Modo>(modo);
  const origemNovo = useRef<"manual" | "link">("manual");
  useEffect(() => { modoRef.current = modo; }, [modo]);
  const docLimpo = (doc || "").replace(/\D/g, "");

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch(`/api/clientes/localizacoes?doc=${docLimpo}`, { headers: await authHeaders(), cache: "no-store" });
        const j = await r.json().catch(() => ({}));
        if (!vivo) return;
        setLista(r.ok ? j.localizacoes || [] : []); setSemTabela(!!j.semTabela);
      } catch { if (vivo) setLista([]); }
    })();
    return () => { vivo = false; };
  }, [docLimpo, versao]);

  const desenhar = useCallback(() => {
    const L = LRef.current, m = mapa.current;
    if (!L || !m || !lista) return [];
    camada.current?.remove();
    const g = L.layerGroup().addTo(m);
    camada.current = g;
    const pts: [number, number][] = [];
    for (const l of lista) {
      if (modo.tipo === "mover" && modo.id === l.id) continue;
      L.marker([l.lat, l.lng], { icon: pinIcon(L, VERDE) }).addTo(g).bindTooltip(l.nome, { permanent: true, direction: "top", offset: [0, -36], className: "lcl-rot" });
      pts.push([l.lat, l.lng]);
    }
    if (pino && (modo.tipo === "novo" || modo.tipo === "mover")) {
      const mk = L.marker([pino.lat, pino.lng], { icon: pinIcon(L, AZUL), draggable: true, zIndexOffset: 1000 }).addTo(g);
      mk.on("dragend", () => { const ll = mk.getLatLng(); setPino({ lat: round6(ll.lat), lng: round6(ll.lng) }); });
      pts.push([pino.lat, pino.lng]);
    }
    return pts;
  }, [lista, pino, modo]);

  // monta o mapa quando a lista chega (uma vez)
  useEffect(() => {
    if (!lista || !caixa.current || mapa.current) return;
    carregarLeaflet(() => {
      const L = (window as any).L;
      if (!L || !caixa.current || mapa.current) return;
      LRef.current = L;
      const m = L.map(caixa.current, { zoomControl: true, attributionControl: false }).setView(CENTRO_PADRAO, 8);
      L.tileLayer("https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}", { subdomains: ["mt0", "mt1", "mt2", "mt3"], maxZoom: 20 }).addTo(m);
      mapa.current = m;
      m.on("click", (e: any) => { const t = modoRef.current.tipo; if (t === "novo" || t === "mover") setPino({ lat: round6(e.latlng.lat), lng: round6(e.latlng.lng) }); });
      const pts = desenhar();
      if (pts.length > 1) m.fitBounds(pts, { padding: [40, 40], maxZoom: 15 }); else if (pts.length === 1) m.setView(pts[0], 15);
      const ro = new ResizeObserver(() => m.invalidateSize());
      ro.observe(caixa.current);
      m.once("unload", () => ro.disconnect());
    });
  }, [lista, desenhar]);
  useEffect(() => { desenhar(); }, [desenhar]);
  useEffect(() => () => { mapa.current?.remove(); mapa.current = null; }, []);

  const focar = (lat: number, lng: number) => mapa.current?.setView([lat, lng], Math.max(16, mapa.current.getZoom()));
  const cancelar = () => { setModo({ tipo: "ver" }); setPino(null); setNome(""); setErro(""); };

  const enviar = async (corpo: Record<string, unknown>) => {
    setSalvando(true); setErro("");
    try {
      const r = await fetch("/api/clientes/localizacoes", { method: "POST", headers: { ...(await authHeaders()), "Content-Type": "application/json" }, body: JSON.stringify({ doc: docLimpo, cliente, ...corpo }) });
      const j = await r.json().catch(() => ({}));
      setSalvando(false);
      if (!r.ok) { setErro(j.error || `Erro ${r.status}`); return false; }
      return true;
    } catch { setSalvando(false); setErro("Sem conexão — tente de novo."); return false; }
  };
  const salvarNovo = async () => {
    if (!pino) return;
    if (await enviar({ nome, lat: pino.lat, lng: pino.lng, origem: origemNovo.current })) { cancelar(); setVersao((v) => v + 1); }
  };
  const salvarMover = async (id: string) => {
    if (!pino) return;
    if (await enviar({ acao: "mover", id, lat: pino.lat, lng: pino.lng })) { cancelar(); setVersao((v) => v + 1); }
  };
  const salvarNome = async (id: string, novo: string) => {
    if (await enviar({ acao: "renomear", id, nome: novo })) { cancelar(); setVersao((v) => v + 1); }
  };
  const apagar = async (l: Loc) => {
    if (!confirm(`Apagar a localização "${l.nome}"?`)) return;
    if (await enviar({ acao: "remover", id: l.id })) setVersao((v) => v + 1);
  };
  const doLink = (c: { lat: number; lng: number }) => { origemNovo.current = "link"; setPino(c); focar(c.lat, c.lng); };

  if (docLimpo.length !== 11 && docLimpo.length !== 14) return null;

  return (
    <div className="lcl">
      <style>{ESTILO}</style>
      <div className="lcl-cab">
        <span className="lcl-ic"><i className="fas fa-location-dot" /></span>
        <div className="lcl-tit"><span>Localizações</span><small>{lista ? (lista.length ? `${lista.length} lugar${lista.length > 1 ? "es" : ""} · vale para o faturar` : "nenhuma ainda · o faturar da OS pede uma") : "…"}</small></div>
        <button type="button" className="lcl-bt-ic" onClick={() => setGrande((v) => !v)} title={grande ? "diminuir o mapa" : "aumentar o mapa"}><i className={`fas ${grande ? "fa-compress" : "fa-expand"}`} /></button>
        {modo.tipo === "ver" && <button type="button" className="lcl-bt-ic azul" onClick={() => { setModo({ tipo: "novo" }); origemNovo.current = "manual"; setErro(""); }} title="adicionar localização"><i className="fas fa-plus" /></button>}
      </div>

      {semTabela && <div className="lcl-aviso">Falta rodar o SQL sql/clientes-localizacoes.sql no Supabase do portal.</div>}

      <div className={`lcl-mapa ${grande ? "grande" : ""}`}>
        <div ref={caixa} className="lcl-mapa-in" />
        {(modo.tipo === "novo" || modo.tipo === "mover") && <span className="lcl-dica">{pino ? "arraste o pino azul para acertar" : "clique no mapa ou cole o link"}</span>}
      </div>

      {modo.tipo === "novo" && (
        <div className="lcl-form">
          <CampoLinkMaps onCoordenada={doLink} compacto />
          <input className="lcl-in" value={nome} maxLength={80} placeholder="Nome do lugar (ex.: Fazenda Santa Luzia)" onChange={(e) => setNome(e.target.value)} />
          {pino && <small className="lcl-coord">{pino.lat.toFixed(5)}, {pino.lng.toFixed(5)}</small>}
          <div className="lcl-acoes">
            <button type="button" className="lcl-bt" onClick={cancelar}>cancelar</button>
            <button type="button" className="lcl-bt azul" disabled={!pino || nome.trim().length < 2 || salvando} onClick={() => void salvarNovo()}>{salvando ? "salvando…" : "salvar"}</button>
          </div>
        </div>
      )}

      {erro && <div className="lcl-erro"><i className="fas fa-circle-exclamation" /> {erro}</div>}

      <div className="lcl-lista">
        {(lista || []).map((l) => {
          const movendo = modo.tipo === "mover" && modo.id === l.id;
          const renomeando = modo.tipo === "renomear" && modo.id === l.id ? modo : null;
          return (
            <div key={l.id} className={`lcl-item ${movendo ? "on" : ""}`}>
              <button type="button" className="lcl-item-t" onClick={() => focar(l.lat, l.lng)} title="ver no mapa">
                {renomeando ? null : <span>{l.nome}</span>}
                <small>{ORIGEM[l.origem] || l.origem}{l.tecnico ? ` · ${l.tecnico.split(" ")[0]}` : ""}{l.os_id ? ` · ${l.os_id}` : ""} · {quem(l.confirmado_por)} em {dataBR(l.confirmado_em)}</small>
              </button>
              {renomeando && (
                <div className="lcl-ren">
                  <input className="lcl-in" autoFocus value={renomeando.nome} maxLength={80} onChange={(e) => setModo({ ...renomeando, nome: e.target.value })}
                    onKeyDown={(e) => { if (e.key === "Enter") void salvarNome(l.id, renomeando.nome); if (e.key === "Escape") cancelar(); }} />
                  <button type="button" className="lcl-bt azul" disabled={salvando} onClick={() => void salvarNome(l.id, renomeando.nome)}>ok</button>
                </div>
              )}
              {movendo ? (
                <div className="lcl-mover">
                  <CampoLinkMaps onCoordenada={(c) => { setPino(c); focar(c.lat, c.lng); }} compacto />
                  <div className="lcl-acoes">
                    <button type="button" className="lcl-bt" onClick={cancelar}>cancelar</button>
                    <button type="button" className="lcl-bt azul" disabled={!pino || salvando} onClick={() => void salvarMover(l.id)}>{salvando ? "salvando…" : "salvar novo ponto"}</button>
                  </div>
                </div>
              ) : !renomeando && modo.tipo === "ver" && (
                <div className="lcl-item-ac">
                  <a href={`https://www.google.com/maps?q=${l.lat},${l.lng}`} target="_blank" rel="noreferrer" title="abrir no Google Maps"><i className="fas fa-map" /></a>
                  <button type="button" title="renomear" onClick={() => setModo({ tipo: "renomear", id: l.id, nome: l.nome })}><i className="fas fa-pen" /></button>
                  <button type="button" title="mudar o ponto (arrastar ou colar link)" onClick={() => { setModo({ tipo: "mover", id: l.id }); setPino({ lat: l.lat, lng: l.lng }); focar(l.lat, l.lng); }}><i className="fas fa-arrows-up-down-left-right" /></button>
                  <button type="button" title="apagar" className="x" onClick={() => void apagar(l)}><i className="fas fa-trash" /></button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const ESTILO = `
.lcl { background: var(--portal-bg-card, #fefefe); border: 1px solid var(--border, #e5e7eb); border-radius: 16px; padding: 12px; display: grid; gap: 10px; box-shadow: 0 1px 3px rgba(16,24,40,.06) }
.lcl-cab { display: flex; align-items: center; gap: 10px }
.lcl-ic { width: 32px; height: 32px; border-radius: 10px; display: grid; place-items: center; color: ${VERDE}; background: color-mix(in srgb, ${VERDE} 9%, #fefefe); border: 1px solid color-mix(in srgb, ${VERDE} 20%, transparent); font-size: 13px }
.lcl-tit { flex: 1; min-width: 0; display: grid } .lcl-tit span { font-size: 14px; color: var(--portal-text, #0f172a) } .lcl-tit small { font-size: 12px; color: #64748b }
.lcl-bt-ic { width: 30px; height: 30px; border-radius: 9px; border: 1px solid var(--border, #e2e8f0); background: transparent; color: #475569; cursor: pointer; font-size: 12px }
.lcl-bt-ic:hover { background: #f1f5f9 } .lcl-bt-ic.azul { color: ${AZUL}; border-color: color-mix(in srgb, ${AZUL} 25%, transparent) } .lcl-bt-ic.azul:hover { background: ${AZUL}; color: #fefefe }
.lcl-mapa { position: relative; height: 190px; border-radius: 12px; overflow: hidden; border: 1px solid var(--border, #e2e8f0); transition: height .3s } .lcl-mapa.grande { height: 420px }
.lcl-mapa-in { position: absolute; inset: 0; z-index: 0 }
.lcl-dica { position: absolute; z-index: 500; bottom: 8px; left: 50%; transform: translateX(-50%); background: #0f172a; color: #fefefe; border-radius: 99px; padding: 4px 12px; font-size: 12px; white-space: nowrap }
.lcl-rot { background: rgba(15,23,42,.85); color: #fefefe; border: 0; border-radius: 6px; font-size: 11.5px; padding: 2px 7px; box-shadow: none } .lcl-rot::before { display: none }
.lcl-form, .lcl-mover { display: grid; gap: 6px }
.lcl-in { border: 1px solid var(--border, #e2e8f0); border-radius: 10px; padding: 7px 10px; font: inherit; font-size: 13px; background: var(--surface, #fefefe); color: inherit; width: 100%; box-sizing: border-box }
.lcl-coord { font-size: 11.5px; color: #64748b }
.lcl-acoes { display: flex; justify-content: flex-end; gap: 6px }
.lcl-bt { border: 1px solid var(--border, #e2e8f0); background: transparent; border-radius: 9px; padding: 5px 12px; font: inherit; font-size: 12.5px; color: #475569; cursor: pointer }
.lcl-bt.azul { background: ${AZUL}; border-color: ${AZUL}; color: #fefefe } .lcl-bt:disabled { opacity: .5; cursor: default }
.lcl-erro { font-size: 12px; color: #b91c1c } .lcl-aviso { font-size: 12px; color: #92400e; background: #fffbeb; border-radius: 8px; padding: 6px 8px }
.lcl-lista { display: grid; gap: 4px }
.lcl-item { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px; align-items: center; padding: 6px 8px; border-radius: 10px }
.lcl-item:hover { background: #f8fafc } .lcl-item.on { background: #eff6ff }
.lcl-item-t { grid-column: 1; border: 0; background: none; text-align: left; padding: 0; cursor: pointer; font: inherit; display: grid; gap: 1px; min-width: 0; color: inherit }
.lcl-item-t span { font-size: 13.5px; color: var(--portal-text, #0f172a) } .lcl-item-t small { font-size: 11.5px; color: #64748b; line-height: 1.35 }
.lcl-item-ac { display: flex; gap: 2px } .lcl-item-ac a, .lcl-item-ac button { width: 26px; height: 26px; border-radius: 8px; border: 0; background: transparent; color: #64748b; display: grid; place-items: center; cursor: pointer; font-size: 11.5px }
.lcl-item-ac a:hover, .lcl-item-ac button:hover { background: #e2e8f0; color: #0f172a } .lcl-item-ac .x:hover { background: #fee2e2; color: #b91c1c }
.lcl-ren, .lcl-mover { grid-column: 1 / -1 } .lcl-ren { display: flex; gap: 6px }
`;
