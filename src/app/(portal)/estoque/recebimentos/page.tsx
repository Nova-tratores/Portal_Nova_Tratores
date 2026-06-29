'use client';
// Recebimento de NF-e de fornecedor. Portado de GET /recebimentos (server.js:10372)
// consumindo /api/estoque/recebimentos{,/resumo,/usuarios,/[id]/{tipo,responsavel,
// concluir,reabrir},/sync,/produto{,/preco-venda}}, /danfe, /omie-categorias.
//
// Espelho do Omie (recebimentos_nfe). Concluir/Reabrir ESCREVEM no Omie.
import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';
import { useConta } from '@/components/estoque/ContaProvider';
import ContaSelector from '@/components/estoque/ContaSelector';
import { fmtRS } from '@/components/estoque/ui';

const TIPOS: Array<{ v: string; label: string }> = [
  { v: '', label: 'Todos' },
  { v: 'almoxarifado', label: 'Almox./Combustível' },
  { v: 'maquinas', label: 'Máquinas' },
  { v: 'pecas', label: 'Peças' },
  { v: 'pecas_garantia', label: 'Peças Garantia' },
];

interface ItemReceb {
  prod?: Record<string, unknown>;
  nCodProduto?: number | string;
  codigo_produto?: number | string;
  cDescricao?: string;
  xProd?: string;
  descricao?: string;
  nQtde?: number;
  qCom?: number;
  qtde?: number;
  quantidade?: number;
  nValUnit?: number;
  vUnCom?: number;
  valor_unitario?: number;
}
interface Recebimento {
  id: number;
  conta_omie: string;
  numero_nf: string;
  serie: string;
  data_emissao: string;
  nome_emitente: string;
  id_fornecedor?: string;
  valor_nf: number;
  etapa_nome: string;
  concluido: boolean;
  tipo: string;
  responsavel: string | null;
  codigo_categoria: string | null;
  itens: ItemReceb[];
}
interface ListaResp { recebimentos: Recebimento[]; total: number; pagina: number; totalPaginas: number; meuEmail?: string; aviso?: string; erro?: string }
interface Resumo { pendentes: Record<string, number>; concluidos: Record<string, number>; total_pendentes: number; total_concluidos: number; minhas_pendentes: number }
interface Usuario { nome: string; email: string | null }
interface Categoria { codigo: string; descricao: string }
interface ProdDetalhe { produto: { codigo_produto: number; codigo: string; descricao: string; familia: string; marca: string; valor_venda: number }; estoque: Record<string, unknown> }

const RED = '#dc2626';
const th: React.CSSProperties = { background: '#fafafa', color: '#888', fontSize: '.62rem', textTransform: 'uppercase', letterSpacing: '.5px', padding: '10px', textAlign: 'left', borderBottom: '1px solid #eee', fontWeight: 600, whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '9px 10px', borderBottom: '1px solid #f5f5f5', color: '#444', fontSize: '.8rem', verticalAlign: 'middle' };
const selStyle: React.CSSProperties = { padding: '5px 8px', border: '1px solid #e0e0e0', borderRadius: 8, fontSize: '.76rem', background: '#fff', maxWidth: 170 };

function tipoLabel(v: string): string {
  return TIPOS.find((t) => t.v === v)?.label || v || '-';
}
function fmtDataBR(iso: string): string {
  if (!iso) return '-';
  const p = String(iso).split('T')[0].split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : iso;
}
function itemInfo(it: ItemReceb): { idProd: string; desc: string; qtd: number; vu: number } {
  const p = (it.prod || it) as ItemReceb;
  return {
    idProd: String(p.nCodProduto ?? p.codigo_produto ?? ''),
    desc: String(p.cDescricao ?? p.xProd ?? p.descricao ?? ''),
    qtd: Number(p.nQtde ?? p.qCom ?? p.qtde ?? p.quantidade ?? 0) || 0,
    vu: Number(p.nValUnit ?? p.vUnCom ?? p.valor_unitario ?? 0) || 0,
  };
}

