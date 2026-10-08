'use client';
// Painel "A alocar" de /ajustes/caracteristicas: peças RECEBIDAS que ainda não têm
// Prateleira/Andar/Caixa. A demanda nasce sozinha no recebimento da nota (motor em
// src/lib/pecas/alocacao-server.ts) e fecha sozinha quando a locação fica completa.
// Aqui a pessoa: aloca (mesmo modal da tela de Localização → POST /api/ajustes/localizacao),
// manda para a fila de etiquetas com cópias = quantidade recebida, ou dispensa com motivo.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { MapPin, PackageOpen, RefreshCw, Tag, X, CheckCircle } from 'lucide-react';
import { authHeaders } from '@/lib/auth/client';
import { ModalMover } from '@/components/ajustes/ModalMoverPeca';
import { chaveProd, locacaoEtiqueta, posLabel, type Pos, type ProdutoLoc } from '@/lib/ajustes/posicao';
import { copiasEtiqueta, diasDesde, type GrupoAlocacao } from '@/lib/pecas/alocacao';

export interface ListaAlocacaoCliente {
  tabelaAusente: boolean;
  grupos: GrupoAlocacao[];
  totais: { pecas: number; linhas: number; minhas: number };
  meuUserId?: string;
}

const VAZIA: ListaAlocacaoCliente = { tabelaAusente: false, grupos: [], totais: { pecas: 0, linhas: 0, minhas: 0 } };

/** Carrega as demandas abertas. A página usa a contagem no botão e o conjunto no filtro da matriz. */
export function useAlocacao(ativo: boolean) {
  const [lista, setLista] = useState<ListaAlocacaoCliente>(VAZIA);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await fetch('/api/pecas/alocacao', { headers: { ...(await authHeaders()) } });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.ok === false) throw new Error(d.erro || `Falha (${r.status})`);
      setLista({ tabelaAusente: !!d.tabelaAusente, grupos: d.grupos || [], totais: d.totais || VAZIA.totais, meuUserId: d.meuUserId });
      setErro(null);
    } catch (e) { setErro((e as Error).message); }
    finally { setCarregando(false); }
  }, []);

  useEffect(() => { if (ativo) recarregar(); }, [ativo, recarregar]);
  return { lista, carregando, erro, recarregar };
}

const EMPRESA_LABEL: Record<string, string> = { NOVA: 'NOVA TRATORES', CASTRO: 'CASTRO PEÇAS' };
const EMPRESA_COR: Record<string, string> = { NOVA: '#dc2626', CASTRO: '#ea580c' };
const btn: React.CSSProperties = { border: '1px solid #cbd5e1', background: '#fff', borderRadius: 8, padding: '7px 11px', fontSize: '.78rem', cursor: 'pointer', color: '#334155', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 };
const btnPrim: React.CSSProperties = { ...btn, background: '#1d4ed8', color: '#fff', border: '1px solid #1d4ed8' };

function fmtData(iso: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
}
function fmtQtd(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}
function espera(iso: string | null): string {
  const d = diasDesde(iso);
  if (d == null) return '';
  return d === 0 ? 'hoje' : d === 1 ? 'há 1 dia' : `há ${d} dias`;
}

interface Alocada { grupo: GrupoAlocacao; pos: Pos; completa: boolean; naFila: boolean }

