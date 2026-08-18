'use client';
// Aba "Etiquetas" do /ppv (Feature B — núcleo). Busca peça (código/descrição/
// locação), marca por empresa e adiciona à FILA COMPARTILHADA; imprime folha
// adesiva 3×10 (Pimaco 6180) ou papel comum, e guarda o HISTÓRICO de folhas
// (snapshot) para reimprimir. Locação vem de #PRATELEIRA/#ANDAR/#CAIXA.
import { useState, useEffect, useMemo, useCallback } from 'react';
import { authHeaders } from '@/lib/auth/client';
import { Search, Tag, Trash2, Printer, Plus, Minus, History, RefreshCw } from 'lucide-react';

interface Produto { empresa: string; codigo_produto: number | string; codigo?: string; descricao?: string; caracteristicas?: Record<string, string> }
interface ItemFila { id: number; empresa: string; codigo_produto: string; codigo: string | null; descricao: string | null; quantidade: number; criado_nome: string | null; criado_em: string }
interface FolhaMeta { id: number; papel: string; inicio_posicao: number; total_etiquetas: number; criado_nome: string | null; criado_em: string }

function norm(s: string): string { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase(); }
function getCar(car: Record<string, string> | undefined, canon: string): string {
  if (!car) return '';
  const alvo = norm(canon);
  for (const k of Object.keys(car)) if (norm(k) === alvo) return String(car[k] ?? '');
  return '';
}
function locacaoDe(p?: Produto): string {
  const car = p?.caracteristicas;
  const prat = getCar(car, '#PRATELEIRA').trim();
  const andar = (getCar(car, '#ANDAR') || getCar(car, '#ANDAR2')).trim();
  const caixa = (getCar(car, '#CAIXA') || getCar(car, '#CAIXA2')).trim();
  return [prat, andar, caixa].filter(Boolean).join(' ');
}
function fmtData(iso: string): string { const d = new Date(iso); return isNaN(d.getTime()) ? iso : d.toLocaleString('pt-BR'); }

const btn: React.CSSProperties = { border: '1px solid #cbd5e1', background: '#fff', borderRadius: 8, padding: '8px 12px', fontSize: '.8rem', cursor: 'pointer', color: '#334155', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 };
const btnPrim: React.CSSProperties = { ...btn, background: '#1d4ed8', color: '#fff', border: '1px solid #1d4ed8' };
const card: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 14 };

