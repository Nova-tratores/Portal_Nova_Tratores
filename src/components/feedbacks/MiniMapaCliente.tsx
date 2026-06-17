"use client";
/* eslint-disable @typescript-eslint/no-explicit-any -- Leaflet é carregado via CDN (window.L), sem tipos disponíveis */
import { useCallback, useEffect, useRef, useState } from "react";
import { buscarLocalizacaoCliente, salvarLocalizacaoCliente } from "@/lib/feedbacks/api";
import { clienteKey } from "@/lib/feedbacks/types";
import { useAuditLog } from "@/hooks/useAuditLog";

interface Props {
  codigoOmie: string | null;
  nome: string;
  cor: string;          // cor do header (CRM vermelho / RFM laranja)
}

// Centro padrão quando o cliente ainda não tem coordenadas (região de atuação).
const CENTRO_PADRAO: [number, number] = [-23.2, -49.37];

// Carrega o Leaflet via CDN uma única vez (mesmo padrão do mapa de visitas).
function carregarLeaflet(cb: () => void) {
  if (typeof window === "undefined") return;
  const w = window as unknown as { L?: unknown };
  if (w.L) { cb(); return; }
  const existente = document.getElementById("leaflet-cdn-js") as HTMLScriptElement | null;
  if (existente) {
    if (w.L) { cb(); return; }
    existente.addEventListener("load", cb);
    return;
  }
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.id = "leaflet-cdn-css";
  link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
  document.head.appendChild(link);
  const script = document.createElement("script");
  script.id = "leaflet-cdn-js";
  script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
  script.onload = () => cb();
  document.head.appendChild(script);
}

