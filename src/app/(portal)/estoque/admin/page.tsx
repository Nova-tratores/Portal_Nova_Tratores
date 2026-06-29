'use client';
// Admin do módulo Estoque. Portado das telas /admin do monolito:
// gerenciar categorias dos cards, detectar meses zerados/parciais, popular cache
// / forçar resync, e ferramentas de debug (ListarPedidos / ListarOS).
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';
import { useConta } from '@/components/estoque/ContaProvider';
import ContaSelector from '@/components/estoque/ContaSelector';

interface Categoria { nome: string; palavras_chave: string; posicao: number }
interface MesSuspeito { mes: number; ano: number; count: number; soma: number }
interface MesesResp {
  erro?: string; conta?: string; total?: number; zerados?: number; parciais?: number; suspeitos?: number;
  medianaCount?: number; thresholdCount?: number;
  detalhe?: { zerados: MesSuspeito[]; parciais: MesSuspeito[] };
}

const card: React.CSSProperties = { background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: 20, marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,.04)' };
const cardTitle: React.CSSProperties = { fontSize: '.7rem', color: '#888', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '.5px', fontWeight: 600 };
const btn = (disabled?: boolean): React.CSSProperties => ({ background: disabled ? '#bbb' : '#dc2626', color: '#fff', border: 'none', padding: '10px 22px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer' });
const inp: React.CSSProperties = { padding: '9px 12px', border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 13, outline: 'none' };
const pre: React.CSSProperties = { background: '#0f172a', color: '#cbd5e1', padding: 12, borderRadius: 8, fontSize: 12, overflowX: 'auto', maxHeight: 360, whiteSpace: 'pre-wrap', wordBreak: 'break-word' };

