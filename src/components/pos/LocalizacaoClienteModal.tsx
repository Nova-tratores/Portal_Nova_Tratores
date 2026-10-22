"use client";
/* eslint-disable @typescript-eslint/no-explicit-any -- Leaflet vem via CDN (window.L), sem tipos */
// Confirmar a localização do cliente (José, 22/10/2026): nos dias de execução da OS, onde o carro do técnico
// ficou parado 30 min ou mais (GPS da Frota). O usuário escolhe a parada (ou ajusta o pino) e confirma para o
// CPF/CNPJ do cliente — vale para as próximas OS. Estilo POS NewPortal (docs/estilo-pos-newportal.md).
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { authHeaders } from "@/lib/auth/client";
import { carregarLeaflet, pinIcon, round6, CENTRO_PADRAO } from "@/components/feedbacks/leaflet";
import { duracaoTexto } from "@/lib/pos/localizacao-cliente";

interface Parada { placa: string; tecnico: string; data: string; inicio: string; fim: string | null; duracaoMin: number; lat: number; lng: number; classe?: string | null; local?: string | null; acompanhado?: boolean }
interface Confirmada { lat: number; lng: number; origem: string; placa: string | null; tecnico: string | null; confirmado_por: string; confirmado_em: string; os_id: string | null }
interface Dados {
  documento: string; cliente: string; dias: string[]; tecnicos: string[]; semCarro: string[];
  paradas: Parada[]; cadastro: { lat: number; lng: number } | null; avisos: string[];
  confirmada: Confirmada | null; semTabela?: boolean; error?: string;
}
type Escolha = { tipo: "parada"; i: number } | { tipo: "cadastro" } | { tipo: "manual" } | { tipo: "confirmada" };