export default function EtiquetasTab() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [empresas, setEmpresas] = useState<string[]>([]);
  const [empresa, setEmpresa] = useState('');
  const [fila, setFila] = useState<ItemFila[]>([]);
  const [folhas, setFolhas] = useState<FolhaMeta[]>([]);
  const [busca, setBusca] = useState('');
  const [papel, setPapel] = useState<'3x10' | 'comum'>('3x10');
  const [inicio, setInicio] = useState(1);
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const carregarMatriz = useCallback(async () => {
    const r = await fetch('/api/ajustes/caracteristicas', { headers: { ...(await authHeaders()) } });
    const d = await r.json();
    const ps: Produto[] = d.produtos || [];
    setProdutos(ps);
    const emps = Array.from(new Set(ps.map((p) => String(p.empresa)))).sort();
    setEmpresas(emps); setEmpresa((e) => e || emps[0] || '');
  }, []);
  const carregarFila = useCallback(async () => {
    const r = await fetch('/api/ppv/etiquetas', { headers: { ...(await authHeaders()) } });
    const d = await r.json(); setFila(d.fila || []);
  }, []);
  const carregarFolhas = useCallback(async () => {
    const r = await fetch('/api/ppv/etiquetas/folhas', { headers: { ...(await authHeaders()) } });
    const d = await r.json(); setFolhas(d.folhas || []);
  }, []);

  useEffect(() => { (async () => { setCarregando(true); try { await Promise.all([carregarMatriz(), carregarFila(), carregarFolhas()]); } catch (e) { setMsg((e as Error).message); } finally { setCarregando(false); } })(); }, [carregarMatriz, carregarFila, carregarFolhas]);

  // índice de produtos por empresa|codigo_produto (para locação ao vivo na fila)
  const idx = useMemo(() => { const m = new Map<string, Produto>(); for (const p of produtos) m.set(`${p.empresa}|${p.codigo_produto}`, p); return m; }, [produtos]);

  const termo = norm(busca);
  const resultados = useMemo(() => {
    if (termo.length < 2) return [];
    return produtos.filter((p) => String(p.empresa) === empresa)
      .filter((p) => norm(`${p.codigo || ''} ${p.descricao || ''} ${locacaoDe(p)}`).includes(termo))
      .slice(0, 60);
  }, [produtos, empresa, termo]);

  const totalEtiquetas = useMemo(() => fila.reduce((s, i) => s + (i.quantidade || 1), 0), [fila]);

  async function addFila(p: Produto) {
    setOcupado(true);
    try {
      const r = await fetch('/api/ppv/etiquetas', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ empresa: p.empresa, codigo_produto: p.codigo_produto, codigo: p.codigo, descricao: p.descricao }),
      });
      const d = await r.json(); if (!r.ok || d.erro) throw new Error(d.erro || 'falha');
      setFila((f) => [...f, d.item]);
    } catch (e) { alert('Erro: ' + (e as Error).message); } finally { setOcupado(false); }
  }
  async function mudarQtd(it: ItemFila, delta: number) {
    const q = Math.max(1, (it.quantidade || 1) + delta);
    setFila((f) => f.map((x) => x.id === it.id ? { ...x, quantidade: q } : x));
    try {
      await fetch('/api/ppv/etiquetas', { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify({ id: it.id, quantidade: q }) });
    } catch { carregarFila(); }
  }
  async function removerItem(it: ItemFila) {
    setFila((f) => f.filter((x) => x.id !== it.id));
    try { await fetch(`/api/ppv/etiquetas?id=${it.id}`, { method: 'DELETE', headers: { ...(await authHeaders()) } }); } catch { carregarFila(); }
  }
  async function limpar() {
    if (!confirm('Esvaziar toda a fila de etiquetas?')) return;
    try { await fetch('/api/ppv/etiquetas?limpar=1', { method: 'DELETE', headers: { ...(await authHeaders()) } }); setFila([]); } catch (e) { alert((e as Error).message); }
  }
  function abrirImpressao(html: string) {
    const w = window.open('', '_blank', 'width=900,height=800');
    if (w) { w.document.write(html); w.document.close(); setTimeout(() => { w.focus(); w.print(); }, 400); }
    else alert('Bloqueador de pop-up? Libere para imprimir.');
  }
  async function imprimir() {
    if (fila.length === 0) { alert('Fila vazia.'); return; }
    setOcupado(true);
    try {
      const r = await fetch('/api/ppv/etiquetas/folhas', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ papel, inicio }),
      });
      const d = await r.json(); if (!r.ok || d.erro) throw new Error(d.erro || 'falha');
      abrirImpressao(d.html);
      setFila([]); setInicio(1); carregarFolhas();
    } catch (e) { alert('Erro ao imprimir: ' + (e as Error).message); } finally { setOcupado(false); }
  }
  async function reimprimir(id: number) {
    try {
      const r = await fetch(`/api/ppv/etiquetas/folhas?id=${id}`, { headers: { ...(await authHeaders()) } });
      const d = await r.json(); if (!r.ok || d.erro) throw new Error(d.erro || 'falha');
      abrirImpressao(d.html);
    } catch (e) { alert('Erro: ' + (e as Error).message); }
  }

  return (
    <div style={{ padding: 16, maxWidth: 1100, margin: '0 auto', display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Tag size={20} color="#1d4ed8" />
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, color: '#0f172a' }}>Etiquetas de identificação de peças</h2>
      </div>
      {msg && <div style={{ color: '#b91c1c', background: '#fef2f2', padding: 10, borderRadius: 8 }}>{msg}</div>}
      {carregando && <div style={{ color: '#64748b' }}>Carregando…</div>}

      {!carregando && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 14, alignItems: 'start' }}>
          {/* ---- Busca / adicionar ---- */}
          <div style={card}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              {empresas.map((e) => (
                <button key={e} onClick={() => setEmpresa(e)} style={{ ...btn, padding: '6px 12px', background: e === empresa ? '#1d4ed8' : '#fff', color: e === empresa ? '#fff' : '#334155', borderColor: e === empresa ? '#1d4ed8' : '#cbd5e1' }}>{e}</button>
              ))}
              <div style={{ position: 'relative', flex: 1 }}>
                <Search size={15} color="#94a3b8" style={{ position: 'absolute', left: 10, top: 9 }} />
                <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar código, descrição ou locação…" style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 8, padding: '7px 10px 7px 32px', fontSize: '.82rem' }} />
              </div>
            </div>
            <div style={{ maxHeight: 420, overflow: 'auto' }}>
              {termo.length < 2 && <div style={{ color: '#94a3b8', fontSize: '.78rem', padding: 8 }}>Digite ao menos 2 letras para buscar.</div>}
              {termo.length >= 2 && resultados.length === 0 && <div style={{ color: '#94a3b8', fontSize: '.78rem', padding: 8 }}>Nada encontrado em {empresa}.</div>}
              {resultados.map((p) => {
                const loc = locacaoDe(p);
                return (
                  <div key={`${p.empresa}|${p.codigo_produto}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderBottom: '1px solid #f1f5f9' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '.8rem' }}>{p.codigo || p.codigo_produto}</div>
                      <div style={{ color: '#64748b', fontSize: '.72rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320 }}>{p.descricao || '—'}{loc && <span style={{ color: '#1d4ed8' }}> · {loc}</span>}</div>
                    </div>
                    <button disabled={ocupado} onClick={() => addFila(p)} style={{ ...btn, marginLeft: 'auto', padding: '5px 10px', fontSize: '.72rem' }}><Plus size={13} /> Fila</button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ---- Fila + impressão ---- */}
          <div style={{ display: 'grid', gap: 14 }}>
            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                <b style={{ color: '#0f172a', fontSize: '.9rem' }}>Fila de impressão ({totalEtiquetas} etiqueta{totalEtiquetas === 1 ? '' : 's'})</b>
                {fila.length > 0 && <button onClick={limpar} style={{ ...btn, marginLeft: 'auto', padding: '4px 10px', fontSize: '.72rem', color: '#b91c1c', borderColor: '#fecaca' }}>Esvaziar</button>}
              </div>
              <div style={{ maxHeight: 300, overflow: 'auto' }}>
                {fila.length === 0 && <div style={{ color: '#94a3b8', fontSize: '.78rem', padding: 8 }}>Fila vazia. Busque peças ao lado (ou marque em Localização) e adicione.</div>}
                {fila.map((it) => {
                  const loc = locacaoDe(idx.get(`${it.empresa}|${it.codigo_produto}`));
                  return (
                    <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderBottom: '1px solid #f1f5f9' }}>
                      <span style={{ fontSize: '.62rem', fontWeight: 800, color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 4, padding: '1px 4px' }}>{it.empresa}</span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '.78rem' }}>{it.codigo || it.codigo_produto}</div>
                        <div style={{ color: '#64748b', fontSize: '.7rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>{it.descricao || '—'}{loc && <span style={{ color: '#1d4ed8' }}> · {loc}</span>}</div>
                      </div>
                      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <button onClick={() => mudarQtd(it, -1)} style={{ ...btn, padding: 4 }}><Minus size={13} /></button>
                        <span style={{ minWidth: 20, textAlign: 'center', fontWeight: 700, fontSize: '.8rem' }}>{it.quantidade}</span>
                        <button onClick={() => mudarQtd(it, 1)} style={{ ...btn, padding: 4 }}><Plus size={13} /></button>
                        <button onClick={() => removerItem(it)} style={{ ...btn, padding: 4, color: '#b91c1c', borderColor: '#fecaca' }}><Trash2 size={13} /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                <label style={{ fontSize: '.74rem', color: '#475569', display: 'flex', alignItems: 'center', gap: 5 }}>
                  Papel
                  <select value={papel} onChange={(e) => setPapel(e.target.value as '3x10' | 'comum')} style={{ border: '1px solid #cbd5e1', borderRadius: 6, padding: '5px 8px', fontSize: '.76rem' }}>
                    <option value="3x10">Adesiva 3×10 (Pimaco 6180)</option>
                    <option value="comum">Comum (tracejado)</option>
                  </select>
                </label>
                <label style={{ fontSize: '.74rem', color: '#475569', display: 'flex', alignItems: 'center', gap: 5 }}>
                  Começar na posição
                  <input type="number" min={1} max={30} value={inicio} onChange={(e) => setInicio(Math.min(30, Math.max(1, Number(e.target.value) || 1)))} style={{ width: 56, border: '1px solid #cbd5e1', borderRadius: 6, padding: '5px 8px', fontSize: '.76rem' }} />
                  <span style={{ color: '#94a3b8' }}>/ 30</span>
                </label>
                <button disabled={ocupado || fila.length === 0} onClick={imprimir} style={{ ...btnPrim, marginLeft: 'auto', opacity: ocupado || fila.length === 0 ? .6 : 1 }}><Printer size={15} /> Imprimir</button>
              </div>
            </div>

            {/* ---- Histórico ---- */}
            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <History size={16} color="#64748b" /><b style={{ color: '#0f172a', fontSize: '.85rem' }}>Histórico de folhas</b>
                <button onClick={carregarFolhas} style={{ ...btn, marginLeft: 'auto', padding: 4 }}><RefreshCw size={13} /></button>
              </div>
              <div style={{ maxHeight: 240, overflow: 'auto' }}>
                {folhas.length === 0 && <div style={{ color: '#94a3b8', fontSize: '.76rem', padding: 8 }}>Nenhuma folha impressa ainda.</div>}
                {folhas.map((f) => (
                  <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderBottom: '1px solid #f1f5f9' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '.76rem' }}>Folha #{f.id} · {f.total_etiquetas} etiq. · {f.papel === 'comum' ? 'comum' : '3×10'}</div>
                      <div style={{ color: '#94a3b8', fontSize: '.68rem' }}>{fmtData(f.criado_em)}{f.criado_nome ? ` · ${f.criado_nome}` : ''}{f.inicio_posicao > 1 ? ` · início ${f.inicio_posicao}` : ''}</div>
                    </div>
                    <button onClick={() => reimprimir(f.id)} style={{ ...btn, marginLeft: 'auto', padding: '4px 10px', fontSize: '.72rem' }}><Printer size={13} /> Reimprimir</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
