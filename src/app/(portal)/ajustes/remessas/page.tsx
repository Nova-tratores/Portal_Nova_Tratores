'use client';
// Remessas em aberto (nao canceladas/faturadas) direto da Omie, com origem
// (OS que gerou a remessa), quem criou (uInc da OS) e vendedor. Consome
// /api/ajustes/remessas. Fechar em massa = devolucao integral via
// DevolverRemessa (job em background /devolver-lote + polling /devolver-status).
// Mesmo padrao visual de /ajustes/pedidos.
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';
import { useConta } from '@/components/estoque/ContaProvider';
import ContaSelector from '@/components/estoque/ContaSelector';

// ---------- tipos (espelham lib/ajustes/remessas.ts) ----------
interface ItemRemessa {
  codProduto: string; descricao: string; qtde: number; valorUnit: number; valorTotal: number; cfop: string;
}
interface Remessa {
  idRemessa: number; numero: string; codIntRem: string;
  dataPrevisao: string | null; diasAberto: number | null;
  codigoCliente: number | null; nomeCliente: string | null; cnpjCliente: string | null;
  numeroOS: string | null; origem: 'OS' | 'Manual';
  criadoPorLogin: string | null; criadoPorNome: string | null; dataCriacaoOS: string | null;
  codVendedor: string | null; vendedorNome: string | null;
  valorTotal: number; qtdItens: number; itens: ItemRemessa[]; obs: string;
}
interface RemessasPayload {
  conta?: string; total?: number; totalOmie?: number; remessas?: Remessa[];
  fonte?: string; duracaoMs?: number; cachedEm?: string; erro?: string;
}
interface ResultadoDevolucao {
  idRemessa: number; numero: string; valorTotal: number; numeroOS: string | null;
  ok: boolean; nIdDevolucao?: number | null; erro?: string;
}
interface StatusLote {
  rodando: boolean; semDados?: boolean; pronto?: boolean; erro?: string; etapa?: string;
  progresso?: { feito?: number; total?: number; ok?: number; erro?: number } | null;
  total?: number | null; devolvidas?: number | null; falhas?: number | null;
  abortadoPorBloqueio?: boolean; valorDevolvido?: number | null;
  resultados?: ResultadoDevolucao[]; jobId?: number;
}

