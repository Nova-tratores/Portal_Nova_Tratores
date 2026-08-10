'use client';
// Reclassificar a FAMÍLIA de produtos. A família vem do cadastro da Omie e é
// só-leitura no resto do portal (filtro em /omie-massa, base da analítica). Aqui
// busca-se por SKU/descrição e altera-se a família — individual ou em lote —
// gravando na Omie (AlterarProduto) e refletindo no Supabase. Cada alteração é
// auditada (audit_log via useAuditLog). Padrão de edição inline herdado de
// /ajustes/caracteristicas.
import { useState, useCallback, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import { useAuditLog } from '@/hooks/useAuditLog';
import SemPermissao from '@/components/SemPermissao';

type Conta = 'NOVA' | 'CASTRO';

interface FamiliaOpcao { codigo_familia: number; nome: string }
interface ProdutoFamilia {
  codigo_produto: number; codigo: string; descricao: string;
  codigo_familia: number | null; familia_nome: string;
}

// A Omie devolve nomes/descrições com entidades HTML — decodifica p/ exibir.
// (&amp; por último, senão reintroduz as outras.)
function decode(s: string): string {
  return String(s || '')
    .replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

const thStyle: React.CSSProperties = { background: '#f1f5f9', color: '#475569', fontSize: '.65rem', textTransform: 'uppercase', letterSpacing: '.4px', padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', fontWeight: 600, whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 1 };
const tdStyle: React.CSSProperties = { padding: '6px 10px', borderBottom: '1px solid #f1f5f9', color: '#334155', fontSize: '.8rem', verticalAlign: 'middle' };

export default function FamiliasPage() {
  const { userProfile } = useAuth();
  const { pode, loading: permLoading } = usePermissoes(userProfile?.id);
  const { log } = useAuditLog();

  const [conta, setConta] = useState<Conta>('NOVA');
  const [familias, setFamilias] = useState<FamiliaOpcao[]>([]);
  const [q, setQ] = useState('');
  const [produtos, setProdutos] = useState<ProdutoFamilia[]>([]);
  const [filtroCli, setFiltroCli] = useState(''); // filtra os resultados já carregados
  const [modo, setModo] = useState<'busca' | 'sem-familia'>('busca');
  const [carregando, setCarregando] = useState(false);
  const [status, setStatus] = useState('');
  const [statusTipo, setStatusTipo] = useState<'ok' | 'erro' | 'info'>('info');

  const [salvando, setSalvando] = useState<Set<number>>(new Set());
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [familiaLote, setFamiliaLote] = useState('');
  const [aplicandoLote, setAplicandoLote] = useState(false);
  const [progresso, setProgresso] = useState('');

  const setMsg = useCallback((texto: string, tipo: 'ok' | 'erro' | 'info' = 'info') => { setStatus(texto); setStatusTipo(tipo); }, []);

  const nomePorCodigo = useMemo(() => {
    const m = new Map<number, string>();
    familias.forEach((f) => m.set(f.codigo_familia, f.nome));
    return m;
  }, [familias]);

  // Filtro client-side sobre os resultados já carregados (SKU/descrição/família).
  const visiveis = useMemo(() => {
    const t = filtroCli.trim().toLowerCase();
    if (!t) return produtos;
    return produtos.filter((p) =>
      p.codigo.toLowerCase().includes(t) ||
      decode(p.descricao).toLowerCase().includes(t) ||
      decode(p.familia_nome).toLowerCase().includes(t));
  }, [produtos, filtroCli]);

  // Carrega as famílias da conta (para os <select>).
  const carregarFamilias = useCallback(async (c: Conta) => {
    try {
      const r = await fetch(`/api/ajustes/familias?conta=${c}`);
      const d = await r.json();
      if (d.erro) { setMsg('Erro ao carregar famílias: ' + d.erro, 'erro'); return; }
      setFamilias(d.familias || []);
    } catch (ex) {
      setMsg('Erro de rede: ' + (ex as Error).message, 'erro');
    }
  }, [setMsg]);

  useEffect(() => {
    carregarFamilias(conta);
    setProdutos([]); setSelecionados(new Set()); setFamiliaLote(''); setFiltroCli('');
  }, [conta, carregarFamilias]);

  const buscar = useCallback(async () => {
    const termo = q.trim();
    if (!termo) { setMsg('Digite um SKU ou parte da descrição.', 'info'); return; }
    setCarregando(true); setModo('busca'); setMsg('buscando…', 'info'); setSelecionados(new Set()); setFiltroCli('');
    try {
      const r = await fetch(`/api/ajustes/familias?conta=${conta}&q=${encodeURIComponent(termo)}`);
      const d = await r.json();
      if (d.erro) { setMsg('Erro: ' + d.erro, 'erro'); return; }
      if (d.familias) setFamilias(d.familias);
      const lista = (d.produtos || []) as ProdutoFamilia[];
      setProdutos(lista);
      setMsg(lista.length ? `${lista.length} produto(s).` : 'Nenhum produto encontrado.', lista.length ? 'ok' : 'info');
    } catch (ex) {
      setMsg('Erro de rede: ' + (ex as Error).message, 'erro');
    } finally {
      setCarregando(false);
    }
  }, [q, conta, setMsg]);

  // Carrega TODOS os produtos sem família da conta, direto da Omie. A 1ª carga
  // varre a Omie (~1–2 min); depois fica em cache. force=refaz a varredura.
  const verSemFamilia = useCallback(async (force = false) => {
    setCarregando(true); setModo('sem-familia');
    setMsg(force ? 'atualizando (varrendo a Omie)…' : 'carregando produtos sem família (1ª vez varre a Omie, ~1–2 min)…', 'info');
    setSelecionados(new Set()); setFiltroCli(''); setQ('');
    try {
      const r = await fetch(`/api/ajustes/familias?conta=${conta}&sem_familia=1${force ? '&atualizar=1' : ''}`);
      const d = await r.json();
      if (d.erro) { setMsg('Erro: ' + d.erro, 'erro'); return; }
      if (d.familias) setFamilias(d.familias);
      const lista = (d.produtos || []) as ProdutoFamilia[];
      setProdutos(lista);
      setMsg(lista.length ? `${lista.length} produto(s) sem família em ${conta}.` : `Nenhum produto sem família em ${conta}. 🎉`, lista.length ? 'ok' : 'info');
    } catch (ex) {
      setMsg('Erro de rede: ' + (ex as Error).message, 'erro');
    } finally {
      setCarregando(false);
    }
  }, [conta, setMsg]);

  // Grava uma alteração de família (Omie + Supabase) e audita. Devolve true/false.
  const aplicarUm = useCallback(async (p: ProdutoFamilia, codigoFamilia: number): Promise<boolean> => {
    const r = await fetch('/api/ajustes/familias/produto', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conta, codigo_produto: p.codigo_produto, codigo_familia: codigoFamilia }),
    });
    const d = await r.json();
    if (d.erro) throw new Error(d.erro);
    const familiaDe = p.familia_nome || (p.codigo_familia != null ? nomePorCodigo.get(p.codigo_familia) || '' : '');
    setProdutos((prev) => prev.map((x) => x.codigo_produto === p.codigo_produto
      ? { ...x, codigo_familia: d.codigo_familia, familia_nome: d.familia_nome } : x));
    log({
      sistema: 'ajustes', acao: 'alterar_familia', entidade: 'produto',
      entidade_id: String(p.codigo_produto), entidade_label: `${p.codigo} — ${decode(p.descricao)}`,
      detalhes: { conta, familia_de: familiaDe, familia_para: d.familia_nome, codigo_familia: d.codigo_familia },
    });
    return true;
  }, [conta, nomePorCodigo, log]);

  // Alteração individual (troca do <select> na linha).
  const alterarLinha = useCallback(async (p: ProdutoFamilia, codigoFamilia: number) => {
    if (!codigoFamilia || codigoFamilia === p.codigo_familia) return;
    setSalvando((s) => new Set(s).add(p.codigo_produto));
    try {
      await aplicarUm(p, codigoFamilia);
      setMsg(`${p.codigo}: família → ${nomePorCodigo.get(codigoFamilia) || codigoFamilia}`, 'ok');
    } catch (ex) {
      setMsg(`Erro ao gravar ${p.codigo}: ${(ex as Error).message}`, 'erro');
    } finally {
      setSalvando((s) => { const n = new Set(s); n.delete(p.codigo_produto); return n; });
    }
  }, [aplicarUm, nomePorCodigo, setMsg]);

  // Aplicação em lote aos selecionados.
  const aplicarLote = useCallback(async () => {
    const cf = Number(familiaLote);
    if (!cf) { setMsg('Escolha a família a aplicar.', 'info'); return; }
    const alvo = produtos.filter((p) => selecionados.has(p.codigo_produto) && p.codigo_familia !== cf);
    if (!alvo.length) { setMsg('Nenhum produto selecionado (ou todos já nessa família).', 'info'); return; }
    const nomeFam = nomePorCodigo.get(cf) || String(cf);
    if (!confirm(`Aplicar a família "${nomeFam}" a ${alvo.length} produto(s) na Omie (${conta})?`)) return;
    setAplicandoLote(true);
    let ok = 0, falhas = 0, primeiraFalha = '';
    for (let i = 0; i < alvo.length; i++) {
      const p = alvo[i];
      setProgresso(`aplicando… ${i + 1}/${alvo.length} (${p.codigo})`);
      setSalvando((s) => new Set(s).add(p.codigo_produto));
      try {
        await aplicarUm(p, cf);
        ok++;
      } catch (ex) {
        falhas++; if (!primeiraFalha) primeiraFalha = (ex as Error).message;
      } finally {
        setSalvando((s) => { const n = new Set(s); n.delete(p.codigo_produto); return n; });
      }
      await new Promise((r) => setTimeout(r, 200)); // rate limit da Omie
    }
    setProgresso('');
    setAplicandoLote(false);
    setSelecionados(new Set());
    let msg = `Aplicados ${ok}/${alvo.length}`;
    if (falhas) msg += ` · ${falhas} falha(s)${primeiraFalha ? ': ' + primeiraFalha.slice(0, 120) : ''}`;
    setMsg(msg, falhas ? 'erro' : 'ok');
  }, [familiaLote, produtos, selecionados, nomePorCodigo, conta, aplicarUm, setMsg]);

  const toggleSel = useCallback((cp: number) => {
    setSelecionados((s) => { const n = new Set(s); n.has(cp) ? n.delete(cp) : n.add(cp); return n; });
  }, []);
  const marcarTodos = useCallback((on: boolean) => {
    setSelecionados(on ? new Set(visiveis.map((p) => p.codigo_produto)) : new Set());
  }, [visiveis]);

  if (!permLoading && userProfile && !pode('ajustes', 'familias')) return <SemPermissao />;

  const statusColor = statusTipo === 'erro' ? '#dc2626' : statusTipo === 'ok' ? '#047857' : '#64748b';
  const todosMarcados = visiveis.length > 0 && visiveis.every((p) => selecionados.has(p.codigo_produto));

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 24px' }}>
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>Família por produto</h1>
        <p style={{ color: '#64748b', fontSize: '.82rem', maxWidth: 920 }}>
          Reclassifique a <b>família</b> de um produto. Busque por <b>SKU ou descrição</b>, escolha a nova família na
          coluna à direita (ou selecione vários e aplique <b>em lote</b>). A alteração é <b>gravada na Omie</b> e refletida
          no portal. A família é a base da analítica (máquina/peça, dashboards, DRE), por isso cada mudança fica registada.
          <br />Use <b>Ver sem família</b> para listar (direto da Omie) os produtos ainda <b>sem família</b> — são os que
          aparecem como <b>&quot;#N/D&quot;</b> nas vendas. A 1ª carga varre a Omie (~1–2 min) e depois fica em cache.
        </p>
      </div>

      <div style={{ margin: '6px 0 14px', display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: '.8rem' }}>
        <Link href="/ajustes" style={{ color: '#dc2626', textDecoration: 'none', fontWeight: 600 }}>← Ajustes</Link>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <label style={{ display: 'block', fontSize: '.65rem', color: '#64748b', marginBottom: 2 }}>Empresa</label>
          <select value={conta} onChange={(e) => setConta(e.target.value as Conta)} style={{ border: '1px solid #cbd5e1', borderRadius: 6, padding: '6px 8px', fontSize: '.82rem', background: '#fff' }}>
            <option value="NOVA">NOVA</option>
            <option value="CASTRO">CASTRO</option>
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 240 }}>
          <label style={{ display: 'block', fontSize: '.65rem', color: '#64748b', marginBottom: 2 }}>Buscar (SKU ou descrição)</label>
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') buscar(); }}
            placeholder="ex: RP-0060, POLIA, ROLO FACA…" style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 6, padding: '6px 8px', fontSize: '.82rem' }} />
        </div>
        <button onClick={buscar} disabled={carregando} style={{ padding: '7px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontSize: '.82rem', cursor: carregando ? 'wait' : 'pointer', opacity: carregando ? 0.5 : 1 }}>{carregando ? 'Buscando…' : 'Buscar'}</button>
        <button onClick={() => verSemFamilia(false)} disabled={carregando} title="Varre a Omie e lista todos os produtos sem família (codigo_familia vazio) da empresa selecionada — a 1ª vez leva ~1–2 min, depois fica em cache"
          style={{ padding: '7px 14px', background: '#fff', color: '#b45309', border: '1px solid #f59e0b', borderRadius: 6, fontSize: '.82rem', cursor: carregando ? 'wait' : 'pointer', opacity: carregando ? 0.5 : 1, fontWeight: 600 }}>
          Ver sem família
        </button>
        {modo === 'sem-familia' && produtos.length > 0 && (
          <button onClick={() => verSemFamilia(true)} disabled={carregando} title="Refazer a varredura na Omie (ignora o cache)"
            style={{ padding: '7px 10px', background: '#fff', color: '#64748b', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '.82rem', cursor: carregando ? 'wait' : 'pointer', opacity: carregando ? 0.5 : 1 }}>
            ↻ atualizar
          </button>
        )}
      </div>

      {/* Filtro dos resultados carregados */}
      {produtos.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <input value={filtroCli} onChange={(e) => setFiltroCli(e.target.value)}
            placeholder="filtrar resultados (SKU, descrição ou família)…"
            style={{ width: '100%', maxWidth: 420, border: '1px solid #cbd5e1', borderRadius: 6, padding: '6px 8px', fontSize: '.8rem' }} />
        </div>
      )}

      {/* Ações em lote */}
      {produtos.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10, padding: '8px 10px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
          <span style={{ fontSize: '.75rem', color: '#475569' }}><b>{selecionados.size}</b> selecionado(s)</span>
          <span style={{ color: '#cbd5e1' }}>·</span>
          <label style={{ fontSize: '.72rem', color: '#64748b' }}>Aplicar família:</label>
          <select value={familiaLote} onChange={(e) => setFamiliaLote(e.target.value)} style={{ border: '1px solid #cbd5e1', borderRadius: 6, padding: '5px 8px', fontSize: '.8rem', background: '#fff', minWidth: 200 }}>
            <option value="">— escolha —</option>
            {familias.map((f) => <option key={f.codigo_familia} value={f.codigo_familia}>{decode(f.nome)}</option>)}
          </select>
          <button onClick={aplicarLote} disabled={aplicandoLote || !selecionados.size || !familiaLote}
            style={{ padding: '6px 12px', background: '#059669', color: '#fff', border: 'none', borderRadius: 6, fontSize: '.8rem', cursor: 'pointer', opacity: (aplicandoLote || !selecionados.size || !familiaLote) ? 0.5 : 1 }}>
            {aplicandoLote ? 'Aplicando…' : 'Aplicar aos selecionados'}
          </button>
          {progresso && <span style={{ fontSize: '.72rem', color: '#b45309' }}>{progresso}</span>}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: '.75rem' }}>
        <span style={{ color: statusColor }}>{status}</span>
        {produtos.length > 0 && (
          <span style={{ marginLeft: 'auto', color: '#64748b' }}>
            {modo === 'sem-familia' ? 'Sem família' : 'Busca'}
            {filtroCli.trim() ? ` · ${visiveis.length} de ${produtos.length}` : ` · ${produtos.length}`} produto(s)
          </span>
        )}
      </div>

      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'auto', maxHeight: '68vh' }}>
        {produtos.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
            Busque por <b>SKU</b>/<b>descrição</b> ou clique em <b>Ver sem família</b> para listar os produtos por classificar.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: 30, textAlign: 'center' }}>
                  <input type="checkbox" checked={todosMarcados} onChange={(e) => marcarTodos(e.target.checked)} title="Marcar todos" />
                </th>
                <th style={thStyle}>SKU</th>
                <th style={thStyle}>Descrição</th>
                <th style={thStyle}>Família atual</th>
                <th style={thStyle}>Alterar para</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.length === 0 ? (
                <tr><td colSpan={5} style={{ ...tdStyle, textAlign: 'center', color: '#94a3b8', padding: 24 }}>Nenhum produto bate com o filtro.</td></tr>
              ) : visiveis.map((p) => {
                const salvandoEsta = salvando.has(p.codigo_produto);
                return (
                  <tr key={p.codigo_produto} style={{ borderTop: '1px solid #f1f5f9', background: selecionados.has(p.codigo_produto) ? '#f0f9ff' : undefined }}>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <input type="checkbox" checked={selecionados.has(p.codigo_produto)} onChange={() => toggleSel(p.codigo_produto)} />
                    </td>
                    <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '.72rem', whiteSpace: 'nowrap' }}>{p.codigo || '-'}</td>
                    <td style={tdStyle}>{decode(p.descricao) || '-'}</td>
                    <td style={{ ...tdStyle, color: p.familia_nome ? '#334155' : '#cbd5e1' }}>{decode(p.familia_nome) || '—'}</td>
                    <td style={tdStyle}>
                      {salvandoEsta ? (
                        <span style={{ color: '#94a3b8', fontSize: '.78rem' }}>gravando…</span>
                      ) : (
                        <select value={p.codigo_familia ?? ''} onChange={(e) => alterarLinha(p, Number(e.target.value))}
                          style={{ width: '100%', minWidth: 190, border: '1px solid #cbd5e1', borderRadius: 4, padding: '3px 6px', fontSize: '.78rem', background: '#fff' }}>
                          {(p.codigo_familia == null || !nomePorCodigo.has(p.codigo_familia)) && (
                            <option value={p.codigo_familia ?? ''}>{p.familia_nome ? decode(p.familia_nome) : '—'} (atual)</option>
                          )}
                          {familias.map((f) => <option key={f.codigo_familia} value={f.codigo_familia}>{decode(f.nome)}</option>)}
                        </select>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