const COR = "#0369A1";
const dataBR = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
const hora = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }) : "—");
const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default function LocalizacaoClienteModal({ osId, onClose, onConfirmada }: {
  osId: string; onClose: () => void; onConfirmada?: () => void;
}) {
  const [d, setD] = useState<Dados | null>(null);
  const [escolha, setEscolha] = useState<Escolha | null>(null);
  const [pino, setPino] = useState<{ lat: number; lng: number } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [trocando, setTrocando] = useState(false);
  const mapaEl = useRef<HTMLDivElement>(null);
  const mapa = useRef<any>(null);
  const camada = useRef<any>(null);
  const LRef = useRef<any>(null);
  const travadoRef = useRef(false);
  useEffect(() => { travadoRef.current = !!d?.confirmada && !trocando; }, [d, trocando]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch(`/api/pos/ordens/${encodeURIComponent(osId)}/localizacao`, { headers: await authHeaders(), cache: "no-store" });
        const j = await r.json();
        if (!vivo) return;
        if (!r.ok) { setD({ ...(j || {}), error: j?.error || `Erro ${r.status}` } as Dados); return; }
        setD(j);
        if (j.confirmada) { setEscolha({ tipo: "confirmada" }); setPino({ lat: j.confirmada.lat, lng: j.confirmada.lng }); }
        else if (j.paradas?.length) { setEscolha({ tipo: "parada", i: 0 }); setPino({ lat: j.paradas[0].lat, lng: j.paradas[0].lng }); }
        else if (j.cadastro) { setEscolha({ tipo: "cadastro" }); setPino(j.cadastro); }
      } catch { if (vivo) setD({ error: "Sem conexão." } as Dados); }
    })();
    return () => { vivo = false; };
  }, [osId]);

  const desenhar = useCallback(() => {
    const L = LRef.current, m = mapa.current;
    if (!L || !m || !d) return;
    camada.current?.remove();
    const g = L.layerGroup().addTo(m);
    camada.current = g;
    const pontos: [number, number][] = [];
    (d.paradas || []).forEach((p, i) => {
      const sel = escolha?.tipo === "parada" && escolha.i === i;
      const mk = L.marker([p.lat, p.lng], { icon: numIcon(L, i + 1, sel), zIndexOffset: sel ? 500 : 0 }).addTo(g);
      mk.on("click", () => { setEscolha({ tipo: "parada", i }); setPino({ lat: p.lat, lng: p.lng }); });
      pontos.push([p.lat, p.lng]);
    });
    if (d.cadastro) { L.circleMarker([d.cadastro.lat, d.cadastro.lng], { radius: 7, color: "#64748b", weight: 2, fillColor: "#fefefe", fillOpacity: 1 }).addTo(g).bindTooltip("Cadastro do cliente"); pontos.push([d.cadastro.lat, d.cadastro.lng]); }
    if (pino) {
      const mk = L.marker([pino.lat, pino.lng], { icon: pinIcon(L, d.confirmada && escolha?.tipo === "confirmada" ? "#15803d" : COR), draggable: !d.confirmada || trocando, zIndexOffset: 1000 }).addTo(g);
      mk.on("dragend", () => { const ll = mk.getLatLng(); setEscolha({ tipo: "manual" }); setPino({ lat: round6(ll.lat), lng: round6(ll.lng) }); });
      pontos.push([pino.lat, pino.lng]);
    }
    return pontos;
  }, [d, escolha, pino, trocando]);

  // monta o mapa uma vez, quando os dados chegam
  useEffect(() => {
    if (!d || d.error || !mapaEl.current || mapa.current) return;
    carregarLeaflet(() => {
      const L = (window as any).L;
      if (!L || !mapaEl.current || mapa.current) return;
      LRef.current = L;
      const m = L.map(mapaEl.current, { zoomControl: true, attributionControl: false }).setView(CENTRO_PADRAO, 9);
      L.tileLayer("https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}", { subdomains: ["mt0", "mt1", "mt2", "mt3"], maxZoom: 20 }).addTo(m);
      mapa.current = m;
      m.on("click", (e: any) => { if (travadoRef.current) return; setEscolha({ tipo: "manual" }); setPino({ lat: round6(e.latlng.lat), lng: round6(e.latlng.lng) }); });
      const pts = desenhar() || [];
      if (pts.length > 1) m.fitBounds(pts, { padding: [40, 40], maxZoom: 16 });
      else if (pts.length === 1) m.setView(pts[0], 16);
      // a janela ainda está montando: recalcula o tamanho quando ela assenta (senão sobra faixa cinza)
      const ro = new ResizeObserver(() => m.invalidateSize());
      ro.observe(mapaEl.current);
      m.once("unload", () => ro.disconnect());
      setTimeout(() => { m.invalidateSize(); if (pts.length > 1) m.fitBounds(pts, { padding: [40, 40], maxZoom: 16 }); }, 250);
    });
  }, [d, desenhar]);

  useEffect(() => { desenhar(); }, [desenhar]);
  useEffect(() => () => { mapa.current?.remove(); mapa.current = null; }, []);

  const focar = (lat: number, lng: number) => mapa.current?.setView([lat, lng], Math.max(16, mapa.current.getZoom()));

  const confirmar = async () => {
    if (!pino || !d) return;
    setSalvando(true); setErro("");
    const p = escolha?.tipo === "parada" ? d.paradas[escolha.i] : null;
    try {
      const r = await fetch(`/api/pos/ordens/${encodeURIComponent(osId)}/localizacao`, {
        method: "POST", headers: { ...(await authHeaders()), "Content-Type": "application/json" },
        body: JSON.stringify({ lat: pino.lat, lng: pino.lng, origem: p ? "parada" : escolha?.tipo === "cadastro" ? "cadastro" : "manual", placa: p?.placa, tecnico: p?.tecnico, paradaInicio: p?.inicio, paradaMin: p?.duracaoMin }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(j.error || `Erro ${r.status}`); setSalvando(false); return; }
      onConfirmada?.();
      onClose();
    } catch { setErro("Sem conexão — tente de novo."); setSalvando(false); }
  };

  const podeEscolher = !d?.confirmada || trocando;
  const comCarro = [...new Set((d?.paradas || []).filter((p) => !p.acompanhado).map((p) => nomeBonito(p.tecnico)))];

  return createPortal(
    <div className="lcm-fundo" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <style>{ESTILO}</style>
      <div className="lcm-janela" role="dialog" aria-label="Localização do cliente">
        <div className="lcm-topo">
          <span className="lcm-ico"><i className="fas fa-location-dot" /></span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="lcm-titulo">Localização do cliente</div>
            <div className="lcm-sub">{d?.cliente || "…"}{d?.documento ? ` · ${d.documento}` : ""}</div>
          </div>
          <button type="button" className="lcm-x" onClick={onClose} aria-label="Fechar"><i className="fas fa-xmark" /></button>
        </div>

        {!d ? <div className="lcm-carregando">Lendo o GPS do carro do técnico…</div>
          : d.error ? <div className="lcm-aviso lcm-vermelho">{d.error}</div>
            : (
              <div className="lcm-corpo">
                <div className="lcm-lado">
                  {d.semTabela && <div className="lcm-aviso lcm-ambar">Falta rodar o SQL <code>sql/clientes-localizacao.sql</code> no Supabase do portal — sem ele não dá para guardar.</div>}
                  {d.confirmada && !trocando && (
                    <div className="lcm-ok">
                      <div className="lcm-ok-t"><i className="fas fa-circle-check" /> Localização confirmada</div>
                      <div className="lcm-ok-d">por {d.confirmada.confirmado_por} em {quando(d.confirmada.confirmado_em)}{d.confirmada.tecnico ? ` · parada do carro de ${d.confirmada.tecnico}` : ""}</div>
                      <div className="lcm-acoes">
                        <a className="lcm-btn-sec" href={`https://www.google.com/maps?q=${d.confirmada.lat},${d.confirmada.lng}`} target="_blank" rel="noreferrer"><i className="fas fa-map" /> Google Maps</a>
                        <button type="button" className="lcm-btn-sec" onClick={() => { setTrocando(true); if (d.paradas.length) { setEscolha({ tipo: "parada", i: 0 }); setPino({ lat: d.paradas[0].lat, lng: d.paradas[0].lng }); } }}>Trocar</button>
                      </div>
                    </div>
                  )}
                  {podeEscolher && (
                    <>
                      <div className="lcm-explica">
                        Paradas de 30 min ou mais (das 7h às 19h) do carro {comCarro.length ? `de ${comCarro.join(" e ")}` : "do técnico"}{d.semCarro.length ? ` — ${d.semCarro.map(nomeBonito).join(" e ")} vai junto` : ""} nos dias do serviço
                        {d.dias.length ? ` (${d.dias.map(dataBR).join(", ")})` : ""}. Escolha onde fica o cliente — ou clique no mapa / arraste o pino.
                      </div>
                      {d.avisos.map((a, i) => <div key={i} className="lcm-aviso lcm-ambar">{a}</div>)}
                      <div className="lcm-lista">
                        {d.paradas.length === 0 && <div className="lcm-vazio">Nenhuma parada de 30 min ou mais fora da loja nesses dias.</div>}
                        {d.paradas.map((p, i) => {
                          const sel = escolha?.tipo === "parada" && escolha.i === i;
                          return (
                            <button key={`${p.placa}${p.inicio}`} type="button" className={`lcm-parada${sel ? " sel" : ""}`}
                              onClick={() => { setEscolha({ tipo: "parada", i }); setPino({ lat: p.lat, lng: p.lng }); focar(p.lat, p.lng); }}>
                              <span className="lcm-num">{i + 1}</span>
                              <span style={{ minWidth: 0, flex: 1 }}>
                                <span className="lcm-p1">{dataBR(p.data)} · {hora(p.inicio)}–{hora(p.fim)} <span className="lcm-dur">{duracaoTexto(p.duracaoMin)}</span></span>
                                <span className="lcm-p2">{p.acompanhado ? `carro de ${p.tecnico}` : p.tecnico} · {p.placa}{p.local ? ` · ${p.local}` : ""}</span>
                              </span>
                            </button>
                          );
                        })}
                        {d.cadastro && (
                          <button type="button" className={`lcm-parada${escolha?.tipo === "cadastro" ? " sel" : ""}`}
                            onClick={() => { setEscolha({ tipo: "cadastro" }); setPino(d.cadastro); focar(d.cadastro!.lat, d.cadastro!.lng); }}>
                            <span className="lcm-num lcm-num-cinza"><i className="fas fa-address-card" /></span>
                            <span style={{ minWidth: 0, flex: 1 }}><span className="lcm-p1">Ponto do cadastro do cliente</span><span className="lcm-p2">já estava no mapa, sem confirmação</span></span>
                          </button>
                        )}
                        {escolha?.tipo === "manual" && pino && <div className="lcm-manual"><i className="fas fa-hand-pointer" /> Ponto escolhido no mapa: {pino.lat.toFixed(5)}, {pino.lng.toFixed(5)}</div>}
                      </div>
                      {erro && <div className="lcm-aviso lcm-vermelho">{erro}</div>}
                      <div className="lcm-rodape">
                        {trocando && <button type="button" className="lcm-btn-sec" onClick={() => { setTrocando(false); setEscolha({ tipo: "confirmada" }); setPino({ lat: d.confirmada!.lat, lng: d.confirmada!.lng }); }}>Cancelar</button>}
                        <button type="button" className="lcm-btn" disabled={!pino || salvando || !!d.semTabela} onClick={() => void confirmar()}>
                          {salvando ? "Gravando…" : "Confirmar esta localização"}
                        </button>
                      </div>
                    </>
                  )}
                </div>
                <div className="lcm-mapa" ref={mapaEl} />
              </div>
            )}
      </div>
    </div>,
    document.body,
  );
}

const nomeBonito = (s: string) => s.toLowerCase().replace(/(^|\s)(\S)/g, (_m, a: string, b: string) => a + b.toUpperCase()).replace(/ (De|Da|Do|Dos|Das|E) /g, (x) => x.toLowerCase());

function numIcon(L: any, n: number, sel: boolean) {
  const bg = sel ? COR : "#fefefe", tx = sel ? "#fefefe" : "#0f172a";
  return L.divIcon({
    className: "",
    html: `<div style="width:26px;height:26px;border-radius:9px;display:grid;place-items:center;font:500 13px system-ui;background:${bg};color:${tx};border:2px solid ${COR};box-shadow:0 2px 6px rgba(15,23,42,.35)">${n}</div>`,
    iconSize: [26, 26], iconAnchor: [13, 13],
  });
}

const ESTILO = `
.lcm-fundo { position: fixed; inset: 0; z-index: 10050; background: rgba(15,23,42,.45); display: flex; align-items: center; justify-content: center; padding: 16px; }
.lcm-janela { background: var(--surface, #fefefe); border: 1px solid var(--border, #e2e8f0); border-radius: 16px; width: min(1100px, 100%); height: min(720px, 100%); display: flex; flex-direction: column; overflow: hidden; color: var(--portal-text, #0f172a); }
.lcm-topo { display: flex; align-items: center; gap: 12px; padding: 14px 18px; border-bottom: 1px solid var(--border, #e2e8f0); }
.lcm-ico { width: 40px; height: 40px; border-radius: 11px; display: grid; place-items: center; font-size: 16px; color: ${COR}; background: color-mix(in srgb, ${COR} 9%, var(--surface, #fefefe)); border: 1px solid color-mix(in srgb, ${COR} 18%, transparent); flex-shrink: 0; }
.lcm-titulo { font-size: 17px; font-weight: 500; }
.lcm-sub { font-size: 13px; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lcm-x { margin-left: auto; width: 36px; height: 36px; border-radius: 10px; border: 1px solid var(--border, #e2e8f0); background: transparent; color: #475569; cursor: pointer; }
.lcm-carregando { padding: 40px; text-align: center; color: #64748b; font-size: 14px; }
.lcm-corpo { flex: 1; min-height: 0; display: grid; grid-template-columns: 360px 1fr; }
.lcm-lado { border-right: 1px solid var(--border, #e2e8f0); padding: 14px; display: flex; flex-direction: column; gap: 10px; min-height: 0; overflow: auto; }
.lcm-mapa { min-height: 300px; }
.lcm-explica { font-size: 13.5px; color: #475569; line-height: 1.45; }
.lcm-lista { display: flex; flex-direction: column; gap: 6px; }
.lcm-parada { display: flex; gap: 10px; align-items: center; text-align: left; padding: 9px 10px; border-radius: 12px; border: 1px solid var(--border, #e2e8f0); background: var(--surface, #fefefe); cursor: pointer; font: inherit; color: inherit; transition: border-color .15s, background .15s; }
.lcm-parada:hover { border-color: color-mix(in srgb, ${COR} 35%, var(--border, #e2e8f0)); }
.lcm-parada.sel { border-color: ${COR}; background: color-mix(in srgb, ${COR} 6%, var(--surface, #fefefe)); }
.lcm-num { width: 26px; height: 26px; border-radius: 9px; display: grid; place-items: center; font-size: 13px; color: ${COR}; background: color-mix(in srgb, ${COR} 10%, var(--surface, #fefefe)); flex-shrink: 0; }
.lcm-parada.sel .lcm-num { background: ${COR}; color: #fefefe; }
.lcm-num-cinza { color: #475569; background: #f1f5f9; }
.lcm-p1 { display: block; font-size: 14px; }
.lcm-p2 { display: block; font-size: 12.5px; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lcm-dur { font-size: 12px; color: ${COR}; background: color-mix(in srgb, ${COR} 9%, transparent); border-radius: 99px; padding: 1px 8px; margin-left: 4px; }
.lcm-vazio, .lcm-manual { font-size: 13px; color: #64748b; padding: 8px 2px; }
.lcm-aviso { font-size: 13px; border-radius: 10px; padding: 8px 10px; line-height: 1.4; }
.lcm-ambar { background: #fffbeb; color: #92400e; border: 1px solid #fde68a; }
.lcm-vermelho { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; margin: 14px; }
.lcm-lado .lcm-vermelho { margin: 0; }
.lcm-ok { border: 1px solid #bbf7d0; background: #f0fdf4; border-radius: 12px; padding: 12px; display: grid; gap: 6px; }
.lcm-ok-t { color: #15803d; font-size: 15px; }
.lcm-ok-d { color: #475569; font-size: 13px; }
.lcm-acoes, .lcm-rodape { display: flex; gap: 8px; flex-wrap: wrap; }
.lcm-rodape { margin-top: auto; justify-content: flex-end; padding-top: 6px; }
.lcm-btn { border: none; background: ${COR}; color: #fefefe; border-radius: 10px; padding: 10px 16px; font: inherit; font-size: 14px; cursor: pointer; }
.lcm-btn:disabled { background: #e2e8f0; color: #94a3b8; cursor: default; }
.lcm-btn-sec { border: 1px solid var(--border, #cbd5e1); background: var(--surface, #fefefe); color: #0f172a; border-radius: 10px; padding: 8px 12px; font: inherit; font-size: 13.5px; cursor: pointer; text-decoration: none; display: inline-flex; gap: 6px; align-items: center; }
@media (max-width: 760px) { .lcm-corpo { grid-template-columns: 1fr; grid-template-rows: auto 320px; } .lcm-lado { border-right: none; border-bottom: 1px solid var(--border, #e2e8f0); } }
`;
