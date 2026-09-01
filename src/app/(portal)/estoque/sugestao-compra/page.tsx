'use client';
// Sugestão de Compra: lê o último snapshot noturno. Eixo = fornecedor; chips
// (AND) para recortar; seleção com soma no rodapé; painel de detalhe com a
// memória de cálculo (via /inspecao) e as barras de saída dos 12 meses.
import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';
import { authHeaders } from '@/lib/auth/client';
import TabelaOrdenavel, { type ColunaDef } from '@/components/abastecimento/TabelaOrdenavel';

interface Item {
  sku: string; descricao?: string; marca?: string; familia?: string; tipo?: string;
  curva?: string; regime?: string; frequencia?: string; codigo_fornecedor?: number | null;
  estoque_nova?: number; estoque_castro?: number; estoque_atual?: number; em_transito?: number;
  minimo_efetivo?: number; estoque_seguranca?: number; demanda_45d?: number;
  prev_30?: number; prev_60?: number; prev_90?: number; qtd_sugerida?: number; valor_estimado?: number;
  alerta?: string; dias_ruptura_12m?: number; indice_sazonal_45d?: number; meses_com_saida_12m?: number;
  lead_time_usado?: number; nivel_servico?: number;
}
interface Forn { codigo_fornecedor: number | null; nome: string; n_itens: number }

const n = (v: unknown): number => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const brl = (v: number): string => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const ALERTA: Record<string, { cor: string; bg: string; txt: string }> = {
  ja_era: { cor: '#991b1b', bg: '#fee2e2', txt: 'Já era' },
  critico: { cor: '#c2410c', bg: '#ffedd5', txt: 'Crítico' },
  atencao: { cor: '#a16207', bg: '#fef9c3', txt: 'Atenção' },
  ok: { cor: '#166534', bg: '#dcfce7', txt: 'OK' },
  nao_comprar: { cor: '#64748b', bg: '#f1f5f9', txt: 'Não comprar' },
};

const CHIPS: Array<{ key: string; label: string; test: (i: Item) => boolean }> = [
  { key: 'ja_era', label: 'Já era', test: (i) => i.alerta === 'ja_era' },
  { key: 'critico', label: 'Crítico', test: (i) => i.alerta === 'critico' },
  { key: 'atencao', label: 'Atenção', test: (i) => i.alerta === 'atencao' },
  { key: 'abaixo_min', label: 'Abaixo do mínimo', test: (i) => n(i.minimo_efetivo) > 0 && n(i.estoque_atual) + n(i.em_transito) < n(i.minimo_efetivo) },
  { key: 'zerado_dem', label: 'Zerado com demanda', test: (i) => n(i.estoque_atual) <= 0 && n(i.demanda_45d) > 0 },
  { key: 'sem_giro', label: 'Sem giro 12m', test: (i) => n(i.demanda_45d) === 0 && (n(i.estoque_nova) > 0 || n(i.estoque_castro) > 0) },
  { key: 'entrando_safra', label: 'Entrando na safra', test: (i) => n(i.indice_sazonal_45d) >= 1.15 },
  { key: 'saindo_safra', label: 'Saindo da safra', test: (i) => n(i.indice_sazonal_45d) > 0 && n(i.indice_sazonal_45d) <= 0.85 },
  { key: 'outro_patio', label: 'Tem no outro pátio', test: (i) => (n(i.estoque_nova) <= 0 && n(i.estoque_castro) > 0) || (n(i.estoque_castro) <= 0 && n(i.estoque_nova) > 0) },
  { key: 'sem_tipo', label: 'Sem tipo', test: (i) => !i.tipo || i.tipo === 'Sem tipo' },
];

