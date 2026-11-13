'use client';
// Janela do Pedido de Máquinas: proposta · cliente/vendedor · máquinas · pagamento · Omie · histórico.
// Grava campo a campo (ao sair do campo). Depois de enviado à Omie, só observação e previsão mudam.
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  X, FileText, Unlink, Search, Plus, Trash2, Wand2, Send, Receipt, Ban, History, ExternalLink, Save, Eye,
} from 'lucide-react';
import { fetchAuth } from '@/lib/auth/client';
import { usePermissoes } from '@/hooks/usePermissoes';
import { useAuth } from '@/hooks/useAuth';
import {
  faseInfo, FASES_PEDIDO_MAQUINA, totalItem, totalItens, somaParcelas, podeMoverPara, CONTA_PADRAO,
  type ParcelaPedidoMaquina, type ItemPedidoMaquina,
} from '@/lib/pedidos-maquinas/regras';
import { gerarParcelas, numeroBR, somarDiasISO, MEIOS } from '@/lib/propostas/pagamento';
import { brl } from '@/lib/pedidos-maquinas/lista';
import ModalImportarProposta from './ModalImportarProposta';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Pedido = Record<string, any> & { id: number; id_pedido: string; status: string };
interface Dados {
  pedido: Pedido;
  itens: (ItemPedidoMaquina & { id: number })[];
  parcelas: ParcelaPedidoMaquina[];
  logs: { id: number; acao: string; usuario: string | null; criado_em: string }[];
  vendedor: { id: number; nome: string } | null;
  proposta: Record<string, any> | null;
}
interface Listas {
  categorias: { codigo: string; descricao: string }[];
  contasCorrentes: { codigo: string; descricao: string }[];
  cenarios: { codigo: string; descricao: string }[];
  vendedores: { id: number; nome: string }[];
}

const hojeISO = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const M = 'pedidos-maquinas';

