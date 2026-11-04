'use client';
import { useEffect, useState } from 'react';
import { fetchAuth } from '@/lib/auth/client';
import { Loader2, FileText, Package, Check, X, Eye, Link2 } from 'lucide-react';
import VisualizadorDocumento, { type DocumentoVisualizavel } from '@/components/comum/VisualizadorDocumento';
import { fmtMoeda } from '@/lib/garantias/format';
import { COMPONENTE_LABEL, type Componente } from '@/lib/garantias/notas';
import type { NotasGarantia, NotaReembolso, NotaPecas } from '@/lib/garantias/notas-server';

// Bloco "Notas fiscais" da garantia: NFS-e de reembolso (Nova → montadora) e
// notas de peças recebidas da fábrica (entrada CFOP x.949). Sugestões; o vínculo
// confirmado entra na versão final (por ora os botões só marcam na tela).

const COR = '#dc2626';
const COMP_COR: Record<Componente, string> = {
  mao_obra: '#2563eb', deslocamento: '#0891b2', pecas: '#d97706', terceiros: '#7c3aed', texto: '#6b7280',
};

function dataBR(iso: string | null | undefined): string {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
}

export function useNotasGarantia(id: string | null, versao = 0) {
  // resposta guardada com o id que a pediu: trocou de garantia = carregando
  const [res, setRes] = useState<{ id: string; dados: NotasGarantia | null; erro: string } | null>(null);
  useEffect(() => {
    if (!id) return;
    let vivo = true;
    fetchAuth(`/api/garantias/${id}/notas`)
      .then(async (r) => {
        const j = await r.json();
        if (vivo) setRes(r.ok ? { id, dados: j, erro: '' } : { id, dados: null, erro: j.error || 'Erro ao buscar as notas.' });
      })
      .catch(() => { if (vivo) setRes({ id, dados: null, erro: 'Sem conexão com o portal.' }); });
    return () => { vivo = false; };
  }, [id, versao]);
  const atual = res && res.id === id ? res : null;
  return { dados: atual?.dados || null, erro: atual?.erro || '', carregando: !!id && !atual };
}

const DECISAO: Record<string, 'ok' | 'nao'> = { vinculada: 'ok', descartada: 'nao' };

