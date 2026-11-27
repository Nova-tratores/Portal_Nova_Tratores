'use client';
// Frete (CT-e) ↔ nota de produto, dentro da janela "Dar entrada" de /estoque/recebimentos.
//  - modo 'nfe': aba "Frete (CT-e)" da nota — marca os CT-e desta carga; os marcados e
//    ainda pendentes entram logo depois da nota (o pai faz a entrada).
//  - modo 'cte': bloco "Nota da carga" do CT-e — escolhe a(s) NF-e (ou "sem nota", com motivo).
// A Omie não diz pela API a qual NF o CT-e se refere: o portal sugere (mesmo remetente,
// data próxima) e a pessoa confirma. Regras em lib/ajustes/frete-vinculo.ts.

import { useEffect, useState } from 'react';
import { authHeaders, fetchAuth } from '@/lib/auth/client';

export interface FreteItem {
  idReceb: number; numero: string | null; chave: string | null; emissao: string | null;
  valor: number; status: string | null; fornecedor: string | null;
  ligado?: boolean; ligadoOutra?: boolean;
}
export interface EscolhaCte { nfes: number[]; semNota: string }

const brl = (v: number) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const num = (s: string | null) => String(s || '?').replace(/^0+(?=\d)/, '');
const dia = (s: string | null) => {
  const t = String(s || '').split('T')[0];
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : t;
};

const caixa: React.CSSProperties = { border: '1px solid #bfdbfe', background: '#eff6ff', borderRadius: 8, padding: 12, marginBottom: 12 };
const linhaSt: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, minHeight: 40, padding: '4px 6px', borderRadius: 6, cursor: 'pointer', flexWrap: 'wrap' };
const selo = (bg: string, cor: string): React.CSSProperties => ({ fontSize: '.64rem', fontWeight: 700, padding: '1px 6px', borderRadius: 5, background: bg, color: cor });

