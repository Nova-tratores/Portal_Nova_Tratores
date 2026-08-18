'use client';
// Modal de TRAJETOS & PARADAS do veículo (aberto pela Ficha — sem redirecionar):
// mini-mapa Leaflet com seleção de VÁRIOS dias — cada dia numa cor, com as
// paradas classificadas (onde/quando/quanto tempo) e o resumo somado dos dias
// escolhidos (km, litros, R$ de combustível, tempo ligado, atípicas).
import { useEffect, useMemo, useRef, useState } from 'react';
import { Route, X, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatarPlaca } from '@/lib/frota/placa';
import { filtrarEspetos, segmentarTrajeto } from '@/lib/frota/gps';

interface Props {
  placa: string;
  onClose: () => void;
}

interface DiaResumo {
  data: string;
  km_total: number;
  km_odometro: number | null;
  partidas: number;
  tempo_ligado_min: number;
  paradas_total: number;
  paradas_atipicas: number;
  litros: number;
  gasto_combustivel: number;
}

interface ParadaDia {
  inicio: string;
  fim: string | null;
  duracao_min: number;
  latitude: number;
  longitude: number;
  classe: string;
  destino_nome: string | null;
  atipica: boolean;
}

interface RotaDiaCache {
  pontos: { lat: number; lng: number; dt: string }[];
  paradas: ParadaDia[];
}

// uma cor por dia/grupo selecionado (repete depois de 8)
const CORES = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

type Visao = 'dia' | 'semana' | 'mes';

const MESES_NOME = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