export default function NotasGarantiaPainel({ garantiaId, compacto, podeEditar = true, onMudou }: {
  garantiaId: string; compacto?: boolean; podeEditar?: boolean; onMudou?: () => void;
}) {
  const [versao, setVersao] = useState(0);
  const { dados, erro, carregando } = useNotasGarantia(garantiaId, versao);
  const [doc, setDoc] = useState<DocumentoVisualizavel | null>(null);
  const [verOutras, setVerOutras] = useState(false);
  const [gravando, setGravando] = useState('');
  const [erroAcao, setErroAcao] = useState('');

  if (carregando && !dados) {
    return <div style={{ padding: 30, textAlign: 'center', color: 'var(--portal-text-muted)' }}><Loader2 size={18} className="spin" /> Procurando notas…</div>;
  }
  if (erro) return <div style={{ padding: 16, color: COR, fontSize: 13 }}>{erro}</div>;
  if (!dados) return null;

  const abrir = (docId: number | null, titulo: string) => {
    if (!docId) return;
    setDoc({ titulo, url: `/api/financeiro/notas/${docId}/arquivo?tipo=pdf`, nome: titulo.replace(/\s+/g, '-') });
  };
  // clicar de novo na mesma decisão desfaz
  const decidir = async (papel: 'reembolso' | 'pecas', ids: { docId?: number | null; entradaId?: number }, atual: 'ok' | 'nao' | undefined, v: 'ok' | 'nao', manual: boolean) => {
    if (!podeEditar || gravando) return;
    const acao = atual === v ? 'desfazer' : v === 'ok' ? 'vincular' : 'descartar';
    setGravando(`${papel}${ids.docId ?? ids.entradaId}`);
    setErroAcao('');
    try {
      const r = await fetchAuth(`/api/garantias/${garantiaId}/notas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ papel, ...ids, acao, origem: manual ? 'manual' : 'sugerida' }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setErroAcao(j.error || 'Não foi possível gravar.');
      else { setVersao((x) => x + 1); onMudou?.(); }
    } catch {
      setErroAcao('Sem conexão com o portal.');
    } finally {
      setGravando('');
    }
  };

  const { reembolso, pecas } = dados;
  const dec = (s: string | null) => (s ? DECISAO[s] : undefined);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: compacto ? '1fr' : 'repeat(auto-fit, minmax(380px, 1fr))', gap: 16 }}>
      {(dados.migracaoFaltando || erroAcao) && (
        <div style={{ gridColumn: '1 / -1', fontSize: 12, color: '#b45309', background: '#f59e0b1a', padding: '8px 10px', borderRadius: 8 }}>
          {erroAcao || 'As sugestões aparecem, mas para gravar o vínculo falta aplicar a migration sql/garantias-notas.sql.'}
        </div>
      )}
      <section>
        <Titulo icone={<FileText size={16} />} texto="NFS-e de reembolso (Nova → montadora)" n={reembolso.sugeridas.length} />
        <Ajuda>Nota de serviço que a Nova emite contra a {dados.garantia.montadora || 'montadora'} para receber o que a fábrica pagou. Achada pelo nº da SG ({dados.garantia.sg || 'sem nº'}) no texto da nota.</Ajuda>
        {reembolso.sugeridas.length === 0 && (
          <Vazio>Nenhuma NFS-e de reembolso cita esta garantia ainda. Ela entra na próxima OS de reembolso da montadora.</Vazio>
        )}
        {reembolso.sugeridas.map((n) => (
          <CardReembolso key={n.docId} n={n} atual={dados.garantia.numero} decisao={dec(n.vinculo)} ocupado={gravando === `reembolso${n.docId}`} podeEditar={podeEditar}
            onDecidir={(v) => decidir('reembolso', { docId: n.docId }, dec(n.vinculo), v, false)} onVer={() => abrir(n.docId, `NFS-e ${n.numero}`)} />
        ))}
      </section>

      <section>
        <Titulo icone={<Package size={16} />} texto="Peças recebidas da fábrica" n={pecas.sugeridas.length} />
        <Ajuda>Notas de entrada da montadora com CFOP x.949 (remessa em garantia) emitidas depois da abertura. Os itens em destaque têm o código de uma peça desta garantia.</Ajuda>
        {pecas.sugeridas.length === 0 && (
          <Vazio>Nenhuma nota de peça casou pelo código. {pecas.outras.length ? 'Veja abaixo as outras notas de remessa da montadora.' : ''}</Vazio>
        )}
        {pecas.sugeridas.map((n) => (
          <CardPecas key={n.entradaId} n={n} decisao={dec(n.vinculo)} ocupado={gravando === `pecas${n.entradaId}`} podeEditar={podeEditar}
            onDecidir={(v) => decidir('pecas', { entradaId: n.entradaId, docId: n.docId }, dec(n.vinculo), v, false)} onVer={() => abrir(n.docId, `NF-e ${n.numero}`)} />
        ))}
      </section>

      {(reembolso.outras.length > 0 || pecas.outras.length > 0) && (
        <section style={{ gridColumn: '1 / -1' }}>
          <button onClick={() => setVerOutras((v) => !v)} style={btnLink}>
            <Link2 size={14} /> {verOutras ? 'Esconder' : 'Vincular outra nota'} ({reembolso.outras.length + pecas.outras.length} da montadora no período)
          </button>
          {verOutras && (
            <div style={{ display: 'grid', gridTemplateColumns: compacto ? '1fr' : '1fr 1fr', gap: 16, marginTop: 10 }}>
              <div>{reembolso.outras.map((n) => (
                <CardReembolso key={n.docId} n={n} atual={dados.garantia.numero} decisao={dec(n.vinculo)} discreto ocupado={gravando === `reembolso${n.docId}`} podeEditar={podeEditar}
                  onDecidir={(v) => decidir('reembolso', { docId: n.docId }, dec(n.vinculo), v, true)} onVer={() => abrir(n.docId, `NFS-e ${n.numero}`)} />
              ))}</div>
              <div>{pecas.outras.map((n) => (
                <CardPecas key={n.entradaId} n={n} decisao={dec(n.vinculo)} discreto ocupado={gravando === `pecas${n.entradaId}`} podeEditar={podeEditar}
                  onDecidir={(v) => decidir('pecas', { entradaId: n.entradaId, docId: n.docId }, dec(n.vinculo), v, true)} onVer={() => abrir(n.docId, `NF-e ${n.numero}`)} />
              ))}</div>
            </div>
          )}
        </section>
      )}
      <VisualizadorDocumento key={doc?.url} doc={doc} onClose={() => setDoc(null)} />
    </div>
  );
}

function CardReembolso({ n, atual, decisao, discreto, ocupado, podeEditar, onDecidir, onVer }: {
  n: NotaReembolso; atual: string; decisao?: 'ok' | 'nao'; discreto?: boolean; ocupado?: boolean; podeEditar?: boolean;
  onDecidir: (v: 'ok' | 'nao') => void; onVer: () => void;
}) {
  const comps = (['mao_obra', 'deslocamento', 'pecas', 'terceiros'] as Componente[]).filter((c) => n.componentes[c] > 0);
  const total = comps.reduce((s, c) => s + n.componentes[c], 0) || n.valor;
  return (
    <div style={{ ...card, opacity: decisao === 'nao' ? 0.45 : 1, borderLeft: `4px solid ${decisao === 'ok' ? '#16a34a' : discreto ? 'var(--portal-border)' : COR}` }}>
      <div style={linhaTopo}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15 }}>NFS-e {n.numero || 's/ nº'} <span style={muted}>· {dataBR(n.data)} · {n.conta}</span></div>
          <div style={muted}>{n.parte}{n.drvg ? ` · DRVG ${n.drvg}` : ''}{n.osNum ? ` · OS Omie ${n.osNum}` : ''}</div>
        </div>
        <div style={{ fontWeight: 800, fontSize: 16, whiteSpace: 'nowrap' }}>{fmtMoeda(n.valor)}</div>
      </div>
      {comps.length > 0 && (
        <>
          <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', margin: '10px 0 6px' }}>
            {comps.map((c) => <div key={c} title={COMPONENTE_LABEL[c]} style={{ width: `${(n.componentes[c] / total) * 100}%`, background: COMP_COR[c] }} />)}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', fontSize: 12 }}>
            {comps.map((c) => (
              <span key={c}><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: COMP_COR[c], marginRight: 5 }} />
                {COMPONENTE_LABEL[c]} <b>{fmtMoeda(n.componentes[c])}</b></span>
            ))}
          </div>
        </>
      )}
      {n.garantiasCobertas.length > 1 && (
        <div style={{ marginTop: 8, fontSize: 12 }}>
          <span style={muted}>Cobre {n.garantiasCobertas.length} SGs: </span>
          {n.garantiasCobertas.map((c) => (
            <span key={c.sg} style={{ ...chip, background: c.numero === atual ? COR : 'var(--portal-bg-input)', color: c.numero === atual ? '#fff' : 'var(--portal-text)' }}>
              {c.numero || `SG ${c.sg}`}
            </span>
          ))}
        </div>
      )}
      <Acoes decisao={decisao} ocupado={ocupado} podeEditar={podeEditar} onDecidir={onDecidir} onVer={n.temPdf ? onVer : undefined} />
    </div>
  );
}

function CardPecas({ n, decisao, discreto, ocupado, podeEditar, onDecidir, onVer }: {
  n: NotaPecas; decisao?: 'ok' | 'nao'; discreto?: boolean; ocupado?: boolean; podeEditar?: boolean;
  onDecidir: (v: 'ok' | 'nao') => void; onVer: () => void;
}) {
  return (
    <div style={{ ...card, opacity: decisao === 'nao' ? 0.45 : 1, borderLeft: `4px solid ${decisao === 'ok' ? '#16a34a' : discreto ? 'var(--portal-border)' : '#d97706'}` }}>
      <div style={linhaTopo}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15 }}>NF-e {n.numero} <span style={muted}>· {dataBR(n.data)} · {n.conta}</span></div>
          <div style={muted}>{n.fornecedor}{n.casadas ? ` · ${n.casadas} peça(s) desta garantia` : ''}</div>
        </div>
        <div style={{ fontWeight: 800, fontSize: 16, whiteSpace: 'nowrap' }}>{fmtMoeda(n.valor)}</div>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8, fontSize: 12 }}>
        <tbody>
          {n.itens.slice(0, 8).map((it, i) => (
            <tr key={i} style={{ background: it.casou ? 'rgba(217,119,6,0.12)' : undefined }}>
              <td style={tdP}>{it.codigo}</td>
              <td style={tdP}>{it.descricao}{it.casou === 'descricao' && <span style={muted}> (código na descrição)</span>}</td>
              <td style={{ ...tdP, textAlign: 'right' }}>{it.quantidade}</td>
              <td style={{ ...tdP, textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtMoeda(it.valor)}</td>
            </tr>
          ))}
          {n.itens.length > 8 && <tr><td colSpan={4} style={{ ...tdP, ...muted }}>+ {n.itens.length - 8} item(ns)</td></tr>}
        </tbody>
      </table>
      <Acoes decisao={decisao} ocupado={ocupado} podeEditar={podeEditar} onDecidir={onDecidir} onVer={n.docId ? onVer : undefined} />
    </div>
  );
}

function Acoes({ decisao, ocupado, podeEditar = true, onDecidir, onVer }: {
  decisao?: 'ok' | 'nao'; ocupado?: boolean; podeEditar?: boolean; onDecidir: (v: 'ok' | 'nao') => void; onVer?: () => void;
}) {
  const trava: React.CSSProperties = !podeEditar || ocupado ? { opacity: 0.5, cursor: 'not-allowed' } : {};
  const dica = podeEditar ? 'Clique de novo para desfazer' : 'Sem permissão para vincular notas';
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
      <button disabled={!podeEditar || ocupado} title={dica} onClick={() => onDecidir('ok')} style={{ ...btn, ...trava, background: decisao === 'ok' ? '#16a34a' : 'transparent', color: decisao === 'ok' ? '#fefefe' : '#16a34a', borderColor: '#16a34a' }}>
        {ocupado ? <Loader2 size={14} className="spin" /> : <Check size={14} />} {decisao === 'ok' ? 'Vinculada' : 'Confirmar'}
      </button>
      <button disabled={!podeEditar || ocupado} title={dica} onClick={() => onDecidir('nao')} style={{ ...btn, ...trava, color: decisao === 'nao' ? COR : 'var(--portal-text-muted)', borderColor: decisao === 'nao' ? COR : 'var(--portal-border)' }}>
        <X size={14} /> {decisao === 'nao' ? 'Marcada: não é esta' : 'Não é esta'}
      </button>
      {onVer && <button onClick={onVer} style={{ ...btn, marginLeft: 'auto' }}><Eye size={14} /> Ver nota</button>}
    </div>
  );
}

function Titulo({ icone, texto, n }: { icone: React.ReactNode; texto: string; n: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 14, marginBottom: 4, color: 'var(--portal-text)' }}>
      {icone} {texto} <span style={{ ...chip, background: n ? COR : 'var(--portal-bg-input)', color: n ? '#fff' : 'var(--portal-text-muted)' }}>{n}</span>
    </div>
  );
}
function Ajuda({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, color: 'var(--portal-text-muted)', marginBottom: 10 }}>{children}</div>;
}
function Vazio({ children }: { children: React.ReactNode }) {
  return <div style={{ ...card, fontSize: 13, color: 'var(--portal-text-muted)', borderStyle: 'dashed' }}>{children}</div>;
}

const card: React.CSSProperties = { border: '1px solid var(--portal-border)', borderRadius: 10, padding: 12, marginBottom: 10, background: 'var(--portal-surface, var(--portal-bg-card))', color: 'var(--portal-text)' };
const linhaTopo: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' };
const muted: React.CSSProperties = { color: 'var(--portal-text-muted)', fontWeight: 400, fontSize: 12 };
const chip: React.CSSProperties = { display: 'inline-block', padding: '1px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, margin: '2px 4px 2px 0' };
const btn: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--portal-border)', background: 'transparent', color: 'var(--portal-text)', fontSize: 12, fontWeight: 600, cursor: 'pointer' };
const btnLink: React.CSSProperties = { ...btn, border: 'none', color: COR, padding: 0 };
const tdP: React.CSSProperties = { padding: '4px 6px', borderTop: '1px solid var(--portal-border)' };