// ---------- helpers ----------
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
function fmtBRL(n: number | null | undefined): string {
  if (n == null || isNaN(Number(n))) return '-';
  return brl.format(Number(n));
}
function fmtNum(n: number | null | undefined, dec = 0): string {
  if (n == null || isNaN(Number(n))) return '-';
  return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

const thStyle: React.CSSProperties = { background: '#f8fafc', color: '#475569', fontSize: '.65rem', textTransform: 'uppercase', letterSpacing: '.4px', padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', fontWeight: 600, whiteSpace: 'nowrap' };
const tdStyle: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid #f1f5f9', color: '#334155', fontSize: '.82rem' };
const thSort: React.CSSProperties = { ...thStyle, cursor: 'pointer', userSelect: 'none' };
const thSortR: React.CSSProperties = { ...thStyle, cursor: 'pointer', userSelect: 'none', textAlign: 'right' };
const thFiltroStyle: React.CSSProperties = { background: '#f8fafc', padding: '0 6px 6px', borderBottom: '1px solid #e2e8f0' };
const filtroInput: React.CSSProperties = { width: '100%', minWidth: 60, border: '1px solid #cbd5e1', borderRadius: 4, padding: '3px 6px', fontSize: '.72rem', fontWeight: 400 };

// Acessores de coluna (ordenacao + filtro), padrao da tela de pedidos.
const ACESSO: Record<string, (r: Remessa) => string | number> = {
  numero: (r) => Number(r.numero) || r.numero || '',
  data: (r) => { const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(r.dataPrevisao || ''); return m ? new Date(+m[3], +m[2] - 1, +m[1]).getTime() : 0; },
  dias: (r) => r.diasAberto ?? -1,
  cliente: (r) => r.nomeCliente || ('cli #' + (r.codigoCliente || '')),
  origem: (r) => r.numeroOS ? 'OS ' + r.numeroOS : 'Manual',
  criadoPor: (r) => r.criadoPorNome || r.criadoPorLogin || '',
  vendedor: (r) => r.vendedorNome || r.codVendedor || '',
  itens: (r) => r.qtdItens,
  valor: (r) => r.valorTotal || 0,
};

export default function RemessasPage() {
  const { userProfile } = useAuth();
  const { pode, loading: permLoading } = usePermissoes(userProfile?.id);
  const { conta, contaParam } = useConta();

  const [dados, setDados] = useState<RemessasPayload | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [erro, setErro] = useState('');
  const [detalheSel, setDetalheSel] = useState<Remessa | null>(null);

  // devolucao em massa
  const podeFechar = pode('ajustes', 'remessas:fechar');
  const [selecao, setSelecao] = useState<Set<number>>(new Set());
  const [modalDevolver, setModalDevolver] = useState(false);
  const [iniciandoLote, setIniciandoLote] = useState(false);
  const [modalStatus, setModalStatus] = useState('');
  const [lote, setLote] = useState<StatusLote | null>(null);
  const [pollKey, setPollKey] = useState(0);
  const rodandoRef = useRef(false);

  const [ordem, setOrdem] = useState<{ col: string; dir: 'asc' | 'desc' } | null>(null);
  const [filtros, setFiltros] = useState<Record<string, string>>({});
  const toggleOrdem = useCallback((col: string) => {
    setOrdem((o) => (o && o.col === col ? (o.dir === 'asc' ? { col, dir: 'desc' } : null) : { col, dir: 'asc' }));
  }, []);
  const setaCol = (col: string) => (ordem?.col === col ? (ordem.dir === 'asc' ? ' ▲' : ' ▼') : '');

  const buscar = useCallback(async (force: boolean) => {
    if (!conta) return;
    setCarregando(true); setErro('');
    setStatusMsg(force ? 'atualizando na Omie (pode levar alguns minutos)...' : 'buscando...');
    try {
      let qs = contaParam.replace(/^&/, '');
      if (force) qs += '&force=1';
      const r = await fetch(`/api/ajustes/remessas?${qs}`);
      const d = (await r.json()) as RemessasPayload;
      if (d.erro) { setErro(d.erro); setStatusMsg(''); return; }
      setDados(d);
      setStatusMsg(`${fmtNum(d.total)} remessa(s) em aberto de ${fmtNum(d.totalOmie)} na Omie${d.fonte === 'cache' ? ' (cache)' : ''}${d.duracaoMs ? ' · ' + (d.duracaoMs / 1000).toFixed(1) + 's' : ''}`);
    } catch (ex) {
      setErro('erro de rede: ' + (ex as Error).message); setStatusMsg('');
    } finally { setCarregando(false); }
  }, [conta, contaParam]);

  useEffect(() => {
    if (conta) buscar(false);
    else { setDados(null); setStatusMsg(''); }
    setSelecao(new Set());
    setLote(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conta]);

  // ---- devolucao em massa: status do job + polling ----

  const checarLote = useCallback(async (): Promise<boolean> => {
    if (!conta) return false;
    try {
      const r = await fetch(`/api/ajustes/remessas/devolver-status?${contaParam.replace(/^&/, '')}`);
      const d = (await r.json()) as StatusLote;
      if (d.semDados) { setLote(null); rodandoRef.current = false; return false; }
      setLote(d);
      // terminou agora (estava rodando nesta sessao): tira as devolvidas da lista
      if (rodandoRef.current && !d.rodando && d.pronto) {
        const okIds = new Set((d.resultados || []).filter((x) => x.ok).map((x) => x.idRemessa));
        if (okIds.size > 0) {
          setDados((prev) => {
            if (!prev) return prev;
            const restantes = (prev.remessas || []).filter((rem) => !okIds.has(rem.idRemessa));
            return { ...prev, total: restantes.length, remessas: restantes };
          });
        }
        setSelecao(new Set());
      }
      rodandoRef.current = !!d.rodando;
      return !!d.rodando;
    } catch { return false; }
  }, [conta, contaParam]);

  useEffect(() => {
    let vivo = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      const rodando = await checarLote();
      if (vivo && rodando) timer = setTimeout(tick, 3000);
    };
    tick();
    return () => { vivo = false; if (timer) clearTimeout(timer); };
  }, [checarLote, pollKey]);

  const confirmarDevolucao = useCallback(async () => {
    if (!conta || selecao.size === 0) return;
    setIniciandoLote(true); setModalStatus('iniciando...');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch('/api/ajustes/remessas/devolver-lote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({ conta, ids: [...selecao] }),
      });
      const d = await resp.json();
      if (!resp.ok || d.erro) { setModalStatus(d.erro || 'falhou'); return; }
      setModalDevolver(false); setModalStatus('');
      setLote({ rodando: true, etapa: d.jaRodando ? 'ja havia um lote em andamento' : 'iniciando' });
      rodandoRef.current = true;
      setPollKey((k) => k + 1); // liga o polling
    } catch (ex) {
      setModalStatus('erro de rede: ' + (ex as Error).message);
    } finally { setIniciandoLote(false); }
  }, [conta, selecao]);

  const loteRodando = !!lote?.rodando;

  const toggleSel = useCallback((id: number) => {
    setSelecao((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }, []);

  const rems = useMemo(() => dados?.remessas || [], [dados]);
  const remsView = useMemo(() => {
    let arr = rems.slice();
    for (const [col, termo] of Object.entries(filtros)) {
      const t = (termo || '').trim().toLowerCase();
      if (!t) continue;
      const acc = ACESSO[col];
      if (!acc) continue;
      arr = arr.filter((r) => String(acc(r)).toLowerCase().includes(t));
    }
    if (ordem) {
      const acc = ACESSO[ordem.col];
      if (acc) {
        arr = arr.slice().sort((a, b) => {
          const va = acc(a), vb = acc(b);
          const c = (typeof va === 'number' && typeof vb === 'number') ? va - vb : String(va).localeCompare(String(vb), 'pt-BR');
          return ordem.dir === 'asc' ? c : -c;
        });
      }
    }
    return arr;
  }, [rems, filtros, ordem]);

  const resumo = useMemo(() => {
    const total = remsView.reduce((s, r) => s + (r.valorTotal || 0), 0);
    const deOS = remsView.filter((r) => r.origem === 'OS').length;
    return { valor: total, deOS, manuais: remsView.length - deOS };
  }, [remsView]);

  const valorSelecionado = useMemo(
    () => rems.filter((r) => selecao.has(r.idRemessa)).reduce((s, r) => s + (r.valorTotal || 0), 0),
    [rems, selecao],
  );
  const todasFiltradasSel = remsView.length > 0 && remsView.every((r) => selecao.has(r.idRemessa));
  const toggleTodasFiltradas = useCallback(() => {
    setSelecao((s) => {
      const n = new Set(s);
      if (remsView.length > 0 && remsView.every((r) => n.has(r.idRemessa))) {
        remsView.forEach((r) => n.delete(r.idRemessa));
      } else {
        remsView.forEach((r) => n.add(r.idRemessa));
      }
      return n;
    });
  }, [remsView]);

  if (!permLoading && userProfile && !pode('ajustes', 'remessas')) return <SemPermissao />;

  return (
    <div style={{ maxWidth: 1300, margin: '0 auto', padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>Remessas em aberto</h1>
          <p style={{ color: '#64748b', fontSize: '.82rem', maxWidth: 760 }}>
            Conta <b>{conta ? conta.toUpperCase() : '—'}</b>. Remessas nao canceladas e nao faturadas, direto da Omie.
            Quando a remessa foi gerada a partir de uma <b>OS</b>, mostramos a OS de origem e quem a criou
            (a API da Omie nao informa o criador da remessa em si).
          </p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => buscar(false)} disabled={carregando || !conta} style={{ padding: '7px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontSize: '.82rem', cursor: 'pointer', opacity: carregando || !conta ? 0.5 : 1 }}>Buscar</button>
          <button onClick={() => buscar(true)} disabled={carregando || !conta} title="Refaz a busca completa na Omie ignorando o cache (lento: pagina todas as remessas e OSs)" style={{ padding: '7px 14px', background: '#e2e8f0', color: '#334155', border: 'none', borderRadius: 6, fontSize: '.82rem', cursor: 'pointer', opacity: carregando || !conta ? 0.5 : 1 }}>Atualizar</button>
          <ContaSelector />
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: '.72rem' }}>
        <span style={{ padding: '3px 8px', borderRadius: 6, background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8' }}>
          {fmtNum(remsView.length)} remessa(s) · {fmtBRL(resumo.valor)}
        </span>
        <span style={{ padding: '3px 8px', borderRadius: 6, background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534' }}>
          {fmtNum(resumo.deOS)} de OS
        </span>
        <span style={{ padding: '3px 8px', borderRadius: 6, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' }}>
          {fmtNum(resumo.manuais)} manual(is)
        </span>
        <span style={{ marginLeft: 'auto', color: '#64748b' }}>{carregando ? 'Carregando… (a 1ª busca pagina a Omie inteira e pode levar alguns minutos)' : statusMsg}</span>
      </div>

      {erro && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: '.82rem' }}>{erro}</div>}

      {/* Barra de acao da selecao (devolucao em massa) */}
      {podeFechar && selecao.size > 0 && !loteRodando && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: '.8rem', color: '#9a3412' }}>
          <b>{fmtNum(selecao.size)} remessa(s) selecionada(s)</b> · {fmtBRL(valorSelecionado)}
          <button onClick={() => { setModalStatus(''); setModalDevolver(true); }} style={{ padding: '6px 14px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, fontSize: '.8rem', cursor: 'pointer', fontWeight: 600 }}>Devolver selecionadas</button>
          <button onClick={() => setSelecao(new Set())} style={{ padding: '6px 10px', background: 'transparent', color: '#9a3412', border: '1px solid #fdba74', borderRadius: 6, fontSize: '.76rem', cursor: 'pointer' }}>Limpar seleção</button>
        </div>
      )}

      {/* Progresso do lote em andamento */}
      {loteRodando && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: '.82rem', color: '#1d4ed8' }}>
          <span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid #93c5fd', borderTopColor: '#1d4ed8', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          <b>Devolvendo em lote…</b> {lote?.etapa || ''}
          {lote?.progresso?.total ? <span style={{ color: '#64748b' }}>({fmtNum(lote?.progresso?.feito)}/{fmtNum(lote?.progresso?.total)})</span> : null}
          <style>{'@keyframes spin{to{transform:rotate(360deg)}}'}</style>
        </div>
      )}

      {/* Resultado do ultimo lote (dispensavel) */}
      {!loteRodando && lote?.pronto && (
        <div style={{ background: (lote.falhas || 0) > 0 ? '#fffbeb' : '#f0fdf4', border: `1px solid ${(lote.falhas || 0) > 0 ? '#fde68a' : '#bbf7d0'}`, borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: '.8rem', color: '#334155' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <b>Lote concluído:</b> {fmtNum(lote.devolvidas)} devolvida(s) de {fmtNum(lote.total)} · {fmtBRL(lote.valorDevolvido)}
            {(lote.falhas || 0) > 0 && <span style={{ color: '#b45309' }}>· {fmtNum(lote.falhas)} falha(s)</span>}
            {lote.abortadoPorBloqueio && <span style={{ color: '#b91c1c' }}>· interrompido: a Omie bloqueou a API — rode o restante mais tarde</span>}
            <button onClick={() => setLote(null)} style={{ marginLeft: 'auto', padding: '4px 10px', background: '#e2e8f0', color: '#334155', border: 'none', borderRadius: 6, fontSize: '.74rem', cursor: 'pointer' }}>Dispensar</button>
          </div>
          {(lote.resultados || []).some((x) => !x.ok) && (
            <div style={{ marginTop: 8, maxHeight: 160, overflowY: 'auto', fontSize: '.74rem' }}>
              {(lote.resultados || []).filter((x) => !x.ok).map((x, i) => (
                <div key={i} style={{ padding: '2px 0', color: '#b45309' }}>
                  <span style={{ fontFamily: 'monospace' }}>#{x.numero || x.idRemessa}</span> — {x.erro || 'erro'}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {!loteRodando && lote?.erro && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: '.8rem', display: 'flex', gap: 10 }}>
          <span><b>Devolução em lote:</b> {lote.erro}</span>
          <button onClick={() => setLote(null)} style={{ marginLeft: 'auto', padding: '4px 10px', background: '#e2e8f0', color: '#334155', border: 'none', borderRadius: 6, fontSize: '.74rem', cursor: 'pointer' }}>Dispensar</button>
        </div>
      )}

      {!conta ? (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: 8, padding: 16, fontSize: '.85rem' }}>
          Esta tela precisa de uma conta especifica para listar as remessas. Selecione <b>NOVA</b> ou <b>CASTRO</b> no menu acima.
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {podeFechar && (
                    <th style={{ ...thStyle, width: 34, textAlign: 'center' }} title="Selecionar todas as remessas filtradas">
                      <input type="checkbox" checked={todasFiltradasSel} onChange={toggleTodasFiltradas} disabled={loteRodando || remsView.length === 0} style={{ cursor: 'pointer' }} />
                    </th>
                  )}
                  <th style={thSort} onClick={() => toggleOrdem('numero')}>Numero{setaCol('numero')}</th>
                  <th style={thSort} onClick={() => toggleOrdem('data')}>Previsao{setaCol('data')}</th>
                  <th style={thSortR} onClick={() => toggleOrdem('dias')}>Dias{setaCol('dias')}</th>
                  <th style={thSort} onClick={() => toggleOrdem('cliente')}>Destinatario{setaCol('cliente')}</th>
                  <th style={thSort} onClick={() => toggleOrdem('origem')}>Origem{setaCol('origem')}</th>
                  <th style={thSort} onClick={() => toggleOrdem('criadoPor')}>Criado por (OS){setaCol('criadoPor')}</th>
                  <th style={thSort} onClick={() => toggleOrdem('vendedor')}>Vendedor{setaCol('vendedor')}</th>
                  <th style={thSortR} onClick={() => toggleOrdem('itens')}>Itens{setaCol('itens')}</th>
                  <th style={thSortR} onClick={() => toggleOrdem('valor')}>Valor{setaCol('valor')}</th>
                </tr>
                <tr>
                  {podeFechar && <th style={thFiltroStyle}></th>}
                  <th style={thFiltroStyle}><input value={filtros.numero || ''} onChange={(e) => setFiltros((f) => ({ ...f, numero: e.target.value }))} placeholder="filtrar…" style={filtroInput} /></th>
                  <th style={thFiltroStyle}></th>
                  <th style={thFiltroStyle}></th>
                  <th style={thFiltroStyle}><input value={filtros.cliente || ''} onChange={(e) => setFiltros((f) => ({ ...f, cliente: e.target.value }))} placeholder="filtrar…" style={filtroInput} /></th>
                  <th style={thFiltroStyle}><input value={filtros.origem || ''} onChange={(e) => setFiltros((f) => ({ ...f, origem: e.target.value }))} placeholder="os / manual" style={filtroInput} /></th>
                  <th style={thFiltroStyle}><input value={filtros.criadoPor || ''} onChange={(e) => setFiltros((f) => ({ ...f, criadoPor: e.target.value }))} placeholder="filtrar…" style={filtroInput} /></th>
                  <th style={thFiltroStyle}><input value={filtros.vendedor || ''} onChange={(e) => setFiltros((f) => ({ ...f, vendedor: e.target.value }))} placeholder="filtrar…" style={filtroInput} /></th>
                  <th style={thFiltroStyle}></th>
                  <th style={thFiltroStyle}></th>
                </tr>
              </thead>
              <tbody>
                {!dados ? (
                  <tr><td colSpan={podeFechar ? 10 : 9} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>{carregando ? 'Buscando na Omie… a primeira busca pode levar alguns minutos.' : <>Clique em <b>Buscar</b> para listar as remessas em aberto.</>}</td></tr>
                ) : rems.length === 0 ? (
                  <tr><td colSpan={podeFechar ? 10 : 9} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Nenhuma remessa em aberto.</td></tr>
                ) : remsView.length === 0 ? (
                  <tr><td colSpan={podeFechar ? 10 : 9} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Nenhuma remessa corresponde ao filtro.</td></tr>
                ) : (
                  remsView.map((r, i) => {
                    const corDias = r.diasAberto != null && r.diasAberto >= 90 ? { color: '#b91c1c', fontWeight: 600 } : r.diasAberto != null && r.diasAberto >= 30 ? { color: '#b45309' } : {};
                    return (
                      <tr key={r.idRemessa ?? i} onClick={() => setDetalheSel(r)} style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer', background: selecao.has(r.idRemessa) ? '#fff7ed' : undefined }} title="Ver detalhes da remessa">
                        {podeFechar && (
                          <td style={{ ...tdStyle, textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                            <input type="checkbox" checked={selecao.has(r.idRemessa)} onChange={() => toggleSel(r.idRemessa)} disabled={loteRodando} style={{ cursor: 'pointer' }} />
                          </td>
                        )}
                        <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{r.numero || '?'}</td>
                        <td style={{ ...tdStyle, fontSize: '.72rem' }}>{r.dataPrevisao || ''}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontSize: '.72rem', ...corDias }}>{r.diasAberto != null ? r.diasAberto : '-'}</td>
                        <td style={{ ...tdStyle, fontSize: '.78rem' }}>{r.nomeCliente || ('cli #' + (r.codigoCliente || '?'))}</td>
                        <td style={tdStyle}>
                          {r.numeroOS ? (
                            <span style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 4, fontSize: '.7rem', background: '#d1fae5', color: '#065f46' }}>OS nº {r.numeroOS}</span>
                          ) : (
                            <span style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 4, fontSize: '.7rem', background: '#f1f5f9', color: '#64748b' }}>Manual</span>
                          )}
                        </td>
                        <td style={{ ...tdStyle, fontSize: '.72rem' }} title={r.dataCriacaoOS ? 'OS criada em ' + r.dataCriacaoOS : ''}>{r.criadoPorNome || r.criadoPorLogin || '-'}</td>
                        <td style={{ ...tdStyle, fontSize: '.72rem' }}>{r.vendedorNome || (r.codVendedor ? '#' + r.codVendedor : '-')}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{r.qtdItens}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtBRL(r.valorTotal)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal de confirmacao da devolucao em massa */}
      {modalDevolver && (
        <div onClick={() => !iniciandoLote && setModalDevolver(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 10, width: '100%', maxWidth: 560, display: 'flex', flexDirection: 'column', boxShadow: '0 10px 40px rgba(0,0,0,.25)' }}>
            <div style={{ borderBottom: '1px solid #e2e8f0', padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontWeight: 600, color: '#1e293b', fontSize: '.95rem', margin: 0 }}>Devolver {fmtNum(selecao.size)} remessa(s)</h2>
              <button onClick={() => setModalDevolver(false)} disabled={iniciandoLote} style={{ background: 'none', border: 'none', fontSize: '1.5rem', lineHeight: 1, color: '#64748b', cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ padding: 18, fontSize: '.82rem' }}>
              <div style={{ marginBottom: 10, fontSize: '.78rem', color: '#475569' }}>
                Conta <b>{conta?.toUpperCase()}</b> · <b>{fmtNum(selecao.size)}</b> remessa(s) · valor total <b>{fmtBRL(valorSelecionado)}</b>
              </div>
              <div style={{ marginBottom: 12, fontSize: '.76rem', color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: 10 }}>
                A ação registra a <b>devolução INTEGRAL</b> de cada remessa no Omie (DevolverRemessa):
                as peças <b>voltam ao estoque</b>, a remessa sai das pendentes e é gerado um registro de
                devolução. <b>Irreversível pelo app.</b> O processo roda em segundo plano
                (~{Math.max(1, Math.ceil(selecao.size * 1.6 / 60))} min) e fica registrado na auditoria.
              </div>
              <div style={{ fontSize: '.72rem', color: '#64748b' }}>
                Dica: na primeira vez, rode com <b>1 remessa</b> de baixo valor e confira no Omie (estoque + status) antes de liberar o lote inteiro.
              </div>
            </div>
            <div style={{ borderTop: '1px solid #e2e8f0', padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '.72rem', color: '#dc2626', marginRight: 'auto' }}>{modalStatus}</span>
              <button onClick={() => setModalDevolver(false)} disabled={iniciandoLote} style={{ padding: '6px 14px', fontSize: '.82rem', background: '#e2e8f0', color: '#334155', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={confirmarDevolucao} disabled={iniciandoLote} style={{ padding: '6px 14px', fontSize: '.82rem', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, cursor: iniciandoLote ? 'wait' : 'pointer', opacity: iniciandoLote ? 0.6 : 1, fontWeight: 600 }}>Devolver {fmtNum(selecao.size)} remessa(s)</button>
            </div>
          </div>
        </div>
      )}

      {/* Popup de detalhes (read-only) */}
      {detalheSel && (
        <div onClick={() => setDetalheSel(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 10, width: '100%', maxWidth: 760, maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 40px rgba(0,0,0,.25)' }}>
            <div style={{ borderBottom: '1px solid #e2e8f0', padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontWeight: 600, color: '#1e293b', fontSize: '.95rem', margin: 0 }}>Remessa #{detalheSel.numero || detalheSel.idRemessa}</h2>
              <button onClick={() => setDetalheSel(null)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', lineHeight: 1, color: '#64748b', cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ padding: 18, overflowY: 'auto', fontSize: '.82rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 18px', marginBottom: 12, fontSize: '.76rem', color: '#475569' }}>
                <div>Destinatario: <b>{detalheSel.nomeCliente || ('#' + (detalheSel.codigoCliente || '?'))}</b></div>
                <div>CNPJ/CPF: <b>{detalheSel.cnpjCliente || '-'}</b></div>
                <div>Origem: <b>{detalheSel.numeroOS ? 'OS nº ' + detalheSel.numeroOS : 'Manual'}</b></div>
                <div>Criado por (OS): <b>{detalheSel.criadoPorNome || detalheSel.criadoPorLogin || '-'}</b></div>
                <div>Data da OS: <b>{detalheSel.dataCriacaoOS || '-'}</b></div>
                <div>Previsao da remessa: <b>{detalheSel.dataPrevisao || '?'}</b></div>
                <div>Dias em aberto: <b>{detalheSel.diasAberto != null ? detalheSel.diasAberto : '-'}</b></div>
                <div>Vendedor: <b>{detalheSel.vendedorNome || (detalheSel.codVendedor ? '#' + detalheSel.codVendedor : '-')}</b></div>
                <div>Valor total: <b>{fmtBRL(detalheSel.valorTotal)}</b></div>
                <div>Cod. integracao: <b style={{ fontFamily: 'monospace' }}>{detalheSel.codIntRem || '-'}</b></div>
              </div>
              {detalheSel.obs && (
                <div style={{ marginBottom: 12, fontSize: '.74rem', color: '#475569', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: 8 }}>
                  <b>Obs:</b> {detalheSel.obs}
                </div>
              )}
              <h3 style={{ fontWeight: 600, color: '#334155', marginBottom: 4, fontSize: '.82rem' }}>Itens ({detalheSel.itens.length})</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #e2e8f0', borderRadius: 6 }}>
                <thead><tr>
                  <th style={{ ...thStyle, fontSize: '.62rem', padding: '4px 8px' }}>Codigo</th>
                  <th style={{ ...thStyle, fontSize: '.62rem', padding: '4px 8px' }}>Descricao</th>
                  <th style={{ ...thStyle, fontSize: '.62rem', padding: '4px 8px' }}>CFOP</th>
                  <th style={{ ...thStyle, fontSize: '.62rem', padding: '4px 8px', textAlign: 'right' }}>Qtde</th>
                  <th style={{ ...thStyle, fontSize: '.62rem', padding: '4px 8px', textAlign: 'right' }}>Vlr unit</th>
                  <th style={{ ...thStyle, fontSize: '.62rem', padding: '4px 8px', textAlign: 'right' }}>Total</th>
                </tr></thead>
                <tbody>
                  {detalheSel.itens.length === 0 ? (
                    <tr><td colSpan={6} style={{ ...tdStyle, color: '#94a3b8' }}>(sem itens)</td></tr>
                  ) : detalheSel.itens.map((it, i) => (
                    <tr key={i}>
                      <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '.72rem', padding: '4px 8px' }}>{it.codProduto || '?'}</td>
                      <td style={{ ...tdStyle, fontSize: '.72rem', padding: '4px 8px' }}>{it.descricao || ''}</td>
                      <td style={{ ...tdStyle, fontSize: '.72rem', padding: '4px 8px' }}>{it.cfop || ''}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontSize: '.72rem', padding: '4px 8px' }}>{fmtNum(it.qtde, 0)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontSize: '.72rem', padding: '4px 8px' }}>{fmtBRL(it.valorUnit)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontSize: '.72rem', padding: '4px 8px' }}>{fmtBRL(it.valorTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ borderTop: '1px solid #e2e8f0', padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={() => setDetalheSel(null)} style={{ padding: '6px 14px', fontSize: '.82rem', background: '#e2e8f0', color: '#334155', border: 'none', borderRadius: 6, cursor: 'pointer', marginLeft: 'auto' }}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
