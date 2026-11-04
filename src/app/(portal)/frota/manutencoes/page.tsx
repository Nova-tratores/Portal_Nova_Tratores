'use client';
// Frota > Manutenções — histórico unificado das 3 fontes:
// Rota Exata (espelho) ∪ registros manuais ∪ Requisições "Veicular Manutenção".
// Agrupado POR VEÍCULO: cada linha é um carro (nº de manutenções, última, total);
// clicar abre o modal com o histórico completo dele. Vendidos/arquivados ficam
// de fora por padrão (checkbox pra mostrar), como no resto do módulo.
// "Detalhado" lista cada serviço na própria tela (com o que foi feito, vindo da
// fonte) e "Imprimir relatório" gera o PDF do que está filtrado.
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Wrench, Search, ExternalLink, Printer } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatarPlaca } from '@/lib/frota/placa';
import type { ManutencaoView } from '@/lib/frota/tipos';
import { enriquecer, noPeriodo, ordenarPorData, type ManutDetalhe, type ReqDetalhe, type ServicoRelatorio } from '@/lib/frota/manutencoes-relatorio';

const fmtRS = (v: number | null) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const fmtData = (s: string | null) => (s ? new Date(`${String(s).slice(0, 10)}T00:00:00`).toLocaleDateString('pt-BR') : '—');

const ORIGEM: Record<string, { label: string; cor: string; bg: string }> = {
  rotaexata: { label: 'Rota Exata', cor: '#1e3a8a', bg: '#dbeafe' },
  manual: { label: 'Portal', cor: '#1d4ed8', bg: '#dbeafe' },
  requisicao: { label: 'Requisição', cor: '#b45309', bg: '#fef3c7' },
};

type InfoVeiculo = { id: string; placa: string; modelo: string | null; descricao: string | null; ativo: boolean; status: string | null };

type GrupoVeiculo = {
  placa: string;
  modelo: string | null;
  ativo: boolean;
  status: string | null;
  itens: ServicoRelatorio[];
  total: number;
  ultima: string | null; // data mais recente
  origens: Record<string, number>;
};

