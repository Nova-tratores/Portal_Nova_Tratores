'use client';
// Frota > Mapa — posição ao vivo + trajeto de qualquer dia de TODA a frota
// rastreada. Reusa o MapaCarros do supervisor (Leaflet + OSM: ao vivo,
// polyline do dia, paradas, histórico de 90 dias) — aqui só muda a fonte:
// todos os 16 rastreados, não só os carros do comercial. Também desenha a
// camada de LOCAIS: geocercas da Rota Exata + propriedades de clientes do
// portal (as geocodificadas).
import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Map as MapIcon } from 'lucide-react';
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

export default function FrotaMapaPage() {
  const [carros, setCarros] = useState<CarroMapa[]>([]);
  const [locais, setLocais] = useState<LocalPin[]>([]);
  const [visitas, setVisitas] = useState<any[]>([]);
  const [erro, setErro] = useState('');

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

  // Visitas dos VENDEDORES (últimos 7 dias, com coordenada) — o cadastro do
  // comercial (vw_visitas_detalhadas) vira pins no mapa, com toggle próprio.
  useEffect(() => {
    (async () => {
      try {
        const de = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
        const { data } = await supabase
          .from('vw_visitas_detalhadas')
          .select('id, vendedor_nome, cliente_nome, tipo, data_visita, latitude, longitude')
          .gte('data_visita', de)
          .not('latitude', 'is', null)
          .order('data_visita', { ascending: false })
          .limit(500);
        setVisitas((data || []).filter((v) => Number(v.latitude) && Number(v.longitude)));
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

  return (
    <div style={{ padding: '28px 40px', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: 'var(--portal-text)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <MapIcon size={20} color="#0d9488" /> Mapa & rastreamento
        </h2>
        <span style={{ fontSize: 12.5, color: 'var(--portal-text-muted)' }}>
          {carros.length} veículos rastreados · escolha um carro e uma data pra ver o trajeto e as paradas
        </span>
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
        />
      </div>
    </div>
  );
}
