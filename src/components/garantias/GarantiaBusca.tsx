'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Loader2 } from 'lucide-react';
import type { GarantiaResumo, Montadora } from '@/lib/garantias/types';
import GarantiaMiniCard from './GarantiaMiniCard';

interface Props {
  onAbrir: (id: string) => void;
}

export default function GarantiaBusca({ onAbrir }: Props) {
  const [q, setQ] = useState('');
  const [montadora, setMontadora] = useState('');
  const [montadoras, setMontadoras] = useState<Montadora[]>([]);
  const [resultados, setResultados] = useState<GarantiaResumo[]>([]);
  const [loading, setLoading] = useState(false);
  const [buscou, setBuscou] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/garantias/montadoras');
        const data = await res.json();
        setMontadoras(data.montadoras || []);
      } catch {
        /* ignora */
      }
    })();
  }, []);

  const buscar = useCallback(async (termo: string, mont: string) => {
    if (!termo.trim() && !mont) {
      setResultados([]);
      setBuscou(false);
      return;
    }
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (termo.trim()) p.set('q', termo.trim());
      if (mont) p.set('montadora', mont);
      const res = await fetch(`/api/garantias/busca?${p}`);
      const data = await res.json();
      setResultados(data.garantias || []);
      setBuscou(true);
    } catch {
      setResultados([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => buscar(q, montadora), 350);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q, montadora, buscar]);

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 260px' }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--portal-text-muted)' }} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por chassi, nº da garantia, OS ou cliente..."
            style={{
              width: '100%',
              padding: '9px 10px 9px 32px',
              borderRadius: 8,
              border: '1px solid var(--portal-border)',
              background: 'var(--portal-bg-input)',
              color: 'var(--portal-text)',
              fontSize: 13,
              outline: 'none',
            }}
          />
        </div>
        <select
          value={montadora}
          onChange={(e) => setMontadora(e.target.value)}
          style={{
            flex: '0 1 220px',
            padding: '9px 10px',
            borderRadius: 8,
            border: '1px solid var(--portal-border)',
            background: 'var(--portal-bg-input)',
            color: 'var(--portal-text)',
            fontSize: 13,
            outline: 'none',
          }}
        >
          <option value="">Todas as montadoras</option>
          {montadoras.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nome}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40, color: 'var(--portal-text-muted)' }}>
          <Loader2 size={20} className="spin" />
        </div>
      ) : !buscou ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--portal-text-muted)', fontSize: 13 }}>
          Digite um termo ou escolha uma montadora para pesquisar.
        </div>
      ) : resultados.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--portal-text-muted)', fontSize: 13 }}>
          Nenhuma garantia encontrada.
        </div>
      ) : (
        <>
          <div style={{ fontSize: 12, color: 'var(--portal-text-muted)', marginBottom: 8 }}>
            {resultados.length} resultado(s)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 10 }}>
            {resultados.map((g) => (
              <GarantiaMiniCard key={g.id} garantia={g} onClick={() => onAbrir(g.id)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
