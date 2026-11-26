'use client';
// Liga uma devolução em garantia (NF de retorno à fábrica) a uma ou mais garantias do portal,
// ou marca "sem garantia no portal" com o motivo. Usado na janela da devolução (Recebimentos)
// e no aviso "Devoluções sem garantia ligada" da tela Garantias.
import { useEffect, useState } from 'react';
import { fetchAuth } from '@/lib/auth/client';

interface GarRef { id: string; numero: string; numeroExterno?: string | null; cliente?: string | null; idOrdem?: string | null; devolucaoStatus?: string | null; status?: string; motivo?: string }
interface Dados {
  devolucao: { id: string; nf: string | null; nfFabrica: string; fornecedor: string | null; status: string; vinculo: string; semGarantiaMotivo: string | null; semGarantiaPor: string | null };
  ligadas: GarRef[]; sugestoes: GarRef[]; migracaoFaltando?: boolean; erro?: string;
}

const DEV: Record<string, string> = { pendente: 'devolução pendente', enviada: 'devolução enviada', dispensada: 'devolução dispensada', nao_aplicavel: 'sem devolução' };
const cor = {
  borda: 'var(--portal-border, #e2e8f0)', texto: 'var(--portal-text, #0f172a)', sec: 'var(--portal-text-secondary, #475569)',
  fundo: 'var(--portal-bg-card, #fefefe)', amb: 'var(--portal-amber-fg, #92400e)', verde: 'var(--portal-green-fg, #047857)', verm: 'var(--portal-red-fg, #b91c1c)',
};