export default function FrotaManutencoesPage() {
  const [linhas, setLinhas] = useState<ManutencaoView[]>([]);
  const [reqs, setReqs] = useState<ReqDetalhe[]>([]);
  const [manuts, setManuts] = useState<ManutDetalhe[]>([]);
  const [veiculos, setVeiculos] = useState<InfoVeiculo[]>([]);
  const [busca, setBusca] = useState('');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [mostrarInativos, setMostrarInativos] = useState(false);
  const [vista, setVista] = useState<'resumo' | 'detalhado'>(() => {
    try { return localStorage.getItem('frota-manut-vista') === 'detalhado' ? 'detalhado' : 'resumo'; } catch { return 'resumo'; }
  });
  const [gerandoPdf, setGerandoPdf] = useState(false);
  const [modalPlaca, setModalPlaca] = useState<string | null>(null);
  const [erro, setErro] = useState('');

  const trocarVista = (v: 'resumo' | 'detalhado') => {
    setVista(v);
    try { localStorage.setItem('frota-manut-vista', v); } catch { /* sem storage */ }
  };

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
      const ls = (manut.data || []) as ManutencaoView[];
      setLinhas(ls);
      setVeiculos((veic.data || []) as InfoVeiculo[]);

      // detalhe de cada serviço, direto da fonte (em lotes: .in() com muitos ids estoura a URL)
      const lotes = (ids: string[]) => Array.from({ length: Math.ceil(ids.length / 150) }, (_, i) => ids.slice(i * 150, i * 150 + 150));
      const idsReq = ls.filter((m) => m.origem === 'requisicao').map((m) => m.id);
      const idsManut = ls.filter((m) => m.origem !== 'requisicao').map((m) => m.id);
      const [rr, mm] = await Promise.all([
        Promise.all(lotes(idsReq).map((l) => supabase.from('Requisicao').select('id, obs, solicitante, ordem_servico, status').in('id', l))),
        Promise.all(lotes(idsManut).map((l) => supabase.from('frota_manutencoes').select('id, descricao, observacao, tipo, status').in('id', l))),
      ]);
      setReqs(rr.flatMap((r) => (r.data || []) as ReqDetalhe[]));
      setManuts(mm.flatMap((r) => (r.data || []) as ManutDetalhe[]));
    })();
  }, []);

  const servicos = useMemo(
    () => enriquecer(linhas, reqs, manuts).filter((m) => noPeriodo(m.data, de, ate)),
    [linhas, reqs, manuts, de, ate],
  );

  // agrupa por placa; modelo/status vêm do cadastro (por veiculo_id, senão por placa)
  const grupos = useMemo(() => {
    const porId = new Map(veiculos.map((v) => [v.id, v]));
    const porPlaca = new Map(veiculos.map((v) => [v.placa, v]));
    const mapa = new Map<string, GrupoVeiculo>();
    for (const m of servicos) {
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
    for (const g of mapa.values()) g.itens = ordenarPorData(g.itens);
    // quem mais gasta em manutenção no topo; empate: mais registros
    return [...mapa.values()].sort((a, b) => b.total - a.total || b.itens.length - a.itens.length);
  }, [servicos, veiculos]);

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
        g.itens.some((m) => [m.descricao, m.fornecedor, m.detalhe, ...m.extras].some((t) => (t || '').toLowerCase().includes(q)))
      );
    });
  }, [grupos, busca, mostrarInativos]);

  const totalGeral = visiveis.reduce((s, g) => s + g.total, 0);
  const registros = visiveis.reduce((s, g) => s + g.itens.length, 0);
  const grupoModal = modalPlaca ? grupos.find((g) => g.placa === modalPlaca) : null;

  const imprimir = async () => {
    setGerandoPdf(true);
    try {
      const filtros = [
        de || ate ? `Período: ${de ? fmtData(de) : 'início'} a ${ate ? fmtData(ate) : 'hoje'}` : 'Período: todo o histórico',
        ...(busca.trim() ? [`Busca: "${busca.trim()}"`] : []),
        mostrarInativos ? 'Inclui vendidos/arquivados' : 'Só veículos ativos',
      ];
      const { gerarPdfManutencoes } = await import('@/lib/frota/manutencoes-pdf');
      await gerarPdfManutencoes({ veiculos: visiveis, filtros });
    } catch (e) {
      alert(`Não foi possível gerar o PDF: ${e instanceof Error ? e.message : e}`);
    } finally {
      setGerandoPdf(false);
    }
  };

  return (
    <div className="frota-pg" style={{ padding: '28px 40px', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: 'var(--portal-text)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Wrench size={20} color="#1e40af" /> Manutenções
        </h2>
        <span style={{ fontSize: 13.5, color: 'var(--portal-text)' }}>
          {visiveis.length} veículos · {registros} registros · total {fmtRS(totalGeral)}
        </span>
        <div style={{ flex: 1 }} />
        <div className="frota-busca-box" style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--portal-text)' }} />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Placa, descrição, fornecedor…"
            className="frota-busca frota-touch"
            style={{ padding: '8px 12px 8px 30px', borderRadius: 0, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-input)', color: 'var(--portal-text)', fontSize: 13, width: 260 }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '8px 0 10px' }}>
        <label style={rotulo}>De <input type="date" value={de} onChange={(e) => setDe(e.target.value)} style={campoData} /></label>
        <label style={rotulo}>Até <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} style={campoData} /></label>
        {(de || ate) && (
          <button onClick={() => { setDe(''); setAte(''); }} style={{ ...botao, background: 'transparent' }}>Limpar período</button>
        )}
        <div style={{ display: 'inline-flex', border: '1px solid var(--portal-border)' }}>
          {(['resumo', 'detalhado'] as const).map((v) => (
            <button
              key={v}
              onClick={() => trocarVista(v)}
              style={{ ...botao, border: 'none', background: vista === v ? '#1e40af' : 'var(--portal-bg-card)', color: vista === v ? '#fefefe' : 'var(--portal-text)' }}
            >
              {v === 'resumo' ? 'Resumo' : 'Detalhado'}
            </button>
          ))}
        </div>
        <button
          onClick={imprimir}
          disabled={gerandoPdf || visiveis.length === 0}
          title="Gera o PDF com todos os serviços de cada veículo, seguindo os filtros da tela"
          style={{ ...botao, background: '#1e40af', color: '#fefefe', border: '1px solid #1e40af', display: 'inline-flex', alignItems: 'center', gap: 6, opacity: gerandoPdf || visiveis.length === 0 ? 0.6 : 1 }}
        >
          <Printer size={14} /> {gerandoPdf ? 'Gerando…' : 'Imprimir relatório'}
        </button>
      </div>

      <p style={{ fontSize: 13, color: 'var(--portal-text)', margin: '0 0 10px' }}>
        {vista === 'resumo' ? 'Clique no veículo pra ver o histórico completo dele.' : 'Cada serviço de cada veículo, do mais recente pro mais antigo.'}
      </p>

      {foraDaFrota.length > 0 && (
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13.5, color: 'var(--portal-text)', cursor: 'pointer', marginBottom: 10 }}>
          <input type="checkbox" checked={mostrarInativos} onChange={() => setMostrarInativos((v) => !v)} />
          mostrar vendidos/arquivados ({foraDaFrota.length})
        </label>
      )}

      {erro && <div style={{ color: '#b91c1c', fontSize: 13, marginBottom: 12 }}>{erro}</div>}

      <style>{`@media (max-width: 640px) {
        .mn-cab { display: none !important; }
        .mn-lin { min-width: 0 !important; grid-template-columns: minmax(0,1fr) auto !important; grid-template-areas: 'p t' 'v v' 'q u' 'o o'; gap: 4px 10px !important; padding: 12px 14px !important; }
        .mn-lin > :nth-child(1) { grid-area: p; } .mn-lin > :nth-child(2) { grid-area: v; } .mn-lin > :nth-child(3) { grid-area: q; text-align: left !important; }
        .mn-lin > :nth-child(4) { grid-area: u; } .mn-lin > :nth-child(5) { grid-area: o; justify-content: flex-start !important; } .mn-lin > :nth-child(6) { grid-area: t; }
        .mn-it { min-width: 0 !important; grid-template-columns: minmax(0,1fr) auto !important; grid-template-areas: 'd v' 's s' 'f o'; gap: 3px 10px !important; padding: 10px 14px !important; }
        .mn-it > :nth-child(1) { grid-area: d; } .mn-it > :nth-child(2) { grid-area: s; white-space: normal !important; } .mn-it > :nth-child(3) { grid-area: f; } .mn-it > :nth-child(4) { display: none; } .mn-it > :nth-child(5) { grid-area: o; } .mn-it > :nth-child(6) { grid-area: v; }
        .mn-lin [data-r]::before { content: attr(data-r) ' '; font-size: 10.5px; font-weight: 600; color: var(--portal-text-muted); text-transform: uppercase; }
      }`}</style>
      {vista === 'detalhado' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {visiveis.map((g) => (
            <div key={g.placa} style={{ background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', borderLeft: '4px solid #1e40af', overflowX: 'auto', opacity: g.ativo ? 1 : 0.7 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 16px', background: 'var(--portal-bg-secondary)' }}>
                <strong style={{ fontSize: 15, color: 'var(--portal-text)' }}>{formatarPlaca(g.placa)}</strong>
                <span style={{ fontSize: 13.5, color: 'var(--portal-text)' }}>{g.modelo || '—'}</span>
                <BadgeStatus status={g.status} />
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: 13, color: 'var(--portal-text)' }}>
                  {g.itens.length} serviço(s) · total <strong>{fmtRS(g.total)}</strong>
                </span>
              </div>
              <ListaServicos itens={g.itens} />
            </div>
          ))}
          {visiveis.length === 0 && !erro && (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--portal-text)', fontSize: 13 }}>Nenhuma manutenção encontrada.</div>
          )}
        </div>
      ) : (
      <div style={{ background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', borderRadius: 0, overflowX: 'auto' }}>
        <div className="mn-cab" style={{ display: 'grid', gridTemplateColumns: '110px 1fr 120px 110px 190px 120px', gap: 0, minWidth: 820, padding: '10px 16px', background: 'var(--portal-bg-secondary)', fontSize: 12, fontWeight: 700, color: 'var(--portal-text)', textTransform: 'uppercase', letterSpacing: 0.6 }}>
          <span>Placa</span><span>Veículo</span><span style={{ textAlign: 'right' }}>Manutenções</span><span style={{ textAlign: 'right' }}>Última</span><span style={{ textAlign: 'center' }}>Origens</span><span style={{ textAlign: 'right' }}>Total</span>
        </div>
        {visiveis.map((g) => (
          <div
            key={g.placa}
            onClick={() => setModalPlaca(g.placa)}
            title="Clique pra ver o histórico completo deste veículo"
            className="mn-lin"
            style={{ display: 'grid', gridTemplateColumns: '110px 1fr 120px 110px 190px 120px', minWidth: 820, padding: '10px 16px', borderTop: '1px solid var(--portal-border)', fontSize: 13.5, color: 'var(--portal-text)', alignItems: 'center', cursor: 'pointer', opacity: g.ativo ? 1 : 0.6 }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--portal-bg-secondary)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <strong style={{ color: 'var(--portal-text)' }}>{formatarPlaca(g.placa)}</strong>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {g.modelo || '—'}
              <BadgeStatus status={g.status} />
            </span>
            <span data-r="manut." style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{g.itens.length}</span>
            <span data-r="última" style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtData(g.ultima)}</span>
            <span style={{ display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap' }}>
              {Object.entries(g.origens).map(([k, n]) => {
                const o = ORIGEM[k] || ORIGEM.manual;
                return (
                  <span key={k} style={{ fontSize: 11, fontWeight: 700, color: o.cor, background: o.bg, borderRadius: 999, padding: '2px 7px', whiteSpace: 'nowrap' }}>
                    {n}× {o.label}
                  </span>
                );
              })}
            </span>
            <strong style={{ color: 'var(--portal-text)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtRS(g.total)}</strong>
          </div>
        ))}
        {visiveis.length === 0 && !erro && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--portal-text)', fontSize: 13 }}>Nenhuma manutenção encontrada.</div>
        )}
      </div>
      )}

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
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'clamp(6px, 2vw, 16px)' }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 860, maxHeight: '85vh', display: 'flex', flexDirection: 'column', background: 'var(--portal-bg-card)', borderRadius: 0, overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.35)' }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '14px 20px', borderBottom: '1px solid var(--portal-border)' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--portal-text)', fontVariantNumeric: 'tabular-nums' }}>{formatarPlaca(grupo.placa)}</span>
              {grupo.modelo && <span style={{ fontSize: 13, color: 'var(--portal-text)' }}>{grupo.modelo}</span>}
              <BadgeStatus status={grupo.status} />
            </div>
            <div style={{ fontSize: 13, color: 'var(--portal-text)', marginTop: 2 }}>
              {grupo.itens.length} manutenções · total <strong style={{ color: 'var(--portal-text)' }}>{fmtRS(grupo.total)}</strong>
            </div>
          </div>
          <button
            onClick={onClose}
            title="Fechar"
            style={{ border: 'none', background: 'transparent', color: 'var(--portal-text)', fontSize: 16, cursor: 'pointer', padding: 4, borderRadius: 0, minWidth: 36, minHeight: 36, flexShrink: 0 }}
          >
            ✕
          </button>
        </div>

        <div style={{ overflowY: 'auto', padding: '4px 0 8px' }}>
          <ListaServicos itens={grupo.itens} />
        </div>
      </div>
    </div>
  );
}