function pinIcon(L: any, cor: string) {
  return L.divIcon({
    className: "",
    html: `<svg width="28" height="38" viewBox="0 0 30 40" style="filter:drop-shadow(0 2px 4px rgba(0,0,0,0.35))">
      <path d="M15 38C15 38 28 22 28 14C28 6.82 22.18 1 15 1C7.82 1 2 6.82 2 14C2 22 15 38 15 38Z" fill="${cor}" stroke="#fff" stroke-width="2"/>
      <circle cx="15" cy="14" r="5" fill="#fff"/>
    </svg>`,
    iconSize: [28, 38],
    iconAnchor: [14, 38],
  });
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

export default function MiniMapaCliente({ codigoOmie, nome, cor }: Props) {
  const { log } = useAuditLog();

  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const centradoRef = useRef(false);

  const [ready, setReady] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [semCliente, setSemCliente] = useState(false);
  const [rowId, setRowId] = useState<number | null>(null);
  const [cidade, setCidade] = useState<string | null>(null);

  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [latStr, setLatStr] = useState("");
  const [lngStr, setLngStr] = useState("");
  const baseRef = useRef<{ lat: number | null; lng: number | null }>({ lat: null, lng: null });
  const [dirty, setDirty] = useState(false);

  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  // Define coordenadas a partir do mapa (clique/arraste) — atualiza inputs.
  const setCoords = useCallback((la: number, ln: number) => {
    const rla = round6(la), rln = round6(ln);
    setLat(rla); setLng(rln);
    setLatStr(String(rla)); setLngStr(String(rln));
    setDirty(true); setMsg(null);
  }, []);

  // 1) Carrega o registro do cliente (id + coordenadas atuais).
  useEffect(() => {
    let vivo = true;
    setCarregando(true); setSemCliente(false); setMsg(null);
    setRowId(null); setCidade(null);
    setLat(null); setLng(null); setLatStr(""); setLngStr("");
    baseRef.current = { lat: null, lng: null };
    setDirty(false);
    centradoRef.current = false;

    if (!codigoOmie) { setCarregando(false); setSemCliente(true); return; }

    buscarLocalizacaoCliente(codigoOmie)
      .then((loc) => {
        if (!vivo) return;
        if (!loc) { setSemCliente(true); return; }
        setRowId(loc.id);
        setCidade(loc.cidade);
        setLat(loc.lat); setLng(loc.lng);
        setLatStr(loc.lat != null ? String(loc.lat) : "");
        setLngStr(loc.lng != null ? String(loc.lng) : "");
        baseRef.current = { lat: loc.lat, lng: loc.lng };
      })
      .catch(() => { if (vivo) setSemCliente(true); })
      .finally(() => { if (vivo) setCarregando(false); });

    return () => { vivo = false; };
  }, [codigoOmie]);

  // 2) Garante que o Leaflet está carregado.
  useEffect(() => {
    if (semCliente) return;
    carregarLeaflet(() => setReady(true));
  }, [semCliente]);

  // 3) Inicializa o mapa quando o Leaflet e o container estão prontos.
  useEffect(() => {
    if (!ready || semCliente || !mapDivRef.current || mapInstance.current) return;
    const L = (window as any).L;
    const inicial: [number, number] = lat != null && lng != null ? [lat, lng] : CENTRO_PADRAO;
    const map = L.map(mapDivRef.current, { attributionControl: false }).setView(inicial, lat != null ? 14 : 9);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);
    map.on("click", (e: any) => setCoords(e.latlng.lat, e.latlng.lng));
    mapInstance.current = map;
    // Corrige tamanho dentro do modal (container ganha dimensão após o paint).
    setTimeout(() => mapInstance.current?.invalidateSize(), 150);
  }, [ready, semCliente, lat, lng, setCoords]);

  // 4) Mantém o marcador sincronizado com as coordenadas.
  useEffect(() => {
    if (!ready || !mapInstance.current) return;
    const L = (window as any).L;
    if (lat == null || lng == null) {
      if (markerRef.current) { markerRef.current.remove(); markerRef.current = null; }
      return;
    }
    if (!markerRef.current) {
      const m = L.marker([lat, lng], { draggable: true, icon: pinIcon(L, cor) }).addTo(mapInstance.current);
      m.on("dragend", () => { const ll = m.getLatLng(); setCoords(ll.lat, ll.lng); });
      markerRef.current = m;
    } else {
      markerRef.current.setLatLng([lat, lng]);
    }
    if (!centradoRef.current) { mapInstance.current.setView([lat, lng], 14); centradoRef.current = true; }
  }, [lat, lng, ready, cor, setCoords]);

  // 5) Limpa o mapa ao desmontar (evita "container already initialized").
  useEffect(() => () => {
    if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; }
    markerRef.current = null;
  }, []);

  const onInput = (eixo: "lat" | "lng", valor: string) => {
    if (eixo === "lat") setLatStr(valor); else setLngStr(valor);
    const v = parseFloat(valor.replace(",", "."));
    if (Number.isFinite(v)) {
      if (eixo === "lat") setLat(round6(v)); else setLng(round6(v));
      setDirty(true); setMsg(null);
    }
  };

  async function handleSalvar() {
    if (rowId == null) return;
    if (lat == null || lng == null) { setMsg({ tipo: "erro", texto: "Informe latitude e longitude." }); return; }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) { setMsg({ tipo: "erro", texto: "Coordenadas fora do intervalo válido." }); return; }
    setSalvando(true); setMsg(null);
    try {
      await salvarLocalizacaoCliente(rowId, lat, lng);
      void log({
        sistema: "feedbacks", acao: "localizacao_cliente", entidade: "cliente",
        entidade_id: clienteKey(codigoOmie, nome), entidade_label: nome,
        detalhes: { de: baseRef.current, para: { lat, lng } },
      });
      baseRef.current = { lat, lng };
      setDirty(false);
      setMsg({ tipo: "ok", texto: "Localização salva." });
    } catch (e) {
      setMsg({ tipo: "erro", texto: e instanceof Error ? e.message : String(e) });
    } finally {
      setSalvando(false);
    }
  }

  if (semCliente) {
    return (
      <div style={{ fontSize: 12, color: "var(--portal-text-muted)", fontStyle: "italic", padding: "8px 0" }}>
        {codigoOmie
          ? "Cliente sem cadastro no mapa do Portal — localização indisponível."
          : "Selecione um cliente do Omie para ver e editar a localização."}
      </div>
    );
  }

  const temBase = baseRef.current.lat != null && baseRef.current.lng != null;

  return (
    <div>
      {!temBase && !carregando && (
        <div style={{ fontSize: 11, color: "#92400e", marginBottom: 6, fontWeight: 600 }}>
          ⚠ Sem localização cadastrada. Clique no mapa ou informe lat/long abaixo.
        </div>
      )}
      <div style={{ position: "relative", width: "100%", height: 200, borderRadius: 10, overflow: "hidden", border: "1.5px solid var(--portal-border)" }}>
        <div ref={mapDivRef} style={{ width: "100%", height: "100%" }} />
        {(carregando || !ready) && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.7)", fontSize: 12, color: "var(--portal-text-secondary)", fontWeight: 600 }}>
            Carregando mapa…
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, alignItems: "end", marginTop: 8 }}>
        <div>
          <div style={miniLabel}>Latitude</div>
          <input value={latStr} onChange={(e) => onInput("lat", e.target.value)} placeholder="-23.200000" inputMode="decimal" style={miniInput} />
        </div>
        <div>
          <div style={miniLabel}>Longitude</div>
          <input value={lngStr} onChange={(e) => onInput("lng", e.target.value)} placeholder="-49.370000" inputMode="decimal" style={miniInput} />
        </div>
        <button
          onClick={handleSalvar}
          disabled={salvando || !dirty || rowId == null}
          style={{
            padding: "9px 16px", borderRadius: 9, border: "none", fontSize: 12, fontWeight: 700,
            color: "#fff", background: cor, whiteSpace: "nowrap",
            opacity: salvando || !dirty || rowId == null ? 0.5 : 1,
            cursor: salvando || !dirty || rowId == null ? "default" : "pointer",
          }}
        >
          {salvando ? "Salvando…" : "Salvar local"}
        </button>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 6, minHeight: 16 }}>
        <span style={{ fontSize: 11, color: "var(--portal-text-muted)" }}>
          {cidade ? `📍 ${cidade}` : ""}
        </span>
        {msg && (
          <span style={{ fontSize: 11, fontWeight: 600, color: msg.tipo === "ok" ? "#065f46" : "#991b1b" }}>
            {msg.tipo === "ok" ? "✓ " : "⚠ "}{msg.texto}
          </span>
        )}
      </div>
    </div>
  );
}

const miniLabel: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: "var(--portal-text-secondary)",
  textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4,
};
const miniInput: React.CSSProperties = {
  width: "100%", padding: "8px 12px",
  border: "1.5px solid var(--portal-border)", borderRadius: 9,
  fontSize: 13, background: "var(--portal-bg-card)", color: "var(--portal-text)",
  fontFamily: "Inter, sans-serif", outline: "none",
};
