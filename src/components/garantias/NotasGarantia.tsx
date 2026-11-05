'use client';
import { useEffect, useState } from 'react';
import { fetchAuth } from '@/lib/auth/client';
import { Loader2, FileText, Package, Check, X, Eye, Link2, Paperclip, ExternalLink, Trash2, Undo2 } from 'lucide-react';
import VisualizadorDocumento, { type DocumentoVisualizavel } from '@/components/comum/VisualizadorDocumento';
import { fmtMoeda } from '@/lib/garantias/format';
import { COMPONENTE_LABEL, type Componente } from '@/lib/garantias/notas';
import type { NotasGarantia, NotaReembolso, NotaPecas, NotaManual } from '@/lib/garantias/notas-server';

// Bloco "Notas fiscais" da garantia: NFS-e de reembolso (Nova → montadora) e
// notas de peças recebidas da fábrica (entrada CFOP x.949). Sugestões que o
// garantista confirma (grava em garantia_notas) ou nota anexada à mão quando ela
// não está no sistema (sql/garantias-notas-manual.sql).

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
  const manuaisDe = (papel: NotaManual['papel']) => (dados.manuais || []).filter((m) => m.papel === papel);
  const recarregar = () => { setVersao((x) => x + 1); onMudou?.(); };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: compacto ? '1fr' : 'repeat(auto-fit, minmax(380px, 1fr))', gap: 16 }}>
      {(dados.migracaoFaltando || erroAcao) && (
        <div style={{ gridColumn: '1 / -1', fontSize: 12, color: '#b45309', background: '#f59e0b1a', padding: '8px 10px', borderRadius: 8 }}>
          {erroAcao || 'As sugestões aparecem, mas para gravar o vínculo falta aplicar a migration sql/garantias-notas.sql.'}
        </div>
      )}
      <section>
        <Titulo icone={<FileText size={16} />} texto="NFS-e de reembolso (Nova → montadora)" n={reembolso.sugeridas.length + manuaisDe('reembolso').length} />
        <Ajuda>Nota de serviço que a Nova emite contra a {dados.garantia.montadora || 'montadora'} para receber o que a fábrica pagou. Achada pelo nº da SG ({dados.garantia.sg || 'sem nº'}) no texto da nota.</Ajuda>
        <DispensaReembolso garantiaId={garantiaId} garantia={dados.garantia} podeEditar={podeEditar}
          temVinculada={reembolso.sugeridas.some((n) => n.vinculo === 'vinculada') || manuaisDe('reembolso').length > 0}
          onMudou={recarregar} onErro={setErroAcao} />
        {reembolso.sugeridas.length === 0 && manuaisDe('reembolso').length === 0 && (
          <Vazio>Nenhuma NFS-e de reembolso cita esta garantia ainda. Ela entra na próxima OS de reembolso da montadora — ou anexe a nota abaixo se ela não estiver no sistema.</Vazio>
        )}
        {reembolso.sugeridas.map((n) => (
          <CardReembolso key={n.docId} n={n} atual={dados.garantia.numero} decisao={dec(n.vinculo)} ocupado={gravando === `reembolso${n.docId}`} podeEditar={podeEditar}
            onDecidir={(v) => decidir('reembolso', { docId: n.docId }, dec(n.vinculo), v, false)} onVer={() => abrir(n.docId, `NFS-e ${n.numero}`)} />
        ))}
        <NotasManuais papel="reembolso" garantiaId={garantiaId} manuais={manuaisDe('reembolso')} podeEditar={podeEditar}
          faltaMigracao={dados.manualFaltando} onMudou={recarregar} />
      </section>

      <section>
        <Titulo icone={<Package size={16} />} texto="Peças recebidas da fábrica" n={pecas.sugeridas.length + manuaisDe('pecas').length} />
        <Ajuda>Notas de entrada da montadora com CFOP x.949 (remessa em garantia) emitidas depois da abertura. Os itens em destaque têm o código de uma peça desta garantia.</Ajuda>
        {pecas.sugeridas.length === 0 && manuaisDe('pecas').length === 0 && (
          <Vazio>Nenhuma nota de peça casou pelo código. {pecas.outras.length ? 'Veja abaixo as outras notas de remessa da montadora.' : ''}</Vazio>
        )}
        {pecas.sugeridas.map((n) => (
          <CardPecas key={n.entradaId} n={n} decisao={dec(n.vinculo)} ocupado={gravando === `pecas${n.entradaId}`} podeEditar={podeEditar}
            onDecidir={(v) => decidir('pecas', { entradaId: n.entradaId, docId: n.docId }, dec(n.vinculo), v, false)} onVer={() => abrir(n.docId, `NF-e ${n.numero}`)} />
        ))}
        <NotasManuais papel="pecas" garantiaId={garantiaId} manuais={manuaisDe('pecas')} podeEditar={podeEditar}
          faltaMigracao={dados.manualFaltando} onMudou={recarregar} />
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
  const dica = podeEditar ? undefined : 'Sem permissão para vincular notas';
  const ver = onVer && <button onClick={onVer} style={{ ...btn, marginLeft: 'auto' }}><Eye size={14} /> Ver nota</button>;
  const girando = ocupado ? <Loader2 size={14} className="spin" /> : null;

  // Decidida: o estado aparece como SELO (não botão) e o único botão desfaz.
  if (decisao) {
    const ok = decisao === 'ok';
    return (
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 800, color: ok ? '#16a34a' : 'var(--portal-text-muted)' }}>
          {ok ? <Check size={15} /> : <X size={15} />} {ok ? 'Vinculada a esta garantia' : 'Marcada como "não é esta"'}
        </span>
        <button disabled={!podeEditar || ocupado} title={dica} onClick={() => onDecidir(decisao)} style={{ ...btn, ...trava, color: ok ? COR : 'var(--portal-text)', borderColor: ok ? COR : 'var(--portal-border)' }}>
          {girando || <Undo2 size={14} />} {ok ? 'Desvincular' : 'Desfazer'}
        </button>
        {ver}
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
      <button disabled={!podeEditar || ocupado} title={dica} onClick={() => onDecidir('ok')} style={{ ...btn, ...trava, background: '#16a34a', color: '#fefefe', borderColor: '#16a34a' }}>
        {girando || <Check size={14} />} Vincular a esta garantia
      </button>
      <button disabled={!podeEditar || ocupado} title={dica} onClick={() => onDecidir('nao')} style={{ ...btn, ...trava, color: 'var(--portal-text-muted)' }}>
        <X size={14} /> Não é esta
      </button>
      {ver}
    </div>
  );
}