/** Aba da NF-e: CT-e desta carga. `onMarcados` = os ligados que ainda estão pendentes. */
export function FretesDaNotaAba({ conta, idReceb, onMarcados, onContagem }: {
  conta: string; idReceb: number;
  onMarcados: (fretes: FreteItem[]) => void;
  onContagem?: (n: number) => void;
}) {
  const [fretes, setFretes] = useState<FreteItem[] | null>(null);
  const [erro, setErro] = useState('');
  const [faltaTabela, setFaltaTabela] = useState(false);
  const [gravando, setGravando] = useState<number | null>(null);

  useEffect(() => {
    let cancel = false;
    fetchAuth(`/api/ajustes/recebimentos/${idReceb}/frete?conta=${encodeURIComponent(conta)}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancel) return;
        if (d.erro) { setErro(d.erro); setFretes([]); return; }
        setFretes(d.fretes || []);
        setFaltaTabela(!!d.faltaTabela);
      })
      .catch((e) => { if (!cancel) { setErro(String(e?.message || e)); setFretes([]); } });
    return () => { cancel = true; };
  }, [conta, idReceb]);

  useEffect(() => {
    if (!fretes) return;
    onContagem?.(fretes.length);
    onMarcados(fretes.filter((f) => f.ligado && f.status !== 'Recebida'));
  }, [fretes]); // eslint-disable-line react-hooks/exhaustive-deps

  const alternar = async (f: FreteItem) => {
    setGravando(f.idReceb);
    try {
      const r = await fetch(`/api/ajustes/recebimentos/${idReceb}/frete`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ conta, cte: f.idReceb, ligar: !f.ligado }),
      });
      const d = await r.json();
      if (!d.ok) { alert(d.erro || 'não gravou'); return; }
      setFretes((fs) => (fs || []).map((x) => (x.idReceb === f.idReceb ? { ...x, ligado: !f.ligado, ligadoOutra: false } : x)));
    } finally { setGravando(null); }
  };

  if (!fretes) return <div style={{ fontSize: '.78rem', color: '#64748b', padding: 12 }}>procurando os fretes desta carga…</div>;
  return (
    <div>
      <div style={{ fontSize: '.78rem', color: '#1e3a8a', marginBottom: 10, lineHeight: 1.45 }}>
        Marque o(s) <b>CT-e (frete) desta carga</b>. Os marcados que ainda estão pendentes entram <b>logo depois da nota</b>,
        com a data de registro igual ou depois da dela — assim a Omie soma o frete no custo das peças.
        A sugestão vem do mesmo remetente com emissão até 10 dias depois da nota (confira o valor e a data).
      </div>
      {faltaTabela && <div style={{ ...caixa, background: '#fffbeb', borderColor: '#fde68a', color: '#92400e', fontSize: '.74rem' }}>Falta aplicar <b>sql/recebimento-frete-vinculos.sql</b>: dá para marcar, mas não fica salvo.</div>}
      {erro && <div style={{ color: '#dc2626', fontSize: '.76rem', marginBottom: 8 }}>{erro}</div>}
      {fretes.length === 0 ? (
        <div style={{ fontSize: '.78rem', color: '#64748b', padding: '10px 0' }}>Nenhum CT-e deste remetente perto da data desta nota. Se o frete chegar depois, ligue pela janela do próprio CT-e.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {fretes.map((f) => (
            <label key={f.idReceb} style={{ ...linhaSt, background: f.ligado ? '#dbeafe' : '#fff', border: '1px solid #e2e8f0' }}>
              <input type="checkbox" checked={!!f.ligado} disabled={gravando === f.idReceb} onChange={() => alternar(f)} style={{ width: 18, height: 18 }} />
              <span style={{ fontWeight: 600 }}>CT-e {num(f.numero)}</span>
              <span style={{ color: '#475569' }}>{brl(f.valor)}</span>
              <span style={{ color: '#64748b', fontSize: '.74rem' }}>emitido {dia(f.emissao)}</span>
              {f.status === 'Recebida' ? <span style={selo('#dcfce7', '#166534')}>já recebido</span> : <span style={selo('#fef3c7', '#92400e')}>pendente</span>}
              {f.ligadoOutra && <span style={selo('#f1f5f9', '#475569')}>ligado a outra nota</span>}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

/** Bloco do CT-e: de qual nota de produto é este frete. */
export function NotaDaCarga({ conta, idReceb, valor, onChange }: {
  conta: string; idReceb: number; valor: EscolhaCte; onChange: (v: EscolhaCte) => void;
}) {
  const [cands, setCands] = useState<FreteItem[] | null>(null);
  const [semNotaAberto, setSemNotaAberto] = useState(false);

  useEffect(() => {
    let cancel = false;
    fetchAuth(`/api/ajustes/recebimentos/${idReceb}/frete?conta=${encodeURIComponent(conta)}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancel) return;
        const lista: FreteItem[] = d.candidatas || [];
        setCands(lista);
        const ligadas: number[] = d.ligadas || [];
        if (ligadas.length) onChange({ nfes: ligadas, semNota: '' });
        else if (d.semNota) { setSemNotaAberto(true); onChange({ nfes: [], semNota: d.semNota }); }
        else if (lista.length === 1) onChange({ nfes: [lista[0].idReceb], semNota: '' });
      })
      .catch(() => { if (!cancel) setCands([]); });
    return () => { cancel = true; };
  }, [conta, idReceb]); // eslint-disable-line react-hooks/exhaustive-deps

  const marcar = (id: number) => {
    const nfes = valor.nfes.includes(id) ? valor.nfes.filter((x) => x !== id) : [...valor.nfes, id];
    onChange({ nfes, semNota: '' });
    if (nfes.length) setSemNotaAberto(false);
  };
  const pendentes = (cands || []).filter((c) => valor.nfes.includes(c.idReceb) && c.status !== 'Recebida');

  return (
    <div style={caixa}>
      <div style={{ fontWeight: 600, color: '#1e3a8a', fontSize: '.82rem', marginBottom: 4 }}>Nota da carga (obrigatório)</div>
      <div style={{ fontSize: '.74rem', color: '#1e40af', marginBottom: 8 }}>
        O frete só entra <b>depois</b> da nota de produto da carga, e com data de registro igual ou depois da dela — senão a Omie pode não somar o frete no custo das peças.
      </div>
      {!cands ? <div style={{ fontSize: '.76rem', color: '#64748b' }}>procurando as notas deste remetente…</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {cands.length === 0 && <div style={{ fontSize: '.76rem', color: '#64748b' }}>Nenhuma nota deste remetente até 10 dias antes do frete.</div>}
          {cands.map((c) => (
            <label key={c.idReceb} style={{ ...linhaSt, background: valor.nfes.includes(c.idReceb) ? '#dbeafe' : '#fff', border: '1px solid #e2e8f0' }}>
              <input type="checkbox" checked={valor.nfes.includes(c.idReceb)} onChange={() => marcar(c.idReceb)} style={{ width: 18, height: 18 }} />
              <span style={{ fontWeight: 600 }}>NF {num(c.numero)}</span>
              <span style={{ color: '#475569' }}>{brl(c.valor)}</span>
              <span style={{ color: '#64748b', fontSize: '.74rem' }}>emitida {dia(c.emissao)}</span>
              {c.status === 'Recebida' ? <span style={selo('#dcfce7', '#166534')}>já recebida</span> : <span style={selo('#fee2e2', '#991b1b')}>ainda pendente</span>}
            </label>
          ))}
          {pendentes.length > 0 && (
            <div style={{ fontSize: '.76rem', color: '#991b1b', marginTop: 4 }}>
              Dê entrada primeiro na nota {pendentes.map((p) => num(p.numero)).join(', ')}{' '}
              {pendentes.map((p) => (
                <a key={p.idReceb} href={`/estoque/recebimentos?conta=${conta}&nota=${p.idReceb}`} style={{ color: '#1d4ed8', marginLeft: 4 }}>abrir NF {num(p.numero)}</a>
              ))}
              {' '}— na aba &quot;Frete (CT-e)&quot; dela dá para dar entrada neste frete junto.
            </div>
          )}
          <label style={{ ...linhaSt, cursor: 'pointer', marginTop: 4 }}>
            <input type="checkbox" checked={semNotaAberto} onChange={(e) => { setSemNotaAberto(e.target.checked); onChange({ nfes: e.target.checked ? [] : valor.nfes, semNota: e.target.checked ? valor.semNota : '' }); }} style={{ width: 18, height: 18 }} />
            <span style={{ fontSize: '.78rem' }}>Este frete não tem nota de produto no portal</span>
          </label>
          {semNotaAberto && (
            <textarea value={valor.semNota} onChange={(e) => onChange({ nfes: [], semNota: e.target.value })} rows={2}
              placeholder="Por quê? Ex.: frete de devolução, de máquina vinda em demonstração, de outra empresa…"
              style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #cbd5e1', borderRadius: 6, padding: '6px 8px', fontSize: '.78rem', fontFamily: 'inherit' }} />
          )}
        </div>
      )}
    </div>
  );
}