async function api(url: string, metodo = 'GET', corpo?: unknown) {
  const r = await fetchAuth(url, {
    method: metodo,
    ...(corpo !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) } : {}),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Erro ${r.status}`);
  return j;
}

export default function PedidoDrawer({ id, onFechar, onMudou }: { id: string | number; onFechar: () => void; onMudou: () => void }) {
  const { userProfile } = useAuth();
  const { pode } = usePermissoes(userProfile?.id);
  const [d, setD] = useState<Dados | null>(null);
  const [erro, setErro] = useState('');
  const [msg, setMsg] = useState('');
  const [listas, setListas] = useState<Listas | null>(null);
  const [importar, setImportar] = useState(false);
  const [ocupado, setOcupado] = useState('');

  const carregar = useCallback(async () => {
    try { setD(await api(`/api/pedidos-maquinas?id=${encodeURIComponent(String(id))}`)); setErro(''); }
    catch (e) { setErro((e as Error).message); }
  }, [id]);
  useEffect(() => { carregar(); }, [carregar]);
  const empresa = d?.pedido.empresa;
  useEffect(() => {
    if (!empresa) return;
    api(`/api/pedidos-maquinas/listas?empresa=${encodeURIComponent(empresa)}`).then(setListas).catch(() => setListas(null));
  }, [empresa]);

  const p = d?.pedido;
  const enviado = !!p?.pedido_omie;
  const encerrado = p?.status === 'faturado' || p?.status === 'cancelado';
  const podeEditar = pode(M, 'editar') && !enviado && !encerrado;

  const acao = async (rotulo: string, fn: () => Promise<unknown>, ok?: string) => {
    setOcupado(rotulo); setErro(''); setMsg('');
    try { await fn(); if (ok) setMsg(ok); await carregar(); onMudou(); }
    catch (e) { setErro((e as Error).message); }
    finally { setOcupado(''); }
  };

  const salvarCampo = (campo: string, valor: unknown) => {
    if (!p || JSON.stringify(p[campo] ?? null) === JSON.stringify(valor ?? null)) return;
    acao('campo', () => api('/api/pedidos-maquinas', 'PATCH', { id: p.id, [campo]: valor }));
  };

  if (!d || !p) {
    return (
      <div className="pm-overlay" onClick={onFechar}>
        <div className="pm-drawer" style={{ alignItems: 'center', justifyContent: 'center' }}>{erro ? <div className="pm-erro">{erro}</div> : 'Carregando…'}</div>
      </div>
    );
  }

  const fase = faseInfo(p.status);
  const total = totalItens(d.itens);

  return (
    <div className="pm-overlay" onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="pm-drawer" role="dialog" aria-label={`Pedido ${p.id_pedido}`}>
        {/* Cabeçalho */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 18, fontWeight: 800 }}>{p.id_pedido}</span>
          <span className="pm-selo" style={{ background: `${fase.cor}22`, color: fase.cor }}>{fase.rotulo}</span>
          {enviado && <span className="pm-selo" style={{ background: '#e0f2fe', color: '#075985' }}>Omie nº {p.pedido_omie}</span>}
          {p.nf_numero && <span className="pm-selo" style={{ background: '#dcfce7', color: '#166534' }}>NF-e {p.nf_numero}</span>}
          <span style={{ marginLeft: 'auto', fontSize: 18, fontWeight: 800, color: '#dc2626' }}>{brl(total)}</span>
          <button className="pm-btn" onClick={onFechar} aria-label="Fechar"><X size={18} /></button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 'clamp(12px, 2vw, 22px)', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {erro && <div className="pm-erro">{erro}</div>}
          {msg && <div className="pm-aviso" style={{ background: '#f0fdf4', borderColor: '#bbf7d0', color: '#166534' }}>{msg}</div>}
          {p.status === 'cancelado' && <div className="pm-erro">Cancelado: {p.motivo_cancelamento}</div>}

          {/* Fase (alternativa ao arrastar, serve no celular) */}
          {!encerrado && pode(M, 'mover_fase') && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span className="pm-lbl">Fase:</span>
              {FASES_PEDIDO_MAQUINA.filter((f) => !f.encerrada && !f.automatica).map((f) => {
                const bloq = podeMoverPara(p.status, f.id, { enviado });
                const ativo = p.status === f.id;
                return (
                  <button key={f.id} className="pm-btn" disabled={!!bloq && !ativo} title={bloq || ''}
                    style={ativo ? { background: f.cor, borderColor: f.cor, color: '#fefefe' } : {}}
                    onClick={() => !ativo && acao('fase', () => api('/api/pedidos-maquinas', 'PATCH', { id: p.id, status: f.id }))}>
                    {f.curto}
                  </button>
                );
              })}
            </div>
          )}

          {/* 1. Proposta */}
          <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="pm-sec-tit"><FileText size={15} /> Proposta</div>
            {d.proposta ? (
              <div className="pm-card" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <b style={{ color: '#dc2626' }}>#{d.proposta.id}</b>
                {d.proposta.removida ? <span>proposta apagada ou na lixeira</span> : (
                  <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{d.proposta.Cliente} · {[d.proposta.Marca, d.proposta.Modelo].filter(Boolean).join(' ')} · {d.proposta.vendedor_nome || '—'}</span>
                )}
                {d.proposta.status === 'Concluida-Vendido'
                  ? <span className="pm-selo" style={{ background: '#dcfce7', color: '#166534' }}>Vendida</span>
                  : d.proposta.status && <span className="pm-selo" style={{ background: '#f1f5f9', color: '#475569' }}>{d.proposta.status}</span>}
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <a className="pm-btn" href={`/propostas?id=${d.proposta.id}`} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Abrir</a>
                  {podeEditar && <button className="pm-btn" onClick={() => setImportar(true)}>Importar de novo</button>}
                  {pode(M, 'editar') && p.status !== 'faturado' && (
                    <button className="pm-btn perigo" onClick={() => confirm('Desligar este pedido da proposta? As parcelas continuam.') && acao('desv', () => api(`/api/pedidos-maquinas/importar-proposta?pedido_id=${p.id}`, 'DELETE'))}>
                      <Unlink size={15} /> Desvincular
                    </button>
                  )}
                </span>
              </div>
            ) : (
              <div className="pm-card" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13.5, color: 'var(--text-light)' }}>Sem proposta (não é obrigatório).</span>
                {podeEditar && <button className="pm-btn pri" style={{ marginLeft: 'auto' }} onClick={() => setImportar(true)}><FileText size={15} /> Importar de uma proposta</button>}
              </div>
            )}
          </section>

          {/* 2. Cliente e vendedor */}
          <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="pm-sec-tit">Cliente e vendedor</div>
            <div className="pm-card pm-grade">
              <BuscaCliente disabled={!podeEditar} nome={p.cliente} doc={p.cliente_documento}
                onEscolher={(nome, doc) => acao('cli', () => api('/api/pedidos-maquinas', 'PATCH', { id: p.id, cliente: nome, cliente_documento: doc }))} />
              <div className="pm-campo">
                <span className="pm-lbl">Vendedor</span>
                <select className="pm-input" disabled={!podeEditar} value={p.vendedor_id ?? ''} onChange={(e) => salvarCampo('vendedor_id', e.target.value ? Number(e.target.value) : null)}>
                  <option value="">— escolha —</option>
                  {(listas?.vendedores || (d.vendedor ? [d.vendedor] : [])).map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
                </select>
              </div>
              <div className="pm-campo">
                <span className="pm-lbl">Empresa</span>
                <select className="pm-input" disabled={!podeEditar || d.itens.length > 0} title={d.itens.length ? 'Tire os itens para trocar a empresa' : ''} value={p.empresa} onChange={(e) => salvarCampo('empresa', e.target.value)}>
                  <option>Nova Tratores</option>
                  <option>Castro Peças</option>
                </select>
              </div>
              <div className="pm-campo">
                <span className="pm-lbl">Previsão de faturamento</span>
                <input type="date" className="pm-input" disabled={encerrado} defaultValue={p.previsao_faturamento || ''} key={`prev-${p.previsao_faturamento}`} onBlur={(e) => salvarCampo('previsao_faturamento', e.target.value || null)} />
              </div>
            </div>
          </section>

          {/* 3. Máquinas */}
          <Itens d={d} podeEditar={podeEditar} acao={acao} />

          {/* 4. Pagamento */}
          <Pagamento key={`pag-${d.parcelas.map((x) => `${x.vencimento}${x.valor}`).join()}-${total}`} d={d} total={total} podeEditar={podeEditar} acao={acao} />

          {/* 5. Omie */}
          <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="pm-sec-tit">Omie</div>
            <div className="pm-card pm-grade">
              <div className="pm-campo">
                <span className="pm-lbl">Categoria * <span style={{ textTransform: 'none', fontWeight: 500 }}>(pela máquina)</span></span>
                <select className="pm-input" disabled={!podeEditar} value={p.categoria_pedido || ''} onChange={(e) => salvarCampo('categoria_pedido', e.target.value || null)}>
                  <option value="">— escolha —</option>
                  {(listas?.categorias || []).map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} · {c.descricao}</option>)}
                </select>
              </div>
              <div className="pm-campo">
                <span className="pm-lbl">Conta corrente</span>
                <select className="pm-input" disabled={!podeEditar} value={p.conta_corrente || CONTA_PADRAO} onChange={(e) => salvarCampo('conta_corrente', e.target.value || null)}>
                  {(listas?.contasCorrentes || []).map((c) => <option key={c.codigo} value={c.codigo}>{c.descricao}</option>)}
                </select>
              </div>
              <div className="pm-campo">
                <span className="pm-lbl">Cenário fiscal</span>
                <select className="pm-input" disabled={!podeEditar} value={p.cenario_fiscal || ''} onChange={(e) => salvarCampo('cenario_fiscal', e.target.value || null)}>
                  <option value="">Padrão da Omie</option>
                  {(listas?.cenarios || []).map((c) => <option key={c.codigo} value={c.codigo}>{c.descricao}</option>)}
                </select>
              </div>
              <CampoProjeto valor={p.projeto} empresa={p.empresa} disabled={!podeEditar}
                sugestao={d.itens.find((i) => i.chassi) ? [d.itens.find((i) => i.chassi)!.marca, d.itens.find((i) => i.chassi)!.modelo, d.itens.find((i) => i.chassi)!.chassi].filter(Boolean).join(' ').toUpperCase() : ''}
                onEscolher={(nome) => salvarCampo('projeto', nome)} />
              <div className="pm-campo">
                <span className="pm-lbl">Contato</span>
                <input className="pm-input" disabled={!podeEditar} defaultValue={p.contato || ''} key={`cont-${p.contato}`} onBlur={(e) => salvarCampo('contato', e.target.value.trim() || null)} />
              </div>
              <label className="pm-campo" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40 }}>
                <input type="checkbox" disabled={!podeEditar} checked={!!p.consumo_final} onChange={(e) => salvarCampo('consumo_final', e.target.checked)} style={{ width: 18, height: 18 }} />
                <span style={{ fontSize: 14 }}>Consumidor final</span>
              </label>
              <div className="pm-campo" style={{ gridColumn: '1 / -1' }}>
                <span className="pm-lbl">Dados adicionais da NF</span>
                <textarea className="pm-input" rows={2} disabled={!podeEditar} defaultValue={p.dados_nf || ''} key={`nf-${p.dados_nf}`} onBlur={(e) => salvarCampo('dados_nf', e.target.value.trim() || null)} />
              </div>
              <div className="pm-campo" style={{ gridColumn: '1 / -1' }}>
                <span className="pm-lbl">Observação interna (não vai à Omie)</span>
                <textarea className="pm-input" rows={2} disabled={p.status === 'cancelado'} defaultValue={p.observacao || ''} key={`obs-${p.observacao}`} onBlur={(e) => salvarCampo('observacao', e.target.value.trim() || null)} />
              </div>
            </div>
            <AcoesOmie p={p} pode={pode} ocupado={ocupado} acao={acao} setErro={setErro} />
          </section>

          {/* 6. Histórico */}
          <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="pm-sec-tit"><History size={15} /> Histórico</div>
            <div className="pm-card" style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
              {d.logs.map((l) => (
                <div key={l.id} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ color: 'var(--text-light)', whiteSpace: 'nowrap' }}>{new Date(l.criado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                  <span style={{ fontWeight: 600 }}>{l.usuario || '—'}</span>
                  <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{l.acao}</span>
                </div>
              ))}
              {!d.logs.length && <span style={{ color: 'var(--text-light)' }}>Sem registros.</span>}
            </div>
          </section>
        </div>
      </div>
      {importar && (
        <ModalImportarProposta pedidoId={p.id} totalPedido={total} onFechar={() => setImportar(false)}
          onImportado={() => { setImportar(false); setMsg('Proposta importada.'); carregar(); onMudou(); }} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
function BuscaCliente({ nome, doc, disabled, onEscolher }: { nome: string | null; doc: string | null; disabled: boolean; onEscolher: (nome: string, doc: string) => void }) {
  const [q, setQ] = useState('');
  const [aberto, setAberto] = useState(false);
  const [res, setRes] = useState<{ nome: string; documento: string; cidade?: string }[]>([]);
  useEffect(() => {
    const t = setTimeout(() => {
      if (q.trim().length < 2) { setRes([]); return; }
      fetchAuth(`/api/ppv/clientes?termo=${encodeURIComponent(q.trim())}`).then((r) => r.json()).then((j) => setRes(Array.isArray(j) ? j.slice(0, 15) : [])).catch(() => setRes([]));
    }, 300);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className="pm-campo" style={{ position: 'relative', gridColumn: 'span 2' }}>
      <span className="pm-lbl">Cliente *</span>
      {!aberto ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 40, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{nome || '—'}</span>
          <span style={{ fontSize: 12.5, color: 'var(--text-light)' }}>{doc || 'sem CPF/CNPJ'}</span>
          {!disabled && <button className="pm-btn" onClick={() => setAberto(true)}><Search size={14} /> {nome ? 'Trocar' : 'Buscar'}</button>}
        </div>
      ) : (
        <>
          <input autoFocus className="pm-input" placeholder="Nome, razão social ou CPF/CNPJ" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setAberto(false)} />
          {res.length > 0 && q.trim().length >= 2 && (
            <div className="pm-lista-flutuante">
              {res.map((c, i) => (
                <button key={i} className="pm-lista-item" onClick={() => { onEscolher(c.nome, c.documento); setAberto(false); setQ(''); }}>
                  <b>{c.nome}</b> <span style={{ fontSize: 12, color: 'var(--text-light)' }}>{c.documento} {c.cidade ? `· ${c.cidade}` : ''}</span>
                </button>
              ))}
            </div>
          )}
          <button className="pm-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setAberto(false)}>Cancelar</button>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
function CampoProjeto({ valor, empresa, disabled, sugestao, onEscolher }: { valor: string | null; empresa: string; disabled: boolean; sugestao: string; onEscolher: (nome: string | null) => void }) {
  const [q, setQ] = useState('');
  const [aberto, setAberto] = useState(false);
  const [res, setRes] = useState<{ codigo: number; nome: string; cliente_nome_ultimo: string | null }[]>([]);
  useEffect(() => {
    if (!aberto) return;
    const t = setTimeout(() => {
      api(`/api/pedidos-maquinas/projetos?q=${encodeURIComponent(q.trim())}&empresa=${encodeURIComponent(empresa)}`)
        .then((j) => setRes(j.projetos || [])).catch(() => setRes([]));
    }, 300);
    return () => clearTimeout(t);
  }, [q, aberto, empresa]);
  const novo = q.trim().toUpperCase();
  const existe = res.some((r) => r.nome.trim().toUpperCase() === novo);
  const escolher = (nome: string | null) => { onEscolher(nome); setAberto(false); setQ(''); };
  return (
    <div className="pm-campo" style={{ position: 'relative' }}>
      <span className="pm-lbl">Projeto</span>
      {!aberto ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 40, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{valor || '—'}</span>
          {!disabled && <button className="pm-btn" onClick={() => { setAberto(true); setQ(valor ? '' : sugestao); }}><Search size={14} /> {valor ? 'Trocar' : 'Escolher'}</button>}
          {!disabled && valor && <button className="pm-btn perigo" aria-label="Tirar projeto" onClick={() => escolher(null)}><X size={14} /></button>}
        </div>
      ) : (
        <>
          <input autoFocus className="pm-input" placeholder="Buscar projeto (modelo, chassi…) ou digitar um novo" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setAberto(false)} />
          <div className="pm-lista-flutuante">
            {novo.length >= 3 && !existe && (
              <button className="pm-lista-item" onClick={() => escolher(novo.slice(0, 70))}>
                <Plus size={14} /> Criar projeto <b>{novo.slice(0, 70)}</b> <span style={{ fontSize: 12, color: 'var(--text-light)' }}>(criado na Omie ao enviar)</span>
              </button>
            )}
            {res.map((r) => (
              <button key={r.codigo} className="pm-lista-item" onClick={() => escolher(r.nome)}>
                <b>{r.nome}</b> {r.cliente_nome_ultimo && <span style={{ fontSize: 12, color: 'var(--text-light)' }}>· {r.cliente_nome_ultimo}</span>}
              </button>
            ))}
            {!res.length && novo.length < 3 && <div style={{ padding: '9px 12px', fontSize: 13, color: 'var(--text-light)' }}>Digite para buscar.</div>}
          </div>
          <button className="pm-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setAberto(false)}>Cancelar</button>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
type Acao = (rotulo: string, fn: () => Promise<unknown>, ok?: string) => Promise<void>;

function Itens({ d, podeEditar, acao }: { d: Dados; podeEditar: boolean; acao: Acao }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState<any[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [mostrar, setMostrar] = useState(false);
  const modeloProposta = d.proposta?.Modelo ? String(d.proposta.Modelo) : '';
  useEffect(() => {
    if (!mostrar) return;
    const t = setTimeout(async () => {
      setBuscando(true);
      try {
        const j = await api(`/api/pedidos-maquinas/itens?q=${encodeURIComponent(q)}&empresa=${encodeURIComponent(d.pedido.empresa)}`);
        setRes(j.produtos || []);
      } catch { setRes([]); } finally { setBuscando(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [q, mostrar, d.pedido.empresa]);

  const incluir = (prod: any) => acao('item', () => api('/api/pedidos-maquinas/itens', 'POST', {
    pedido_id: d.pedido.id,
    item: {
      codigo: prod.codigo, codigo_produto: prod.codigo_produto, descricao: prod.descricao, familia: prod.familia_nome,
      marca: prod.marca, modelo: prod.modelo, chassi: /\d{4,}/.test(String(prod.codigo)) ? prod.codigo : null,
      qtde: 1, preco: Number(prod.valor_unitario) || 0,
    },
  }));
  const alterar = (id: number, campo: string, valor: unknown) => acao('item', () => api('/api/pedidos-maquinas/itens', 'PATCH', { id, [campo]: valor }));

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="pm-sec-tit">Máquinas e implementos</div>
      {d.itens.length > 0 && (
        <div className="pm-tabela-wrap">
          <table className="pm-tabela" style={{ minWidth: 680 }}>
            <thead><tr><th>Produto</th><th>Chassi</th><th style={{ width: 70 }}>Qtd</th><th style={{ width: 130 }}>Preço (R$)</th><th style={{ width: 120 }}>Desconto (R$)</th><th>Total</th><th /></tr></thead>
            <tbody>
              {d.itens.map((i) => (
                <tr key={i.id}>
                  <td style={{ minWidth: 200 }}><b>{i.descricao}</b><div style={{ fontSize: 12, color: 'var(--text-light)' }}>{i.codigo} · {i.familia || '—'}</div></td>
                  <td><input className="pm-input" disabled={!podeEditar} defaultValue={i.chassi || ''} key={`ch-${i.id}-${i.chassi}`} onBlur={(e) => e.target.value.trim().toUpperCase() !== (i.chassi || '') && alterar(i.id, 'chassi', e.target.value)} /></td>
                  <td><input className="pm-input" type="number" min={1} disabled={!podeEditar} defaultValue={Number(i.qtde)} key={`q-${i.id}-${i.qtde}`} onBlur={(e) => Number(e.target.value) !== Number(i.qtde) && alterar(i.id, 'qtde', Number(e.target.value))} /></td>
                  <td><input className="pm-input" inputMode="decimal" disabled={!podeEditar} defaultValue={Number(i.preco).toFixed(2).replace('.', ',')} key={`p-${i.id}-${i.preco}`} onBlur={(e) => numeroBR(e.target.value) !== Number(i.preco) && alterar(i.id, 'preco', numeroBR(e.target.value))} /></td>
                  <td><input className="pm-input" inputMode="decimal" disabled={!podeEditar} defaultValue={Number(i.desconto).toFixed(2).replace('.', ',')} key={`d-${i.id}-${i.desconto}`} onBlur={(e) => numeroBR(e.target.value) !== Number(i.desconto) && alterar(i.id, 'desconto', numeroBR(e.target.value))} /></td>
                  <td style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{brl(totalItem({ qtde: Number(i.qtde), preco: Number(i.preco), desconto: Number(i.desconto) }))}</td>
                  <td>{podeEditar && <button className="pm-btn perigo" aria-label="Tirar" onClick={() => confirm(`Tirar ${i.descricao}?`) && acao('item', () => api(`/api/pedidos-maquinas/itens?id=${i.id}`, 'DELETE'))}><Trash2 size={15} /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {podeEditar && !mostrar && (
        <button className="pm-btn" style={{ alignSelf: 'flex-start' }} onClick={() => { setMostrar(true); if (!q && modeloProposta) setQ(modeloProposta); }}><Plus size={15} /> Incluir máquina ou implemento</button>
      )}
      {podeEditar && mostrar && (
        <div className="pm-card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input autoFocus className="pm-input" placeholder="Modelo, chassi, código ou descrição (vazio = máquinas novas em estoque)" value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="pm-btn" onClick={() => setMostrar(false)}><X size={15} /></button>
          </div>
          {buscando && <span style={{ fontSize: 13, color: 'var(--text-light)' }}>Buscando…</span>}
          <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 300, overflowY: 'auto' }}>
            {res.map((r) => (
              <button key={`${r.codigo}-${r.codigo_produto}`} onClick={() => incluir(r)}
                style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', textAlign: 'left', padding: '9px 6px', border: 'none', borderBottom: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', cursor: 'pointer', fontFamily: 'inherit', minHeight: 44 }}>
                <span style={{ fontWeight: 600, minWidth: 0, overflowWrap: 'anywhere' }}>{r.descricao}</span>
                <span style={{ fontSize: 12, color: 'var(--text-light)' }}>{r.codigo} · {r.familia_nome || '—'}</span>
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span className="pm-selo" style={{ background: Number(r.estoque) > 0 ? '#dcfce7' : '#f1f5f9', color: Number(r.estoque) > 0 ? '#166534' : '#64748b' }}>estoque {Number(r.estoque) || 0}</span>
                  <b>{brl(Number(r.valor_unitario) || 0)}</b>
                </span>
              </button>
            ))}
            {!buscando && !res.length && <span style={{ fontSize: 13, color: 'var(--text-light)' }}>Nada encontrado nesta empresa.</span>}
          </div>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
function Pagamento({ d, total, podeEditar, acao }: { d: Dados; total: number; podeEditar: boolean; acao: Acao }) {
  const [linhas, setLinhas] = useState<ParcelaPedidoMaquina[]>(d.parcelas);
  const [qtd, setQtd] = useState(1);
  const [entrada, setEntrada] = useState('');
  const sujo = JSON.stringify(linhas) !== JSON.stringify(d.parcelas);
  const soma = somaParcelas(linhas);
  const dif = Math.round((total - soma) * 100) / 100;
  const temOrigem = useMemo(() => linhas.some((l) => l.origem_proposta_parcela != null), [linhas]);

  const gerar = () => {
    const ent = numeroBR(entrada);
    const hoje = hojeISO();
    const novas: ParcelaPedidoMaquina[] = [];
    if (ent > 0) novas.push({ n: 0, vencimento: hoje, valor: ent, percentual: 0, meio: 'pix', entrada: true, origem_proposta_parcela: null });
    gerarParcelas({ total, entrada: ent, base: hoje, quantidade: qtd, intervalo: 'mensal' })
      .forEach((p) => novas.push({ ...p, entrada: false, origem_proposta_parcela: null }));
    setLinhas(novas.map((x, i) => ({ ...x, n: i + 1 })));
  };
  const mudar = (i: number, patch: Partial<ParcelaPedidoMaquina>) => setLinhas((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="pm-sec-tit">Pagamento</div>
      <div className="pm-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {temOrigem && <div style={{ fontSize: 12.5, color: 'var(--text-light)' }}>As parcelas marcadas com <b>da proposta</b> vieram da proposta #{d.pedido.proposta_id}.</div>}
        {linhas.length > 0 && (
          <div className="pm-tabela-wrap">
            <table className="pm-tabela" style={{ minWidth: 560 }}>
              <thead><tr><th>Nº</th><th>Vencimento</th><th>Valor (R$)</th><th>%</th><th>Meio</th><th>Origem</th><th /></tr></thead>
              <tbody>
                {linhas.map((l, i) => (
                  <tr key={i}>
                    <td>{l.entrada ? 'Entrada' : i + 1}</td>
                    <td><input type="date" className="pm-input" disabled={!podeEditar} value={l.vencimento} onChange={(e) => mudar(i, { vencimento: e.target.value })} /></td>
                    <td><input className="pm-input" inputMode="decimal" disabled={!podeEditar} defaultValue={l.valor.toFixed(2).replace('.', ',')} key={`${i}-${l.valor}`} onBlur={(e) => mudar(i, { valor: numeroBR(e.target.value) })} /></td>
                    <td style={{ color: 'var(--text-light)' }}>{total > 0 ? `${(Math.round((l.valor / total) * 10000) / 100).toLocaleString('pt-BR')}%` : '—'}</td>
                    <td>
                      <select className="pm-input" disabled={!podeEditar} value={l.meio} onChange={(e) => mudar(i, { meio: e.target.value as ParcelaPedidoMaquina['meio'] })}>
                        {MEIOS.map((m) => <option key={m.valor} value={m.valor}>{m.rotulo}</option>)}
                      </select>
                    </td>
                    <td>{l.origem_proposta_parcela != null
                      ? <span className="pm-selo" style={{ background: '#fee2e2', color: '#991b1b' }}>da proposta · {l.origem_proposta_parcela === 0 ? 'entrada' : `parc. ${l.origem_proposta_parcela}`}</span>
                      : <span style={{ fontSize: 12, color: 'var(--text-light)' }}>no pedido</span>}</td>
                    <td>{podeEditar && <button className="pm-btn perigo" aria-label="Tirar parcela" onClick={() => setLinhas((ls) => ls.filter((_, k) => k !== i))}><Trash2 size={15} /></button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', fontSize: 13.5 }}>
          <span>Soma: <b>{brl(soma)}</b> de <b>{brl(total)}</b></span>
          {linhas.length > 0 && dif !== 0 && <span style={{ color: '#b45309', fontWeight: 600 }}>{dif > 0 ? `Faltam ${brl(dif)}` : `Passa ${brl(-dif)}`}</span>}
          {linhas.length > 0 && dif === 0 && <span style={{ color: '#15803d', fontWeight: 600 }}>Fecha com o total</span>}
        </div>
        {podeEditar && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="pm-campo" style={{ width: 140 }}><span className="pm-lbl">Entrada (R$)</span><input className="pm-input" inputMode="decimal" value={entrada} onChange={(e) => setEntrada(e.target.value)} /></div>
            <div className="pm-campo" style={{ width: 100 }}><span className="pm-lbl">Parcelas</span><input className="pm-input" type="number" min={1} value={qtd} onChange={(e) => setQtd(Number(e.target.value) || 1)} /></div>
            <button className="pm-btn" disabled={!(total > 0)} onClick={gerar} title={total > 0 ? '' : 'Inclua os itens primeiro'}><Wand2 size={15} /> Gerar mensais</button>
            <button className="pm-btn" onClick={() => setLinhas((ls) => [...ls, { n: ls.length + 1, vencimento: ls.length ? somarDiasISO(ls[ls.length - 1].vencimento || hojeISO(), 30) : hojeISO(), valor: Math.max(0, dif), percentual: 0, meio: 'boleto', entrada: false, origem_proposta_parcela: null }])}><Plus size={15} /> Parcela</button>
            <button className="pm-btn pri" disabled={!sujo} onClick={() => acao('pag', () => api('/api/pedidos-maquinas/parcelas', 'PUT', { pedido_id: d.pedido.id, parcelas: linhas }), 'Pagamento salvo.')}><Save size={15} /> Salvar pagamento</button>
            {sujo && <button className="pm-btn" onClick={() => setLinhas(d.parcelas)}>Desfazer</button>}
          </div>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
function AcoesOmie({ p, pode, ocupado, acao, setErro }: { p: Pedido; pode: (m: string, a?: string) => boolean; ocupado: string; acao: Acao; setErro: (s: string) => void }) {
  const [previa, setPrevia] = useState<any>(null);
  const [fat, setFat] = useState<any>(null);
  const enviado = !!p.pedido_omie;

  const verPrevia = async () => {
    setErro('');
    try { setPrevia(await api(`/api/pedidos-maquinas/omie?id=${p.id}`)); } catch (e) { setErro((e as Error).message); }
  };
  const verFaturar = async () => {
    setErro('');
    try { setFat(await api(`/api/pedidos-maquinas/faturar?id=${p.id}`)); } catch (e) { setErro((e as Error).message); }
  };

  return (
    <>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {!enviado && p.status !== 'cancelado' && pode(M, 'enviar_omie') && (
          <>
            <button className="pm-btn" onClick={verPrevia}><Eye size={15} /> Conferir antes de enviar</button>
            <button className="pm-btn azul" disabled={!!ocupado} onClick={() => confirm('Enviar este pedido para a Omie?') && acao('enviar', () => api('/api/pedidos-maquinas/omie', 'POST', { id: p.id }), 'Pedido enviado à Omie.')}>
              <Send size={15} /> {ocupado === 'enviar' ? 'Enviando…' : 'Enviar para a Omie'}
            </button>
          </>
        )}
        {enviado && !p.faturado_omie_em && p.status !== 'cancelado' && pode(M, 'faturar') && (
          <button className="pm-btn ok" onClick={verFaturar}><Receipt size={15} /> Faturar (NF-e)</button>
        )}
        {p.status !== 'faturado' && p.status !== 'cancelado' && pode(M, 'cancelar') && (
          <button className="pm-btn perigo" disabled={!!ocupado} onClick={() => {
            const motivo = prompt(enviado ? 'Motivo do cancelamento (o pedido também será cancelado na Omie):' : 'Motivo do cancelamento:');
            if (motivo && motivo.trim()) acao('cancelar', () => api('/api/pedidos-maquinas/cancelar', 'POST', { id: p.id, motivo }), 'Pedido cancelado.');
          }}><Ban size={15} /> Cancelar pedido</button>
        )}
      </div>

      {previa && (
        <div className="pm-card" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <b>O que vai para a Omie ({previa.empresa})</b>
          {(previa.avisos || []).map((a: string, i: number) => <div key={i} className="pm-aviso">{a}</div>)}
          <pre style={{ fontSize: 11.5, maxHeight: 260, overflow: 'auto', background: 'var(--bg)', padding: 10, borderRadius: 6, margin: 0 }}>{JSON.stringify(previa.payload, null, 2)}</pre>
          <button className="pm-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setPrevia(null)}>Fechar</button>
        </div>
      )}

      {fat && (
        <div className="pm-modal-fundo" onClick={(e) => { if (e.target === e.currentTarget) setFat(null); }}>
          <div className="pm-modal">
            <div style={{ fontSize: 17, fontWeight: 700 }}>Faturar o pedido {p.id_pedido}?</div>
            <div style={{ fontSize: 14 }}>Pedido Omie nº <b>{fat.numero}</b> ({fat.empresa}) · etapa {fat.etapa}</div>
            <div className="pm-tabela-wrap">
              <table className="pm-tabela"><thead><tr><th>Item</th><th>Qtd</th><th>Valor</th></tr></thead>
                <tbody>{(fat.itens || []).map((i: any, k: number) => <tr key={k}><td>{i.descricao}</td><td>{i.quantidade}</td><td>{brl(Number(i.valor) || 0)}</td></tr>)}</tbody>
              </table>
            </div>
            <div style={{ fontSize: 14 }}>Total na Omie: <b>{brl(fat.totalOmie)}</b> · no portal: <b>{brl(fat.totalPortal)}</b></div>
            {fat.diverge && <div className="pm-aviso">O total da Omie é diferente do portal. Confira antes de faturar.</div>}
            {fat.jaFaturado && <div className="pm-aviso">A Omie já mostra este pedido na etapa de faturamento — confirmar só carimba a NF-e.</div>}
            {fat.bloqueio && <div className="pm-erro">{fat.bloqueio}</div>}
            <div style={{ fontSize: 13, color: 'var(--text-light)' }}>Faturar emite a NF-e na SEFAZ. Não dá para desfazer pelo portal.</div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button className="pm-btn" onClick={() => setFat(null)}>Voltar</button>
              <button className="pm-btn ok" disabled={!!fat.bloqueio || !!ocupado} onClick={async () => {
                await acao('faturar', async () => {
                  const r = await api('/api/pedidos-maquinas/faturar', 'POST', { id: p.id });
                  if (r.pendente) throw new Error(r.erro);
                }, 'Faturamento enviado. A NF-e aparece quando a SEFAZ autorizar.');
                setFat(null);
              }}><Receipt size={15} /> {ocupado === 'faturar' ? 'Faturando…' : 'Confirmar e faturar'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