// Notas anexadas à mão (quando a nota não está no sistema) + o formulário para anexar.
function NotasManuais({ papel, garantiaId, manuais, podeEditar, faltaMigracao, onMudou }: {
  papel: NotaManual['papel']; garantiaId: string; manuais: NotaManual[]; podeEditar: boolean;
  faltaMigracao: boolean; onMudou: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [numero, setNumero] = useState('');
  const [data, setData] = useState('');
  const [valor, setValor] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [gravando, setGravando] = useState('');
  const [erro, setErro] = useState('');
  const rotulo = papel === 'reembolso' ? 'NFS-e' : 'NF-e';

  const salvar = async () => {
    if (!numero.trim() || !arquivo) { setErro('Informe o número e escolha o arquivo da nota.'); return; }
    setGravando('novo');
    setErro('');
    const fd = new FormData();
    fd.append('papel', papel);
    fd.append('numero', numero.trim());
    if (data) fd.append('data', data);
    if (valor.trim()) fd.append('valor', valor.trim());
    fd.append('file', arquivo);
    try {
      const r = await fetchAuth(`/api/garantias/${garantiaId}/notas/manual`, { method: 'POST', body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(j.error || 'Não foi possível anexar.'); return; }
      setAberto(false); setNumero(''); setData(''); setValor(''); setArquivo(null);
      onMudou();
    } catch {
      setErro('Sem conexão com o portal.');
    } finally {
      setGravando('');
    }
  };

  const remover = async (m: NotaManual) => {
    if (!confirm(`Remover a ${rotulo} ${m.numero || ''} anexada à mão?`)) return;
    setGravando(m.id);
    setErro('');
    try {
      const r = await fetchAuth(`/api/garantias/${garantiaId}/notas/manual?nota=${m.id}`, { method: 'DELETE' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setErro(j.error || 'Não foi possível remover.');
      else onMudou();
    } catch {
      setErro('Sem conexão com o portal.');
    } finally {
      setGravando('');
    }
  };

  return (
    <div>
      {manuais.map((m) => (
        <div key={m.id} style={{ ...card, borderLeft: '4px solid #16a34a' }}>
          <div style={linhaTopo}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15 }}>{rotulo} {m.numero || 's/ nº'} <span style={muted}>· {dataBR(m.data)}</span></div>
              <div style={muted}>Anexada à mão por {m.criadoPor || '—'} · {m.nomeArquivo}</div>
            </div>
            {m.valor != null && <div style={{ fontWeight: 800, fontSize: 16, whiteSpace: 'nowrap' }}>{fmtMoeda(m.valor)}</div>}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 800, color: '#16a34a' }}>
              <Check size={15} /> Vinculada a esta garantia
            </span>
            <button disabled={!podeEditar || !!gravando} onClick={() => remover(m)} style={{ ...btn, color: COR, borderColor: COR, opacity: !podeEditar || gravando ? 0.5 : 1 }}>
              {gravando === m.id ? <Loader2 size={14} className="spin" /> : <Trash2 size={14} />} Remover
            </button>
            <a href={m.url} target="_blank" rel="noreferrer" style={{ ...btn, marginLeft: 'auto', textDecoration: 'none' }}><ExternalLink size={14} /> Abrir</a>
          </div>
        </div>
      ))}

      {podeEditar && !aberto && (
        <button onClick={() => { setAberto(true); setErro(''); }} style={{ ...btnLink, marginTop: 2 }}>
          <Paperclip size={14} /> Não achou a nota? Anexar {rotulo} manualmente
        </button>
      )}
      {aberto && (
        <div style={{ ...card, borderStyle: 'dashed' }}>
          <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8 }}>Anexar {rotulo} {papel === 'reembolso' ? 'de reembolso' : 'de peças da fábrica'}</div>
          {faltaMigracao && <div style={{ fontSize: 12, color: '#b45309', marginBottom: 8 }}>Para gravar falta aplicar a migration sql/garantias-notas-manual.sql.</div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
            <label style={rot}>Nº da nota *<input value={numero} onChange={(e) => setNumero(e.target.value)} style={inp} /></label>
            <label style={rot}>Data de emissão<input type="date" value={data} onChange={(e) => setData(e.target.value)} style={inp} /></label>
            <label style={rot}>Valor (R$)<input value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" inputMode="decimal" style={inp} /></label>
          </div>
          <label style={{ ...rot, marginTop: 8 }}>Arquivo da nota * (PDF, XML ou foto)
            <input type="file" accept="application/pdf,.pdf,.xml,text/xml,application/xml,image/*" onChange={(e) => setArquivo(e.target.files?.[0] || null)} style={{ ...inp, padding: 6 }} />
          </label>
          {erro && <div style={{ fontSize: 12, color: COR, marginTop: 8 }}>{erro}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button disabled={!!gravando} onClick={salvar} style={{ ...btn, background: '#16a34a', color: '#fefefe', borderColor: '#16a34a' }}>
              {gravando === 'novo' ? <Loader2 size={14} className="spin" /> : <Paperclip size={14} />} Anexar e vincular
            </button>
            <button disabled={!!gravando} onClick={() => setAberto(false)} style={btn}>Cancelar</button>
          </div>
        </div>
      )}
      {!aberto && erro && <div style={{ fontSize: 12, color: COR, marginTop: 6 }}>{erro}</div>}
    </div>
  );
}

