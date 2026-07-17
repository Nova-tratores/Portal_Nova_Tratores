'use client';
// Frota > Manutenções — histórico unificado das 3 fontes:
// Rota Exata (espelho) ∪ registros manuais ∪ Requisições "Veicular Manutenção".
// Agrupado POR VEÍCULO: cada linha é um carro (nº de manutenções, última, total);
// clicar abre o modal com o histórico completo dele. Vendidos/arquivados ficam
// de fora por padrão (checkbox pra mostrar), como no resto do módulo.
import { useEffect, useMemo, useState } from 'react';
import { Wrench, Search, ExternalLink } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatarPlaca } from '@/lib/frota/placa';
import type { ManutencaoView } from '@/lib/frota/tipos';

const fmtRS = (v: number | null) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const fmtData = (s: string | null) => (s ? new Date(`${String(s).slice(0, 10)}T00:00:00`).toLocaleDateString('pt-BR') : '—');

const ORIGEM: Record<string, { label: string; cor: string; bg: string }> = {
  rotaexata: { label: 'Rota Exata', cor: '#0f766e', bg: '#ccfbf1' },
  manual: { label: 'Portal', cor: '#1d4ed8', bg: '#dbeafe' },
  requisicao: { label: 'Requisição', cor: '#b45309', bg: '#fef3c7' },
};

type InfoVeiculo = { id: string; placa: string; modelo: string | null; descricao: string | null; ativo: boolean; status: string | null };

type GrupoVeiculo = {
  placa: string;
  modelo: string | null;
  ativo: boolean;
  status: string | null;
  itens: ManutencaoView[];
  total: number;
  ultima: string | null; // data mais recente
  origens: Record<string, number>;
};

