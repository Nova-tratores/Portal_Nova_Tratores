'use client';
// Pedidos de Máquinas: o "PPV" do Comercial. Quadro (arrasta de fase) · Relação · Painel.
// Mora numa aba de /propostas (?aba=pedidos — pedido do usuário, 13/11/2026).
// ?pvm=PVM-0001 abre o pedido; ?vista=relacao|painel; ?proposta=<id> cria um pedido já importando a proposta.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { LayoutGrid, Table2, BarChart3, Plus, HelpCircle, Search, Download, RefreshCw } from 'lucide-react';
import { fetchAuth } from '@/lib/auth/client';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';
import { FASES_PEDIDO_MAQUINA, faseInfo, podeMoverPara } from '@/lib/pedidos-maquinas/regras';
import {
  casaBusca, filtrarRel, ordenarRel, totais, agregar, rotuloMes, csv, brl, dataCurta, diasNaFase,
  COLUNAS_REL, textoColuna, type PedidoLista, type ColunaRel, type Agregado,
} from '@/lib/pedidos-maquinas/lista';
import { CSS_PM } from './estilo';
import PedidoDrawer from './PedidoDrawer';

type Aba = 'quadro' | 'relacao' | 'painel';
const M = 'pedidos-maquinas';

export default function TelaPedidosMaquinas({ embutida = false }: { embutida?: boolean }) {
  const { userProfile } = useAuth();
  const { temAcesso, pode, loading } = usePermissoes(userProfile?.id);
  const router = useRouter();
  const pathname = usePathname() || '/propostas';
  const sp = useSearchParams();
  const [aba, setAba] = useState<Aba>((sp.get('vista') as Aba) || 'quadro');
  const [lista, setLista] = useState<PedidoLista[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [migracao, setMigracao] = useState(false);
  const [busca, setBusca] = useState('');
  const [ajuda, setAjuda] = useState(false);
  const [aberto, setAberto] = useState<string | null>(sp.get('pvm'));
  const criandoDaProposta = useRef(false);

  const carregar = useCallback(async () => {
    try {
      const r = await fetchAuth('/api/pedidos-maquinas');
      const j = await r.json();
      if (j.migracaoFaltando) { setMigracao(true); return; }
      if (!r.ok) throw new Error(j.error || `Erro ${r.status}`);
      setLista(j.pedidos || []); setErro('');
    } catch (e) { setErro((e as Error).message); }
    finally { setCarregando(false); }
  }, []);
  useEffect(() => { if (!loading && temAcesso(M)) carregar(); }, [loading, carregar]); // eslint-disable-line react-hooks/exhaustive-deps

  const trocarUrl = useCallback((patch: Record<string, string | null>) => {
    const u = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) { if (v) u.set(k, v); else u.delete(k); }
    router.replace(`${pathname}${u.toString() ? `?${u}` : ''}`, { scroll: false });
  }, [router, sp, pathname]);

  const abrir = (id: string | null) => { setAberto(id); trocarUrl({ pvm: id }); };

  const novo = useCallback(async (propostaId?: string) => {
    setErro('');
    try {
      const r = await fetchAuth('/api/pedidos-maquinas', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(propostaId ? { proposta_id: Number(propostaId) } : {}),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `Erro ${r.status}`);
      await carregar();
      setAberto(j.id_pedido);
      trocarUrl({ pvm: j.id_pedido, proposta: null });
    } catch (e) { setErro((e as Error).message); trocarUrl({ proposta: null }); }
  }, [carregar, trocarUrl]);

  // ?proposta=<id>: vindo do botão "Gerar pedido de máquina" da Proposta
  useEffect(() => {
    const prop = sp.get('proposta');
    if (!prop || loading || criandoDaProposta.current || !pode(M, 'criar')) return;
    criandoDaProposta.current = true;
    novo(prop);
  }, [sp, loading, novo]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtrada = useMemo(() => lista.filter((p) => casaBusca(p, busca)), [lista, busca]);

  if (loading) return null;
  if (!temAcesso(M)) return <SemPermissao />;

  const guias: { id: Aba; rotulo: string; Ico: typeof LayoutGrid }[] = [
    { id: 'quadro', rotulo: 'Quadro', Ico: LayoutGrid },
    { id: 'relacao', rotulo: 'Relação', Ico: Table2 },
    { id: 'painel', rotulo: 'Painel', Ico: BarChart3 },
  ];

  return (
    <div className={`pm-tela ${embutida ? 'embutida' : ''}`}>
      <style>{CSS_PM}</style>
      <div className={`pm-faixa print:hidden ${embutida ? 'leve' : ''}`}>
        {guias.map((g) => (
          <button key={g.id} className={`pm-guia ${aba === g.id ? 'on' : ''}`} onClick={() => { setAba(g.id); trocarUrl({ vista: g.id === 'quadro' ? null : g.id }); }}>
            <g.Ico size={16} color={aba === g.id ? '#dc2626' : '#111111'} /> {g.rotulo}
          </button>
        ))}
        <div className="pm-faixa-dir">
          <button className="pm-btn branco" onClick={() => setAjuda((a) => !a)} aria-label="Como ler esta tela"><HelpCircle size={16} /><span className="pm-txt-longo">Como ler</span></button>
          {pode(M, 'criar') && <button className="pm-btn branco" onClick={() => novo()}><Plus size={16} /> Novo pedido</button>}
        </div>
      </div>

      <div className="pm-root">
        {ajuda && (
          <div className="pm-card" style={{ fontSize: 13.5, lineHeight: 1.55 }}>
            <b>Como ler esta tela</b>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              <li>Cada cartão é um pedido de venda de máquina (<b>PVM</b>). Ele nasce <b>Em montagem</b>.</li>
              <li><b>Importar de uma proposta</b> (opcional) traz o cliente, o vendedor e as parcelas que foram combinadas na Proposta. Cada parcela guarda de qual parcela da proposta veio.</li>
              <li>As máquinas são escolhidas pelo cadastro da Omie (pelo chassi). O total do pedido é a soma delas; as parcelas precisam fechar com esse total.</li>
              <li>Arraste o cartão entre <b>Em montagem</b>, <b>Aguardando crédito</b> e <b>Aguardando máquina</b> (no celular, use os botões de fase dentro do pedido).</li>
              <li><b>Enviado Omie</b> e <b>Faturado</b> mudam sozinhos quando você envia e fatura pelo pedido.</li>
              <li>Relação = tabela com filtro em cada coluna e exportar. Painel = valores por fase, mês e vendedor (clique numa barra para ver os pedidos).</li>
            </ul>
          </div>
        )}
        {migracao && <div className="pm-aviso">O módulo ainda não foi ativado no banco: falta aplicar <b>sql/pedidos-maquinas.sql</b> (e <b>sql/proposta-pagamento.sql</b> para as parcelas da Proposta).</div>}
        {erro && <div className="pm-erro">{erro}</div>}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: 520 }}>
            <Search size={16} style={{ position: 'absolute', left: 10, top: 12, color: 'var(--text-light)' }} />
            <input className="pm-input" style={{ paddingLeft: 32 }} placeholder="Cliente, PVM, chassi, modelo, vendedor, nº Omie, NF-e…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          <button className="pm-btn" onClick={() => { setCarregando(true); carregar(); }}><RefreshCw size={15} /> Atualizar</button>
          <Resumo lista={filtrada} />
        </div>

        {carregando ? <div style={{ fontSize: 14, color: 'var(--text-light)' }}>Carregando…</div> : (
          <>
            {aba === 'quadro' && <Quadro lista={filtrada} podeMover={pode(M, 'mover_fase')} onAbrir={abrir} onMovido={carregar} setErro={setErro} />}
            {aba === 'relacao' && <Relacao lista={filtrada} busca={busca} onAbrir={abrir} />}
            {aba === 'painel' && <Painel lista={filtrada} onAbrir={abrir} />}
          </>
        )}
      </div>

      {aberto && <PedidoDrawer id={aberto} onFechar={() => abrir(null)} onMudou={carregar} />}
    </div>
  );
}