const rot: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, fontWeight: 700, color: 'var(--portal-text-muted)' };
const inp: React.CSSProperties = { padding: '8px 9px', borderRadius: 7, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-input)', color: 'var(--portal-text)', fontSize: 13, minHeight: 38, width: '100%', boxSizing: 'border-box' };

// Garantia sem mão de obra/deslocamento cobrado não gera NFS-e de reembolso; os
// outros casos o garantista marca "não precisa" (sai da coluna "falta NFS-e").
function DispensaReembolso({ garantiaId, garantia, temVinculada, podeEditar, onMudou, onErro }: {
  garantiaId: string; garantia: NotasGarantia['garantia']; temVinculada: boolean; podeEditar: boolean;
  onMudou: () => void; onErro: (m: string) => void;
}) {
  const [gravando, setGravando] = useState(false);
  if (temVinculada) return null;
  const mudar = async (dispensado: boolean) => {
    if (!podeEditar || gravando) return;
    setGravando(true);
    onErro('');
    try {
      const r = await fetchAuth(`/api/garantias/${garantiaId}/reembolso`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dispensado }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) onErro(j.error || 'Não foi possível gravar.');
      else onMudou();
    } catch {
      onErro('Sem conexão com o portal.');
    } finally {
      setGravando(false);
    }
  };
  const caixa: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12, padding: '8px 10px',
    borderRadius: 8, marginBottom: 8, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)',
  };
  const botao: React.CSSProperties = {
    marginLeft: 'auto', padding: '6px 10px', minHeight: 34, borderRadius: 6, fontSize: 12, fontWeight: 700,
    border: '1px solid var(--portal-border)', background: 'transparent', color: 'var(--portal-text)',
    cursor: podeEditar ? 'pointer' : 'not-allowed',
  };
  if (garantia.reembolsoDispensado) {
    return (
      <div style={caixa}>
        <Check size={14} color="#16a34a" /> <b>Marcada: não precisa de NFS-e de reembolso.</b>
        {podeEditar && <button style={botao} disabled={gravando} onClick={() => mudar(false)}>{gravando ? <Loader2 size={13} className="spin" /> : 'Desfazer'}</button>}
      </div>
    );
  }
  if (!garantia.precisaNfse) {
    return <div style={caixa}><Check size={14} color="#16a34a" /> Sem mão de obra nem deslocamento cobrados: esta garantia não precisa de NFS-e de reembolso.</div>;
  }
  if (!podeEditar) return null;
  return (
    <div style={caixa}>
      <span style={{ color: 'var(--portal-text-muted)' }}>Esta garantia não vai ter NFS-e de reembolso?</span>
      <button style={botao} disabled={gravando} onClick={() => mudar(true)}>{gravando ? <Loader2 size={13} className="spin" /> : 'Não precisa de NFS-e'}</button>
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