// segunda-feira da semana do dia (chave do agrupamento semanal)
function segundaDe(dia: string): string {
  const d = new Date(`${dia}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

function rotuloSemana(segunda: string): string {
  const ini = new Date(`${segunda}T00:00:00Z`);
  const fim = new Date(ini);
  fim.setUTCDate(fim.getUTCDate() + 6);
  const dd = (x: Date) => String(x.getUTCDate()).padStart(2, '0');
  const mm = (x: Date) => String(x.getUTCMonth() + 1).padStart(2, '0');
  return `${dd(ini)}/${mm(ini)} – ${dd(fim)}/${mm(fim)}/${String(fim.getUTCFullYear()).slice(2)}`;
}

const CLASSE_LABEL: Record<string, string> = {
  loja: 'Loja', cliente: 'Cliente', cliente_portal: 'Propriedade de cliente', manutencao: 'Manutenção',
  estacionamento: 'Estacionamento', descarga: 'Descarga', outro_destino: 'Destino cadastrado',
  visita: 'Visita comercial', abastecimento: 'Abastecimento', fora_geocerca: 'Fora de geocerca',
};

const fmtRS = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const fmtData = (d: string) => { const [y, m, dia] = d.split('-'); return `${dia}/${m}/${y.slice(2)}`; };
const fmtHora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const fmtMin = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}` : `${min}min`);

export default function TrajetosModal({ placa, onClose }: Props) {
  const [dias, setDias] = useState<DiaResumo[]>([]);
  const [sel, setSel] = useState<string[]>([]);
  const [visao, setVisao] = useState<Visao>('dia');
  const [rotas, setRotas] = useState<Record<string, RotaDiaCache>>({});
  const [carregandoDias, setCarregandoDias] = useState(true);
  const [buscando, setBuscando] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapa = useRef<any>(null);
  const camada = useRef<any>(null);
  const [leafletOk, setLeafletOk] = useState(false);

  // dias com movimento (últimos 60 fechados) — a lista lateral
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('frota_dias')
        .select('data, km_total, km_odometro, partidas, tempo_ligado_min, paradas_total, paradas_atipicas, litros, gasto_combustivel')
        .eq('placa', placa)
        .gt('posicoes_total', 0)
        .order('data', { ascending: false })
        .limit(120);
      const lista = (data || []) as DiaResumo[];
      setDias(lista);
      if (lista.length > 0) setSel([lista[0].data]); // o dia mais recente já vem marcado
      setCarregandoDias(false);
    })();
  }, [placa]);

  // Leaflet via CDN (mesmo padrão do MapaCarros)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if ((window as any).L) { setLeafletOk(true); return; }
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => setLeafletOk(true);
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!leafletOk || !mapRef.current || mapa.current) return;
    const L = (window as any).L;
    mapa.current = L.map(mapRef.current).setView([-23.2, -49.37], 10);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' }).addTo(mapa.current);
    camada.current = L.layerGroup().addTo(mapa.current);
  }, [leafletOk]);

  // busca a rota (pontos) + paradas classificadas de cada dia selecionado
  useEffect(() => {
    (async () => {
      const faltam = sel.filter((d) => !rotas[d]);
      if (faltam.length === 0) return;
      setBuscando(true);
      for (const dia of faltam) {
        try {
          const [rotaRes, paradasRes] = await Promise.all([
            fetch(`/api/supervisor-vendas/veiculos?acao=rota&placa=${encodeURIComponent(placa)}&data=${dia}`).then((r) => (r.ok ? r.json() : null)),
            supabase
              .from('frota_paradas')
              .select('inicio, fim, duracao_min, latitude, longitude, classe, destino_nome, atipica')
              .eq('placa', placa)
              .eq('data', dia)
              .order('inicio'),
          ]);
          const pontos = filtrarEspetos(((rotaRes?.pontos || []) as RotaDiaCache['pontos']));
          // paradas classificadas do fechamento; se o dia ainda não fechou
          // (hoje), usa as cruas da própria rota
          const paradas: ParadaDia[] = (paradasRes.data && paradasRes.data.length > 0)
            ? (paradasRes.data as ParadaDia[])
            : ((rotaRes?.paradas || []) as any[]).map((p) => ({
                inicio: p.inicio, fim: p.fim, duracao_min: p.duracao_min,
                latitude: p.lat, longitude: p.lng, classe: '', destino_nome: null, atipica: false,
              }));
          setRotas((prev) => ({ ...prev, [dia]: { pontos, paradas } }));
        } catch { /* dia fica sem desenho */ }
      }
      setBuscando(false);
    })();
  }, [sel, placa, rotas]);

  // Grupos conforme a visão (dia = 1 grupo por dia; semana/mês = agregados).
  // Marcar um grupo = marcar TODOS os dias dele (a semana/mês inteiro desenha).
  const grupos = useMemo(() => {
    const porChave = new Map<string, { rotulo: string; dias: DiaResumo[] }>();
    for (const d of dias) {
      let chave: string, rotulo: string;
      if (visao === 'dia') { chave = d.data; rotulo = fmtData(d.data); }
      else if (visao === 'semana') { chave = segundaDe(d.data); rotulo = rotuloSemana(chave); }
      else { chave = d.data.slice(0, 7); rotulo = `${MESES_NOME[Number(d.data.slice(5, 7)) - 1]}/${d.data.slice(0, 4)}`; }
      const g = porChave.get(chave) || { rotulo, dias: [] };
      g.dias.push(d);
      porChave.set(chave, g);
    }
    return [...porChave.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([chave, g]) => ({
        chave,
        rotulo: g.rotulo,
        dias: g.dias,
        km: g.dias.reduce((s, d) => s + Number(d.km_odometro ?? d.km_total ?? 0), 0),
        paradas: g.dias.reduce((s, d) => s + (d.paradas_total || 0), 0),
        atipicas: g.dias.reduce((s, d) => s + (d.paradas_atipicas || 0), 0),
        gasto: g.dias.reduce((s, d) => s + Number(d.gasto_combustivel || 0), 0),
        litros: g.dias.reduce((s, d) => s + Number(d.litros || 0), 0),
      }));
  }, [dias, visao]);

  // cor por DIA: dias do mesmo grupo selecionado dividem a cor do grupo
  const corPorDia = useMemo(() => {
    const mapa: Record<string, string> = {};
    const selecionados = grupos.filter((g) => g.dias.some((d) => sel.includes(d.data)));
    selecionados.forEach((g, i) => {
      for (const d of g.dias) if (sel.includes(d.data)) mapa[d.data] = CORES[i % CORES.length];
    });
    return mapa;
  }, [grupos, sel]);

  const alternarGrupo = (g: { dias: DiaResumo[] }) => {
    const datas = g.dias.map((d) => d.data);
    const todosMarcados = datas.every((d) => sel.includes(d));
    setSel((prev) => (todosMarcados ? prev.filter((d) => !datas.includes(d)) : [...new Set([...prev, ...datas])]));
  };

  // desenha os dias selecionados
  useEffect(() => {
    if (!mapa.current || !camada.current) return;
    const L = (window as any).L;
    camada.current.clearLayers();
    const bounds: [number, number][] = [];
    sel.forEach((dia) => {
      const rota = rotas[dia];
      if (!rota) return;
      const cor = corPorDia[dia] || CORES[0];
      const { segmentos, buracos } = segmentarTrajeto(rota.pontos as any[]);
      for (const s of segmentos) {
        if (s.length >= 2) L.polyline(s.map((p) => [p.lat, p.lng]), { color: cor, weight: 4, opacity: 0.8 }).addTo(camada.current);
      }
      for (const b of buracos) {
        L.polyline([[b.de.lat, b.de.lng], [b.ate.lat, b.ate.lng]], { color: '#94a3b8', weight: 2, opacity: 0.5, dashArray: '6 8' })
          .bindTooltip(b.tooltip).addTo(camada.current);
      }
      for (const p of rota.pontos) bounds.push([p.lat, p.lng]);
      for (const pa of rota.paradas) {
        if (!pa.latitude || !pa.longitude) continue;
        const corP = pa.atipica ? '#dc2626' : cor;
        L.circleMarker([pa.latitude, pa.longitude], { radius: 6, weight: 2, color: '#fff', fillColor: corP, fillOpacity: 1 })
          .bindPopup(
            `<div style="font-size:12.5px"><b>${fmtData(dia)} · parada ${fmtMin(pa.duracao_min)}</b><br>` +
            `${fmtHora(pa.inicio)} → ${pa.fim ? fmtHora(pa.fim) : 'em aberto'}<br>` +
            `${pa.destino_nome ? `<b>${pa.destino_nome}</b>` : (CLASSE_LABEL[pa.classe] || 'Local sem cadastro')}` +
            `${pa.atipica ? ' · <span style="color:#dc2626;font-weight:700">ATÍPICA</span>' : ''}</div>`,
          )
          .addTo(camada.current);
        bounds.push([pa.latitude, pa.longitude]);
      }
    });
    if (bounds.length > 1) mapa.current.fitBounds(bounds, { padding: [40, 40] });
  }, [sel, rotas, leafletOk, corPorDia]);

  const resumo = useMemo(() => {
    const escolhidos = dias.filter((d) => sel.includes(d.data));
    return {
      km: escolhidos.reduce((s, d) => s + Number(d.km_odometro ?? d.km_total ?? 0), 0),
      paradas: escolhidos.reduce((s, d) => s + (d.paradas_total || 0), 0),
      atipicas: escolhidos.reduce((s, d) => s + (d.paradas_atipicas || 0), 0),
      litros: escolhidos.reduce((s, d) => s + Number(d.litros || 0), 0),
      gasto: escolhidos.reduce((s, d) => s + Number(d.gasto_combustivel || 0), 0),
      ligado: escolhidos.reduce((s, d) => s + (d.tempo_ligado_min || 0), 0),
    };
  }, [dias, sel]);


  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 950, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(1000px, 96vw)', height: 'min(640px, 88vh)', background: 'var(--portal-bg)', borderRadius: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 70px rgba(0,0,0,0.4)' }}>
        {/* Header + resumo dos dias escolhidos */}
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--portal-border)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Route size={17} color="#1e40af" />
          <strong style={{ fontSize: 15, fontWeight: 800, color: 'var(--portal-text)' }}>Trajetos & paradas · {formatarPlaca(placa)}</strong>
          {sel.length > 0 && (
            <span style={{ fontSize: 13, color: 'var(--portal-text)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <span><strong style={{ color: '#2563eb' }}>{Math.round(resumo.km).toLocaleString('pt-BR')} km</strong> em {sel.length} dia{sel.length > 1 ? 's' : ''}</span>
              <span>{resumo.paradas} paradas{resumo.atipicas > 0 && <strong style={{ color: '#b91c1c' }}> ({resumo.atipicas} atípicas)</strong>}</span>
              <span>{fmtMin(resumo.ligado)} ligado</span>
              {resumo.litros > 0 && <span>{resumo.litros.toFixed(1)} L · <strong style={{ color: '#1e40af' }}>{fmtRS(resumo.gasto)}</strong></span>}
            </span>
          )}
          {buscando && <Loader2 size={14} className="spin" color="var(--portal-text-muted)" />}
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', border: '1px solid var(--portal-border)', borderRadius: 0, overflow: 'hidden' }}>
            {(['dia', 'semana', 'mes'] as Visao[]).map((v) => (
              <button key={v} onClick={() => setVisao(v)} style={{ padding: '5px 12px', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', background: visao === v ? '#1e40af' : 'var(--portal-bg-input)', color: visao === v ? '#fff' : 'var(--portal-text-secondary)' }}>
                {v === 'dia' ? 'Dia' : v === 'semana' ? 'Semana' : 'Mês'}
              </button>
            ))}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--portal-text)' }}><X size={18} /></button>
        </div>

        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          {/* Lista de dias (multi-seleção) */}
          <div style={{ width: 250, borderRight: '1px solid var(--portal-border)', overflowY: 'auto', flexShrink: 0 }}>
            {carregandoDias && <div style={{ padding: 14, fontSize: 13, color: 'var(--portal-text)' }}>Carregando dias…</div>}
            {!carregandoDias && dias.length === 0 && (
              <div style={{ padding: 14, fontSize: 13, color: 'var(--portal-text)' }}>
                Nenhum dia consolidado ainda — o fechamento roda de madrugada (e este veículo precisa de rastreador).
              </div>
            )}
            {grupos.map((g) => {
              const marcado = g.dias.every((d) => sel.includes(d.data));
              const parcial = !marcado && g.dias.some((d) => sel.includes(d.data));
              const cor = marcado || parcial ? corPorDia[g.dias.find((d) => sel.includes(d.data))?.data || ''] : null;
              return (
                <label key={g.chave} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderBottom: '1px solid var(--portal-border)', cursor: 'pointer', background: marcado || parcial ? 'var(--portal-bg-secondary)' : 'transparent' }}>
                  <input type="checkbox" checked={marcado} ref={(el) => { if (el) el.indeterminate = parcial; }} onChange={() => alternarGrupo(g)} style={{ accentColor: cor || '#1e40af' }} />
                  {cor && <span style={{ width: 9, height: 9, borderRadius: '50%', background: cor, flexShrink: 0 }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--portal-text)', textTransform: visao === 'mes' ? 'capitalize' : 'none' }}>
                      {g.rotulo}
                      {visao !== 'dia' && <span style={{ fontWeight: 500, color: 'var(--portal-text)' }}> · {g.dias.length} dia{g.dias.length > 1 ? 's' : ''}</span>}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--portal-text)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <span>{Math.round(g.km).toLocaleString('pt-BR')} km</span>
                      <span>{g.paradas} par.</span>
                      {g.atipicas > 0 && <span style={{ color: '#b91c1c', fontWeight: 700 }}>{g.atipicas} atíp.</span>}
                      {g.gasto > 0 && <span style={{ color: '#1e40af' }}>{fmtRS(g.gasto)}</span>}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>

          {/* Mapa */}
          <div style={{ flex: 1, position: 'relative' }}>
            <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
            {sel.length === 0 && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.75)', zIndex: 500, fontSize: 13, color: '#475569', fontWeight: 600 }}>
                Marque um ou mais dias na lista pra desenhar os trajetos
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