export default function PainelAlocacao({ lista, carregando, erro, recarregar, produtos, focoCod, onFechar, onLocacaoGravada }: {
  lista: ListaAlocacaoCliente; carregando: boolean; erro: string | null; recarregar: () => Promise<void>;
  /** matriz já carregada pela tela: dá as sugestões de posição e o aviso de posição ocupada */
  produtos: ProdutoLoc[];
  focoCod?: string | null;
  onFechar: () => void;
  /** a tela reflete a nova posição na matriz sem recarregar tudo */
  onLocacaoGravada: (alvo: ProdutoLoc, pos: Pos, liberados: ProdutoLoc[]) => void;
}) {
  const [quem, setQuem] = useState<'todas' | 'minhas'>('todas');
  const [empresa, setEmpresa] = useState('');
  const [busca, setBusca] = useState(focoCod || '');
  const [alocar, setAlocar] = useState<GrupoAlocacao | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [alocadas, setAlocadas] = useState<Alocada[]>([]);       // feitas nesta sessão (para o botão da etiqueta)
  const [dispensar, setDispensar] = useState<string | null>(null); // chave do grupo com a caixa de motivo aberta
  const [motivo, setMotivo] = useState('');
  const [aviso, setAviso] = useState<{ texto: string; tipo: 'ok' | 'erro' } | null>(null);
  const [verificando, setVerificando] = useState(false);

  const porChave = useMemo(() => new Map(produtos.map((p) => [chaveProd(p), p])), [produtos]);
  const empresas = useMemo(() => Array.from(new Set(lista.grupos.map((g) => g.conta_omie))).sort(), [lista.grupos]);

  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return lista.grupos.filter((g) => {
      if (quem === 'minhas' && g.responsavel_user_id !== lista.meuUserId) return false;
      if (empresa && g.conta_omie !== empresa) return false;
      if (!t) return true;
      return String(g.codigo || '').toLowerCase().includes(t)
        || String(g.descricao || '').toLowerCase().includes(t)
        || g.notas.some((n) => String(n.numero_nfe || '').includes(t) || String(n.fornecedor || '').toLowerCase().includes(t));
    });
  }, [lista.grupos, lista.meuUserId, quem, empresa, busca]);

  // peça da demanda no formato da matriz (a recém-criada pode ainda não estar nela)
  const produtoDe = useCallback((g: GrupoAlocacao): ProdutoLoc => {
    const p = porChave.get(`${g.conta_omie}|${g.codigo_produto}`);
    return p || { empresa: g.conta_omie, codigo_produto: g.codigo_produto, codigo: g.codigo || undefined, descricao: g.descricao || undefined, caracteristicas: {} };
  }, [porChave]);

  async function confirmarAlocacao(target: ProdutoLoc, pos: Pos, liberar: ProdutoLoc[]) {
    const g = alocar;
    if (!g) return;
    setSalvando(true);
    try {
      const r = await fetch('/api/ajustes/localizacao', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({
          acao: 'definir', empresa: target.empresa, codigo_produto: target.codigo_produto,
          prateleira: pos.prat, andar: pos.andar, caixa: pos.caixa,
          liberar: liberar.map((p) => ({ empresa: p.empresa, codigo_produto: p.codigo_produto })),
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.erro) throw new Error(d.erro || `Falha (${r.status})`);
      onLocacaoGravada(target, pos, liberar);
      const completa = !!(pos.prat && pos.andar && pos.caixa);
      setAlocadas((prev) => [{ grupo: g, pos, completa, naFila: false }, ...prev.filter((a) => a.grupo.chave !== g.chave)]);
      setAlocar(null);
      setAviso(completa
        ? { texto: `Locação gravada: ${g.codigo || g.codigo_produto} → ${posLabel(pos)}`, tipo: 'ok' }
        : { texto: `Gravado, mas a locação ficou incompleta (${posLabel(pos)}). A demanda continua aberta até preencher Prateleira, Andar e Caixa.`, tipo: 'erro' });
      await recarregar();
    } catch (e) { setAviso({ texto: 'Erro ao gravar: ' + (e as Error).message, tipo: 'erro' }); }
    finally { setSalvando(false); }
  }

  async function addEtiqueta(a: Alocada) {
    const g = a.grupo;
    const car = { '#PRATELEIRA': a.pos.prat, '#ANDAR': a.pos.andar, '#CAIXA': a.pos.caixa };
    const linha = {
      conta: g.conta_omie,
      empresa: EMPRESA_LABEL[g.conta_omie] || g.conta_omie,
      codigo: g.codigo || String(g.codigo_produto),
      descricao: (g.descricao || '').trim(),
      locacao: locacaoEtiqueta(car),
    };
    try {
      const r = await fetch('/api/ppv/etiquetas/fila', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ linhas: [linha], copias: copiasEtiqueta(g.qtde) }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.erro) throw new Error(d.erro || 'falha');
      setAlocadas((prev) => prev.map((x) => (x.grupo.chave === g.chave ? { ...x, naFila: true } : x)));
      setAviso({ texto: `Etiqueta na fila: ${linha.codigo} × ${copiasEtiqueta(g.qtde)}`, tipo: 'ok' });
    } catch (e) { setAviso({ texto: 'Erro ao adicionar à fila: ' + (e as Error).message, tipo: 'erro' }); }
  }

  async function confirmarDispensa(g: GrupoAlocacao) {
    if (motivo.trim().length < 3) { setAviso({ texto: 'Informe o motivo da dispensa.', tipo: 'erro' }); return; }
    setSalvando(true);
    try {
      const r = await fetch('/api/pecas/alocacao', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ acao: 'dispensar', conta: g.conta_omie, codigo_produto: g.codigo_produto, motivo }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.ok === false) throw new Error(d.erro || `Falha (${r.status})`);
      setDispensar(null); setMotivo('');
      setAviso({ texto: `Dispensada: ${g.codigo || g.codigo_produto}`, tipo: 'ok' });
      await recarregar();
    } catch (e) { setAviso({ texto: 'Erro: ' + (e as Error).message, tipo: 'erro' }); }
    finally { setSalvando(false); }
  }

  async function verificarAgora() {
    setVerificando(true);
    try {
      const r = await fetch('/api/pecas/alocacao', { method: 'POST', headers: { ...(await authHeaders()) } });
      const d = await r.json().catch(() => ({}));
      if (!r.ok && !d.pulado) throw new Error(d.erro || `Falha (${r.status})`);
      setAviso(d.pulado
        ? { texto: d.pulado, tipo: 'erro' }
        : { texto: `Verificado na Omie (${(d.sync || []).reduce((n: number, s: { upserts?: number }) => n + (s.upserts || 0), 0)} notas recentes lidas): ${d.abertas || 0} demanda(s) nova(s), ${d.fechadas || 0} fechada(s).${(d.sync || []).some((s: { erro?: string | null }) => s.erro) ? ' Atenção: a leitura de uma das empresas falhou.' : ''}`, tipo: 'ok' });
      await recarregar();
    } catch (e) { setAviso({ texto: 'Erro: ' + (e as Error).message, tipo: 'erro' }); }
    finally { setVerificando(false); }
  }

  const alvoProduto = alocar ? produtoDe(alocar) : null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', zIndex: 50, display: 'flex', justifyContent: 'flex-end' }} onClick={onFechar}>
      <div className="est-touch" onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(760px, 100vw)', height: '100%', background: '#f8fafc', display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 24px rgba(15,23,42,.18)' }}>
        {/* cabeçalho */}
        <div style={{ padding: '14px 16px 10px', background: '#fff', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <PackageOpen size={18} color="#1d4ed8" />
            <h2 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: '#0f172a' }}>A alocar</h2>
            <span style={{ fontSize: '.74rem', color: '#64748b' }}>
              {lista.totais.pecas} peça(s) recebida(s) sem Prateleira / Andar / Caixa
            </span>
            <button onClick={onFechar} style={{ ...btn, marginLeft: 'auto', padding: 6 }} title="Fechar"><X size={16} /></button>
          </div>
          <p style={{ margin: '6px 0 10px', fontSize: '.74rem', color: '#64748b' }}>
            A demanda nasce em até 10 minutos depois que a nota é recebida (portal ou Omie) e fecha sozinha quando a peça ganha as três posições.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'inline-flex', border: '1px solid #cbd5e1', borderRadius: 8, overflow: 'hidden' }}>
              {(['todas', 'minhas'] as const).map((q) => (
                <button key={q} onClick={() => setQuem(q)}
                  style={{ border: 'none', padding: '6px 12px', fontSize: '.76rem', fontWeight: 600, cursor: 'pointer', background: quem === q ? '#1d4ed8' : '#fff', color: quem === q ? '#fefefe' : '#334155' }}>
                  {q === 'todas' ? `Todas (${lista.totais.pecas})` : `Minhas (${lista.totais.minhas})`}
                </button>
              ))}
            </div>
            <select value={empresa} onChange={(e) => setEmpresa(e.target.value)} style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: '6px 8px', fontSize: '.78rem', background: '#fff' }}>
              <option value="">Todas as empresas</option>
              {empresas.map((e) => <option key={e} value={e}>{EMPRESA_LABEL[e] || e}</option>)}
            </select>
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="código, descrição, nota ou fornecedor"
              style={{ flex: 1, minWidth: 160, border: '1px solid #cbd5e1', borderRadius: 8, padding: '6px 8px', fontSize: '.78rem' }} />
            <button onClick={verificarAgora} disabled={verificando} style={{ ...btn, opacity: verificando ? .6 : 1 }}
              title="Relê na Omie as notas recentes (emitidas nos últimos 45 dias) e atualiza as demandas — leva cerca de meio minuto. Sozinho, o portal faz isso a cada 10 min em horário comercial.">
              <RefreshCw size={14} /> {verificando ? 'Buscando na Omie…' : 'Verificar agora'}
            </button>
          </div>
          {aviso && (
            <div style={{ marginTop: 8, fontSize: '.76rem', padding: '6px 10px', borderRadius: 8, background: aviso.tipo === 'ok' ? '#ecfdf5' : '#fef2f2', color: aviso.tipo === 'ok' ? '#047857' : '#b91c1c', border: `1px solid ${aviso.tipo === 'ok' ? '#a7f3d0' : '#fecaca'}` }}>
              {aviso.texto}
            </div>
          )}
        </div>

        {/* corpo */}
        <div style={{ flex: 1, overflow: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {erro && <div style={{ color: '#b91c1c', fontSize: '.8rem' }}>Erro ao carregar: {erro}</div>}
          {lista.tabelaAusente && (
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: 8, padding: 10, fontSize: '.78rem' }}>
              A tabela das demandas ainda não existe no banco. Aplique <b>sql/pecas-alocacao-pendencias.sql</b> no SQL Editor do Supabase.
            </div>
          )}

          {alocadas.length > 0 && (
            <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 10, padding: 10 }}>
              <div style={{ fontSize: '.72rem', fontWeight: 700, color: '#047857', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.4px' }}>Alocadas agora</div>
              {alocadas.map((a) => (
                <div key={a.grupo.chave} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', flexWrap: 'wrap' }}>
                  <CheckCircle size={15} color="#047857" />
                  <span style={{ fontSize: '.8rem', color: '#0f172a' }}><b>{a.grupo.codigo || a.grupo.codigo_produto}</b> → {posLabel(a.pos)}</span>
                  {a.naFila
                    ? <span style={{ marginLeft: 'auto', fontSize: '.74rem', color: '#047857', fontWeight: 600 }}>✓ na fila de etiquetas</span>
                    : (
                      <button onClick={() => addEtiqueta(a)} style={{ ...btn, marginLeft: 'auto' }}
                        title="Põe a peça na fila da aba Etiquetas do PPV, com cópias = quantidade recebida">
                        <Tag size={14} /> Adicionar à fila de etiquetas ({copiasEtiqueta(a.grupo.qtde)} {copiasEtiqueta(a.grupo.qtde) === 1 ? 'cópia' : 'cópias'})
                      </button>
                    )}
                </div>
              ))}
            </div>
          )}

          {carregando && lista.grupos.length === 0 && <div style={{ color: '#64748b', fontSize: '.8rem' }}>Carregando…</div>}
          {!carregando && !lista.tabelaAusente && visiveis.length === 0 && (
            <div style={{ color: '#64748b', fontSize: '.82rem', padding: '18px 4px' }}>
              {lista.grupos.length === 0 ? 'Nenhuma peça recebida aguardando locação.' : 'Nenhuma peça no filtro.'}
            </div>
          )}

          {visiveis.map((g) => {
            const p = porChave.get(`${g.conta_omie}|${g.codigo_produto}`);
            const parcial = p ? locacaoEtiqueta(p.caracteristicas) : '';
            return (
              <div key={g.chave} style={{ background: '#fff', border: '1px solid #e2e8f0', borderLeft: `4px solid ${EMPRESA_COR[g.conta_omie] || '#64748b'}`, borderRadius: 8, padding: '10px 12px' }}>
                <div className="est-pa-row" style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 999, color: '#fefefe', background: EMPRESA_COR[g.conta_omie] || '#6b7280' }}>{EMPRESA_LABEL[g.conta_omie] || g.conta_omie}</span>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '.86rem', color: '#0f172a' }}>{g.codigo || g.codigo_produto}</span>
                      <span style={{ fontSize: '.74rem', color: '#b45309', fontWeight: 600 }}>{espera(g.recebido_em)}</span>
                    </div>
                    <div style={{ fontSize: '.82rem', color: '#334155', marginTop: 3 }}>{g.descricao || <em style={{ color: '#94a3b8' }}>sem descrição</em>}</div>
                    <div style={{ fontSize: '.74rem', color: '#64748b', marginTop: 5 }}>
                      {g.notas.map((n) => (
                        <div key={n.id}><b>{fmtQtd(n.qtde)} un</b> · NF {n.numero_nfe || '—'} · {n.fornecedor || 'fornecedor não informado'} · recebida em {fmtData(n.recebido_em)}</div>
                      ))}
                      {g.notas.length > 1 && <div style={{ marginTop: 2 }}>Total: <b>{fmtQtd(g.qtde)} un</b> em {g.notas.length} notas</div>}
                      <div style={{ marginTop: 2 }}>
                        Responsável: {g.responsavel_nome || <em>não definido</em>}
                        {parcial && <> · locação parcial: <b>{parcial}</b></>}
                      </div>
                    </div>
                  </div>
                  <div className="est-pa-acoes" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <button onClick={() => setAlocar(g)} style={btnPrim}><MapPin size={14} /> Alocar</button>
                    <button onClick={() => { setDispensar(dispensar === g.chave ? null : g.chave); setMotivo(''); }} style={btn}
                      title="Para peça que não vai para prateleira (ex.: fica no chão, já saiu)">Dispensar</button>
                  </div>
                </div>
                {dispensar === g.chave && (
                  <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                    <input autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (obrigatório) — ex.: peça grande, fica no pátio"
                      onKeyDown={(e) => { if (e.key === 'Enter') confirmarDispensa(g); }}
                      style={{ flex: '1 1 200px', minWidth: 0, border: '1px solid #cbd5e1', borderRadius: 8, padding: '7px 9px', fontSize: '.78rem' }} />
                    <button disabled={salvando} onClick={() => confirmarDispensa(g)} style={{ ...btn, color: '#b91c1c', borderColor: '#fecaca', opacity: salvando ? .6 : 1 }}>Confirmar dispensa</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {alocar && alvoProduto && (
        <div onClick={(e) => e.stopPropagation()}>
          <ModalMover
            produto={alvoProduto}
            produtosEmpresa={produtos.filter((p) => p.empresa === alocar.conta_omie)}
            salvando={salvando}
            titulo="Alocar peça recebida"
            rotuloConfirmar="Alocar aqui"
            nota={<>Recebidas <b>{fmtQtd(alocar.qtde)} un</b>. Preencha as <b>três</b> posições para a demanda fechar.</>}
            onCancelar={() => setAlocar(null)}
            onConfirmar={confirmarAlocacao}
          />
        </div>
      )}
    </div>
  );
}
