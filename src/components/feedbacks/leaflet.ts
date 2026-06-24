/* eslint-disable @typescript-eslint/no-explicit-any -- Leaflet vem via CDN (window.L), sem tipos */
// Helpers de Leaflet compartilhados pelos mapas do módulo de feedbacks.
// O Leaflet é carregado via CDN uma única vez (mesmo padrão do mapa de visitas).

export const CENTRO_PADRAO: [number, number] = [-23.2, -49.37];

export function carregarLeaflet(cb: () => void) {
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

export function pinIcon(L: any, cor: string) {
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

export const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