function Resumo({ lista }: { lista: PedidoLista[] }) {
  const t = totais(lista);
  const item = (rot: string, val: string, cor?: string) => (
    <span style={{ display: 'flex', flexDirection: 'column', fontSize: 11, color: 'var(--text-light)', textTransform: 'uppercase', fontWeight: 700 }}>
      {rot}<b style={{ fontSize: 16, color: cor || 'var(--text)', textTransform: 'none' }}>{val}</b>
    </span>
  );
  return (
    <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginLeft: 'auto' }}>
      {item('Em aberto', `${t.abertos} · ${brl(t.valorAbertos)}`, '#dc2626')}
      {item('Faturados', `${t.faturados} · ${brl(t.valorFaturados)}`, '#16a34a')}
      {item('Com proposta', `${t.comProposta} de ${t.n}`)}
    </div>
  );
}

// ---------------------------------------------------------------------------
function Cartao({ p, onAbrir, arrastavel, onDragStart }: { p: PedidoLista; onAbrir: (id: string) => void; arrastavel: boolean; onDragStart?: (e: React.DragEvent) => void }) {
  const dias = diasNaFase(p);
  return (
    <button draggable={arrastavel} onDragStart={onDragStart} onClick={() => onAbrir(p.id_pedido)} className="pm-card"
      style={{ textAlign: 'left', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 4, fontFamily: 'inherit', color: 'var(--text)', padding: '10px 12px', width: '100%' }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <b style={{ color: '#dc2626' }}>{p.id_pedido}</b>
        {p.proposta_id && <span className="pm-selo" style={{ background: '#fee2e2', color: '#991b1b' }}>Prop. #{p.proposta_id}</span>}
        {dias != null && <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--text-light)' }}>{dias}d na fase</span>}
      </div>
      <span style={{ fontWeight: 600, fontSize: 14, overflowWrap: 'anywhere' }}>{p.cliente || 'Sem cliente'}</span>
      <span style={{ fontSize: 12.5, color: 'var(--text-light)', overflowWrap: 'anywhere' }}>{p.maquinas.join(' · ') || 'sem máquina'}</span>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <b style={{ fontSize: 15 }}>{brl(p.valor_total)}</b>
        <span style={{ fontSize: 12, color: 'var(--text-light)', marginLeft: 'auto' }}>{p.vendedor_nome || '—'}</span>
      </div>
      {(p.pedido_omie || p.nf_numero) && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {p.pedido_omie && <span className="pm-selo" style={{ background: '#e0f2fe', color: '#075985' }}>Omie {p.pedido_omie}</span>}
          {p.nf_numero && <span className="pm-selo" style={{ background: '#dcfce7', color: '#166534' }}>NF-e {p.nf_numero}</span>}
        </div>
      )}
    </button>
  );
}

function Quadro({ lista, podeMover, onAbrir, onMovido, setErro }: { lista: PedidoLista[]; podeMover: boolean; onAbrir: (id: string) => void; onMovido: () => void; setErro: (s: string) => void }) {
  const [arrastando, setArrastando] = useState<PedidoLista | null>(null);
  const [mostrarEncerrados, setMostrarEncerrados] = useState(false);
  const fases = FASES_PEDIDO_MAQUINA.filter((f) => mostrarEncerrados || !f.encerrada);

  const soltar = async (fase: string) => {
    const p = arrastando; setArrastando(null);
    if (!p || p.status === fase) return;
    const erro = podeMoverPara(p.status, fase, { enviado: !!p.pedido_omie });
    if (erro) { setErro(erro); return; }
    const r = await fetchAuth('/api/pedidos-maquinas', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id, status: fase }) });
    if (!r.ok) setErro((await r.json().catch(() => ({}))).error || 'Não foi possível mover.');
    onMovido();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, minHeight: 32 }}>
        <input type="checkbox" checked={mostrarEncerrados} onChange={(e) => setMostrarEncerrados(e.target.checked)} style={{ width: 18, height: 18 }} /> Mostrar faturados e cancelados
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${fases.length}, minmax(240px, 1fr))`, gap: 10, overflowX: 'auto', paddingBottom: 6 }}>
        {fases.map((f) => {
          const doFase = lista.filter((p) => p.status === f.id);
          const alvo = arrastando && !podeMoverPara(arrastando.status, f.id, { enviado: !!arrastando.pedido_omie });
          return (
            <div key={f.id} onDragOver={(e) => { if (alvo) e.preventDefault(); }} onDrop={() => soltar(f.id)}
              style={{ background: 'var(--bg)', borderRadius: 10, padding: 8, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 200, outline: alvo ? `2px dashed ${f.cor}` : 'none', opacity: arrastando && !alvo && arrastando.status !== f.id ? 0.5 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 4px' }}>
                <span style={{ width: 10, height: 10, borderRadius: 999, background: f.cor }} />
                <b style={{ fontSize: 13.5 }}>{f.rotulo}</b>
                <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-light)' }}>{doFase.length} · {brl(doFase.reduce((s, p) => s + p.valor_total, 0))}</span>
              </div>
              {doFase.map((p) => (
                <Cartao key={p.id} p={p} onAbrir={onAbrir} arrastavel={podeMover && !f.encerrada}
                  onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; setArrastando(p); }} />
              ))}
              {!doFase.length && <span style={{ fontSize: 12.5, color: 'var(--text-light)', padding: 6 }}>Nenhum pedido.</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function Relacao({ lista, busca, onAbrir }: { lista: PedidoLista[]; busca: string; onAbrir: (id: string) => void }) {
  const [filtros, setFiltros] = useState<Partial<Record<ColunaRel, string>>>({});
  const [ordem, setOrdem] = useState<{ k: ColunaRel; dir: 'asc' | 'desc' }>({ k: 'criado', dir: 'desc' });
  const linhas = useMemo(() => ordenarRel(filtrarRel(lista, filtros, busca), ordem.k, ordem.dir), [lista, filtros, busca, ordem]);
  const baixar = () => {
    const blob = new Blob([csv(linhas)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `pedidos-maquinas-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13 }}>{linhas.length} pedido(s) · {brl(linhas.reduce((s, p) => s + (p.status === 'cancelado' ? 0 : p.valor_total), 0))}</span>
        {Object.values(filtros).some(Boolean) && <button className="pm-btn" onClick={() => setFiltros({})}>Limpar filtros</button>}
        <button className="pm-btn" style={{ marginLeft: 'auto' }} onClick={baixar}><Download size={15} /> CSV</button>
      </div>
      <div className="pm-tabela-wrap">
        <table className="pm-tabela" style={{ minWidth: 1100 }}>
          <thead>
            <tr>
              {COLUNAS_REL.map((c) => (
                <th key={c.k} onClick={() => setOrdem((o) => ({ k: c.k, dir: o.k === c.k && o.dir === 'asc' ? 'desc' : 'asc' }))} style={{ cursor: 'pointer', userSelect: 'none' }}
                  aria-sort={ordem.k === c.k ? (ordem.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                  {c.label} {ordem.k === c.k ? (ordem.dir === 'asc' ? '▲' : '▼') : '⇅'}
                </th>
              ))}
            </tr>
            <tr>
              {COLUNAS_REL.map((c) => (
                <th key={c.k} style={{ padding: 4 }}>
                  {c.k === 'fase' ? (
                    <select className="pm-input" style={{ minHeight: 32 }} value={filtros.fase || ''} onChange={(e) => setFiltros((f) => ({ ...f, fase: e.target.value }))}>
                      <option value="">Todas</option>
                      {FASES_PEDIDO_MAQUINA.map((f) => <option key={f.id} value={f.rotulo}>{f.rotulo}</option>)}
                    </select>
                  ) : (
                    <input className="pm-input" style={{ minHeight: 32, fontSize: 12.5 }} value={filtros[c.k] || ''} placeholder="filtrar" onChange={(e) => setFiltros((f) => ({ ...f, [c.k]: e.target.value }))} />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((p) => (
              <tr key={p.id} onClick={() => onAbrir(p.id_pedido)} style={{ cursor: 'pointer' }}>
                {COLUNAS_REL.map((c) => (
                  <td key={c.k} style={{ whiteSpace: c.k === 'cliente' || c.k === 'maquinas' ? 'normal' : 'nowrap', textAlign: c.num ? 'right' : 'left', fontWeight: c.k === 'id_pedido' || c.k === 'valor' ? 700 : 400 }}>
                    {c.k === 'fase'
                      ? <span className="pm-selo" style={{ background: `${faseInfo(p.status).cor}22`, color: faseInfo(p.status).cor }}>{faseInfo(p.status).rotulo}</span>
                      : textoColuna(p, c.k) || '—'}
                  </td>
                ))}
              </tr>
            ))}
            {!linhas.length && <tr><td colSpan={COLUNAS_REL.length} style={{ color: 'var(--text-light)' }}>Nenhum pedido.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function Barras({ titulo, itens, cor, corDe, onClique }: { titulo: string; itens: Agregado[]; cor?: string; corDe?: (a: Agregado) => string; onClique: (a: Agregado) => void }) {
  const max = Math.max(1, ...itens.map((a) => a.valor));
  return (
    <div className="pm-card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <b style={{ fontSize: 14 }}>{titulo}</b>
      {itens.map((a) => (
        <button key={a.chave} onClick={() => onClique(a)} title={`${a.n} pedido(s)`}
          style={{ display: 'grid', gridTemplateColumns: 'minmax(90px, 160px) 1fr auto', gap: 8, alignItems: 'center', border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text)', minHeight: 30 }}>
          <span style={{ fontSize: 12.5, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.label}</span>
          <span style={{ height: 14, background: 'var(--bg)', borderRadius: 4, overflow: 'hidden' }}>
            <span style={{ display: 'block', height: '100%', width: `${(a.valor / max) * 100}%`, background: corDe ? corDe(a) : cor || '#dc2626', borderRadius: 4, transition: 'width .5s ease' }} />
          </span>
          <span style={{ fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap' }}>{brl(a.valor)} <span style={{ color: 'var(--text-light)', fontWeight: 500 }}>({a.n})</span></span>
        </button>
      ))}
      {!itens.length && <span style={{ fontSize: 13, color: 'var(--text-light)' }}>Sem dados.</span>}
    </div>
  );
}

function Painel({ lista, onAbrir }: { lista: PedidoLista[]; onAbrir: (id: string) => void }) {
  const [sel, setSel] = useState<{ titulo: string; ids: string[] } | null>(null);
  const validos = lista.filter((p) => p.status !== 'cancelado');
  const porFase = agregar(lista, (p) => p.status, (c) => faseInfo(c).rotulo);
  const porMes = agregar(validos, (p) => String(p.criado_em || '').slice(0, 7), rotuloMes, 'chave').slice(-12);
  const porFat = agregar(validos.filter((p) => p.status !== 'faturado'), (p) => String(p.previsao_faturamento || '').slice(0, 7) || 'sem', (c) => (c === 'sem' ? 'Sem previsão' : rotuloMes(c)), 'chave');
  const porVend = agregar(validos, (p) => p.vendedor_nome || 'Sem vendedor').slice(0, 12);
  const porCli = agregar(validos, (p) => p.cliente || 'Sem cliente').slice(0, 12);
  const clique = (titulo: string) => (a: Agregado) => setSel({ titulo: `${titulo}: ${a.label}`, ids: a.ids });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="pm-grade" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(340px, 100%), 1fr))' }}>
        <Barras titulo="Por fase" itens={porFase} corDe={(a) => faseInfo(a.chave).cor} onClique={clique('Fase')} />
        <Barras titulo="Por mês do pedido" itens={porMes} onClique={clique('Mês')} />
        <Barras titulo="A faturar, por previsão" itens={porFat} cor="#0284c7" onClique={clique('Previsão')} />
        <Barras titulo="Por vendedor" itens={porVend} cor="#7c3aed" onClique={clique('Vendedor')} />
        <Barras titulo="Por cliente" itens={porCli} cor="#d97706" onClique={clique('Cliente')} />
      </div>
      {sel && (
        <div className="pm-modal-fundo" onClick={(e) => { if (e.target === e.currentTarget) setSel(null); }}>
          <div className="pm-modal">
            <div style={{ display: 'flex', alignItems: 'center' }}><b style={{ flex: 1 }}>{sel.titulo}</b><button className="pm-btn" onClick={() => setSel(null)}>Fechar</button></div>
            {lista.filter((p) => sel.ids.includes(p.id_pedido)).map((p) => (
              <button key={p.id} className="pm-card" onClick={() => { setSel(null); onAbrir(p.id_pedido); }}
                style={{ display: 'flex', gap: 10, flexWrap: 'wrap', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text)' }}>
                <b style={{ color: '#dc2626' }}>{p.id_pedido}</b><span>{p.cliente || '—'}</span>
                <span style={{ color: 'var(--text-light)', fontSize: 12.5 }}>{faseInfo(p.status).rotulo} · {dataCurta(p.criado_em)}</span>
                <b style={{ marginLeft: 'auto' }}>{brl(p.valor_total)}</b>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
