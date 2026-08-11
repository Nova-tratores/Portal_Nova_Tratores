'use client';
// Editar a DESCRIÇÃO de produtos. A resumida (`descricao`) é editável inline
// (grava na Omie via AlterarProduto + auditoria); a detalhada (`descr_detalhada`)
// vem da Omie lazy por linha (só leitura). Busca por SKU/descrição, NOVA/CASTRO.
// Padrão herdado de /ajustes/familias e /ajustes/caracteristicas.
//
// Nota: os textos já vêm DECODIFICADOS do servidor (a Omie devolve HTML-escapado;
// o lib decodeOmie trata). Ao gravar, envia-se o texto limpo do input.
import { useState, useCallback, useMemo, Fragment } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import { useAuditLog } from '@/hooks/useAuditLog';
import SemPermissao from '@/components/SemPermissao';

type Conta = 'NOVA' | 'CASTRO';

interface ProdutoDescricao { codigo_produto: number; codigo: string; descricao: string }
interface Detalhe { descricao: string; descr_detalhada: string }

const thStyle: React.CSSProperties = { background: '#f1f5f9', color: '#475569', fontSize: '.65rem', textTransform: 'uppercase', letterSpacing: '.4px', padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', fontWeight: 600, whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 1 };
const tdStyle: React.CSSProperties = { padding: '6px 10px', borderBottom: '1px solid #f1f5f9', color: '#334155', fontSize: '.8rem', verticalAlign: 'top' };

export default function DescricoesPage() {
  const { userProfile } = useAuth();
  const { pode, loading: permLoading } = usePermissoes(userProfile?.id);
  const { log } = useAuditLog();

  const [conta, setConta] = useState<Conta>('NOVA');
  const [q, setQ] = useState('');
  const [produtos, setProdutos] = useState<ProdutoDescricao[]>([]);
  const [filtroCli, setFiltroCli] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [status, setStatus] = useState('');
  const [statusTipo, setStatusTipo] = useState<'ok' | 'erro' | 'info'>('info');

  // edição inline da resumida
  const [editando, setEditando] = useState<number | null>(null);
  const [editVal, setEditVal] = useState('');
  const [salvando, setSalvando] = useState<Set<number>>(new Set());

  // detalhada lazy por linha
  const [detalhes, setDetalhes] = useState<Map<number, Detalhe>>(new Map());
  const [carregandoDet, setCarregandoDet] = useState<Set<number>>(new Set());
  const [expandido, setExpandido] = useState<Set<number>>(new Set());

  const setMsg = useCallback((texto: string, tipo: 'ok' | 'erro' | 'info' = 'info') => { setStatus(texto); setStatusTipo(tipo); }, []);

  const visiveis = useMemo(() => {
    const t = filtroCli.trim().toLowerCase();
    if (!t) return produtos;
    return produtos.filter((p) => p.codigo.toLowerCase().includes(t) || p.descricao.toLowerCase().includes(t));
  }, [produtos, filtroCli]);

  const buscar = useCallback(async () => {
    const termo = q.trim();
    if (!termo) { setMsg('Digite um SKU ou parte da descrição.', 'info'); return; }
    setCarregando(true); setMsg('buscando…', 'info'); setFiltroCli('');
    setEditando(null); setExpandido(new Set());
    try {
      const r = await fetch(`/api/ajustes/descricoes?conta=${conta}&q=${encodeURIComponent(termo)}`);
      const d = await r.json();
      if (d.erro) { setMsg('Erro: ' + d.erro, 'erro'); return; }
      const lista = (d.produtos || []) as ProdutoDescricao[];
      setProdutos(lista);
      setMsg(lista.length ? `${lista.length} produto(s).` : 'Nenhum produto encontrado.', lista.length ? 'ok' : 'info');
    } catch (ex) {
      setMsg('Erro de rede: ' + (ex as Error).message, 'erro');
    } finally {
      setCarregando(false);
    }
  }, [q, conta, setMsg]);

  // ---- edição inline da resumida ----
  const abrirEdicao = useCallback((p: ProdutoDescricao) => {
    setEditando(p.codigo_produto);
    setEditVal(p.descricao);
  }, []);

  const salvar = useCallback(async (p: ProdutoDescricao, valor: string) => {
    const novo = valor.trim();
    setEditando(null);
    if (!novo || novo === p.descricao) return;
    setSalvando((s) => new Set(s).add(p.codigo_produto));
    try {
      const r = await fetch('/api/ajustes/descricoes/produto', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conta, codigo_produto: p.codigo_produto, descricao: novo }),
      });
      const d = await r.json();
      if (d.erro) { setMsg('Erro ao gravar: ' + d.erro, 'erro'); return; }
      const de = p.descricao;
      setProdutos((prev) => prev.map((x) => x.codigo_produto === p.codigo_produto ? { ...x, descricao: d.descricao } : x));
      log({
        sistema: 'ajustes', acao: 'alterar_descricao', entidade: 'produto',
        entidade_id: String(p.codigo_produto), entidade_label: `${p.codigo} — ${d.descricao}`,
        detalhes: { conta, de, para: d.descricao },
      });
      setMsg(`${p.codigo}: descrição atualizada.`, 'ok');
    } catch (ex) {
      setMsg('Erro de rede: ' + (ex as Error).message, 'erro');
    } finally {
      setSalvando((s) => { const n = new Set(s); n.delete(p.codigo_produto); return n; });
    }
  }, [conta, log, setMsg]);

  // ---- detalhada lazy ----
  const toggleDetalhe = useCallback(async (cp: number) => {
    setExpandido((s) => { const n = new Set(s); n.has(cp) ? n.delete(cp) : n.add(cp); return n; });
    if (detalhes.has(cp) || carregandoDet.has(cp)) return; // já temos (ou está a caminho)
    setCarregandoDet((s) => new Set(s).add(cp));
    try {
      const r = await fetch(`/api/ajustes/descricoes/detalhe?conta=${conta}&codigo_produto=${cp}`);
      const d = await r.json();
      if (d.erro) { setMsg('Erro ao ler detalhada: ' + d.erro, 'erro'); return; }
      setDetalhes((prev) => new Map(prev).set(cp, { descricao: d.descricao || '', descr_detalhada: d.descr_detalhada || '' }));
    } catch (ex) {
      setMsg('Erro de rede: ' + (ex as Error).message, 'erro');
    } finally {
      setCarregandoDet((s) => { const n = new Set(s); n.delete(cp); return n; });
    }
  }, [conta, detalhes, carregandoDet, setMsg]);

  if (!permLoading && userProfile && !pode('ajustes', 'descricoes')) return <SemPermissao />;

  const statusColor = statusTipo === 'erro' ? '#dc2626' : statusTipo === 'ok' ? '#047857' : '#64748b';

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 24px' }}>
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>Descrições de produto</h1>
        <p style={{ color: '#64748b', fontSize: '.82rem', maxWidth: 920 }}>
          Edite a <b>descrição resumida</b> de um produto (clique na célula → grava na Omie). Busque por <b>SKU ou descrição</b>.
          Clique em <b>ver detalhada</b> para carregar a <b>descrição detalhada</b> (só leitura, vem da Omie). Cada alteração fica registada.
        </p>
      </div>

      <div style={{ margin: '6px 0 14px', display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: '.8rem' }}>
        <Link href="/ajustes" style={{ color: '#dc2626', textDecoration: 'none', fontWeight: 600 }}>← Ajustes</Link>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <label style={{ display: 'block', fontSize: '.65rem', color: '#64748b', marginBottom: 2 }}>Empresa</label>
          <select value={conta} onChange={(e) => { setConta(e.target.value as Conta); setProdutos([]); setDetalhes(new Map()); setExpandido(new Set()); }}
            style={{ border: '1px solid #cbd5e1', borderRadius: 6, padding: '6px 8px', fontSize: '.82rem', background: '#fff' }}>
            <option value="NOVA">NOVA</option>
            <option value="CASTRO">CASTRO</option>
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 240 }}>
          <label style={{ display: 'block', fontSize: '.65rem', color: '#64748b', marginBottom: 2 }}>Buscar (SKU ou descrição)</label>
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') buscar(); }}
            placeholder="ex: RP-0060, PINO, ARRUELA…" style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 6, padding: '6px 8px', fontSize: '.82rem' }} />
        </div>
        <button onClick={buscar} disabled={carregando} style={{ padding: '7px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontSize: '.82rem', cursor: carregando ? 'wait' : 'pointer', opacity: carregando ? 0.5 : 1 }}>{carregando ? 'Buscando…' : 'Buscar'}</button>
      </div>

      {produtos.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <input value={filtroCli} onChange={(e) => setFiltroCli(e.target.value)}
            placeholder="filtrar resultados (SKU ou descrição)…"
            style={{ width: '100%', maxWidth: 420, border: '1px solid #cbd5e1', borderRadius: 6, padding: '6px 8px', fontSize: '.8rem' }} />
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: '.75rem' }}>
        <span style={{ color: statusColor }}>{status}</span>
        {produtos.length > 0 && (
          <span style={{ marginLeft: 'auto', color: '#64748b' }}>
            {filtroCli.trim() ? `${visiveis.length} de ${produtos.length}` : `${produtos.length}`} produto(s)
          </span>
        )}
      </div>

      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'auto', maxHeight: '68vh' }}>
        {produtos.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
            Busque um produto por <b>SKU</b> ou <b>descrição</b> para começar.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: 130 }}>SKU</th>
                <th style={thStyle}>Descrição (resumida)</th>
                <th style={{ ...thStyle, width: 130 }}>Detalhada</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.length === 0 ? (
                <tr><td colSpan={3} style={{ ...tdStyle, textAlign: 'center', color: '#94a3b8', padding: 24 }}>Nenhum produto bate com o filtro.</td></tr>
              ) : visiveis.map((p) => {
                const emEdicao = editando === p.codigo_produto;
                const salvandoEsta = salvando.has(p.codigo_produto);
                const aberto = expandido.has(p.codigo_produto);
                const det = detalhes.get(p.codigo_produto);
                return (
                  <Fragment key={p.codigo_produto}>
                    <tr style={{ borderTop: '1px solid #f1f5f9' }}>
                      <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '.72rem', whiteSpace: 'nowrap' }}>{p.codigo || '-'}</td>
                      <td style={tdStyle}>
                        {salvandoEsta ? (
                          <span style={{ color: '#94a3b8' }}>gravando…</span>
                        ) : emEdicao ? (
                          <input autoFocus value={editVal} onChange={(e) => setEditVal(e.target.value)}
                            onBlur={() => salvar(p, editVal)}
                            onKeyDown={(e) => { if (e.key === 'Enter') salvar(p, editVal); else if (e.key === 'Escape') setEditando(null); }}
                            style={{ width: '100%', border: '1px solid #60a5fa', borderRadius: 4, padding: '4px 6px', fontSize: '.8rem' }} />
                        ) : (
                          <span onClick={() => abrirEdicao(p)} title="Clique para editar" style={{ cursor: 'pointer', display: 'block', minHeight: 18 }}>
                            {p.descricao || <span style={{ color: '#cbd5e1' }}>—</span>}
                          </span>
                        )}
                      </td>
                      <td style={tdStyle}>
                        <button onClick={() => toggleDetalhe(p.codigo_produto)}
                          style={{ padding: '3px 8px', background: aberto ? '#e0f2fe' : '#f1f5f9', color: '#0369a1', border: 'none', borderRadius: 4, fontSize: '.72rem', cursor: 'pointer' }}>
                          {aberto ? 'ocultar' : 'ver detalhada'}
                        </button>
                      </td>
                    </tr>
                    {aberto && (
                      <tr key={`${p.codigo_produto}-det`} style={{ background: '#f8fafc' }}>
                        <td />
                        <td colSpan={2} style={{ ...tdStyle, whiteSpace: 'pre-wrap' }}>
                          {carregandoDet.has(p.codigo_produto) && !det ? (
                            <span style={{ color: '#94a3b8' }}>carregando detalhada…</span>
                          ) : det ? (
                            <>
                              <div style={{ fontSize: '.62rem', textTransform: 'uppercase', letterSpacing: '.4px', color: '#94a3b8', marginBottom: 3 }}>Descrição detalhada</div>
                              {det.descr_detalhada ? det.descr_detalhada : <span style={{ color: '#cbd5e1' }}>(vazia)</span>}
                            </>
                          ) : (
                            <span style={{ color: '#94a3b8' }}>—</span>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
