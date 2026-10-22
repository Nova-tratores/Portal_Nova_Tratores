"use client";
/* eslint-disable @typescript-eslint/no-explicit-any -- Leaflet vem via CDN (window.L), sem tipos */
// Localizações do cliente (José, 22/10/2026): um CPF/CNPJ pode ter VÁRIAS (fazendas, sítios, sede), cada uma
// com o nome. Para adicionar: nos dias de execução da OS, onde o carro do técnico ficou parado 30 min ou mais
// (GPS da Frota) — o usuário escolhe a parada (ou clica no mapa / arrasta o pino), dá o nome e confirma.
// Estilo POS NewPortal (docs/estilo-pos-newportal.md).
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { authHeaders } from "@/lib/auth/client";
import { carregarLeaflet, pinIcon, round6, CENTRO_PADRAO } from "@/components/feedbacks/leaflet";
import { distanciaM, duracaoTexto } from "@/lib/pos/localizacao-cliente";

interface Parada { placa: string; tecnico: string; data: string; inicio: string; fim: string | null; duracaoMin: number; lat: number; lng: number; classe?: string | null; local?: string | null; acompanhado?: boolean }
interface Localizacao { id: string; nome: string; lat: number; lng: number; origem: string; tecnico: string | null; confirmado_por: string; confirmado_em: string; os_id: string | null }
interface Dados {
  documento: string; cliente: string; dias: string[]; tecnicos: string[]; semCarro: string[];
  paradas: Parada[]; cadastro: { lat: number; lng: number } | null; avisos: string[];
  localizacoes: Localizacao[]; semTabela?: boolean; error?: string;
}
type Escolha = { tipo: "parada"; i: number } | { tipo: "cadastro" } | { tipo: "manual" };

const COR = "#0369A1";
const VERDE = "#15803d";
const dataBR = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
const hora = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }) : "—");
const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit" });
const nomeBonito = (s: string) => s.toLowerCase().replace(/(^|\s)(\S)/g, (_m, a: string, b: string) => a + b.toUpperCase()).replace(/ (De|Da|Do|Dos|Das|E) /g, (x) => x.toLowerCase());

/** parada que cai numa localização já cadastrada (até 150 m) — não é sugerida de novo */
const jaCadastrada = (p: { lat: number; lng: number }, lista: Localizacao[]) => lista.find((l) => distanciaM(l, p) < 150) || null;