export default function FrotaManutencoesPage() {
  const [linhas, setLinhas] = useState<ManutencaoView[]>([]);
  const [veiculos, setVeiculos] = useState<InfoVeiculo[]>([]);
  const [busca, setBusca] = useState('');
  const [mostrarInativos, setMostrarInativos] = useState(false);
  const [modalPlaca, setModalPlaca] = useState<string | null>(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    (async () => {
      const [manut, veic] = await Promise.all([
        supabase
          .from('vw_frota_manutencoes')
          .select('*')
          .order('data', { ascending: false, nullsFirst: false })
          .limit(2000),
        supabase.from('frota_veiculos').select('id, placa, modelo, descricao, ativo, status'),
      ]);
      if (manut.error) { setErro(manut.error.message); return; }
      setLinhas((manut.data || []) as ManutencaoView[]);
      setVeiculos((veic.data || []) as InfoVeiculo[]);
    })();
  }, []);

  // agrupa por placa; modelo/status vêm do cadastro (por veiculo_id, senão por placa)
  const grupos = useMemo(() => {
    const porId = new Map(veiculos.map((v) => [v.id, v]));
    const porPlaca = new Map(veiculos.map((v) => [v.placa, v]));
    const mapa = new Map<string, GrupoVeiculo>();
    for (const m of linhas) {
      const cad = (m.veiculo_id && porId.get(m.veiculo_id)) || porPlaca.get(m.placa) || null;
      let g = mapa.get(m.placa);
      if (!g) {
        g = {
          placa: m.placa,
          modelo: cad ? cad.modelo || cad.descricao : null,
          ativo: cad ? cad.ativo !== false : true, // sem cadastro = mostra (pendência é da Visão geral)
          status: cad?.status ?? null,
          itens: [], total: 0, ultima: null, origens: {},
        };
        mapa.set(m.placa, g);
      }
      g.itens.push(m);
      g.total += Number(m.valor_total) || 0;
      if (m.data && (!g.ultima || m.data > g.ultima)) g.ultima = m.data;
      g.origens[m.origem] = (g.origens[m.origem] || 0) + 1;
    }
    // quem mais gasta em manutenção no topo; empate: mais registros
    return [...mapa.values()].sort((a, b) => b.total - a.total || b.itens.length - a.itens.length);
  }, [linhas, veiculos]);

  const foraDaFrota = useMemo(() => grupos.filter((g) => !g.ativo), [grupos]);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return grupos.filter((g) => {
      if (!mostrarInativos && !g.ativo) return false;
      if (!q) return true;
      return (
        g.placa.toLowerCase().includes(q) ||
        formatarPlaca(g.placa).toLowerCase().includes(q) ||
        (g.modelo || '').toLowerCase().includes(q) ||
        g.itens.some((m) => (m.descricao || '').toLowerCase().includes(q) || (m.fornecedor || '').toLowerCase().includes(q))
      );
    });
  }, [grupos, busca, mostrarInativos]);

  const totalGeral = visiveis.reduce((s, g) => s + g.total, 0);
  const registros = visiveis.reduce((s, g) => s + g.itens.length, 0);
  const grupoModal = modalPlaca ? grupos.find((g) => g.placa === modalPlaca) : null;

  return (
    <div style={{ padding: '28px 40px', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: 'var(--portal-text)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Wrench size={20} color="#0d9488" /> Manutenções
        </h2>
        <span style={{ fontSize: 12.5, color: 'var(--portal-text-muted)' }}>
          {visiveis.length} veículos · {registros} registros · total {fmtRS(totalGeral)}
        </span>
        <div style={{ flex: 1 }} />
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--portal-text-muted)' }} />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Placa, descrição, fornecedor…"
            style={{ padding: '8px 12px 8px 30px', borderRadius: 8, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-input)', color: 'var(--portal-text)', fontSize: 13, width: 260 }}
          />
        </div>
      </div>

      <p style={{ fontSize: 12, color: 'var(--portal-text-muted)', margin: '0 0 10px' }}>
        Clique no veículo pra ver o histórico completo dele.
      </p>

      {foraDaFrota.length > 0 && (
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--portal-text-secondary)', cursor: 'pointer', marginBottom: 10 }}>
          <input type="checkbox" checked={mostrarInativos} onChange={() => setMostrarInativos((v) => !v)} />
          mostrar vendidos/arquivados ({foraDaFrota.length})
        </label>
      )}

      {erro && <div style={{ color: '#b91c1c', fontSize: 13, marginBottom: 12 }}>{erro}</div>}

      <div style={{ background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 120px 110px 190px 120px', gap: 0, padding: '10px 16px', background: 'var(--portal-bg-secondary)', fontSize: 11, fontWeight: 700, color: 'var(--portal-text-muted)', textTransform: 'uppercase', letterSpacing: 0.6 }}>
          <span>Placa</span><span>Veículo</span><span style={{ textAlign: 'right' }}>Manutenções</span><span style={{ textAlign: 'right' }}>Última</span><span style={{ textAlign: 'center' }}>Origens</span><span style={{ textAlign: 'right' }}>Total</span>
        </div>
        {visiveis.map((g) => (
          <div
            key={g.placa}
            onClick={() => setModalPlaca(g.placa)}
            title="Clique pra ver o histórico completo deste veículo"
            style={{ display: 'grid', gridTemplateColumns: '110px 1fr 120px 110px 190px 120px', padding: '10px 16px', borderTop: '1px solid var(--portal-border)', fontSize: 12.5, color: 'var(--portal-text-secondary)', alignItems: 'center', cursor: 'pointer', opacity: g.ativo ? 1 : 0.6 }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--portal-bg-secondary)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <strong style={{ color: 'var(--portal-text)' }}>{formatarPlaca(g.placa)}</strong>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {g.modelo || '—'}
              <BadgeStatus status={g.status} />
            </span>
            <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{g.itens.length}</span>
            <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtData(g.ultima)}</span>
            <span style={{ display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap' }}>
              {Object.entries(g.origens).map(([k, n]) => {
                const o = ORIGEM[k] || ORIGEM.manual;
                return (
                  <span key={k} style={{ fontSize: 10, fontWeight: 700, color: o.cor, background: o.bg, borderRadius: 999, padding: '2px 7px', whiteSpace: 'nowrap' }}>
                    {n}× {o.label}
                  </span>
                );
              })}
            </span>
            <strong style={{ color: 'var(--portal-text)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtRS(g.total)}</strong>
          </div>
        ))}
        {visiveis.length === 0 && !erro && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--portal-text-muted)', fontSize: 13 }}>Nenhuma manutenção encontrada.</div>
        )}
      </div>

      {grupoModal && <ModalManutencoes grupo={grupoModal} onClose={() => setModalPlaca(null)} />}
    </div>
  );
}

function BadgeStatus({ status }: { status: string | null }) {
  if (status === 'vendido') {
    return <span style={{ marginLeft: 6, fontSize: 9.5, fontWeight: 800, color: '#6d28d9', background: '#ede9fe', borderRadius: 999, padding: '2px 7px' }}>VENDIDO</span>;
  }
  if (status === 'arquivado') {
    return <span style={{ marginLeft: 6, fontSize: 9.5, fontWeight: 800, color: '#475569', background: '#e2e8f0', borderRadius: 999, padding: '2px 7px' }}>ARQUIVADO</span>;
  }
  return null;
}

// Modal: o histórico completo do veículo clicado (a antiga tabela, agora só dele)
function ModalManutencoes({ grupo, onClose }: { grupo: GrupoVeiculo; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 860, maxHeight: '85vh', display: 'flex', flexDirection: 'column', background: 'var(--portal-bg-card)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.35)' }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '14px 20px', borderBottom: '1px solid var(--portal-border)' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--portal-text)', fontVariantNumeric: 'tabular-nums' }}>{formatarPlaca(grupo.placa)}</span>
              {grupo.modelo && <span style={{ fontSize: 13, color: 'var(--portal-text-muted)' }}>{grupo.modelo}</span>}
              <BadgeStatus status={grupo.status} />
            </div>
            <div style={{ fontSize: 12, color: 'var(--portal-text-muted)', marginTop: 2 }}>
              {grupo.itens.length} manutenções · total <strong style={{ color: 'var(--portal-text)' }}>{fmtRS(grupo.total)}</strong>
            </div>
          </div>
          <button
            onClick={onClose}
            title="Fechar"
            style={{ border: 'none', background: 'transparent', color: 'var(--portal-text-muted)', fontSize: 16, cursor: 'pointer', padding: 4, borderRadius: 6 }}
          >
            ✕
          </button>
        </div>

        <div style={{ overflowY: 'auto', padding: '4px 0 8px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '92px 1fr 170px 105px 105px', gap: 0, padding: '8px 20px', fontSize: 10.5, fontWeight: 700, color: 'var(--portal-text-muted)', textTransform: 'uppercase', letterSpacing: 0.6 }}>
            <span>Data</span><span>Descrição</span><span>Fornecedor</span><span>Origem</span><span style={{ textAlign: 'right' }}>Valor</span>
          </div>
          {grupo.itens.map((m) => {
            const o = ORIGEM[m.origem] || ORIGEM.manual;
            return (
              <div key={`${m.origem}-${m.id}`} style={{ display: 'grid', gridTemplateColumns: '92px 1fr 170px 105px 105px', padding: '8px 20px', borderTop: '1px solid var(--portal-border)', fontSize: 12.5, color: 'var(--portal-text-secondary)', alignItems: 'center' }}>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtData(m.data)}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }} title={m.descricao || ''}>
                  {m.origem === 'requisicao' ? (
                    <a
                      href={`/requisicoes?req=${m.id}`}
                      title="Abrir a requisição"
                      style={{ color: 'var(--portal-text)', textDecoration: 'none', fontWeight: 600 }}
                    >
                      {m.descricao || m.tipo || '—'} <ExternalLink size={11} style={{ verticalAlign: '-1px', color: '#0d9488' }} />
                    </a>
                  ) : (
                    m.descricao || m.tipo || '—'
                  )}
                </span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>{m.fornecedor || '—'}</span>
                <span><span style={{ fontSize: 10, fontWeight: 700, color: o.cor, background: o.bg, borderRadius: 999, padding: '2px 8px' }}>{o.label}</span></span>
                <strong style={{ color: 'var(--portal-text)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtRS(m.valor_total)}</strong>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