export default function LigarGarantia({ fichaId, onMudou, compacto }: { fichaId: string; onMudou?: (msg: string) => void; compacto?: boolean }) {
  const [d, setD] = useState<Dados | null>(null);
  const [erro, setErro] = useState('');
  const [sel, setSel] = useState<GarRef[]>([]);
  const [q, setQ] = useState('');
  const [busca, setBusca] = useState<GarRef[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [semG, setSemG] = useState(false);
  const [motivo, setMotivo] = useState('');

  const carregar = () => {
    setErro('');
    fetchAuth(`/api/garantias/retorno-remessa?vincular=${encodeURIComponent(fichaId)}`).then((r) => r.json()).then((x: Dados) => {
      if (x.erro) { setErro(x.erro); return; }
      setD(x); setSel(x.ligadas);
    }).catch((e) => setErro((e as Error).message));
  };
  useEffect(carregar, [fichaId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (q.trim().length < 2) { setBusca([]); return; }
    const t = setTimeout(() => {
      fetchAuth(`/api/garantias/retorno-remessa?buscarGarantia=${encodeURIComponent(q)}`).then((r) => r.json()).then((x) => setBusca(x.garantias || [])).catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const post = async (body: Record<string, unknown>, msgOk: string) => {
    setEnviando(true); setErro('');
    try {
      const r = await fetchAuth('/api/garantias/retorno-remessa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fichaId, ...body }) });
      const x = await r.json();
      if (!x.ok) { setErro(x.erro || `Erro ${r.status}`); return; }
      onMudou?.(msgOk); setSemG(false); setMotivo(''); carregar();
    } catch (e) { setErro((e as Error).message); }
    finally { setEnviando(false); }
  };

  const tem = (id: string) => sel.some((s) => s.id === id);
  const alternar = (g: GarRef) => setSel((l) => tem(g.id) ? l.filter((s) => s.id !== g.id) : [...l, g]);
  const mudou = !!d && (sel.length !== d.ligadas.length || sel.some((s) => !d.ligadas.some((l) => l.id === s.id)));

  const btn = (bg: string, on = true): React.CSSProperties => ({ minHeight: 40, padding: '6px 14px', borderRadius: 8, border: 'none', background: on ? bg : '#cbd5e1', color: '#fefefe', fontWeight: 600, cursor: on ? 'pointer' : 'not-allowed', fontSize: '.8rem' });
  const chip = (on: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', minHeight: 44, padding: '6px 10px', borderRadius: 8,
    border: `1px solid ${on ? '#b45309' : cor.borda}`, background: on ? 'rgb(245 158 11 / .12)' : cor.fundo, color: cor.texto, cursor: 'pointer', fontSize: '.8rem', fontFamily: 'inherit',
  });
  const linha = (g: GarRef, extra?: string) => (
    <button key={g.id} type="button" onClick={() => alternar(g)} style={chip(tem(g.id))}>
      <input type="checkbox" readOnly checked={tem(g.id)} style={{ width: 18, height: 18, flexShrink: 0 }} />
      <span style={{ minWidth: 0 }}>
        <b>{g.numero}</b>{g.numeroExterno ? ` · SG ${g.numeroExterno}` : ''}{g.idOrdem ? ` · ${g.idOrdem}` : ''}{g.cliente ? ` · ${g.cliente}` : ''}
        <span style={{ display: 'block', fontSize: '.7rem', color: cor.sec }}>{[extra, g.devolucaoStatus ? DEV[g.devolucaoStatus] || g.devolucaoStatus : null].filter(Boolean).join(' · ')}</span>
      </span>
    </button>
  );

  if (!d) return <div style={{ fontSize: '.8rem', color: erro ? cor.verm : cor.sec, padding: '6px 0' }}>{erro || 'Procurando garantias para esta devolução…'}</div>;
  const v = d.devolucao;
  const outras = busca.filter((b) => !d.sugestoes.some((s) => s.id === b.id) && !d.ligadas.some((l) => l.id === b.id));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '.8rem', color: cor.texto }}>
      {!compacto && (
        <div style={{ color: cor.sec }}>
          Ligar à garantia fecha a pendência <b>Devolução de peças</b> dela{v.status === 'faturada' ? ` com a NF ${v.nf || ''}` : ' quando a NF-e for autorizada'} e registra no histórico da garantia.
        </div>
      )}
      {d.migracaoFaltando && <div style={{ color: cor.amb, fontSize: '.74rem' }}>Falta aplicar <code>sql/garantia-retornos-vinculo.sql</code>: por enquanto dá para ligar só UMA garantia e não dá para marcar &quot;sem garantia&quot;.</div>}
      {v.vinculo === 'sem_garantia' && (
        <div style={{ color: cor.sec, border: `1px dashed ${cor.borda}`, borderRadius: 8, padding: '6px 10px' }}>
          Marcada <b>sem garantia no portal</b> por {v.semGarantiaPor || '—'}: {v.semGarantiaMotivo}
          <button type="button" disabled={enviando} onClick={() => post({ acao: 'sem_garantia', desfazer: true }, 'Marcação desfeita.')} style={{ marginLeft: 8, minHeight: 32, borderRadius: 6, border: `1px solid ${cor.borda}`, background: cor.fundo, color: cor.texto, cursor: 'pointer', fontSize: '.72rem' }}>Desfazer</button>
        </div>
      )}

      {d.ligadas.length > 0 && <div style={{ fontWeight: 700, color: cor.verde }}>Ligada a {d.ligadas.map((l) => l.numero).join(', ')}</div>}
      {d.ligadas.map((g) => linha(g, 'ligada'))}
      {d.sugestoes.length > 0 && <div style={{ fontWeight: 700, color: cor.sec, marginTop: 2 }}>Sugeridas pelas peças</div>}
      {(d.sugestoes as GarRef[]).map((g) => linha(g, g.motivo))}
      {d.sugestoes.length === 0 && d.ligadas.length === 0 && <div style={{ color: cor.sec }}>Nenhuma garantia do portal tem as peças desta nota. Procure abaixo, ou marque que não tem garantia no portal.</div>}

      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Procurar garantia: GAR-…, SG, OS, cliente ou chassi"
        style={{ minHeight: 40, border: `1px solid ${cor.borda}`, borderRadius: 8, padding: '6px 10px', fontSize: '.82rem', background: cor.fundo, color: cor.texto, boxSizing: 'border-box', width: '100%' }} />
      {outras.map((g) => linha(g))}

      {erro && <div style={{ color: cor.verm }}>{erro}</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" disabled={!mudou || enviando} onClick={() => post({ acao: 'ligar', garantiaIds: sel.map((s) => s.id) }, sel.length ? `Devolução ligada a ${sel.map((s) => s.numero).join(', ')}.` : 'Devolução desligada das garantias.')} style={btn('#b45309', mudou && !enviando)}>
          {enviando ? 'Gravando…' : sel.length ? `Ligar a ${sel.map((s) => s.numero).join(', ')}` : 'Salvar sem garantia ligada'}
        </button>
        {v.vinculo !== 'sem_garantia' && d.ligadas.length === 0 && !d.migracaoFaltando && !semG && (
          <button type="button" onClick={() => setSemG(true)} style={{ minHeight: 40, padding: '6px 12px', borderRadius: 8, border: `1px solid ${cor.borda}`, background: cor.fundo, color: cor.texto, cursor: 'pointer', fontSize: '.8rem' }}>Não tem garantia no portal</button>
        )}
      </div>
      {semG && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} placeholder="Por quê? Ex.: peça de estoque com defeito devolvida ao fornecedor; garantia tratada direto com a fábrica."
            style={{ border: `1px solid ${cor.borda}`, borderRadius: 8, padding: '6px 10px', fontSize: '.8rem', background: cor.fundo, color: cor.texto, fontFamily: 'inherit' }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" disabled={enviando || motivo.trim().length < 5} onClick={() => post({ acao: 'sem_garantia', motivo }, 'Marcada sem garantia no portal.')} style={btn('#475569', !enviando && motivo.trim().length >= 5)}>Confirmar</button>
            <button type="button" onClick={() => setSemG(false)} style={{ minHeight: 40, padding: '6px 12px', borderRadius: 8, border: `1px solid ${cor.borda}`, background: cor.fundo, color: cor.texto, cursor: 'pointer' }}>Voltar</button>
          </div>
        </div>
      )}
    </div>
  );
}
