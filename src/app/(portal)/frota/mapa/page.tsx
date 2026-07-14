'use client';
// Frota > Mapa — posição ao vivo + trajeto de qualquer dia de TODA a frota
// rastreada. Reusa o MapaCarros do supervisor (Leaflet + OSM: ao vivo,
// polyline do dia, paradas, histórico de 90 dias) — aqui só muda a fonte:
// todos os 16 rastreados, não só os carros do comercial.
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Map as MapIcon } from 'lucide-react';
import { authHeaders } from '@/lib/auth/client';
import { formatarPlaca } from '@/lib/frota/placa';

const MapaCarros = dynamic(() => import('@/components/supervisor/MapaCarros'), { ssr: false });

interface CarroMapa { placa: string; descricao?: string | null; pessoa_nome?: string | null }

export default function FrotaMapaPage() {
  const [carros, setCarros] = useState<CarroMapa[]>([]);
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
        <MapaCarros carros={carros as any} fontePosicoes="frota" />
      </div>
    </div>
  );
}
