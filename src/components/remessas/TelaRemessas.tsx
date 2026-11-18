'use client';
// Módulo Remessas (18/11/2026): Em aberto · Demonstrações · Histórico · Nova demonstração.
// ?aba=abertas|demos|historico|nova · ?ficha=nova-<idRemessa> abre a ficha.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { HelpCircle, Search, RefreshCw, Download, Plus, Truck, Clock, History, ListChecks, ArrowUp, ArrowDown } from 'lucide-react';
import { fetchAuth } from '@/lib/auth/client';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';
import {
  TIPOS, SITUACOES, casaBusca, csvRemessas, dataBR, type LinhaRemessa, type TipoRemessa, type Situacao,
} from '@/lib/remessas/regras';
import { CSS_RM } from './estilo';
import FichaRemessa from './FichaRemessa';
import NovaDemonstracao from './NovaDemonstracao';

type Aba = 'abertas' | 'demos' | 'historico' | 'nova';
type Col = 'numero' | 'emissao' | 'tipo' | 'situacao' | 'destinatario' | 'itens' | 'total' | 'prazo';
/** demonstrações: por padrão só as que saíram de 2026 em diante (as antigas ficam atrás do filtro) */
const DEMO_DESDE = '2026-01-01';
const semAcento = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
/** texto de cada coluna (o mesmo que a tabela mostra) — base do filtro do cabeçalho */
function textoCol(x: LinhaRemessa, col: Col): string {
  switch (col) {
    case 'numero': return `${x.numero} ${x.conta}`;
    case 'emissao': return dataBR(x.emissao);
    case 'tipo': return x.tipo;
    case 'situacao': return x.situacao;
    case 'destinatario': return `${x.destinatario} ${x.cnpj}`;
    case 'itens': return x.itens.join(' ');
    case 'total': return `${x.total.toFixed(2).replace('.', ',')} ${brl(x.total)}`;
    case 'prazo': return dataBR(x.prazoAte);
  }
}
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function TelaRemessas() {
  const { userProfile } = useAuth();
  const { temAcesso, pode, loading } = usePermissoes(userProfile?.id);
  const router = useRouter();
  const pathname = usePathname() || '/remessas';
  const sp = useSearchParams();
  const [aba, setAba] = useState<Aba>((sp.get('aba') as Aba) || 'abertas');
  const [linhas, setLinhas] = useState<LinhaRemessa[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [migracao, setMigracao] = useState(false);
  const [busca, setBusca] = useState('');
  const [conta, setConta] = useState<'todas' | 'nova' | 'castro'>('todas');
  const [tipos, setTipos] = useState<Set<TipoRemessa>>(new Set());
  const [sits, setSits] = useState<Set<Situacao>>(new Set());
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [ordem, setOrdem] = useState<{ col: Col; dir: 1 | -1 }>({ col: 'emissao', dir: -1 });
  const [fcol, setFcol] = useState<Partial<Record<Col, string>>>({});
  const [demoSits, setDemoSits] = useState<Set<Situacao>>(new Set());
  const [demoAntigas, setDemoAntigas] = useState(false);
  const [demoOrdem, setDemoOrdem] = useState<'prazo' | 'saida'>('prazo');
  const [ajuda, setAjuda] = useState(false);
  const [ficha, setFicha] = useState<string | null>(sp.get('ficha'));
  const [aviso, setAviso] = useState('');

  const podeVer = temAcesso('remessas') || pode('consulta-estoque', 'remessas') || pode('ajustes', 'remessas');
  const podeEmitir = pode('remessas', 'emitir');

  const carregar = useCallback(async () => {
    try {
      const r = await fetchAuth('/api/remessas');
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro || `Erro ${r.status}`);
      setLinhas(j.linhas || []); setMigracao(!!j.migracaoFaltando); setErro('');
    } catch (e) { setErro((e as Error).message); }
    finally { setCarregando(false); }
  }, []);
  useEffect(() => { if (!loading && podeVer) carregar(); }, [loading, podeVer, carregar]);

  const trocarUrl = useCallback((patch: Record<string, string | null>) => {
    const u = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) { if (v) u.set(k, v); else u.delete(k); }
    router.replace(`${pathname}${u.toString() ? `?${u}` : ''}`, { scroll: false });
  }, [router, sp, pathname]);
  const irAba = (a: Aba) => { setAba(a); trocarUrl({ aba: a === 'abertas' ? null : a }); };
  const abrir = (l: { conta: string; idRemessa: number } | null) => {
    const k = l ? `${l.conta}-${l.idRemessa}` : null;
    setFicha(k); trocarUrl({ ficha: k });
  };

  const base = useMemo(() => linhas.filter((l) => (conta === 'todas' || l.conta === conta) && casaBusca(l, busca)), [linhas, conta, busca]);
  const abertas = useMemo(() => base.filter((l) => SITUACOES[l.situacao].aberta), [base]);
  const demosTodas = useMemo(() => abertas.filter((l) => l.tipo === 'demonstracao'), [abertas]);
  const demosAntigas = demosTodas.filter((l) => (l.emissao || '') < DEMO_DESDE).length;
  const demos = useMemo(() => demosTodas
    .filter((l) => demoAntigas || (l.emissao || '') >= DEMO_DESDE)
    .filter((l) => !demoSits.size || demoSits.has(l.situacao))
    .sort((a, b) => demoOrdem === 'saida' ? (b.emissao || '').localeCompare(a.emissao || '') : (a.diasPrazo ?? 9999) - (b.diasPrazo ?? 9999)),
  [demosTodas, demoAntigas, demoSits, demoOrdem]);
  const atrasadas = demos.filter((d) => d.situacao === 'vencida').length;

  const tabela = useMemo(() => {
    let l = aba === 'historico' ? base : abertas;
    if (tipos.size) l = l.filter((x) => tipos.has(x.tipo));
    if (sits.size) l = l.filter((x) => sits.has(x.situacao));
    if (aba === 'historico' && de) l = l.filter((x) => (x.emissao || '') >= de);
    if (aba === 'historico' && ate) l = l.filter((x) => (x.emissao || '') <= ate);
    for (const [c, v] of Object.entries(fcol) as [Col, string][]) {
      if (!v) continue;
      if (c === 'tipo' || c === 'situacao') { l = l.filter((x) => textoCol(x, c) === v); continue; }
      const t = semAcento(v.trim());
      l = l.filter((x) => semAcento(textoCol(x, c)).includes(t));
    }
    const v = (x: LinhaRemessa): string | number => {
      switch (ordem.col) {
        case 'numero': return Number(x.numero) || 0;
        case 'emissao': return x.emissao || '';
        case 'tipo': return TIPOS[x.tipo].rotulo;
        case 'situacao': return SITUACOES[x.situacao].rotulo;
        case 'destinatario': return x.destinatario;
        case 'itens': return x.itens.join(' ');
        case 'total': return x.total;
        case 'prazo': return x.prazoAte || '9999';
      }
    };
    return [...l].sort((a, b) => { const A = v(a), B = v(b); return (A < B ? -1 : A > B ? 1 : 0) * ordem.dir; });
  }, [aba, base, abertas, tipos, sits, de, ate, ordem, fcol]);

  if (loading) return <div style={{ padding: 24 }}>Carregando…</div>;
  if (!podeVer) return <SemPermissao />;

  const baixar = () => {
    const blob = new Blob([csvRemessas(tabela)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `remessas-${aba}.csv`; a.click();
    URL.revokeObjectURL(a.href);
  };
  const alternar = <T,>(s: Set<T>, v: T) => { const n = new Set(s); if (n.has(v)) n.delete(v); else n.add(v); return n; };
  const th = (col: Col, rot: string, alinhar?: 'right') => (
    <th className="ord" style={alinhar ? { textAlign: alinhar } : undefined} onClick={() => setOrdem((o) => ({ col, dir: o.col === col ? (o.dir === 1 ? -1 : 1) : 1 }))}
      aria-sort={ordem.col === col ? (ordem.dir === 1 ? 'ascending' : 'descending') : 'none'} title="Clique para ordenar A→Z / Z→A">
      {rot} {ordem.col === col ? (ordem.dir === 1 ? <ArrowUp size={11} /> : <ArrowDown size={11} />) : <span style={{ opacity: .35 }}>⇅</span>}
    </th>
  );
  const tiposPresentes = [...new Set((aba === 'historico' ? base : abertas).map((l) => l.tipo))];
  const sitsPresentes = [...new Set((aba === 'historico' ? base : abertas).map((l) => l.situacao))];

  return (
    <div className="rm-tela">
      <style>{CSS_RM}</style>
      <div className="rm-faixa print:hidden">
        <button className={`rm-guia ${aba === 'abertas' ? 'on' : ''}`} onClick={() => irAba('abertas')}><ListChecks size={16} /> Em aberto <span className="rm-n">{abertas.length}</span></button>
        <button className={`rm-guia ${aba === 'demos' ? 'on' : ''}`} onClick={() => irAba('demos')}><Clock size={16} /> Demonstrações <span className={`rm-n ${atrasadas ? 'alerta' : ''}`}>{demos.length}</span></button>
        <button className={`rm-guia ${aba === 'historico' ? 'on' : ''}`} onClick={() => irAba('historico')}><History size={16} /> Histórico</button>
        {podeEmitir && <button className={`rm-guia ${aba === 'nova' ? 'on' : ''}`} onClick={() => irAba('nova')}><Plus size={16} /> Nova demonstração</button>}
        <div className="rm-faixa-dir">
          <button className="rm-btn branco" onClick={() => setAjuda((a) => !a)} aria-label="Como ler esta tela"><HelpCircle size={16} /><span className="rm-txt-longo">Como ler</span></button>
        </div>
      </div>

      <div className="rm-root">
        {ajuda && (
          <div className="rm-card" style={{ fontSize: 13.5, lineHeight: 1.6 }}>
            <b>Como ler esta tela.</b> Remessa é a nota de saída de produto que não é venda. O tipo sai do CFOP: <b>demonstração</b> (5.912/6.912 — a máquina sai do estoque e volta por uma nota de entrada 1.913/2.913),
            garantia em dois tipos — <b>Garantia → fábrica</b> (devolução de peças à montadora: o destinatário é fornecedor; inclui as emitidas pelo portal em Garantias/Recebimentos) e <b>Garantia → cliente</b> (peças mandadas ao cliente em garantia pela OS), ambas 5.949/6.949 —, peças de OS (5.910), conserto (5.915) e retorno ao fornecedor (5.913, máquina que um fornecedor nos mandou em demonstração).
            <br /><b>Em aberto</b>: o que ainda está fora (demonstrações) ou sem nota emitida. <b>Demonstrações</b>: cada máquina na rua com o prazo de volta — padrão de 30 dias, verde em dia, âmbar a 5 dias, vermelho vencida.
            Na ficha dá para <b>renovar</b> (nota de volta + remessa nova, como já se fazia à mão), <b>registrar a volta</b> ou marcar que <b>virou venda</b>. <b>Histórico</b>: todas as remessas desde 2022, com filtro por período, tipo e situação.
            <br />As remessas vêm da Omie duas vezes por dia (03:15 e 13:15); o que é emitido aqui aparece na hora. O sino avisa quem acompanha a demonstração quando faltam 5 dias e quando vence.
            Remessas de OS em aberto também podem ser devolvidas em lote em <a href="/ajustes/remessas" style={{ color: '#7c3aed' }}>Ajustes › Remessas em aberto</a>.
          </div>
        )}
        {migracao && <div className="rm-aviso">O módulo ainda não foi ativado no banco: falta aplicar <b>sql/remessas-modulo.sql</b>. A lista funciona; prazo, histórico e emissão ficam travados.</div>}
        {erro && <div className="rm-erro">{erro}</div>}
        {aviso && <div className="rm-ok">{aviso}</div>}

        {aba === 'nova' ? (
          <NovaDemonstracao onCriada={(r) => { setAviso(`Remessa criada na Omie (nº ${r.numero || '?'}). Confira e emita a NF-e na ficha.`); carregar(); irAba('demos'); abrir({ conta: r.conta, idRemessa: r.idRemessa }); }} />
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ position: 'relative', flex: '1 1 260px', minWidth: 0 }}>
                <Search size={15} style={{ position: 'absolute', left: 10, top: 12, opacity: .5 }} />
                <input className="rm-input" style={{ paddingLeft: 32 }} placeholder="Nº, cliente, CPF/CNPJ, máquina, chassi, CFOP…" value={busca} onChange={(e) => setBusca(e.target.value)} />
              </div>
              <div className="rm-chips">
                {(['todas', 'nova', 'castro'] as const).map((c) => (
                  <button key={c} className={`rm-chip ${conta === c ? 'on' : ''}`} onClick={() => setConta(c)}>{c === 'todas' ? 'Todas' : c.toUpperCase()}</button>
                ))}
              </div>
              <button className="rm-btn" onClick={() => { setCarregando(true); carregar(); }}><RefreshCw size={15} /> <span className="rm-so-pc">Atualizar</span></button>
              {aba !== 'demos' && <button className="rm-btn" onClick={baixar}><Download size={15} /> CSV</button>}
            </div>

            {carregando && <div className="rm-card">Carregando as remessas…</div>}

            {!carregando && aba === 'demos' && (
              <div className="rm-chips" style={{ alignItems: 'center' }}>
                {(['em_demonstracao', 'vence_logo', 'vencida', 'conferir', 'sem_nota'] as Situacao[]).filter((x) => demosTodas.some((d) => d.situacao === x)).map((x) => (
                  <button key={x} className={`rm-chip ${demoSits.has(x) ? 'on' : ''}`} onClick={() => setDemoSits((y) => alternar(y, x))}>
                    <span style={{ width: 8, height: 8, borderRadius: 9, background: SITUACOES[x].cor }} />{SITUACOES[x].rotulo}
                  </button>
                ))}
                <span style={{ width: 1, alignSelf: 'stretch', background: 'var(--border)', margin: '0 4px' }} />
                <button className={`rm-chip ${demoAntigas ? 'on' : ''}`} onClick={() => setDemoAntigas((v) => !v)} title="Por padrão ficam escondidas as que saíram até 2025">
                  {demoAntigas ? 'Mostrando as de 2025 para trás' : `Mostrar as de 2025 para trás (${demosAntigas})`}
                </button>
                <select className="rm-input" style={{ width: 'auto', minHeight: 34 }} value={demoOrdem} onChange={(e) => setDemoOrdem(e.target.value as 'prazo' | 'saida')} aria-label="Ordenar">
                  <option value="prazo">Ordenar: prazo mais perto</option>
                  <option value="saida">Ordenar: saída mais recente</option>
                </select>
                {(demoSits.size > 0 || demoAntigas) && <button className="rm-chip" onClick={() => { setDemoSits(new Set()); setDemoAntigas(false); }}>Limpar filtros</button>}
              </div>
            )}
            {!carregando && aba === 'demos' && (
              demos.length === 0 ? <div className="rm-card">Nenhuma demonstração neste filtro{!demoAntigas && demosAntigas ? ` — há ${demosAntigas} de 2025 para trás escondida(s)` : ''}.</div> : (
                <div className="rm-demos">
                  {demos.map((d) => <CartaoDemo key={`${d.conta}-${d.idRemessa}`} d={d} onAbrir={() => abrir(d)} />)}
                </div>
              )
            )}

            {!carregando && aba !== 'demos' && (
              <>
                <div className="rm-chips">
                  {tiposPresentes.map((t) => (
                    <button key={t} className={`rm-chip ${tipos.has(t) ? 'on' : ''}`} onClick={() => setTipos((s) => alternar(s, t))}>
                      <span style={{ width: 8, height: 8, borderRadius: 9, background: TIPOS[t].cor }} />{TIPOS[t].rotulo}
                    </button>
                  ))}
                  <span style={{ width: 1, background: 'var(--border)', margin: '0 4px' }} />
                  {sitsPresentes.map((s) => (
                    <button key={s} className={`rm-chip ${sits.has(s) ? 'on' : ''}`} onClick={() => setSits((x) => alternar(x, s))}>{SITUACOES[s].rotulo}</button>
                  ))}
                  {aba === 'historico' && (
                    <>
                      <input type="date" className="rm-input" style={{ width: 150, minHeight: 34 }} value={de} onChange={(e) => setDe(e.target.value)} aria-label="De" />
                      <input type="date" className="rm-input" style={{ width: 150, minHeight: 34 }} value={ate} onChange={(e) => setAte(e.target.value)} aria-label="Até" />
                    </>
                  )}
                  {(tipos.size > 0 || sits.size > 0 || de || ate || Object.values(fcol).some(Boolean)) && <button className="rm-chip" onClick={() => { setTipos(new Set()); setSits(new Set()); setDe(''); setAte(''); setFcol({}); }}>Limpar filtros</button>}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--text-light)' }}>
                  {tabela.length} remessa(s) · {brl(tabela.reduce((s, l) => s + l.total, 0))}
                </div>
                <div className="rm-tabela-wrap">
                  <table className="rm-tabela" style={{ minWidth: 860 }}>
                    <thead>
                      <tr>
                        {th('numero', 'Nº')}{th('emissao', 'Emissão')}{th('tipo', 'Tipo')}{th('situacao', 'Situação')}
                        {th('destinatario', 'Destinatário')}{th('itens', 'Itens')}{th('total', 'Valor', 'right')}{th('prazo', 'Prazo')}
                      </tr>
                      <tr className="rm-filtros">
                        {(['numero', 'emissao', 'tipo', 'situacao', 'destinatario', 'itens', 'total', 'prazo'] as Col[]).map((c) => (
                          <th key={c}>
                            {c === 'tipo' || c === 'situacao' ? (
                              <select className="rm-input rm-fcol" value={fcol[c] || ''} onChange={(e) => setFcol((f) => ({ ...f, [c]: e.target.value }))} aria-label={`Filtrar ${c}`}>
                                <option value="">Todos</option>
                                {(c === 'tipo' ? tiposPresentes : sitsPresentes).map((v) => (
                                  <option key={v} value={v}>{c === 'tipo' ? TIPOS[v as TipoRemessa].rotulo : SITUACOES[v as Situacao].rotulo}</option>
                                ))}
                              </select>
                            ) : (
                              <input className="rm-input rm-fcol" value={fcol[c] || ''} placeholder={c === 'emissao' || c === 'prazo' ? 'dd/mm/aaaa' : 'filtrar'}
                                onChange={(e) => setFcol((f) => ({ ...f, [c]: e.target.value }))} aria-label={`Filtrar ${c}`} />
                            )}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {tabela.slice(0, 600).map((l) => (
                        <tr key={`${l.conta}-${l.idRemessa}`} onClick={() => abrir(l)}>
                          <td style={{ whiteSpace: 'nowrap' }}><b>{l.numero || '—'}</b> <span style={{ fontSize: 11, color: 'var(--text-light)' }}>{l.conta.toUpperCase()}</span>{l.origemPortal && <span className="rm-selo" style={{ marginLeft: 4, background: '#ede9fe', color: '#5b21b6' }}>portal</span>}</td>
                          <td style={{ whiteSpace: 'nowrap' }}>{dataBR(l.emissao)}</td>
                          <td><span className="rm-selo" style={{ background: `${TIPOS[l.tipo].cor}1f`, color: TIPOS[l.tipo].cor }}>{TIPOS[l.tipo].rotulo}</span></td>
                          <td><span className="rm-selo" style={{ background: `${SITUACOES[l.situacao].cor}1f`, color: SITUACOES[l.situacao].cor }}>{SITUACOES[l.situacao].rotulo}</span></td>
                          <td style={{ maxWidth: 260 }}>{l.destinatario}</td>
                          <td style={{ maxWidth: 320, fontSize: 12.5, color: 'var(--text-light)' }}>{l.itens.slice(0, 2).join(' · ')}{l.itens.length > 2 ? ` +${l.itens.length - 2}` : ''}</td>
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{brl(l.total)}</td>
                          <td style={{ whiteSpace: 'nowrap' }}>{l.prazoAte ? dataBR(l.prazoAte) : ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {tabela.length > 600 && <div style={{ fontSize: 12.5, color: 'var(--text-light)' }}>Mostrando as 600 primeiras — use a busca ou os filtros (o CSV leva todas).</div>}
              </>
            )}
          </>
        )}
      </div>

      {ficha && <FichaRemessa chave={ficha} onFechar={() => abrir(null)} onMudou={carregar} onAbrir={(k) => { setFicha(k); trocarUrl({ ficha: k }); }} />}
    </div>
  );
}

function CartaoDemo({ d, onAbrir }: { d: LinhaRemessa; onAbrir: () => void }) {
  const s = SITUACOES[d.situacao];
  const dias = d.diasPrazo;
  const pct = dias == null ? 0 : Math.max(4, Math.min(100, ((30 - dias) / 30) * 100));
  return (
    <button className="rm-card rm-demo" style={{ ['--cor' as string]: s.cor }} onClick={onAbrir}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, width: '100%' }}>
        <Truck size={16} color={s.cor} style={{ flexShrink: 0, marginTop: 3 }} />
        <b style={{ flex: 1, minWidth: 0 }}>{d.destinatario || '—'}</b>
        <span className="rm-selo" style={{ background: `${s.cor}1f`, color: s.cor }}>{s.rotulo}</span>
      </div>
      <div style={{ fontSize: 13 }}>{d.itens[0] || 'Máquina'}{d.itens.length > 1 ? ` +${d.itens.length - 1}` : ''}</div>
      <div className="rm-barra"><i style={{ width: `${pct}%`, background: s.cor }} /></div>
      <div style={{ display: 'flex', fontSize: 12.5, color: 'var(--text-light)', gap: 8, flexWrap: 'wrap' }}>
        <span>Nº {d.numero} · {d.conta.toUpperCase()}</span>
        <span>saiu {dataBR(d.emissao)}</span>
        <span style={{ marginLeft: 'auto', fontWeight: 700, color: s.cor }}>
          {dias == null ? '' : dias < 0 ? `vencida há ${-dias} dia(s)` : dias === 0 ? 'vence hoje' : `faltam ${dias} dia(s)`}
        </span>
      </div>
    </button>
  );
}
