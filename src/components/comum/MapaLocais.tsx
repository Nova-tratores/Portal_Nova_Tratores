'use client';
// Mapa de onde fica o trator / o cliente: mapa (OpenStreetMap), lista dos pontos conhecidos
// (visita do vendedor, GPS do carro do técnico, CRM) e botões para o Google Maps.
// Sem ponto nenhum, oferece buscar o endereço. Usado na fila Hoje e em Tratores vendidos.
import { useState } from 'react';

export interface PontoMapa {
  nome: string;
  lat: number;
  lng: number;
  origem: 'visita' | 'gps' | 'crm' | 'cadastro';
  quando: string | null;
  quem: string | null;
}

const ORIGEM: Record<PontoMapa['origem'], string> = {
  visita: 'Vendedor viu o trator aqui', gps: 'Fazenda confirmada pelo GPS do carro', crm: 'Ponto anotado no CRM', cadastro: 'Ponto do cadastro',
};
const dataBR = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '');

const BTN: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 7, height: 36, padding: '0 13px', borderRadius: 10, border: '1px solid var(--border, #e2e8f0)',
  background: 'var(--surface, #fefefe)', color: 'var(--portal-text, #0f172a)', fontSize: 13.5, textDecoration: 'none', whiteSpace: 'nowrap',
};

export default function MapaLocais({ locais, endereco, altura = 230 }: { locais: PontoMapa[]; endereco: string | null; altura?: number }) {
  const [i, setI] = useState(0);
  const l = locais[i] || locais[0] || null;
  if (!l) {
    // Sem GPS: o mapa mostra o endereço do cadastro (busca do Google, sem chave).
    return (
      <div style={{ display: 'grid', gap: 8 }}>
        {endereco && (
          <iframe title="Mapa" loading="lazy" style={{ width: '100%', height: altura, border: '1px solid var(--border, #e2e8f0)', borderRadius: 12 }}
            src={`https://maps.google.com/maps?q=${encodeURIComponent(endereco)}&z=13&output=embed`} />
        )}
        <small style={{ fontSize: 12, color: 'var(--portal-text-secondary, #475569)', lineHeight: 1.45 }}>
          {endereco ? <>Pelo endereço do cadastro: {endereco} · ainda sem ponto de GPS confirmado</> : 'Sem ponto de GPS e o cadastro não tem endereço.'}
        </small>
        {endereco && (
          <div><a style={BTN} href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}`} target="_blank" rel="noreferrer">
            <i className="fa-solid fa-map" style={{ fontWeight: 900 }} /> Mostrar no Google Maps
          </a></div>
        )}
      </div>
    );
  }
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <iframe title="Mapa" loading="lazy" style={{ width: '100%', height: altura, border: '1px solid var(--border, #e2e8f0)', borderRadius: 12 }}
        src={`https://www.openstreetmap.org/export/embed.html?bbox=${l.lng - 0.03},${l.lat - 0.018},${l.lng + 0.03},${l.lat + 0.018}&layer=mapnik&marker=${l.lat},${l.lng}`} />
      {locais.length > 1 && (
        <div style={{ display: 'grid', gap: 5 }}>
          {locais.map((x, k) => (
            <button key={k} type="button" onClick={() => setI(k)} style={{
              textAlign: 'left', padding: '7px 10px', borderRadius: 10, font: 'inherit', cursor: 'pointer', display: 'grid',
              border: `1px solid ${k === i ? '#16a34a' : 'var(--border, #e2e8f0)'}`,
              background: k === i ? 'color-mix(in srgb, #16a34a 6%, var(--surface, #fefefe))' : 'var(--surface, #fefefe)',
            }}>
              <span style={{ fontSize: 13.5, color: 'var(--portal-text, #0f172a)' }}>{x.nome}</span>
              <small style={{ fontSize: 12, color: 'var(--portal-text-secondary, #475569)' }}>{ORIGEM[x.origem]}{x.quem ? ` · ${x.quem}` : ''}{x.quando ? ` · ${dataBR(x.quando)}` : ''}</small>
            </button>
          ))}
        </div>
      )}
      {locais.length === 1 && <small style={{ fontSize: 12, color: 'var(--portal-text-secondary, #475569)' }}>{l.nome} · {ORIGEM[l.origem]}{l.quem ? ` · ${l.quem}` : ''}{l.quando ? ` · ${dataBR(l.quando)}` : ''}</small>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <a style={BTN} href={`https://www.google.com/maps/search/?api=1&query=${l.lat},${l.lng}`} target="_blank" rel="noreferrer"><i className="fa-solid fa-map" style={{ fontWeight: 900 }} /> Mostrar no Google Maps</a>
        <a style={BTN} href={`https://www.google.com/maps/dir/?api=1&destination=${l.lat},${l.lng}`} target="_blank" rel="noreferrer"><i className="fa-solid fa-route" style={{ fontWeight: 900 }} /> Rota até lá</a>
      </div>
    </div>
  );
}