export default function AdminEstoquePage() {
  const { userProfile } = useAuth();
  const { pode, loading: permLoading } = usePermissoes(userProfile?.id);
  const { conta, contaParam } = useConta();

  const [cats, setCats] = useState<Categoria[]>([]);
  const [salvandoCat, setSalvandoCat] = useState(false);
  const [catMsg, setCatMsg] = useState('');

  const [meses, setMeses] = useState<MesesResp | null>(null);
  const [pct, setPct] = useState(30);
  const [carregandoMeses, setCarregandoMeses] = useState(false);

  const [popMsg, setPopMsg] = useState('');
  const [resyncMsg, setResyncMsg] = useState('');

  const [debugDe, setDebugDe] = useState('');
  const [debugAte, setDebugAte] = useState('');
  const [debugOut, setDebugOut] = useState('');
  const [debugBusy, setDebugBusy] = useState(false);

  const carregarCats = useCallback(async () => {
    const r = await fetch('/api/estoque/admin/categorias');
    const d = (await r.json()) as Categoria[];
    setCats(Array.isArray(d) ? d : []);
  }, []);

  useEffect(() => { carregarCats(); }, [carregarCats]);

  const salvarCats = useCallback(async () => {
    setSalvandoCat(true);
    setCatMsg('');
    try {
      const r = await fetch('/api/estoque/admin/categorias', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categorias: cats.map((c) => ({ nome: c.nome, palavras_chave: c.palavras_chave })) }),
      });
      const d = await r.json();
      if (d.erro) setCatMsg('Erro: ' + d.erro);
      else { setCatMsg('Categorias salvas.'); carregarCats(); }
    } finally {
      setSalvandoCat(false);
    }
  }, [cats, carregarCats]);

  const detectarMeses = useCallback(async () => {
    if (!conta) { setMeses({ erro: 'Selecione NOVA ou CASTRO (modo Todas não suportado aqui)' }); return; }
    setCarregandoMeses(true);
    try {
      const r = await fetch(`/api/estoque/admin/meses-zerados?pct=${pct}${contaParam}`);
      setMeses((await r.json()) as MesesResp);
    } finally {
      setCarregandoMeses(false);
    }
  }, [conta, pct, contaParam]);

  const dispararPopular = useCallback(async (forcar: boolean) => {
    setPopMsg('Disparando…');
    const r = await fetch(`/api/estoque/popular-cache?${forcar ? 'forcar=1&' : ''}${contaParam.replace(/^&/, '')}`);
    setPopMsg(JSON.stringify(await r.json()));
  }, [contaParam]);

  const dispararPopularOS = useCallback(async () => {
    setPopMsg('Disparando popular-os (foreground, pode demorar)…');
    const r = await fetch(`/api/estoque/popular-os?${contaParam.replace(/^&/, '')}`);
    setPopMsg(JSON.stringify(await r.json()));
  }, [contaParam]);

  const forcarResync = useCallback(async () => {
    if (!conta) { setResyncMsg('Selecione NOVA ou CASTRO.'); return; }
    setResyncMsg('Disparando…');
    const r = await fetch('/api/estoque/admin/forcar-resync-meses', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conta }),
    });
    setResyncMsg(JSON.stringify(await r.json()));
  }, [conta]);

  const repopularTipo = useCallback(async () => {
    if (!conta) { setResyncMsg('Selecione NOVA ou CASTRO.'); return; }
    setResyncMsg('Repopulando produto_tipo…');
    const r = await fetch(`/api/estoque/admin/repopular-produto-tipo${contaParam}`);
    setResyncMsg(JSON.stringify(await r.json()));
  }, [conta, contaParam]);

  const rodarDebug = useCallback(async (tipo: 'pedidos' | 'os') => {
    if (!conta) { setDebugOut('Selecione NOVA ou CASTRO.'); return; }
    if (!debugDe || !debugAte) { setDebugOut('Informe de/ate (DD/MM/YYYY).'); return; }
    setDebugBusy(true);
    setDebugOut('Carregando…');
    try {
      const ep = tipo === 'pedidos' ? 'debug-listar-pedidos' : 'debug-listar-os';
      const r = await fetch(`/api/estoque/admin/${ep}?de=${encodeURIComponent(debugDe)}&ate=${encodeURIComponent(debugAte)}${contaParam}`);
      setDebugOut(JSON.stringify(await r.json(), null, 2));
    } finally {
      setDebugBusy(false);
    }
  }, [conta, debugDe, debugAte, contaParam]);

  if (!permLoading && userProfile && !pode('estoque', 'admin')) return <SemPermissao />;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ color: '#333', marginBottom: 4, fontSize: '1.4rem', fontWeight: 700 }}>Admin Estoque</h1>
          <p style={{ color: '#888', fontSize: '.82rem' }}>Categorias dos cards, manutenção de cache e debug</p>
        </div>
        <ContaSelector />
      </div>
      <div style={{ margin: '14px 0 18px', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {pode('estoque', 'dashboard') && (<Link href="/estoque/dashboard" style={{ color: '#dc2626', textDecoration: 'none', fontSize: '.82rem', fontWeight: 600 }}>← Dashboard</Link>)}
        {pode('estoque', 'admin-cmc') && (<Link href="/estoque/admin-cmc" style={{ color: '#dc2626', textDecoration: 'none', fontSize: '.82rem', fontWeight: 600 }}>Admin CMC</Link>)}
        {pode('estoque', 'ignorar-clientes') && (<Link href="/estoque/ignorar-clientes" style={{ color: '#dc2626', textDecoration: 'none', fontSize: '.82rem', fontWeight: 600 }}>Ignorar Clientes</Link>)}
      </div>

      <div style={card}>
        <div style={cardTitle}>Categorias dos cards do dashboard (2 a 5)</div>
        {cats.map((c, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, padding: 12, background: '#fafafa', borderRadius: 10, border: '1px solid #f0f0f0' }}>
            <span style={{ width: 28, height: 28, background: '#dc2626', color: '#fff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{i + 1}</span>
            <input value={c.nome} placeholder="Nome" onChange={(e) => setCats((p) => p.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)))} style={{ ...inp, flex: 1 }} />
            <input value={c.palavras_chave} placeholder="palavras,chave" onChange={(e) => setCats((p) => p.map((x, j) => (j === i ? { ...x, palavras_chave: e.target.value } : x)))} style={{ ...inp, flex: 2 }} />
            {cats.length > 2 && <button onClick={() => setCats((p) => p.filter((_, j) => j !== i))} style={{ ...btn(), padding: '8px 12px', background: '#fff', color: '#dc2626', border: '1px solid #dc2626' }}>×</button>}
          </div>
        ))}
        <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
          {cats.length < 5 && <button onClick={() => setCats((p) => [...p, { nome: '', palavras_chave: '', posicao: p.length + 1 }])} style={{ ...btn(), background: '#fff', color: '#dc2626', border: '1px solid #dc2626' }}>+ Categoria</button>}
          <button onClick={salvarCats} disabled={salvandoCat} style={btn(salvandoCat)}>{salvandoCat ? 'Salvando…' : 'Salvar categorias'}</button>
        </div>
        {catMsg && <div style={{ marginTop: 12, fontSize: 13, color: catMsg.startsWith('Erro') ? '#dc2626' : '#16a34a' }}>{catMsg}</div>}
      </div>

      <div style={card}>
        <div style={cardTitle}>Meses zerados / parciais (só leitura)</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12, color: '#888' }}>Threshold %</label>
          <input type="number" value={pct} onChange={(e) => setPct(parseInt(e.target.value) || 30)} style={{ ...inp, width: 80 }} />
          <button onClick={detectarMeses} disabled={carregandoMeses} style={btn(carregandoMeses)}>{carregandoMeses ? 'Detectando…' : 'Detectar'}</button>
        </div>
        {meses && (
          <div style={{ marginTop: 12, fontSize: 13, color: '#444' }}>
            {meses.erro ? <span style={{ color: '#dc2626' }}>{meses.erro}</span> : (
              <>
                <div>{meses.conta}: {meses.total} meses esperados — {meses.zerados} zerados, {meses.parciais} parciais (medianaCount={meses.medianaCount}, thresholdCount={meses.thresholdCount})</div>
                <div style={{ marginTop: 8, color: '#888' }}>Suspeitos: {(meses.detalhe?.zerados.concat(meses.detalhe?.parciais || []) || []).map((m) => `${m.mes}/${m.ano}(${m.count})`).join(', ') || 'nenhum'}</div>
              </>
            )}
          </div>
        )}
      </div>

      <div style={card}>
        <div style={cardTitle}>Popular cache / forçar resync</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={() => dispararPopular(false)} style={btn()}>Popular cache (BG)</button>
          <button onClick={() => dispararPopular(true)} style={{ ...btn(), background: '#b91c1c' }}>Popular cache FORÇADO (BG)</button>
          <button onClick={dispararPopularOS} style={{ ...btn(), background: '#fff', color: '#dc2626', border: '1px solid #dc2626' }}>Popular OS</button>
        </div>
        {popMsg && <pre style={{ ...pre, marginTop: 12 }}>{popMsg}</pre>}
        <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
          <button onClick={forcarResync} style={btn()}>Forçar resync meses suspeitos (BG)</button>
          <button onClick={repopularTipo} style={{ ...btn(), background: '#fff', color: '#dc2626', border: '1px solid #dc2626' }}>Repopular produto_tipo</button>
        </div>
        {resyncMsg && <pre style={{ ...pre, marginTop: 12 }}>{resyncMsg}</pre>}
      </div>

      <div style={card}>
        <div style={cardTitle}>Debug Omie (ListarPedidos / ListarOS)</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
          <input value={debugDe} onChange={(e) => setDebugDe(e.target.value)} placeholder="de DD/MM/YYYY" style={{ ...inp, width: 150 }} />
          <input value={debugAte} onChange={(e) => setDebugAte(e.target.value)} placeholder="ate DD/MM/YYYY" style={{ ...inp, width: 150 }} />
          <button onClick={() => rodarDebug('pedidos')} disabled={debugBusy} style={btn(debugBusy)}>Pedidos</button>
          <button onClick={() => rodarDebug('os')} disabled={debugBusy} style={btn(debugBusy)}>OS</button>
        </div>
        {debugOut && <pre style={pre}>{debugOut}</pre>}
      </div>
      {conta === '' && <div style={{ fontSize: '.7rem', color: '#bbb', marginTop: 10 }}>Operações por conta exigem NOVA ou CASTRO selecionada.</div>}
    </div>
  );
}