export default function SugestaoCompraPage() {
  const { userProfile } = useAuth();
  const { pode, loading: permLoading } = usePermissoes(userProfile?.id);

  const [itens, setItens] = useState<Item[]>([]);
  const [forns, setForns] = useState<Forn[]>([]);
  const [geradoEm, setGeradoEm] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [fornSel, setFornSel] = useState<string>('*'); // '*' = todos, '' = não definido, ou id
  const [chipsOn, setChipsOn] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [detalhe, setDetalhe] = useState<{ sku: string; curva?: string } | null>(null);

  useEffect(() => {
    (async () => {
      setCarregando(true);
      try {
        const r = await fetch('/api/estoque/sugestao-compra', { headers: await authHeaders() });
        const d = await r.json();
        if (d.erro) { setCarregando(false); return; }
        setItens(d.itens || []); setForns(d.fornecedores || []); setGeradoEm(d.snapshot?.gerado_em ?? null);
      } finally { setCarregando(false); }
    })();
  }, []);

  // recorte por fornecedor
  const porForn = useMemo(() => {
    if (fornSel === '*') return itens;
    if (fornSel === '') return itens.filter((i) => i.codigo_fornecedor == null);
    return itens.filter((i) => String(i.codigo_fornecedor) === fornSel);
  }, [itens, fornSel]);

  // contagem de cada chip DENTRO do recorte por fornecedor
  const contagemChips = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of CHIPS) m[c.key] = porForn.filter(c.test).length;
    return m;
  }, [porForn]);

  // aplica chips (AND)
  const filtradas = useMemo(() => {
    if (chipsOn.size === 0) return porForn;
    const ativos = CHIPS.filter((c) => chipsOn.has(c.key));
    return porForn.filter((i) => ativos.every((c) => c.test(i)));
  }, [porForn, chipsOn]);

  const toggleChip = (k: string) => setChipsOn((s) => { const x = new Set(s); x.has(k) ? x.delete(k) : x.add(k); return x; });
  const toggleSel = useCallback((sku: string) => setSel((s) => { const x = new Set(s); x.has(sku) ? x.delete(sku) : x.add(sku); return x; }), []);

  const totalSel = useMemo(() => {
    let q = 0, v = 0;
    for (const i of filtradas) if (sel.has(i.sku)) { q += n(i.qtd_sugerida); v += n(i.valor_estimado); }
    return { itens: sel.size, qtd: q, valor: v };
  }, [filtradas, sel]);

  const colunas: ColunaDef<Item>[] = useMemo(() => [
    { chave: 'sel', titulo: '', valor: (i) => (sel.has(i.sku) ? 1 : 0), render: (i) => <input type="checkbox" checked={sel.has(i.sku)} onChange={() => toggleSel(i.sku)} /> },
    { chave: 'sku', titulo: 'SKU', valor: (i) => i.sku, render: (i) => <span style={{ fontFamily: 'monospace', fontSize: '.72rem' }}>{i.sku}</span> },
    { chave: 'descricao', titulo: 'Descrição', valor: (i) => i.descricao ?? '', render: (i) => <span title={i.descricao}>{(i.descricao || '').slice(0, 42)}</span> },
    { chave: 'tipo', titulo: 'Tipo', valor: (i) => i.tipo ?? '', render: (i) => i.tipo || '—' },
    { chave: 'curva', titulo: 'Curva', valor: (i) => i.curva ?? '', render: (i) => <b>{i.curva}</b> },
    { chave: 'regime', titulo: 'Regime', valor: (i) => i.regime ?? '', render: (i) => <span style={{ fontSize: '.68rem', color: '#888' }}>{i.regime}</span> },
    { chave: 'estoque', titulo: 'Estoque', direita: true, valor: (i) => n(i.estoque_atual), render: (i) => <span title={`nova ${n(i.estoque_nova)} · castro ${n(i.estoque_castro)}`}>{n(i.estoque_atual)}</span> },
    { chave: 'transito', titulo: 'Trânsito', direita: true, valor: (i) => n(i.em_transito), render: (i) => n(i.em_transito) || '—' },
    { chave: 'minimo', titulo: 'Mínimo', direita: true, valor: (i) => n(i.minimo_efetivo), render: (i) => Math.round(n(i.minimo_efetivo)) },
    { chave: 'prev', titulo: 'Prev 30·60·90', direita: true, valor: (i) => n(i.prev_30), render: (i) => <span style={{ fontSize: '.7rem' }}>{Math.round(n(i.prev_30))}·{Math.round(n(i.prev_60))}·{Math.round(n(i.prev_90))}</span> },
    { chave: 'sugestao', titulo: 'Sugestão', direita: true, valor: (i) => n(i.qtd_sugerida), render: (i) => <b style={{ color: n(i.qtd_sugerida) > 0 ? '#0f766e' : '#bbb' }}>{n(i.qtd_sugerida)}</b> },
    { chave: 'valor', titulo: 'Valor est.', direita: true, valor: (i) => n(i.valor_estimado), render: (i) => brl(n(i.valor_estimado)) },
    { chave: 'alerta', titulo: 'Alerta', valor: (i) => i.alerta ?? '', render: (i) => { const a = ALERTA[i.alerta || 'nao_comprar'] || ALERTA.nao_comprar; return <span style={{ padding: '2px 7px', borderRadius: 10, fontSize: '.66rem', fontWeight: 600, background: a.bg, color: a.cor }}>{a.txt}</span>; } },
    { chave: 'det', titulo: '', valor: () => '', render: (i) => <button onClick={() => setDetalhe({ sku: i.sku, curva: i.curva })} style={{ padding: '3px 8px', background: '#fff', color: '#0f766e', border: '1px solid #0f766e', borderRadius: 6, cursor: 'pointer', fontSize: '.7rem', fontWeight: 600 }}>ver</button> },
  ], [sel, toggleSel]);

  if (!permLoading && userProfile && !pode('estoque', 'sugestao-compra')) return <SemPermissao />;

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '20px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ color: '#333', marginBottom: 4, fontSize: '1.4rem', fontWeight: 700 }}>Sugestão de Compra</h1>
          <p style={{ color: '#888', fontSize: '.82rem' }}>Reposição de peças calculada — consolidada NOVA + CASTRO. {geradoEm ? `Snapshot de ${new Date(geradoEm).toLocaleString('pt-BR')}.` : ''}</p>
        </div>
        {pode('estoque', 'config-compras') && <Link href="/estoque/config-compras" style={{ color: '#0f766e', textDecoration: 'none', fontSize: '.82rem', fontWeight: 600 }}>⚙ Config. de Compras</Link>}
      </div>

      {/* eixo fornecedor */}
      <div style={{ margin: '14px 0 10px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ fontSize: '.72rem', fontWeight: 600, color: '#888', textTransform: 'uppercase' }}>Fornecedor</label>
        <select value={fornSel} onChange={(e) => { setFornSel(e.target.value); setSel(new Set()); }} style={{ padding: '7px 10px', border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 13, minWidth: 240 }}>
          <option value="*">Todos ({itens.length})</option>
          {forns.map((f) => <option key={String(f.codigo_fornecedor)} value={f.codigo_fornecedor == null ? '' : String(f.codigo_fornecedor)}>{f.nome} ({f.n_itens})</option>)}
        </select>
        {forns.length <= 1 && <span style={{ fontSize: '.72rem', color: '#b45309' }}>⚠ fornecedores ainda não atribuídos — defina em Config. de Compras.</span>}
      </div>

      {/* chips */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {CHIPS.map((c) => {
          const on = chipsOn.has(c.key); const q = contagemChips[c.key] || 0;
          return (
            <button key={c.key} onClick={() => toggleChip(c.key)} style={{
              padding: '5px 11px', borderRadius: 16, fontSize: '.74rem', fontWeight: 600, cursor: 'pointer',
              border: on ? '1px solid #0f766e' : '1px solid #e2e2e2', background: on ? '#0f766e' : '#fff', color: on ? '#fff' : (q ? '#444' : '#bbb'),
            }}>{c.label} <span style={{ opacity: .8 }}>{q}</span></button>
          );
        })}
        {chipsOn.size > 0 && <button onClick={() => setChipsOn(new Set())} style={{ padding: '5px 11px', borderRadius: 16, fontSize: '.74rem', border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer' }}>limpar</button>}
      </div>

      <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: 14, boxShadow: '0 1px 4px rgba(0,0,0,.04)' }}>
        <TabelaOrdenavel<Item> colunas={colunas} linhas={filtradas} chaveLinha={(i) => i.sku} carregando={carregando} />
      </div>

      {/* rodapé de seleção */}
      {totalSel.itens > 0 && (
        <div style={{ position: 'sticky', bottom: 0, marginTop: 12, background: '#0f766e', color: '#fff', borderRadius: 10, padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <span style={{ fontSize: '.85rem', fontWeight: 600 }}>{totalSel.itens} itens · {totalSel.qtd} un · {brl(totalSel.valor)}</span>
          <span style={{ fontSize: '.75rem', opacity: .85 }}>Gerar pedido / PDF: próxima etapa (Fatia 8)</span>
        </div>
      )}

      {detalhe && <PainelDetalhe sku={detalhe.sku} curva={detalhe.curva} onFechar={() => setDetalhe(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
interface Inspecao {
  sku: string; consolidado?: { memoria?: Array<{ rotulo: string; valor: string | number; origem?: string }>; qtd_sugerida?: number; alerta?: string };
  por_conta?: Record<string, { serie12m?: Array<{ ano: number; mes: number; demanda: number; diasNoMes: number; diasComSaldoPositivo: number }>; tipo?: string; estoque?: number; cmd_diario?: number; demanda_45d?: number; indice_sazonal_aplicavel?: boolean }>;
}

function PainelDetalhe({ sku, curva, onFechar }: { sku: string; curva?: string; onFechar: () => void }) {
  const [dados, setDados] = useState<Inspecao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const qc = curva ? `&curva=${encodeURIComponent(curva)}` : '';
        const r = await fetch(`/api/estoque/sugestao-compra/inspecao?sku=${encodeURIComponent(sku)}${qc}`, { headers: await authHeaders() });
        const d = await r.json();
        if (d.erro) setErro(d.erro); else setDados(d);
      } catch (e) { setErro((e as Error).message); }
    })();
  }, [sku, curva]);

  return (
    <div onClick={onFechar} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(560px, 96vw)', height: '100%', background: '#fff', overflowY: 'auto', padding: 20, boxShadow: '-4px 0 20px rgba(0,0,0,.15)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#333', fontFamily: 'monospace' }}>{sku}</h2>
          <button onClick={onFechar} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#888' }}>×</button>
        </div>
        {erro && <div style={{ color: '#991b1b', fontSize: '.82rem' }}>{erro}</div>}
        {!dados && !erro && <div style={{ color: '#888', fontSize: '.82rem' }}>Calculando ao vivo…</div>}
        {dados && (
          <>
            {Object.entries(dados.por_conta || {}).map(([conta, pc]) => (
              <div key={conta} style={{ marginBottom: 16 }}>
                <h3 style={{ fontSize: '.8rem', fontWeight: 700, color: '#0f766e', textTransform: 'uppercase', marginBottom: 6 }}>{conta} · {pc.tipo} {pc.indice_sazonal_aplicavel && <span style={{ color: '#b45309', fontSize: '.7rem' }}>· sazonal</span>}</h3>
                <div style={{ fontSize: '.75rem', color: '#666', marginBottom: 6 }}>estoque {n(pc.estoque)} · cmd {pc.cmd_diario}/dia · demanda 45d {pc.demanda_45d}</div>
                <BarrasSaida serie={pc.serie12m || []} />
              </div>
            ))}
            <h3 style={{ fontSize: '.8rem', fontWeight: 700, color: '#333', margin: '14px 0 6px' }}>Memória de cálculo (consolidado)</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {(dados.consolidado?.memoria || []).map((m, k) => (
                  <tr key={k}>
                    <td style={{ padding: '4px 6px', fontSize: '.76rem', color: '#666', borderBottom: '1px solid #f5f5f5' }}>{m.rotulo}{m.origem && <span style={{ color: '#aaa' }}> · {m.origem}</span>}</td>
                    <td style={{ padding: '4px 6px', fontSize: '.78rem', color: '#333', fontWeight: 600, textAlign: 'right', borderBottom: '1px solid #f5f5f5' }}>{m.valor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: 10, padding: 10, background: '#f0fdfa', borderRadius: 8, fontSize: '.82rem', color: '#0f766e', fontWeight: 700 }}>Sugestão: {dados.consolidado?.qtd_sugerida ?? '—'} un · {dados.consolidado?.alerta}</div>
          </>
        )}
      </div>
    </div>
  );
}

function BarrasSaida({ serie }: { serie: Array<{ ano: number; mes: number; demanda: number; diasNoMes: number; diasComSaldoPositivo: number }> }) {
  const max = Math.max(1, ...serie.map((s) => s.demanda));
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 54 }}>
      {serie.map((s, k) => {
        const rompeu = s.diasComSaldoPositivo < s.diasNoMes; // teve ruptura no mês
        return (
          <div key={k} title={`${String(s.mes).padStart(2, '0')}/${s.ano}: ${s.demanda}${rompeu ? ' (ruptura)' : ''}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
            <div style={{ width: '100%', height: `${(s.demanda / max) * 100}%`, minHeight: s.demanda > 0 ? 2 : 0, background: rompeu ? '#f59e0b' : '#0f766e', borderRadius: '2px 2px 0 0' }} />
            <span style={{ fontSize: '.55rem', color: '#bbb' }}>{s.mes}</span>
          </div>
        );
      })}
    </div>
  );
}
