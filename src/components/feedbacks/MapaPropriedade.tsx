"use client";
/* eslint-disable @typescript-eslint/no-explicit-any -- Leaflet via CDN (window.L), sem tipos */
import { useEffect, useRef, useState } from "react";
import { CENTRO_PADRAO, carregarLeaflet, pinIcon, round6 } from "./leaflet";

interface Props {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number) => void;   // clique/arraste no mapa
  cor: string;
  height?: number;
}

// Mapa CONTROLADO: não busca nem salva nada — só mostra/edita a posição que o
// pai passa (lat/lng) e reporta mudanças por clique/arraste via onChange.
export default function MapaPropriedade({ lat, lng, onChange, cor, height = 200 }: Props) {
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const centradoRef = useRef(false);
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; });
  const [ready, setReady] = useState(false);

  useEffect(() => { carregarLeaflet(() => setReady(true)); }, []);

  // Inicializa o mapa.
  useEffect(() => {
    if (!ready || !mapDivRef.current || mapInstance.current) return;
    const L = (window as any).L;
    const inicial: [number, number] = lat != null && lng != null ? [lat, lng] : CENTRO_PADRAO;
    const map = L.map(mapDivRef.current, { attributionControl: false }).setView(inicial, lat != null ? 14 : 9);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);
    map.on("click", (e: any) => onChangeRef.current(round6(e.latlng.lat), round6(e.latlng.lng)));
    mapInstance.current = map;
    setTimeout(() => mapInstance.current?.invalidateSize(), 150);
  }, [ready, lat, lng]);

  // Sincroniza o marcador com a posição controlada.
  useEffect(() => {
    if (!ready || !mapInstance.current) return;
    const L = (window as any).L;
    if (lat == null || lng == null) {
      if (markerRef.current) { markerRef.current.remove(); markerRef.current = null; }
      return;
    }
    if (!markerRef.current) {
      const m = L.marker([lat, lng], { draggable: true, icon: pinIcon(L, cor) }).addTo(mapInstance.current);
      m.on("dragend", () => { const ll = m.getLatLng(); onChangeRef.current(round6(ll.lat), round6(ll.lng)); });
      markerRef.current = m;
    } else {
      markerRef.current.setLatLng([lat, lng]);
    }
    if (!centradoRef.current) { mapInstance.current.setView([lat, lng], 14); centradoRef.current = true; }
  }, [lat, lng, ready, cor]);

  // Limpa ao desmontar.
  useEffect(() => () => {
    if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; }
    markerRef.current = null;
  }, []);

  return (
    <div style={{ position: "relative", width: "100%", height, borderRadius: 12, overflow: "hidden", border: "1.5px solid var(--portal-border)" }}>
      <div ref={mapDivRef} style={{ width: "100%", height: "100%" }} />
      {!ready && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.7)", fontSize: 12, color: "var(--portal-text-secondary)", fontWeight: 600 }}>
          Carregando mapa…
        </div>
      )}
    </div>
  );
}