export default function RecebimentosPage() {
  const { userProfile } = useAuth();
  const { pode, loading: permLoading } = usePermissoes(userProfile?.id);
  const { conta, contaParam } = useConta();
  const meu = userProfile?.nome || '';

  const [status, setStatus] = useState<'pendente' | 'concluido'>('pendente');
  const [resp, setResp] = useState<'todas' | 'me' | '__nenhum__'>('todas');
  const [tipo, setTipo] = useState('');
  const [pagina, setPagina] = useState(1);
  const [data, setData] = useState<ListaResp | null>(null);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [msg, setMsg] = useState<{ txt: string; tipo: 'ok' | 'err' } | null>(null);
  const [concluirAlvo, setConcluirAlvo] = useState<Recebimento | null>(null);
  const [prodAlvo, setProdAlvo] = useState<{ idProd: string; contaUp: string } | null>(null);

  const flash = useCallback((txt: string, t: 'ok' | 'err' = 'ok') => {
    setMsg({ txt, tipo: t });
    if (t !== 'err') setTimeout(() => setMsg(null), 3000);
  }, []);

  // Conta da PRÓPRIA linha (recebimentos_nfe usa conta minúscula). O backend normaliza.
  const rContaQ = useCallback((r: Recebimento) => `?conta=${encodeURIComponent(String(r.conta_omie || '').toUpperCase())}`, []);

  const carregarUsuarios = useCallback(async () => {
    try {
      const r = await fetch(`/api/estoque/recebimentos/usuarios?meu=${encodeURIComponent(meu)}${contaParam}`);
      const d = await r.json();
      setUsuarios(d.usuarios || []);
    } catch {
      setUsuarios([]);
    }
  }, [contaParam, meu]);

  const carregarResumo = useCallback(async () => {
    try {
      const r = await fetch(`/api/estoque/recebimentos/resumo?meu=${encodeURIComponent(meu)}${contaParam}`);
      const d = await r.json();
      if (!d.erro) setResumo(d);
    } catch {
      /* ignore */
    }
  }, [contaParam, meu]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      let url = `/api/estoque/recebimentos?status=${status}&pagina=${pagina}&meu=${encodeURIComponent(meu)}${contaParam}`;
      if (tipo) url += `&tipo=${tipo}`;
      if (resp === 'me') url += '&responsavel=me';
      else if (resp === '__nenhum__') url += '&responsavel=__nenhum__';
      const r = await fetch(url);
      const d = (await r.json()) as ListaResp;
      setData(d);
    } catch (e) {
      setData({ recebimentos: [], total: 0, pagina: 1, totalPaginas: 0, erro: (e as Error).message });
    } finally {
      setCarregando(false);
    }
  }, [status, pagina, tipo, resp, contaParam, meu]);

  useEffect(() => { carregarUsuarios(); }, [carregarUsuarios]);
  useEffect(() => { carregarResumo(); }, [carregarResumo, status]);
  useEffect(() => { carregar(); }, [carregar]);

  const alterarTipo = async (r: Recebimento, novoTipo: string) => {
    try {
      const res = await fetch(`/api/estoque/recebimentos/${r.id}/tipo${rContaQ(r)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo: novoTipo }),
      });
      const d = await res.json();
      if (d.erro) return flash(d.erro, 'err');
      flash('Tipo atualizado.');
      carregarResumo();
      carregar();
    } catch (e) {
      flash('Erro: ' + (e as Error).message, 'err');
    }
  };

  const alterarResp = async (r: Recebimento, novoResp: string) => {
    try {
      let valor = novoResp;
      if (novoResp === '__novo__') {
        const nome = prompt('Nome do novo responsável:')?.trim();
        if (!nome) { carregar(); return; }
        const ur = await fetch(`/api/estoque/recebimentos/usuarios${rContaQ(r)}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome }),
        });
        const ud = await ur.json();
        if (ud.erro) return flash(ud.erro, 'err');
        await carregarUsuarios();
        valor = nome;
      }
      const res = await fetch(`/api/estoque/recebimentos/${r.id}/responsavel${rContaQ(r)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ responsavel: valor }),
      });
      const d = await res.json();
      if (d.erro) return flash(d.erro, 'err');
      flash('Responsável atualizado.');
      carregar();
    } catch (e) {
      flash('Erro: ' + (e as Error).message, 'err');
    }
  };

  const reabrir = async (r: Recebimento) => {
    if (!confirm('Reabrir este recebimento? Isso reverte a conclusão no Omie.')) return;
    try {
      const res = await fetch(`/api/estoque/recebimentos/${r.id}/reabrir${rContaQ(r)}`, { method: 'POST' });
      const d = await res.json();
      if (d.erro) return flash(d.erro, 'err');
      flash('Recebimento reaberto.');
      carregar();
      carregarResumo();
    } catch (e) {
      flash('Erro: ' + (e as Error).message, 'err');
    }
  };

  const verNF = async (r: Recebimento) => {
    flash('Abrindo NF...');
    try {
      const contaUp = String(r.conta_omie || '').toUpperCase();
      const u = `/api/estoque/danfe?numero_nf=${encodeURIComponent(r.numero_nf || '')}&serie=${encodeURIComponent(r.serie || '1')}${contaUp ? `&conta=${encodeURIComponent(contaUp)}` : ''}`;
      const res = await fetch(u);
      const d = await res.json();
      if (d.erro) return flash(d.erro, 'err');
      if (d.url) window.open(d.url, '_blank');
      else flash('URL do DANFE não disponível', 'err');
    } catch (e) {
      flash('Erro: ' + (e as Error).message, 'err');
    }
  };

  if (!permLoading && userProfile && !pode('estoque', 'recebimentos')) return <SemPermissao />;

  const statusKey = status === 'concluido' ? 'concluidos' : 'pendentes';
  const lista = data?.recebimentos || [];

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '20px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ color: '#333', marginBottom: 4, fontSize: '1.4rem', fontWeight: 700 }}>Recebimentos</h1>
          <p style={{ color: '#888', fontSize: '.82rem', marginBottom: 0 }}>Recebimento de NF-e de fornecedor — espelho do Omie (pendentes e concluídos)</p>
        </div>
        <ContaSelector />
      </div>

      <div style={{ margin: '14px 0', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <Link href="/estoque" style={navLink}>← Busca</Link>
        {pode('estoque', 'notas-entrada') && (<Link href="/estoque/notas-entrada" style={navLink}>Notas de Entrada</Link>)}
        {pode('estoque', 'dashboard') && (<Link href="/estoque/dashboard" style={navLink}>Dashboard</Link>)}
      </div>

      {/* Abas por tipo */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {TIPOS.map((t) => {
          const cnt = resumo ? (t.v === '' ? (statusKey === 'pendentes' ? resumo.total_pendentes : resumo.total_concluidos) : resumo[statusKey]?.[t.v] || 0) : null;
          const ativa = tipo === t.v;
          return (
            <button key={t.v} onClick={() => { setTipo(t.v); setPagina(1); }} style={{
              padding: '8px 16px', border: `1px solid ${ativa ? RED : '#e0e0e0'}`, background: ativa ? RED : '#fff',
              borderRadius: 20, cursor: 'pointer', fontSize: '.8rem', fontWeight: 600, color: ativa ? '#fff' : '#666',
            }}>
              {t.label}
              {cnt !== null && <span style={{ marginLeft: 6, background: ativa ? 'rgba(255,255,255,.25)' : 'rgba(0,0,0,.12)', borderRadius: 10, padding: '1px 7px', fontSize: '.7rem' }}>{cnt}</span>}
            </button>
          );
        })}
      </div>

      {/* Toggles de status e responsável */}
      <div style={{ display: 'flex', gap: 18, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <Toggle value={status} onChange={(v) => { setStatus(v as 'pendente' | 'concluido'); setPagina(1); }} options={[{ v: 'pendente', l: 'Pendentes' }, { v: 'concluido', l: 'Concluídos' }]} />
        <Toggle value={resp} onChange={(v) => { setResp(v as typeof resp); setPagina(1); }} options={[{ v: 'todas', l: 'Todas' }, { v: 'me', l: 'Minhas' }, { v: '__nenhum__', l: 'Sem responsável' }]} />
      </div>

      {msg && <div style={{ padding: '10px 14px', borderRadius: 10, marginBottom: 12, fontSize: '.8rem', background: msg.tipo === 'err' ? '#fef2f2' : '#f0fdf4', border: `1px solid ${msg.tipo === 'err' ? '#fecaca' : '#bbf7d0'}`, color: msg.tipo === 'err' ? RED : '#16a34a' }}>{msg.txt}</div>}
      {carregando && <div style={{ color: '#888', fontSize: '.85rem', padding: 12 }}>Carregando recebimentos…</div>}

      <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, overflowX: 'auto', boxShadow: '0 1px 4px rgba(0,0,0,.04)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>{['NF', 'Data', 'Fornecedor', 'Valor', 'Etapa', 'Tipo', 'Responsável', 'Ações'].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
          <tbody>
            {data?.erro && <tr><td colSpan={8} style={{ ...td, color: '#bbb', textAlign: 'center', padding: 28 }}>{data.erro}</td></tr>}
            {!data?.erro && lista.length === 0 && !carregando && <tr><td colSpan={8} style={{ ...td, color: '#bbb', textAlign: 'center', padding: 28 }}>Nenhum recebimento.</td></tr>}
            {lista.map((r) => (
              <tr key={r.id}>
                <td style={td}><strong>{r.numero_nf || '-'}</strong>{r.serie ? `/${r.serie}` : ''}</td>
                <td style={{ ...td, color: '#999' }}>{fmtDataBR(r.data_emissao)}</td>
                <td style={td}>{r.nome_emitente || r.id_fornecedor || '-'}</td>
                <td style={{ ...td, color: '#16a34a', fontWeight: 600 }}>{fmtRS(r.valor_nf)}</td>
                <td style={td}><span style={{ display: 'inline-block', padding: '3px 9px', borderRadius: 8, background: r.concluido ? '#dcfce7' : '#eef2ff', color: r.concluido ? '#16a34a' : '#4f46e5', fontSize: '.72rem', fontWeight: 600 }}>{r.etapa_nome || '-'}</span></td>
                <td style={td}>
                  <select value={r.tipo} onChange={(e) => alterarTipo(r, e.target.value)} style={selStyle}>
                    {TIPOS.filter((t) => t.v !== '').map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
                  </select>
                </td>
                <td style={td}>
                  <select value={r.responsavel || ''} onChange={(e) => alterarResp(r, e.target.value)} style={selStyle}>
                    <option value="">(ninguém)</option>
                    {usuarios.map((u) => { const val = u.email || u.nome; return <option key={val} value={val}>{u.nome}</option>; })}
                    {r.responsavel && !usuarios.some((u) => (u.email || u.nome) === r.responsavel) && <option value={r.responsavel}>{r.responsavel}</option>}
                    <option value="__novo__">+ Novo responsável…</option>
                  </select>
                </td>
                <td style={td}>
                  <button onClick={() => verNF(r)} style={{ ...btnSm, background: '#eef2ff', color: '#4f46e5', marginRight: 6 }}>Ver NF</button>
                  {r.concluido
                    ? <button onClick={() => reabrir(r)} style={{ ...btnSm, background: '#fff', color: RED, border: '1px solid #fca5a5' }}>Reabrir</button>
                    : <button onClick={() => setConcluirAlvo(r)} style={{ ...btnSm, background: '#16a34a', color: '#fff' }}>Concluir</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data && data.totalPaginas > 1 && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 18, alignItems: 'center' }}>
          <button onClick={() => setPagina((p) => Math.max(1, p - 1))} disabled={pagina <= 1} style={pgBtn(pagina <= 1)}>←</button>
          <span style={{ fontSize: 12, color: '#888' }}>Página {pagina} de {data.totalPaginas} ({data.total} itens)</span>
          <button onClick={() => setPagina((p) => p + 1)} disabled={pagina >= data.totalPaginas} style={pgBtn(pagina >= data.totalPaginas)}>→</button>
        </div>
      )}
      {conta === '' && <div style={{ fontSize: '.7rem', color: '#bbb', marginTop: 10 }}>Modo Todas (NOVA + CASTRO)</div>}

      {concluirAlvo && (
        <ConcluirModal
          receb={concluirAlvo}
          contaParam={contaParam}
          onClose={() => setConcluirAlvo(null)}
          onAbrirProduto={(idProd) => setProdAlvo({ idProd, contaUp: String(concluirAlvo.conta_omie || '').toUpperCase() })}
          onSucesso={() => { setConcluirAlvo(null); flash('Recebimento concluído no Omie.'); carregar(); carregarResumo(); }}
          onErro={(e) => flash(e, 'err')}
        />
      )}
      {prodAlvo && <ProdutoModal idProd={prodAlvo.idProd} contaUp={prodAlvo.contaUp} onClose={() => setProdAlvo(null)} onMsg={flash} />}
    </div>
  );
}

// ---- Modal de conclusão (categoria + itens) ----
function ConcluirModal({ receb, contaParam, onClose, onAbrirProduto, onSucesso, onErro }: {
  receb: Recebimento; contaParam: string; onClose: () => void;
  onAbrirProduto: (idProd: string) => void; onSucesso: () => void; onErro: (e: string) => void;
}) {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [busca, setBusca] = useState('');
  const [catSel, setCatSel] = useState(receb.codigo_categoria || '');
  const [enviando, setEnviando] = useState(false);
  const contaUp = String(receb.conta_omie || '').toUpperCase();

  useEffect(() => {
    fetch(`/api/estoque/omie-categorias${contaParam}`).then((r) => r.json()).then((d) => setCategorias(d.categorias || [])).catch(() => setCategorias([]));
  }, [contaParam]);

  const filtradas = (busca.trim()
    ? categorias.filter((c) => `${c.descricao} ${c.codigo}`.toLowerCase().includes(busca.toLowerCase().trim()))
    : categorias
  ).slice(0, 200);

  const confirmar = async () => {
    setEnviando(true);
    try {
      const body: Record<string, string> = {};
      if (catSel) body.codigo_categoria = catSel;
      const r = await fetch(`/api/estoque/recebimentos/${receb.id}/concluir?conta=${encodeURIComponent(contaUp)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const d = await r.json();
      if (d.erro) { onErro(d.erro); setEnviando(false); return; }
      onSucesso();
    } catch (e) {
      onErro('Erro: ' + (e as Error).message);
      setEnviando(false);
    }
  };

  const itens = (receb.itens || []).map(itemInfo).filter((i) => i.idProd || i.desc);

  return (
    <ModalShell onClose={onClose}>
      <h3 style={{ color: RED, marginBottom: 14, fontSize: '1.05rem', fontWeight: 700 }}>Concluir recebimento</h3>
      <div style={resumoBox}>
        <strong>NF {receb.numero_nf || '-'}</strong>{receb.serie ? `/${receb.serie}` : ''}<br />
        Fornecedor: {receb.nome_emitente || receb.id_fornecedor || '-'}<br />
        Valor: {fmtRS(receb.valor_nf)} · {fmtDataBR(receb.data_emissao)}<br />
        Tipo: {tipoLabel(receb.tipo)}
      </div>
      {itens.length > 0 && (
        <>
          <label style={lbl}>Itens da NF (duplo-clique para ver/editar o produto)</label>
          <div style={{ border: '1px solid #eee', borderRadius: 10, marginBottom: 16, maxHeight: 170, overflowY: 'auto' }}>
            {itens.map((info, i) => (
              <div key={i} title="Duplo-clique para ver o produto" onDoubleClick={() => info.idProd && onAbrirProduto(info.idProd)} style={{ padding: '8px 12px', cursor: info.idProd ? 'pointer' : 'default', fontSize: '.82rem', borderBottom: '1px solid #f5f5f5' }}>
                {info.desc || '-'}<span style={{ color: '#999', float: 'right' }}>x{info.qtd} · {fmtRS(info.vu)}</span>
              </div>
            ))}
          </div>
        </>
      )}
      <label style={lbl}>Categoria (digite para filtrar ou escolha na lista)</label>
      <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Ex.: revenda, combustível..." style={{ width: '100%', padding: '10px 14px', border: '1px solid #e0e0e0', borderRadius: 10, fontSize: 13, outline: 'none' }} />
      <div style={{ border: '1px solid #eee', borderRadius: 10, marginTop: 6, maxHeight: 240, overflowY: 'auto' }}>
        {filtradas.length === 0 && <div style={{ padding: '8px 12px', color: '#bbb', fontSize: '.82rem' }}>Nenhuma categoria</div>}
        {filtradas.map((c) => (
          <div key={c.codigo} onClick={() => { setCatSel(c.codigo); setBusca(`${c.descricao} (${c.codigo})`); }} style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '.82rem', borderBottom: '1px solid #f5f5f5', background: c.codigo === catSel ? '#fef2f2' : '#fff', color: c.codigo === catSel ? RED : '#444' }}>
            {c.descricao} <span style={{ color: '#bbb' }}>({c.codigo})</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
        <button onClick={onClose} style={{ padding: '9px 20px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: '#f1f1f1', color: '#666' }}>Cancelar</button>
        <button onClick={confirmar} disabled={enviando} style={{ padding: '9px 20px', borderRadius: 10, border: 'none', cursor: enviando ? 'wait' : 'pointer', fontSize: 13, fontWeight: 600, background: '#16a34a', color: '#fff' }}>{enviando ? 'Concluindo…' : 'Concluir no Omie'}</button>
      </div>
    </ModalShell>
  );
}

// ---- Modal de produto (consulta por id + editar preço de venda) ----
function ProdutoModal({ idProd, contaUp, onClose, onMsg }: { idProd: string; contaUp: string; onClose: () => void; onMsg: (t: string, k?: 'ok' | 'err') => void }) {
  const [det, setDet] = useState<ProdDetalhe | null>(null);
  const [erro, setErro] = useState('');
  const [preco, setPreco] = useState('');

  useEffect(() => {
    fetch(`/api/estoque/recebimentos/produto?id=${encodeURIComponent(idProd)}${contaUp ? `&conta=${encodeURIComponent(contaUp)}` : ''}`)
      .then((r) => r.json())
      .then((d: ProdDetalhe & { erro?: string }) => {
        if (d.erro) { setErro(d.erro); return; }
        setDet(d);
        setPreco(String(d.produto.valor_venda || 0));
      })
      .catch((e) => setErro((e as Error).message));
  }, [idProd, contaUp]);

  const salvar = async () => {
    const val = parseFloat(preco);
    if (isNaN(val) || val < 0) return onMsg('Preço inválido', 'err');
    if (!confirm(`Atualizar o preço de venda no Omie para R$ ${val.toFixed(2).replace('.', ',')}?`)) return;
    try {
      const r = await fetch(`/api/estoque/recebimentos/produto/preco-venda${contaUp ? `?conta=${encodeURIComponent(contaUp)}` : ''}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ codigo_produto: det?.produto.codigo_produto || idProd, valor_venda: val }),
      });
      const d = await r.json();
      if (d.erro) return onMsg(d.erro, 'err');
      onMsg('Preço de venda atualizado no Omie.');
      onClose();
    } catch (e) {
      onMsg('Erro: ' + (e as Error).message, 'err');
    }
  };

  const e = (det?.estoque || {}) as Record<string, unknown>;
  return (
    <ModalShell onClose={onClose} z={120}>
      {erro && <div style={{ color: '#bbb', padding: 12 }}>{erro}</div>}
      {!det && !erro && <div style={{ color: '#bbb', padding: 12 }}>Carregando…</div>}
      {det && (
        <>
          <h3 style={{ color: RED, marginBottom: 14, fontSize: '1.05rem', fontWeight: 700 }}>{det.produto.codigo} — {det.produto.descricao}</h3>
          <div style={resumoBox}>
            Família: {det.produto.familia || '-'}<br />Marca: {det.produto.marca || '-'}<br />
            Saldo: {String(e.saldo)} · Físico: {String(e.fisico)} · Reservado: {String(e.reservado)}<br />
            CMC: {fmtRS(e.cmc as number)}
          </div>
          <label style={lbl}>Preço de venda (atualiza no Omie)</label>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input type="number" step="0.01" min="0" value={preco} onChange={(ev) => setPreco(ev.target.value)} style={{ flex: 1, padding: '10px 14px', border: '1px solid #e0e0e0', borderRadius: 10, fontSize: 14 }} />
            <button onClick={salvar} style={{ ...btnSm, background: '#16a34a', color: '#fff', padding: '11px 18px' }}>Salvar</button>
          </div>
        </>
      )}
    </ModalShell>
  );
}

function ModalShell({ children, onClose, z = 100 }: { children: React.ReactNode; onClose: () => void; z?: number }) {
  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: z, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 14, padding: 24, maxWidth: 560, width: '95%', maxHeight: '85vh', overflowY: 'auto', position: 'relative', boxShadow: '0 8px 30px rgba(0,0,0,.12)' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 12, right: 16, cursor: 'pointer', fontSize: '1.3rem', color: '#bbb', background: 'none', border: 'none' }}>×</button>
        {children}
      </div>
    </div>
  );
}

function Toggle({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: Array<{ v: string; l: string }> }) {
  return (
    <div style={{ display: 'inline-flex', border: '1px solid #e0e0e0', borderRadius: 10, overflow: 'hidden' }}>
      {options.map((o) => (
        <button key={o.v} onClick={() => onChange(o.v)} style={{ padding: '7px 16px', background: value === o.v ? RED : '#fff', border: 'none', cursor: 'pointer', fontSize: '.78rem', fontWeight: 600, color: value === o.v ? '#fff' : '#666' }}>{o.l}</button>
      ))}
    </div>
  );
}

const navLink: React.CSSProperties = { color: RED, textDecoration: 'none', fontSize: '.82rem', fontWeight: 600 };
const btnSm: React.CSSProperties = { padding: '6px 12px', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: '.74rem', fontWeight: 600 };
const resumoBox: React.CSSProperties = { background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 10, padding: 12, marginBottom: 16, fontSize: '.82rem', lineHeight: 1.6 };
const lbl: React.CSSProperties = { display: 'block', fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.5px', color: '#888', fontWeight: 600, marginBottom: 6, marginTop: 4 };
function pgBtn(disabled: boolean): React.CSSProperties {
  return { padding: '7px 14px', border: '1px solid #e0e0e0', background: '#fff', color: disabled ? '#ccc' : '#666', borderRadius: 8, fontSize: 12, cursor: disabled ? 'not-allowed' : 'pointer' };
}
