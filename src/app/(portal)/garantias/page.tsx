'use client';
import { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, Loader2, LayoutGrid, CheckSquare, BarChart3, Search, Factory } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import SemPermissao from '@/components/SemPermissao';
import type { GarantiaResumo } from '@/lib/garantias/types';
import GarantiasBoard from '@/components/garantias/GarantiasBoard';
import GarantiaDrawer from '@/components/garantias/GarantiaDrawer';
import GarantiasHistorico from '@/components/garantias/GarantiasHistorico';
import GarantiasRelatorio from '@/components/garantias/GarantiasRelatorio';
import GarantiaBusca from '@/components/garantias/GarantiaBusca';
import MontadorasConfig from '@/components/garantias/MontadorasConfig';

type Aba = 'pipeline' | 'finalizadas' | 'relatorio' | 'buscar' | 'montadoras';

function GarantiasPageInner({ isAdmin }: { isAdmin: boolean }) {
  const { userProfile } = useAuth();
  const [garantias, setGarantias] = useState<GarantiaResumo[]>([]);
  const [loading, setLoading] = useState(true);
  const [aba, setAba] = useState<Aba>('pipeline');
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const carregar = useCallback(async () => {
    try {
      const res = await fetch('/api/garantias?finalizadas=false');
      const data = await res.json();
      setGarantias(data.garantias || []);
    } catch {
      /* mantém estado anterior */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Abre garantia direto pela URL (?id=) — vindo de notificação
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('id');
    if (id) setDrawerId(id);
  }, []);

  useEffect(() => {
    const t = setInterval(carregar, 60000);
    return () => clearInterval(t);
  }, [carregar]);
  useRefreshOnFocus(carregar);

  const stats = {
    solicitadas: garantias.filter((g) => g.status === 'aberta').length,
    analise: garantias.filter((g) => g.status === 'em_analise').length,
    fabrica: garantias.filter((g) => g.status === 'enviada').length,
    tecnico: garantias.filter((g) => g.status === 'bo_tecnico' || g.status === 'info_pendente').length,
  };

  const abas: { id: Aba; label: string; icone: React.ReactNode }[] = [
    { id: 'pipeline', label: 'Pipeline', icone: <LayoutGrid size={15} /> },
    { id: 'finalizadas', label: 'Finalizadas', icone: <CheckSquare size={15} /> },
    { id: 'relatorio', label: 'Relatório', icone: <BarChart3 size={15} /> },
    { id: 'buscar', label: 'Buscar', icone: <Search size={15} /> },
    ...(isAdmin ? [{ id: 'montadoras' as Aba, label: 'Montadoras', icone: <Factory size={15} /> }] : []),
  ];

  function fecharDrawer() {
    setDrawerId(null);
  }
  function aposSalvar() {
    setRefreshKey((k) => k + 1);
    carregar();
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1280, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 14,
            background: 'linear-gradient(135deg, #dc2626, #7f1d1d)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            boxShadow: '0 4px 12px rgba(220,38,38,0.25)',
          }}
        >
          <ShieldCheck size={24} />
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--portal-text)' }}>Garantias</h1>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--portal-text-muted)' }}>
            Controle do ciclo de garantias — da solicitação do técnico ao retorno da fábrica.
          </p>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <StatCard label="Solicitadas" valor={stats.solicitadas} cor="#0ea5e9" />
        <StatCard label="Em análise" valor={stats.analise} cor="#6366f1" />
        <StatCard label="Na fábrica" valor={stats.fabrica} cor="#8b5cf6" />
        <StatCard label="Devolvidas ao técnico" valor={stats.tecnico} cor="#f59e0b" />
      </div>

      {/* Abas */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18, borderBottom: '1px solid var(--portal-border)', paddingBottom: 10 }}>
        {abas.map((a) => (
          <button
            key={a.id}
            onClick={() => setAba(a.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              borderRadius: 9,
              border: 'none',
              background: aba === a.id ? 'linear-gradient(135deg, #dc2626, #7f1d1d)' : 'var(--portal-bg-input)',
              color: aba === a.id ? '#fff' : 'var(--portal-text-secondary)',
              boxShadow: aba === a.id ? '0 2px 8px rgba(220,38,38,0.25)' : 'none',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {a.icone}
            {a.label}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      {aba === 'pipeline' &&
        (loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60, color: 'var(--portal-text-muted)' }}>
            <Loader2 size={22} className="spin" />
          </div>
        ) : garantias.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--portal-text-muted)', fontSize: 14 }}>
            <ShieldCheck size={36} style={{ opacity: 0.35 }} />
            <p>Nenhuma garantia em andamento.</p>
          </div>
        ) : (
          <GarantiasBoard garantias={garantias} onCardClick={(g) => setDrawerId(g.id)} />
        ))}

      {aba === 'finalizadas' && <GarantiasHistorico onAbrir={setDrawerId} refreshKey={refreshKey} />}
      {aba === 'relatorio' && <GarantiasRelatorio refreshKey={refreshKey} />}
      {aba === 'buscar' && <GarantiaBusca onAbrir={setDrawerId} />}
      {aba === 'montadoras' && isAdmin && <MontadorasConfig criadoPor={userProfile?.nome || ''} />}

      {/* Drawer */}
      {drawerId && (
        <GarantiaDrawer
          garantiaId={drawerId}
          userName={userProfile?.nome || ''}
          userId={userProfile?.id || ''}
          onClose={fecharDrawer}
          onSaved={aposSalvar}
        />
      )}
    </div>
  );
}

function StatCard({ label, valor, cor }: { label: string; valor: number; cor: string }) {
  return (
    <div
      style={{
        flex: '1 1 150px',
        background: 'var(--portal-bg-card)',
        border: '1px solid var(--portal-border)',
        borderLeft: `4px solid ${cor}`,
        borderRadius: 12,
        padding: '12px 16px',
      }}
    >
      <div style={{ fontSize: 12, color: 'var(--portal-text-muted)' }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--portal-text)' }}>{valor}</div>
    </div>
  );
}

export default function GarantiasPage() {
  const { userProfile } = useAuth();
  const { temAcesso, isAdmin, loading } = usePermissoes(userProfile?.id);
  if (!loading && userProfile && !temAcesso('garantias')) return <SemPermissao />;
  return <GarantiasPageInner isAdmin={isAdmin} />;
}
