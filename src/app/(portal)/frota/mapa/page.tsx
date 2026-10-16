'use client';
// Frota > Mapa — cada carro ATIVO da frota na última posição conhecida, com a
// cor da situação (andando · parado ligado · desligado · sem sinal), + o trajeto
// de qualquer dia. Reusa o MapaCarros do supervisor em modo="frota": a lista e
// os marcadores vêm de /api/frota/mapa/vivo. Camadas opcionais (começam
// desligadas): LOCAIS (geocercas + propriedades de clientes) e VISITAS do dia.
import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { Map as MapIcon, Search, X } from 'lucide-react';
import { authHeaders } from '@/lib/auth/client';
import { supabase } from '@/lib/supabase';
import { resolverPlaca } from '@/lib/frota/placa';
import type { LocalPin } from '@/components/supervisor/MapaCarros';

const MapaCarros = dynamic(() => import('@/components/supervisor/MapaCarros'), { ssr: false });

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
  const [locais, setLocais] = useState<LocalPin[]>([]);
  const [visitas, setVisitas] = useState<any[]>([]);
  // busca de cliente/local: escolher → o mapa voa até lá
  const [busca, setBusca] = useState('');
  const [buscaAberta, setBuscaAberta] = useState(false);
  const [foco, setFoco] = useState<{ lat: number; lng: number; nome?: string; subtitulo?: string } | null>(null);

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

  // Visitas dos VENDEDORES com coordenada — camada opcional; o mapa mostra só
  // as do dia escolhido. Busca a janela do histórico de rotas (120 dias), não
  // a história inteira. Paginado de 1000 em 1000 (teto do PostgREST).
  useEffect(() => {
    (async () => {
      try {
        const desde = new Date(Date.now() - 120 * 86400_000).toISOString();
        const todas: any[] = [];
        for (let offset = 0; offset < 20_000; offset += 1000) {
          const { data } = await supabase
            .from('vw_visitas_detalhadas')
            .select('id, vendedor_nome, cliente_nome, tipo, data_visita, latitude, longitude')
            .not('latitude', 'is', null)
            .gte('data_visita', desde)
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
    <div className="frota-pg" style={{ padding: '28px 40px', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: 'var(--portal-text)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <MapIcon size={20} color="#1e40af" /> Mapa & rastreamento
        </h2>
        <span style={{ fontSize: 13.5, color: 'var(--portal-text)' }}>
          Onde cada carro está agora. Clique num carro para ver o trajeto e as paradas do dia.
        </span>
        <div style={{ flex: 1 }} />
        {/* Busca de cliente/local: escolher → o mapa voa até lá */}
        <div className="frota-busca-box" style={{ position: 'relative', width: 300, maxWidth: '100%' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--portal-text)' }} />
          <input
            value={busca}
            onChange={(e) => { setBusca(e.target.value); setBuscaAberta(true); }}
            onFocus={() => setBuscaAberta(true)}
            placeholder={`Buscar cliente/local no mapa… (${locais.length})`}
            style={{ width: '100%', padding: '8px 30px 8px 30px', borderRadius: 0, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-input)', color: 'var(--portal-text)', fontSize: 13 }}
          />
          {busca && (
            <button
              onClick={() => { setBusca(''); setFoco(null); setBuscaAberta(false); }}
              title="Limpar"
              style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--portal-text)', padding: 2 }}
            >
              <X size={14} />
            </button>
          )}
          {buscaAberta && resultadosBusca.length > 0 && (
            <div style={{ position: 'absolute', top: '110%', left: 0, right: 0, zIndex: 1200, background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', borderRadius: 0, overflow: 'hidden', boxShadow: '0 12px 32px rgba(0,0,0,0.25)' }}>
              {resultadosBusca.map((l, i) => (
                <button
                  key={`${l.nome}-${i}`}
                  onClick={() => irPara(l)}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', border: 'none', borderTop: i > 0 ? '1px solid var(--portal-border)' : 'none', background: 'transparent', cursor: 'pointer' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--portal-bg-secondary)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--portal-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.nome}</div>
                  <div style={{ fontSize: 12, color: 'var(--portal-text)' }}>{l.subtitulo || ''}</div>
                </button>
              ))}
            </div>
          )}
          {buscaAberta && busca.trim().length >= 2 && resultadosBusca.length === 0 && (
            <div style={{ position: 'absolute', top: '110%', left: 0, right: 0, zIndex: 1200, background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', borderRadius: 0, padding: '10px 12px', fontSize: 13, color: 'var(--portal-text)', boxShadow: '0 12px 32px rgba(0,0,0,0.25)' }}>
              Nenhum cliente/local com esse nome (só aparecem os com endereço geocodificado).
            </div>
          )}
        </div>
      </div>
      {/* O MapaCarros usa height:100% — sem um pai com ALTURA EXPLÍCITA o
          Leaflet monta num container de 0px e a tela fica em branco. */}
      <div style={{ width: '100%', height: 'calc(100vh - 230px)', minHeight: 480, borderRadius: 0, overflow: 'hidden', border: '1px solid var(--portal-border)' }}>
        <MapaCarros
          carros={[]}
          modo="frota"
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
