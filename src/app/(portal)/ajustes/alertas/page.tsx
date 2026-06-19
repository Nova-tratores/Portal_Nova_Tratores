'use client';
// Alertas (verificacao diaria). Portado de alertas.ejs + public/alertas.js.
// Lista alertas (cmc_alertas), permite marcar lido (individual/todos), rodar a
// verificacao manualmente (worker-ready: POST /rodar-agora + polling /status).
// Filtros: conta (ContaSelector - permite Todas), lido/nao-lido, tipo.
import { useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';
import { useConta } from '@/components/estoque/ContaProvider';
import ContaSelector from '@/components/estoque/ContaSelector';

// ---------- tipos ----------
interface AlertaDetalhe {
  saldoAnt?: number | null; saldoHoje?: number | null; saldo?: number | null; cmc?: number | null; codigo?: string | number | null;
  cmcAnt?: number | null; cmcHoje?: number | null; pct?: number | null;
  saldoAqui?: number | null; outraEmpresa?: { contaLabel?: string | null; saldo?: number | null; cmc?: number | null } | null;
  numeroNFe?: string | null; fornecedor?: string | null; natureza?: string | null; maiorImpactoPct?: number | null; itensRisco?: unknown[];
  numero?: string | number | null; diasParado?: number | null; etapa?: string | null; etapaNome?: string | null; criadoPor?: string | null; valor?: number | null; cliente?: string | null;
}
interface Alerta {
  id: number; conta_omie?: string | null; tipo?: string | null;
  codigo_produto?: number | string | null; codigo_integracao?: string | null;
  descricao_produto?: string | null; ref?: string | null; detalhe?: AlertaDetalhe | null;
  lido?: boolean; criado_em?: string | null;
}
interface VerificacaoStatus {
  rodando?: boolean; etapa?: string | null; inicio?: string | null; fim?: string | null; erro?: string | null;
  ultimoResumo?: { rodadoEm?: string; alertasNovos?: number; duracaoMs?: number } | null;
}
interface AlertasResposta { alertas?: Alerta[]; naoLidos?: number; verificacao?: VerificacaoStatus; erro?: string }

// ---------- helpers ----------
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
function fmtBRL(n: number | null | undefined): string { if (n == null || isNaN(Number(n))) return '-'; return brl.format(Number(n)); }
function fmtNum(n: number | null | undefined, d = 0): string { if (n == null || isNaN(Number(n))) return '-'; return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }); }
function fmtPct(p: number | null | undefined): string { if (p == null || isNaN(Number(p))) return '-'; return (Number(p) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%'; }
function fmtDataHora(s?: string | null): string { if (!s) return '-'; const d = new Date(s); return isNaN(d.getTime()) ? String(s) : d.toLocaleString('pt-BR'); }

interface TipoInfo { label: string; bg: string; cor: string }
const TIPOS: Record<string, TipoInfo> = {
  negativo: { label: 'Ficou negativo', bg: '#fee2e2', cor: '#991b1b' },
  cmc_queda: { label: 'CMC caiu muito', bg: '#ffedd5', cor: '#9a3412' },
  recebimento_garantia: { label: 'Recebimento garantia', bg: '#fef3c7', cor: '#92400e' },
  suspeita_empresa_errada: { label: 'Suspeita empresa errada', bg: '#ffe4e6', cor: '#9f1239' },
  pedido_parado: { label: 'Pedido parado', bg: '#e0f2fe', cor: '#075985' },
};
function tipoInfo(t?: string | null): TipoInfo { return (t && TIPOS[t]) || { label: t || '?', bg: '#f1f5f9', cor: '#475569' }; }

const TIPO_OPCOES = [
  { v: '', nome: 'Todos os tipos' },
  { v: 'negativo', nome: 'Ficou negativo' },
  { v: 'cmc_queda', nome: 'CMC caiu muito' },
  { v: 'recebimento_garantia', nome: 'Recebimento garantia' },
  { v: 'suspeita_empresa_errada', nome: 'Suspeita empresa errada' },
  { v: 'pedido_parado', nome: 'Pedido parado' },
];

function DetalheAlerta({ a }: { a: Alerta }) {
  const d = a.detalhe || {};
  if (a.tipo === 'negativo') {
    return <>Saldo {d.saldoAnt != null && <span style={{ color: '#64748b' }}>{fmtNum(d.saldoAnt)} → </span>}<b style={{ color: '#b91c1c' }}>{fmtNum(d.saldoHoje != null ? d.saldoHoje : d.saldo)}</b>{d.cmc != null && <> · CMC {fmtBRL(d.cmc)}</>}</>;
  }
  if (a.tipo === 'cmc_queda') {
    return <>CMC {fmtBRL(d.cmcAnt)} → {fmtBRL(d.cmcHoje)} (<b style={{ color: '#b91c1c' }}>−{fmtPct(d.pct)}</b>){d.saldoHoje != null && <> · saldo {fmtNum(d.saldoHoje)}</>}</>;
  }
  if (a.tipo === 'suspeita_empresa_errada') {
    const oe = d.outraEmpresa || {};
    return <>Negativo aqui (saldo <b style={{ color: '#b91c1c' }}>{fmtNum(d.saldoAqui)}</b>); na <b>{oe.contaLabel || 'outra empresa'}</b> tem saldo <b style={{ color: '#047857' }}>{fmtNum(oe.saldo)}</b>{oe.cmc != null && <>, CMC {fmtBRL(oe.cmc)}</>}. <span style={{ color: '#be123c' }}>→ fazer contagem fisica, nao corrigir.</span></>;
  }
  if (a.tipo === 'recebimento_garantia') {
    const itens = Array.isArray(d.itensRisco) ? d.itensRisco : [];
    return <>NF {d.numeroNFe || '?'}{d.fornecedor && <> - {d.fornecedor}</>}{d.natureza && <span style={{ color: '#64748b' }}> ({d.natureza})</span>}{d.maiorImpactoPct != null && <> · maior impacto ~−{fmtPct(d.maiorImpactoPct)}</>}{itens.length > 0 && <> · {itens.length} item(ns) de risco</>}</>;
  }
  if (a.tipo === 'pedido_parado') {
    return <>Pedido #{d.numero || '?'} parado ha <b style={{ color: '#075985' }}>{d.diasParado} dias</b> na etapa <b>{d.etapaNome || d.etapa || '?'}</b>{d.criadoPor && <> · criado por {d.criadoPor}</>}{d.valor != null && <> · {fmtBRL(d.valor)}</>}{d.cliente && <><br /><span style={{ fontSize: '.72rem', color: '#64748b' }}>Cliente: {d.cliente}</span></>}</>;
  }
  let txt = '';
  try { txt = JSON.stringify(d); } catch { txt = ''; }
  return <span style={{ fontSize: '.72rem', color: '#64748b' }}>{txt}</span>;
}

const thStyle: React.CSSProperties = { background: '#f8fafc', color: '#475569', fontSize: '.65rem', textTransform: 'uppercase', letterSpacing: '.4px', padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', fontWeight: 600, whiteSpace: 'nowrap' };
const tdStyle: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid #f1f5f9', color: '#334155', fontSize: '.82rem' };
const selStyle: React.CSSProperties = { padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, background: '#fff', cursor: 'pointer' };

export default function AlertasPage() {
  const { userProfile } = useAuth();
  const { temAcesso, loading: permLoading } = usePermissoes(userProfile?.id);
  const { conta, contaParam } = useConta();
  const criadoPor = userProfile?.nome || 'portal';

  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [naoLidos, setNaoLidos] = useState<number | null>(null);
  const [verif, setVerif] = useState<VerificacaoStatus>({});
  const [filtroLido, setFiltroLido] = useState<'0' | '' | '1'>('0');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [listaStatus, setListaStatus] = useState('');
  const [verifStatus, setVerifStatus] = useState('');
  const [erro, setErro] = useState('');

  const verifTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const contaRef = useRef(conta);
  contaRef.current = conta;
  const filtroLidoRef = useRef(filtroLido);
  filtroLidoRef.current = filtroLido;
  const filtroTipoRef = useRef(filtroTipo);
  filtroTipoRef.current = filtroTipo;

  const stopVerifTimer = useCallback(() => {
    if (verifTimer.current) { clearInterval(verifTimer.current); verifTimer.current = null; }
  }, []);

  const renderVerif = useCallback((v: VerificacaoStatus) => {
    setVerif(v || {});
    if (v?.rodando) {
      setVerifStatus(`verificando... ${v.etapa || ''}${v.inicio ? ` (desde ${new Date(v.inicio).toLocaleTimeString('pt-BR')})` : ''}`);
    } else {
      const r = v?.ultimoResumo;
      if (v?.erro) setVerifStatus(`ultima verificacao falhou: ${v.erro}`);
      else if (r) setVerifStatus(`Ultima verificacao: ${fmtDataHora(r.rodadoEm || v.fim)} · ${r.alertasNovos != null ? r.alertasNovos : '?'} alerta(s) novo(s)${r.duracaoMs ? ` · ${(r.duracaoMs / 60000).toFixed(0)} min` : ''}`);
      else if (v?.fim) setVerifStatus(`Ultima verificacao: ${fmtDataHora(v.fim)}`);
      else setVerifStatus('Nenhuma verificacao manual ainda (roda automaticamente 1x/dia).');
    }
  }, []);

  const carregar = useCallback(async () => {
    setListaStatus('carregando...');
    setErro('');
    let qs = contaParam.replace(/^&/, '');
    if (filtroLidoRef.current !== '') qs += (qs ? '&' : '') + 'lido=' + filtroLidoRef.current;
    if (filtroTipoRef.current) qs += (qs ? '&' : '') + 'tipo=' + encodeURIComponent(filtroTipoRef.current);
    try {
      const r = await fetch(`/api/ajustes/alertas${qs ? '?' + qs : ''}`);
      const d = (await r.json()) as AlertasResposta;
      if (d.erro) { setErro(d.erro); }
      renderVerif(d.verificacao || {});
      const lista = d.alertas || [];
      setAlertas(lista);
      setNaoLidos(d.naoLidos != null ? d.naoLidos : lista.filter((a) => !a.lido).length);
      setListaStatus(`${lista.length} alerta(s)${d.naoLidos != null ? ` · ${d.naoLidos} nao lido(s)` : ''}`);
    } catch (e) {
      setListaStatus('');
      setErro('erro de rede: ' + (e as Error).message);
    }
  }, [contaParam, renderVerif]);

  const pollVerif = useCallback(async () => {
    try {
      const r = await fetch('/api/ajustes/verificacao/status');
      const v = (await r.json()) as VerificacaoStatus;
      renderVerif(v || {});
      if (!v || !v.rodando) { stopVerifTimer(); carregar(); }
    } catch { /* ignora */ }
  }, [renderVerif, stopVerifTimer, carregar]);

  // (re)carrega ao montar / trocar conta / filtros
  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conta, filtroLido, filtroTipo]);

  useEffect(() => () => stopVerifTimer(), [stopVerifTimer]);

  const marcar = useCallback(async (ids: number[], lido: boolean) => {
    setListaStatus('atualizando...');
    try {
      const r = await fetch('/api/ajustes/alertas/marcar-lido', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, lido }),
      });
      const d = await r.json();
      if (d && d.ok) carregar(); else setListaStatus((d && d.erro) || 'falhou');
    } catch (e) { setListaStatus('erro de rede: ' + (e as Error).message); }
  }, [carregar]);

  const marcarTodos = useCallback(async () => {
    if (!confirm(`Marcar TODOS os alertas nao lidos${conta ? ' da conta ' + conta : ''} como lidos?`)) return;
    setListaStatus('atualizando...');
    try {
      const r = await fetch('/api/ajustes/alertas/marcar-lido', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conta: conta || undefined, lido: true }),
      });
      const d = await r.json();
      if (d && d.ok) carregar(); else setListaStatus((d && d.erro) || 'falhou');
    } catch (e) { setListaStatus('erro de rede: ' + (e as Error).message); }
  }, [conta, carregar]);

  const rodarVerificacao = useCallback(async () => {
    if (!confirm('Rodar a verificacao agora? Ela varre as contas inteiras no Omie e demora ~1-1,5h. Voce pode fechar a aba e voltar depois.')) return;
    setVerifStatus('iniciando verificacao...');
    try {
      const r = await fetch('/api/ajustes/verificacao/rodar-agora', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ criadoPor }),
      });
      const d = await r.json();
      if (r.status === 202 || (d && d.ok && !d.erro)) {
        if (!verifTimer.current) verifTimer.current = setInterval(pollVerif, 20000);
        setTimeout(pollVerif, 3000);
      } else {
        setVerifStatus((d && d.erro) || (d && d.jaRodando ? 'ja ha uma verificacao rodando' : 'falhou'));
        if (d && d.jaRodando) { if (!verifTimer.current) verifTimer.current = setInterval(pollVerif, 20000); setTimeout(pollVerif, 3000); }
      }
    } catch (e) { setVerifStatus('erro de rede: ' + (e as Error).message); }
  }, [criadoPor, pollVerif]);

  // se a verificacao ja vier rodando do carregar, liga o polling
  useEffect(() => {
    if (verif.rodando && !verifTimer.current) verifTimer.current = setInterval(pollVerif, 20000);
    if (!verif.rodando) stopVerifTimer();
  }, [verif.rodando, pollVerif, stopVerifTimer]);

  if (!permLoading && userProfile && !temAcesso('ajustes')) return <SemPermissao />;

  const porTipo: Record<string, number> = { negativo: 0, cmc_queda: 0, recebimento_garantia: 0, suspeita_empresa_errada: 0, pedido_parado: 0 };
  for (const a of alertas) { if (a.tipo && porTipo[a.tipo] != null) porTipo[a.tipo]++; }

  return (
    <div style={{ maxWidth: 1300, margin: '0 auto', padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>Alertas (verificacao diaria)</h1>
          <p style={{ color: '#64748b', fontSize: '.82rem', maxWidth: 800 }}>
            Comportamentos atipicos detectados na varredura diaria: produto que ficou negativo, CMC que caiu muito num dia, novo recebimento de NF-e de garantia de risco, suspeita de faturamento na empresa errada e pedidos parados ha muitos dias.
          </p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
          <select value={filtroLido} onChange={(e) => setFiltroLido(e.target.value as '0' | '' | '1')} style={selStyle}>
            <option value="0">Nao lidos</option>
            <option value="">Todos</option>
            <option value="1">Lidos</option>
          </select>
          <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} style={selStyle}>
            {TIPO_OPCOES.map((o) => <option key={o.v} value={o.v}>{o.nome}</option>)}
          </select>
          <button onClick={carregar} style={{ padding: '7px 14px', background: '#e2e8f0', color: '#334155', border: 'none', borderRadius: 6, fontSize: '.82rem', cursor: 'pointer' }}>Atualizar lista</button>
          <button onClick={rodarVerificacao} disabled={!!verif.rodando} title="Roda a varredura das contas agora (demora ~1-1,5h)" style={{ padding: '7px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontSize: '.82rem', cursor: verif.rodando ? 'wait' : 'pointer', opacity: verif.rodando ? 0.5 : 1 }}>Rodar verificacao agora</button>
          <ContaSelector />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 14, fontSize: '.8rem' }}>
        <Link href="/ajustes" style={{ color: '#dc2626', textDecoration: 'none', fontWeight: 600 }}>← Ajustes</Link>
        <span style={{ marginLeft: 'auto', color: '#64748b' }}>{verif.rodando ? `⏳ ${verifStatus}` : verifStatus}</span>
      </div>

      {erro && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: '.82rem' }}>{erro}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 18 }}>
        <Kpi label="Nao lidos" valor={fmtNum(naoLidos)} cor="#b91c1c" />
        <Kpi label="Ficou negativo" valor={fmtNum(porTipo.negativo)} />
        <Kpi label="CMC caiu muito" valor={fmtNum(porTipo.cmc_queda)} />
        <Kpi label="Recebimento garantia" valor={fmtNum(porTipo.recebimento_garantia)} />
        <Kpi label="Suspeita empresa errada" valor={fmtNum(porTipo.suspeita_empresa_errada)} cor="#b45309" />
        <Kpi label="Pedido parado" valor={fmtNum(porTipo.pedido_parado)} cor="#075985" />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <button onClick={marcarTodos} style={{ padding: '6px 12px', background: '#f1f5f9', color: '#334155', border: 'none', borderRadius: 6, fontSize: '.8rem', cursor: 'pointer' }}>Marcar todos como lidos</button>
        <span style={{ fontSize: '.8rem', color: '#64748b' }}>{listaStatus}</span>
      </div>

      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Quando</th>
                <th style={thStyle}>Conta</th>
                <th style={thStyle}>Tipo</th>
                <th style={thStyle}>Produto</th>
                <th style={thStyle}>Detalhe</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Acao</th>
              </tr>
            </thead>
            <tbody>
              {alertas.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Nenhum alerta{filtroLido === '0' ? ' nao lido' : ''}. 🎉</td></tr>
              ) : (
                alertas.map((a) => {
                  const prod = a.codigo_produto != null ? a.codigo_produto : (a.codigo_integracao || '');
                  const ti = tipoInfo(a.tipo);
                  return (
                    <tr key={a.id} style={{ borderBottom: '1px solid #f1f5f9', opacity: a.lido ? 0.6 : 1 }}>
                      <td style={{ ...tdStyle, whiteSpace: 'nowrap', fontSize: '.72rem' }}>{fmtDataHora(a.criado_em)}</td>
                      <td style={{ ...tdStyle, fontSize: '.72rem' }}>{a.conta_omie || ''}</td>
                      <td style={tdStyle}><span style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 6, fontSize: '.7rem', background: ti.bg, color: ti.cor }}>{ti.label}</span></td>
                      <td style={tdStyle}>{prod !== '' && <span style={{ fontFamily: 'monospace', fontSize: '.72rem', color: '#64748b' }}>{prod} </span>}<span>{a.descricao_produto || ''}</span></td>
                      <td style={tdStyle}><DetalheAlerta a={a} /></td>
                      <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {a.lido ? (
                          <button onClick={() => marcar([a.id], false)} style={{ padding: '3px 8px', fontSize: '.72rem', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 4, cursor: 'pointer' }}>marcar nao lido</button>
                        ) : (
                          <button onClick={() => marcar([a.id], true)} style={{ padding: '3px 8px', fontSize: '.72rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>marcar lido</button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, valor, cor }: { label: string; valor: string; cor?: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14 }}>
      <div style={{ fontSize: '.65rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '.4px' }}>{label}</div>
      <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: 4, color: cor || '#1e293b' }}>{valor}</div>
    </div>
  );
}