const rotulo: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--portal-text)' };
const campoData: CSSProperties = { padding: '6px 8px', borderRadius: 0, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-input)', color: 'var(--portal-text)', fontSize: 13 };
const botao: CSSProperties = { padding: '7px 12px', borderRadius: 0, border: '1px solid var(--portal-border)', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--portal-text)', minHeight: 34 };

// Lista de serviços de um veículo (modal e modo Detalhado): título + o que foi
// feito (obs da requisição / observação da Rota Exata) + solicitante, OS, km.
function ListaServicos({ itens }: { itens: ServicoRelatorio[] }) {
  return (
    <>
      <div className="mn-cab" style={{ display: 'grid', gridTemplateColumns: '92px 1fr 170px 80px 105px 105px', gap: 0, minWidth: 720, padding: '8px 20px', fontSize: 11.5, fontWeight: 700, color: 'var(--portal-text)', textTransform: 'uppercase', letterSpacing: 0.6 }}>
        <span>Data</span><span>Serviço</span><span>Fornecedor</span><span style={{ textAlign: 'right' }}>Km</span><span style={{ textAlign: 'center' }}>Origem</span><span style={{ textAlign: 'right' }}>Valor</span>
      </div>
      {itens.map((m) => {
        const o = ORIGEM[m.origem] || ORIGEM.manual;
        const titulo = m.descricao || m.tipo || '—';
        return (
          <div key={`${m.origem}-${m.id}`} className="mn-it" style={{ display: 'grid', gridTemplateColumns: '92px 1fr 170px 80px 105px 105px', minWidth: 720, padding: '8px 20px', borderTop: '1px solid var(--portal-border)', fontSize: 13.5, color: 'var(--portal-text)', alignItems: 'start' }}>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtData(m.data)}</span>
            <span style={{ paddingRight: 8, minWidth: 0 }}>
              {m.origem === 'requisicao' ? (
                <a href={`/requisicoes?req=${m.id}`} title="Abrir a requisição" style={{ color: 'var(--portal-text)', textDecoration: 'none', fontWeight: 600 }}>
                  {titulo} <span style={{ fontWeight: 400, fontSize: 12 }}>#{m.id}</span> <ExternalLink size={11} style={{ verticalAlign: '-1px', color: '#1e40af' }} />
                </a>
              ) : (
                <span style={{ fontWeight: 600 }}>{titulo}</span>
              )}
              {m.detalhe && <div style={{ fontSize: 12.5, marginTop: 2, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.detalhe}</div>}
              {m.extras.length > 0 && <div style={{ fontSize: 11.5, marginTop: 2, color: 'var(--portal-text-muted)' }}>{m.extras.join(' · ')}</div>}
            </span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }} title={m.fornecedor || ''}>{m.fornecedor || '—'}</span>
            <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', paddingRight: 8 }}>{m.hodometro != null ? Number(m.hodometro).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) : '—'}</span>
            <span style={{ textAlign: 'center' }}><span style={{ fontSize: 11, fontWeight: 700, color: o.cor, background: o.bg, borderRadius: 999, padding: '2px 8px', whiteSpace: 'nowrap' }}>{o.label}</span></span>
            <strong style={{ color: 'var(--portal-text)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtRS(m.valor_total)}</strong>
          </div>
        );
      })}
    </>
  );
}
