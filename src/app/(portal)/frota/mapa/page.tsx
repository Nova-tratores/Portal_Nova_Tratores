'use client';
// Frota > Mapa — posição ao vivo + trajeto de qualquer dia de TODA a frota
// rastreada. Reusa o MapaCarros do supervisor (Leaflet + OSM: ao vivo,
// polyline do dia, paradas, histórico de 90 dias) — aqui só muda a fonte:
// todos os 16 rastreados, não só os carros do comercial. Também desenha a
// camada de LOCAIS: geocercas da Rota Exata + propriedades de clientes do
// portal (as geocodificadas).
import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { Map as MapIcon, Search, X } from 'lucide-react';
import { authHeaders } from '@/lib/auth/client';
import { supabase } from '@/lib/supabase';
import { formatarPlaca, resolverPlaca } from '@/lib/frota/placa';
import type { LocalPin } from '@/components/supervisor/MapaCarros';

const MapaCarros = dynamic(() => import('@/components/supervisor/MapaCarros'), { ssr: false });

interface CarroMapa { placa: string; descricao?: string | null; pessoa_nome?: string | null }

const CLASSE_LABEL: Record<string, string> = {
  loja: 'Loja', cliente: 'Cliente (geocerca)', manutencao: 'Manutenção',
  estacionamento: 'Estacionamento', descarga: 'Descarga',
};

// cores dos tipos de visita — o mesmo padrão do supervisor de vendas
const TIPO_CORES: Record<string, { bg: string; text: string }> = {
  presencial: { bg: '#DBEAFE', text: '#1D4ED8' },
  mensagem: { bg: '#D1FAE5', text: '#059669' },
  telefonema: { bg: '#FEF3C7', text: '#D97706' },
  email: { bg: '#EDE9FE', text: '#7C3AED' },
};