export default function LocalizacaoClienteModal({ osId, onClose, onConfirmada }: {
  osId: string; onClose: () => void; onConfirmada?: () => void;
}) {
  const [d, setD] = useState<Dados | null>(null);
  const [versao, setVersao] = useState(0);
  const [adicionando, setAdicionando] = useState(false);
  const [escolha, setEscolha] = useState<Escolha | null>(null);
  const [pino, setPino] = useState<{ lat: number; lng: number } | null>(null);
  const [nome, setNome] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [editando, setEditando] = useState<{ id: string; nome: string } | null>(null);
  const mapaEl = useRef<HTMLDivElement>(null);
  const mapa = useRef<any>(null);
  const camada = useRef<any>(null);
  const LRef = useRef<any>(null);
  const adicionandoRef = useRef(false);
  useEffect(() => { adicionandoRef.current = adicionando; }, [adicionando]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch(`/api/pos/ordens/${encodeURIComponent(osId)}/localizacao`, { headers: await authHeaders(), cache: "no-store" });
        const j = await r.json();
        if (!vivo) return;
        if (!r.ok) { setD({ ...(j || {}), localizacoes: [], error: j?.error || `Erro ${r.status}` } as Dados); return; }
        setD(j);
        // sem nenhuma localização: já abre adicionando, com a parada mais longa escolhida
        if (!j.localizacoes?.length) {
          setAdicionando(true);
          if (j.paradas?.length) { setEscolha({ tipo: "parada", i: 0 }); setPino({ lat: j.paradas[0].lat, lng: j.paradas[0].lng }); }
          else if (j.cadastro) { setEscolha({ tipo: "cadastro" }); setPino(j.cadastro); }
        }
      } catch { if (vivo) setD({ error: "Sem conexão.", localizacoes: [] } as unknown as Dados); }
    })();
    return () => { vivo = false; };
  }, [osId, versao]);

  const desenhar = useCallback(() => {
    const L = LRef.current, m = mapa.current;
    if (!L || !m || !d) return;
    camada.current?.remove();
    const g = L.layerGroup().addTo(m);
    camada.current = g;
    const pontos: [number, number][] = [];
    for (const l of d.localizacoes || []) {
      L.marker([l.lat, l.lng], { icon: pinIcon(L, VERDE), zIndexOffset: 800 }).addTo(g)
        .bindTooltip(l.nome, { permanent: true, direction: "top", offset: [0, -36], className: "lcm-rotulo" });
      pontos.push([l.lat, l.lng]);
    }
    if (adicionando) {
      (d.paradas || []).forEach((p, i) => {
        if (jaCadastrada(p, d.localizacoes || [])) return;
        const sel = escolha?.tipo === "parada" && escolha.i === i;
        const mk = L.marker([p.lat, p.lng], { icon: numIcon(L, i + 1, sel), zIndexOffset: sel ? 500 : 0 }).addTo(g);
        mk.on("click", () => { setEscolha({ tipo: "parada", i }); setPino({ lat: p.lat, lng: p.lng }); });
        pontos.push([p.lat, p.lng]);
      });
      if (d.cadastro) { L.circleMarker([d.cadastro.lat, d.cadastro.lng], { radius: 7, color: "#64748b", weight: 2, fillColor: "#fefefe", fillOpacity: 1 }).addTo(g).bindTooltip("Ponto do cadastro"); pontos.push([d.cadastro.lat, d.cadastro.lng]); }
      if (pino) {
        const mk = L.marker([pino.lat, pino.lng], { icon: pinIcon(L, COR), draggable: true, zIndexOffset: 1000 }).addTo(g);
        mk.on("dragend", () => { const ll = mk.getLatLng(); setEscolha({ tipo: "manual" }); setPino({ lat: round6(ll.lat), lng: round6(ll.lng) }); });
        pontos.push([pino.lat, pino.lng]);
      }
    }
    return pontos;
  }, [d, escolha, pino, adicionando]);

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
      m.on("click", (e: any) => { if (!adicionandoRef.current) return; setEscolha({ tipo: "manual" }); setPino({ lat: round6(e.latlng.lat), lng: round6(e.latlng.lng) }); });
      const pts = desenhar() || [];
      const enquadrar = () => { if (pts.length > 1) m.fitBounds(pts, { padding: [50, 50], maxZoom: 16 }); else if (pts.length === 1) m.setView(pts[0], 16); };
      enquadrar();
      // a janela ainda está montando: recalcula o tamanho quando ela assenta (senão sobra faixa cinza)
      const ro = new ResizeObserver(() => m.invalidateSize());
      ro.observe(mapaEl.current);
      m.once("unload", () => ro.disconnect());
      setTimeout(() => { m.invalidateSize(); enquadrar(); }, 250);
    });
  }, [d, desenhar]);

  useEffect(() => { desenhar(); }, [desenhar]);
  useEffect(() => () => { mapa.current?.remove(); mapa.current = null; }, []);

  const focar = (lat: number, lng: number) => mapa.current?.setView([lat, lng], Math.max(16, mapa.current.getZoom()));

  const enviar = async (corpo: Record<string, unknown>): Promise<boolean> => {
    setSalvando(true); setErro("");
    try {
      const r = await fetch(`/api/pos/ordens/${encodeURIComponent(osId)}/localizacao`, {
        method: "POST", headers: { ...(await authHeaders()), "Content-Type": "application/json" }, body: JSON.stringify(corpo),
      });
      const j = await r.json().catch(() => ({}));
      setSalvando(false);
      if (!r.ok) { setErro(j.error || `Erro ${r.status}`); return false; }
      return true;
    } catch { setErro("Sem conexão — tente de novo."); setSalvando(false); return false; }
  };

  const adicionar = async () => {
    if (!pino || !d) return;
    const p = escolha?.tipo === "parada" ? d.paradas[escolha.i] : null;
    const ok = await enviar({ nome, lat: pino.lat, lng: pino.lng, origem: p ? "parada" : escolha?.tipo === "cadastro" ? "cadastro" : "manual", placa: p?.placa, tecnico: p?.tecnico, paradaInicio: p?.inicio, paradaMin: p?.duracaoMin });
    if (!ok) return;
    onConfirmada?.();
    setAdicionando(false); setNome(""); setEscolha(null); setPino(null); setVersao((v) => v + 1);
  };

  const renomear = async () => {
    if (!editando) return;
    if (await enviar({ acao: "renomear", id: editando.id, nome: editando.nome })) { setEditando(null); setVersao((v) => v + 1); }
  };
  const remover = async (l: Localizacao) => {
    if (!confirm(`Apagar a localização "${l.nome}"?`)) return;
    if (await enviar({ acao: "remover", id: l.id })) { onConfirmada?.(); setVersao((v) => v + 1); }
  };
  const comecarAdicionar = () => {
    setAdicionando(true); setErro(""); setNome("");
    const i = (d?.paradas || []).findIndex((p) => !jaCadastrada(p, d?.localizacoes || []));
    if (d && i >= 0) { setEscolha({ tipo: "parada", i }); setPino({ lat: d.paradas[i].lat, lng: d.paradas[i].lng }); }
  };

  const comCarro = [...new Set((d?.paradas || []).filter((p) => !p.acompanhado).map((p) => nomeBonito(p.tecnico)))];
  const lista = d?.localizacoes || [];

  return createPortal(
    <div className="lcm-fundo" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <style>{ESTILO}</style>
      <div className="lcm-janela" role="dialog" aria-label="Localizações do cliente">
        <div className="lcm-topo">
          <span className="lcm-ico"><i className="fas fa-location-dot" /></span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="lcm-titulo">Localizações do cliente</div>
            <div className="lcm-sub">{d?.cliente || "…"}{d?.documento ? ` · ${d.documento}` : ""}</div>
          </div>
          <button type="button" className="lcm-x" onClick={onClose} aria-label="Fechar"><i className="fas fa-xmark" /></button>
        </div>

        {!d ? <div className="lcm-carregando">Lendo o GPS do carro do técnico…</div>
          : d.error ? <div className="lcm-aviso lcm-vermelho" style={{ margin: 14 }}>{d.error}</div>
            : (
              <div className="lcm-corpo">
                <div className="lcm-lado">
                  {d.semTabela && <div className="lcm-aviso lcm-ambar">Falta rodar o SQL <code>sql/clientes-localizacoes.sql</code> no Supabase do portal — sem ele não dá para guardar.</div>}

                  {lista.length > 0 && (
                    <div className="lcm-secao">
                      <div className="lcm-secao-t">Fazendas e locais ({lista.length})</div>
                      {lista.map((l) => (
                        <div key={l.id} className="lcm-loc">
                          <button type="button" className="lcm-loc-ico" onClick={() => focar(l.lat, l.lng)} title="Ver no mapa"><i className="fas fa-location-dot" /></button>
                          {editando?.id === l.id ? (
                            <div className="lcm-loc-edit">
                              <input className="lcm-input" value={editando.nome} autoFocus maxLength={80}
                                onChange={(e) => setEditando({ id: l.id, nome: e.target.value })}
                                onKeyDown={(e) => { if (e.key === "Enter") void renomear(); if (e.key === "Escape") setEditando(null); }} />
                              <button type="button" className="lcm-btn lcm-btn-p" disabled={salvando || editando.nome.trim().length < 2} onClick={() => void renomear()}>Salvar</button>
                            </div>
                          ) : (
                            <button type="button" className="lcm-loc-txt" onClick={() => focar(l.lat, l.lng)}>
                              <span className="lcm-p1">{l.nome}</span>
                              <span className="lcm-p2" title={`confirmada por ${l.confirmado_por} em ${quando(l.confirmado_em)}`}>{l.confirmado_por.split("@")[0]} · {quando(l.confirmado_em)}{l.os_id ? ` · ${l.os_id}` : ""}</span>
                            </button>
                          )}
                          {editando?.id !== l.id && (
                            <span className="lcm-loc-acoes">
                              <a href={`https://www.google.com/maps?q=${l.lat},${l.lng}`} target="_blank" rel="noreferrer" title="Abrir no Google Maps"><i className="fas fa-map" /></a>
                              <button type="button" title="Renomear" onClick={() => setEditando({ id: l.id, nome: l.nome })}><i className="fas fa-pen" /></button>
                              <button type="button" title="Apagar" onClick={() => void remover(l)}><i className="fas fa-trash" /></button>
                            </span>
                          )}
                        </div>
                      ))}
                      {!adicionando && <button type="button" className="lcm-btn-sec lcm-mais" onClick={comecarAdicionar}><i className="fas fa-plus" /> Adicionar outra fazenda</button>}
                    </div>
                  )}

                  {adicionando && (
                    <div className="lcm-secao">
                      <div className="lcm-secao-t">{lista.length ? "Nova localização" : "Onde fica o cliente?"}</div>
                      <div className="lcm-explica">
                        Paradas de 30 min ou mais (das 7h às 19h) do carro {comCarro.length ? `de ${comCarro.join(" e ")}` : "do técnico"}
                        {d.semCarro.length ? ` — ${d.semCarro.map(nomeBonito).join(" e ")} vai junto` : ""}
                        {d.dias.length ? ` nos dias do serviço (${d.dias.map(dataBR).join(", ")})` : ""}. Escolha uma — ou clique no mapa / arraste o pino.
                      </div>
                      {d.avisos.map((a, i) => <div key={i} className="lcm-aviso lcm-ambar">{a}</div>)}
                      <div className="lcm-lista">
                        {d.paradas.length === 0 && <div className="lcm-vazio">Nenhuma parada de 30 min ou mais fora da loja nesses dias.</div>}
                        {d.paradas.map((p, i) => {
                          const sel = escolha?.tipo === "parada" && escolha.i === i;
                          const ja = jaCadastrada(p, lista);
                          return (
                            <button key={`${p.placa}${p.inicio}`} type="button" className={`lcm-parada${sel ? " sel" : ""}${ja ? " ja" : ""}`} disabled={!!ja}
                              onClick={() => { setEscolha({ tipo: "parada", i }); setPino({ lat: p.lat, lng: p.lng }); focar(p.lat, p.lng); }}>
                              <span className="lcm-num">{i + 1}</span>
                              <span style={{ minWidth: 0, flex: 1 }}>
                                <span className="lcm-p1">{dataBR(p.data)} · {hora(p.inicio)}–{hora(p.fim)} <span className="lcm-dur">{duracaoTexto(p.duracaoMin)}</span></span>
                                <span className="lcm-p2">{ja ? `já é a ${ja.nome}` : `${nomeBonito(p.tecnico)} · ${p.placa}${p.local ? ` · ${p.local}` : ""}`}</span>
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
                        {escolha?.tipo === "manual" && pino && <div className="lcm-vazio"><i className="fas fa-hand-pointer" /> Ponto escolhido no mapa: {pino.lat.toFixed(5)}, {pino.lng.toFixed(5)}</div>}
                      </div>
                      <label className="lcm-rot">Nome da fazenda
                        <input className="lcm-input" value={nome} maxLength={80} placeholder="ex.: Fazenda Santa Luzia, Sítio São José"
                          onChange={(e) => setNome(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && pino && nome.trim().length >= 2) void adicionar(); }} />
                      </label>
                    </div>
                  )}

                  {erro && <div className="lcm-aviso lcm-vermelho">{erro}</div>}
                  {adicionando && (
                    <div className="lcm-rodape">
                      {lista.length > 0 && <button type="button" className="lcm-btn-sec" onClick={() => { setAdicionando(false); setErro(""); setPino(null); setEscolha(null); }}>Cancelar</button>}
                      <button type="button" className="lcm-btn lcm-btn-p" disabled={!pino || nome.trim().length < 2 || salvando || !!d.semTabela} onClick={() => void adicionar()}>
                        {salvando ? "Gravando…" : "Confirmar esta localização"}
                      </button>
                    </div>
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
.lcm-corpo { flex: 1; min-height: 0; display: grid; grid-template-columns: 370px 1fr; }
.lcm-lado { border-right: 1px solid var(--border, #e2e8f0); padding: 14px; display: flex; flex-direction: column; gap: 12px; min-height: 0; overflow: auto; }
.lcm-mapa { min-height: 300px; }
.lcm-secao { display: flex; flex-direction: column; gap: 8px; }
.lcm-secao-t { font-size: 15px; color: #0f172a; }
.lcm-explica { font-size: 13px; color: #475569; line-height: 1.45; }
.lcm-lista { display: flex; flex-direction: column; gap: 6px; }
.lcm-loc { display: flex; gap: 10px; align-items: center; padding: 8px 10px; border-radius: 12px; border: 1px solid color-mix(in srgb, ${VERDE} 25%, var(--border, #e2e8f0)); background: color-mix(in srgb, ${VERDE} 4%, var(--surface, #fefefe)); }
.lcm-loc-ico { width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; color: ${VERDE}; background: color-mix(in srgb, ${VERDE} 10%, var(--surface, #fefefe)); border: none; cursor: pointer; flex-shrink: 0; }
.lcm-loc-txt { flex: 1; min-width: 0; text-align: left; border: none; background: none; padding: 0; font: inherit; color: inherit; cursor: pointer; }
.lcm-loc-edit { flex: 1; min-width: 0; display: flex; gap: 6px; }
.lcm-loc-edit .lcm-input { flex: 1; min-width: 0; }
.lcm-loc-acoes { display: flex; gap: 2px; }
.lcm-loc-acoes a, .lcm-loc-acoes button { width: 30px; height: 30px; border-radius: 8px; display: grid; place-items: center; color: #64748b; background: none; border: none; cursor: pointer; font-size: 13px; text-decoration: none; }
.lcm-loc-acoes a:hover, .lcm-loc-acoes button:hover { background: color-mix(in srgb, #0f172a 6%, transparent); color: #0f172a; }
.lcm-mais { align-self: flex-start; }
.lcm-parada { display: flex; gap: 10px; align-items: center; text-align: left; padding: 9px 10px; border-radius: 12px; border: 1px solid var(--border, #e2e8f0); background: var(--surface, #fefefe); cursor: pointer; font: inherit; color: inherit; transition: border-color .15s, background .15s; }
.lcm-parada:hover { border-color: color-mix(in srgb, ${COR} 35%, var(--border, #e2e8f0)); }
.lcm-parada.sel { border-color: ${COR}; background: color-mix(in srgb, ${COR} 6%, var(--surface, #fefefe)); }
.lcm-num { width: 26px; height: 26px; border-radius: 9px; display: grid; place-items: center; font-size: 13px; color: ${COR}; background: color-mix(in srgb, ${COR} 10%, var(--surface, #fefefe)); flex-shrink: 0; }
.lcm-parada.ja { opacity: .55; cursor: default; }
.lcm-parada.ja .lcm-num { color: ${VERDE}; background: color-mix(in srgb, ${VERDE} 10%, var(--surface, #fefefe)); }
.lcm-parada.sel .lcm-num { background: ${COR}; color: #fefefe; }
.lcm-num-cinza { color: #475569; background: #f1f5f9; }
.lcm-p1 { display: block; font-size: 14px; }
.lcm-p2 { display: block; font-size: 12.5px; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lcm-dur { font-size: 12px; color: ${COR}; background: color-mix(in srgb, ${COR} 9%, transparent); border-radius: 99px; padding: 1px 8px; margin-left: 4px; }
.lcm-vazio { font-size: 13px; color: #64748b; padding: 6px 2px; }
.lcm-rot { display: flex; flex-direction: column; gap: 5px; font-size: 13px; color: #475569; }
.lcm-input { border: 1px solid var(--border, #cbd5e1); border-radius: 10px; padding: 9px 12px; font: inherit; font-size: 14.5px; color: inherit; background: var(--surface, #fefefe); }
.lcm-input:focus { outline: none; border-color: ${COR}; box-shadow: 0 0 0 3px color-mix(in srgb, ${COR} 12%, transparent); }
.lcm-aviso { font-size: 13px; border-radius: 10px; padding: 8px 10px; line-height: 1.4; }
.lcm-ambar { background: #fffbeb; color: #92400e; border: 1px solid #fde68a; }
.lcm-vermelho { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }
.lcm-rodape { display: flex; gap: 8px; flex-wrap: wrap; margin-top: auto; justify-content: flex-end; padding-top: 6px; }
.lcm-btn { border: none; border-radius: 10px; padding: 10px 16px; font: inherit; font-size: 14px; cursor: pointer; }
.lcm-btn-p { background: ${COR}; color: #fefefe; }
.lcm-btn:disabled { background: #e2e8f0; color: #94a3b8; cursor: default; }
.lcm-btn-sec { border: 1px solid var(--border, #cbd5e1); background: var(--surface, #fefefe); color: #0f172a; border-radius: 10px; padding: 8px 12px; font: inherit; font-size: 13.5px; cursor: pointer; text-decoration: none; display: inline-flex; gap: 6px; align-items: center; }
.lcm-rotulo { background: #fefefe; color: #0f172a; border: 1px solid color-mix(in srgb, ${VERDE} 35%, #e2e8f0); border-radius: 8px; padding: 2px 8px; font: 400 12.5px system-ui; box-shadow: 0 2px 6px rgba(15,23,42,.2); }
.lcm-rotulo::before { display: none; }
@media (max-width: 760px) { .lcm-corpo { grid-template-columns: 1fr; grid-template-rows: auto minmax(320px, 1fr); } .lcm-lado { border-right: none; border-bottom: 1px solid var(--border, #e2e8f0); } }
`;