// busca sem acento/caixa ("joao" acha "JOÃO")
const semAcento = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export default function FrotaMapaPage() {
  const [carros, setCarros] = useState<CarroMapa[]>([]);
  const [locais, setLocais] = useState<LocalPin[]>([]);
  const [visitas, setVisitas] = useState<any[]>([]);
  const [erro, setErro] = useState('');
  // busca de cliente/local: escolher → o mapa voa até lá
  const [busca, setBusca] = useState('');
  const [buscaAberta, setBuscaAberta] = useState(false);
  const [foco, setFoco] = useState<{ lat: number; lng: number; nome?: string; subtitulo?: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/frota/veiculos', { headers: await authHeaders() });
        const d = await r.json();
        if (!r.ok) { setErro(d.error || 'Falha ao carregar.'); return; }
        setCarros(
          (d.veiculos || [])
            .filter((v: any) => v.tem_rastreador && v.tipo_registro === 'veiculo')
            .map((v: any) => ({
              placa: v.placa,
              descricao: [v.marca, v.modelo || v.descricao].filter(Boolean).join(' ') || formatarPlaca(v.placa),
              pessoa_nome: v.responsavel_nome,
            })),
        );
      } catch (e) { setErro(String(e)); }
    })();
  }, []);

  // Camada de locais: geocercas + propriedades de clientes (falha em silêncio —
  // o mapa funciona sem ela)
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/frota/locais', { headers: await authHeaders() });
        if (!r.ok) return;
        const d = await r.json();
        setLocais([
          ...(d.geocercas || []).map((g: any) => ({
            nome: g.nome,
            lat: g.latitude,
            lng: g.longitude,
            classe: g.classe || 'outro',
            subtitulo: CLASSE_LABEL[g.classe] || 'Geocerca',
          })),
          ...(d.propriedades || []).map((p: any) => ({
            nome: p.nome,
            lat: p.latitude,
            lng: p.longitude,
            classe: 'propriedade',
            subtitulo: `Propriedade de cliente${p.cidade ? ` · ${p.cidade}` : ''}`,
          })),
        ]);
      } catch { /* camada opcional */ }
    })();
  }, []);

  // Visitas dos VENDEDORES (TODAS, com coordenada) — o cadastro do comercial
  // (vw_visitas_detalhadas) vira pins no mapa, com toggle próprio. Paginado
  // de 1000 em 1000 (teto do PostgREST) pra não truncar quando crescer.
  useEffect(() => {
    (async () => {
      try {
        const todas: any[] = [];
        for (let offset = 0; offset < 20_000; offset += 1000) {
          const { data } = await supabase
            .from('vw_visitas_detalhadas')
            .select('id, vendedor_nome, cliente_nome, tipo, data_visita, latitude, longitude')
            .not('latitude', 'is', null)
            .order('data_visita', { ascending: false })
            .range(offset, offset + 999);
          todas.push(...(data || []));
          if (!data || data.length < 1000) break;
        }
        setVisitas(todas.filter((v) => Number(v.latitude) && Number(v.longitude)));
      } catch { /* camada opcional */ }
    })();
  }, []);

  // Quem estava com o carro no dia — vw_frota_uso_diario (check-in dos
  // vendedores + check-in diário do app dos MECÂNICOS). Aparece na timeline.
  const resolverMotorista = useCallback(async (placa: string, data: string) => {
    const { data: rows } = await supabase
      .from('vw_frota_uso_diario')
      .select('pessoa_nome, created_at')
      .eq('placa', resolverPlaca(placa))
      .eq('data', data)
      .order('created_at', { ascending: false })
      .limit(1);
    return rows?.[0]?.pessoa_nome || null;
  }, []);

  // resultados da busca: clientes (propriedades) primeiro, depois geocercas
  const resultadosBusca = useMemo(() => {
    const q = semAcento(busca.trim());
    if (q.length < 2) return [];
    return locais
      .filter((l) => l.lat && l.lng && semAcento(l.nome || '').includes(q))
      .sort((a, b) => {
        const pa = a.classe === 'propriedade' ? 0 : 1;
        const pb = b.classe === 'propriedade' ? 0 : 1;
        if (pa !== pb) return pa - pb;
        return (a.nome || '').localeCompare(b.nome || '', 'pt-BR');
      })
      .slice(0, 8);
  }, [locais, busca]);

  const irPara = (l: LocalPin) => {
    setFoco({ lat: l.lat, lng: l.lng, nome: l.nome || undefined, subtitulo: l.subtitulo || undefined });
    setBusca(l.nome || '');
    setBuscaAberta(false);
  };

  return (
    <div style={{ padding: '28px 40px', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: 'var(--portal-text)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <MapIcon size={20} color="#0d9488" /> Mapa & rastreamento
        </h2>
        <span style={{ fontSize: 12.5, color: 'var(--portal-text-muted)' }}>
          {carros.length} veículos rastreados · escolha um carro e uma data pra ver o trajeto e as paradas
        </span>
        <div style={{ flex: 1 }} />
        {/* Busca de cliente/local: escolher → o mapa voa até lá */}
        <div style={{ position: 'relative', width: 300 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--portal-text-muted)' }} />
          <input
            value={busca}
            onChange={(e) => { setBusca(e.target.value); setBuscaAberta(true); }}
            onFocus={() => setBuscaAberta(true)}
            placeholder={`Buscar cliente/local no mapa… (${locais.length})`}
            style={{ width: '100%', padding: '8px 30px 8px 30px', borderRadius: 8, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-input)', color: 'var(--portal-text)', fontSize: 13 }}
          />
          {busca && (
            <button
              onClick={() => { setBusca(''); setFoco(null); setBuscaAberta(false); }}
              title="Limpar"
              style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--portal-text-muted)', padding: 2 }}
            >
              <X size={14} />
            </button>
          )}
          {buscaAberta && resultadosBusca.length > 0 && (
            <div style={{ position: 'absolute', top: '110%', left: 0, right: 0, zIndex: 1200, background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', borderRadius: 10, overflow: 'hidden', boxShadow: '0 12px 32px rgba(0,0,0,0.25)' }}>
              {resultadosBusca.map((l, i) => (
                <button
                  key={`${l.nome}-${i}`}
                  onClick={() => irPara(l)}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', border: 'none', borderTop: i > 0 ? '1px solid var(--portal-border)' : 'none', background: 'transparent', cursor: 'pointer' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--portal-bg-secondary)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--portal-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.nome}</div>
                  <div style={{ fontSize: 11, color: 'var(--portal-text-muted)' }}>{l.subtitulo || ''}</div>
                </button>
              ))}
            </div>
          )}
          {buscaAberta && busca.trim().length >= 2 && resultadosBusca.length === 0 && (
            <div style={{ position: 'absolute', top: '110%', left: 0, right: 0, zIndex: 1200, background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', borderRadius: 10, padding: '10px 12px', fontSize: 12, color: 'var(--portal-text-muted)', boxShadow: '0 12px 32px rgba(0,0,0,0.25)' }}>
              Nenhum cliente/local com esse nome (só aparecem os com endereço geocodificado).
            </div>
          )}
        </div>
      </div>
      {erro && <div style={{ color: '#b91c1c', fontSize: 13, marginBottom: 10 }}>{erro}</div>}
      {/* O MapaCarros usa height:100% — sem um pai com ALTURA EXPLÍCITA o
          Leaflet monta num container de 0px e a tela fica em branco. */}
      <div style={{ width: '100%', height: 'calc(100vh - 230px)', minHeight: 480, borderRadius: 14, overflow: 'hidden', border: '1px solid var(--portal-border)' }}>
        <MapaCarros
          carros={carros as any}
          fontePosicoes="frota"
          tituloPainel="FROTA RASTREADA"
          locais={locais}
          visitas={visitas}
          tipoCores={TIPO_CORES}
          fmtVisita={(iso) => { try { return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return iso || ''; } }}
          resolverMotorista={resolverMotorista}
          foco={foco}
        />
      </div>
    </div>
  );
}
