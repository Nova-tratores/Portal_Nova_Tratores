'use client';
// "Notas do Omie encontradas": requisição sem nº de nota × nota de entrada que parece ser dela.
// A pessoa confirma uma a uma ("É esta") ou descarta ("Não é" — fica guardado neste navegador).
// Só chegam aqui as de confiança ALTA (lib/requisicoes/casar-nota.ts, 97,4% de acerto no passado).
import React, { useState } from 'react';
import { brl, normalizarTipo, valorReq, visualTipo, type Req } from '@/lib/requisicoes/inteligencia';
import type { SugestaoNota } from '@/lib/requisicoes/casar-nota-server';
import { IconeQuadrado } from './visualReq';
import VisualizadorDocumento, { type DocumentoVisualizavel } from '@/components/comum/VisualizadorDocumento';

const dataBR = (iso: string) => (iso ? new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR') : '—');
const fmtCnpj = (c: string) => (c.length === 14 ? c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : c);

export function NotasEncontradasCartao({ qtd, onAbrir }: { qtd: number; onAbrir: () => void }) {
  if (!qtd) return null;
  return (
    <div role="button" tabIndex={0} onClick={onAbrir} onKeyDown={(e) => { if (e.key === 'Enter') onAbrir(); }}
      className="rq-card clicavel rq-pulsa" style={{ ['--c' as any]: '#2563EB', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', marginBottom: 12 }}>
      <IconeQuadrado icone="fa-file-invoice" cor="#2563EB" tamanho={36} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 500 }}>{qtd === 1 ? 'Achei 1 nota no Omie' : `Achei ${qtd} notas no Omie`} para requisições sem nº de nota</div>
        <div className="rq-rot">Mesmo fornecedor e mesmo valor (ou várias requisições que somam a nota), com data perto. Confira e confirme.</div>
      </div>
      <i className="fa-solid fa-chevron-right" style={{ color: 'var(--rq-apag)' }} />
    </div>
  );
}

export default function ConfirmarNotas({ sugestoes: todas, requisicoes, onConfirmar, onRecusar, onFechar, foco }: {
  sugestoes: SugestaoNota[];
  /** veio do selo de um cartão: essa requisição aparece primeiro */
  foco?: number | null;
  requisicoes: Req[];
  onConfirmar: (s: SugestaoNota) => Promise<string | null>; // devolve a mensagem de erro, se houver
  onRecusar: (s: SugestaoNota) => void;
  onFechar: () => void;
}) {
  const [ocupado, setOcupado] = useState<number | null>(null); // id da nota sendo gravada
  const [erro, setErro] = useState<Record<number, string>>({});
  // "Ver nota": abre o PDF numa janela por cima, sem sair da tela
  const [doc, setDoc] = useState<DocumentoVisualizavel | null>(null);
  const reqDe = (id: number) => requisicoes.find((r) => Number(r.id) === id);
  const sugestoes = foco ? [...todas].sort((a, b) => Number(b.reqIds.includes(foco)) - Number(a.reqIds.includes(foco))) : todas;

  return (
    <div className="fixed inset-0 z-[10002] flex items-center justify-center p-3" style={{ background: 'rgba(15,23,42,.35)', backdropFilter: 'blur(6px)' }} onClick={onFechar}>
      <div className="rq-card" style={{ maxWidth: 900, width: '100%', maxHeight: '88vh', overflowY: 'auto', padding: '20px 22px' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <IconeQuadrado icone="fa-file-invoice" cor="#2563EB" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 19, fontWeight: 500 }}>Notas do Omie para confirmar</div>
            <div className="rq-rot">&quot;É esta&quot; grava o nº da nota e o CNPJ e anexa o PDF da nota (se a requisição ainda não tem). &quot;Não é&quot; tira a sugestão.</div>
          </div>
          <button className="rq-btn" style={{ height: 34 }} onClick={onFechar}><i className="fa-solid fa-xmark" /></button>
        </div>

        {sugestoes.length === 0 && <div className="rq-rot" style={{ padding: '30px 0', textAlign: 'center' }}>Nada para confirmar agora.</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
          {sugestoes.map((s) => {
            const rs = s.reqIds.map(reqDe).filter((x): x is Req => !!x);
            const soma = rs.reduce((t, r) => t + valorReq(r), 0);
            const igual = Math.abs(soma - s.nota.valor) < 0.06;
            const varias = s.reqIds.length > 1;
            return (
              <div key={`${s.reqIds.join(',')}-${s.nota.id}`} className="rq-card" style={{ ['--c' as any]: '#2563EB', padding: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(260px, 100%), 1fr))', gap: 12, alignItems: 'stretch' }}>
                  {/* requisição(ões) */}
                  <div style={{ border: '1px solid var(--rq-borda)', borderRadius: 12, padding: '10px 12px' }}>
                    <div className="rq-rot" style={{ marginBottom: 4 }}>{varias ? `${s.reqIds.length} requisições (a soma dá a nota)` : 'Requisição'}</div>
                    {rs.map((r) => {
                      const v = visualTipo(r.tipo || '');
                      return (
                        <div key={r.id} style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr) auto', gap: 8, alignItems: 'center', padding: varias ? '4px 0' : 0, borderBottom: varias ? '1px dashed var(--rq-borda)' : 0 }}>
                          <i className={`fa-solid ${v.icone}`} style={{ color: v.cor }} />
                          <div style={{ minWidth: 0 }}>
                            <a href={`/requisicoes?req=${r.id}`} target="_blank" rel="noreferrer" style={{ fontSize: 14, fontWeight: 500, color: 'var(--rq-txt)' }}>REQ {r.id}</a>
                            <span className="rq-rot"> · {normalizarTipo(r.tipo)} · {dataBR(String(r.data || '').slice(0, 10))}</span>
                            <div style={{ fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.titulo || '—'}</div>
                            {!varias && <div className="rq-rot">{r.fornecedor || 'sem fornecedor'}</div>}
                          </div>
                          <span style={{ fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>{brl(valorReq(r))}</span>
                        </div>
                      );
                    })}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 6 }}>
                      <span className="rq-rot">{varias ? 'Soma' : 'Valor'}</span>
                      <span className="rq-num" style={{ fontSize: 18 }}>{brl(soma)}</span>
                    </div>
                  </div>
                  {/* nota */}
                  <div style={{ border: '1px solid color-mix(in srgb, #2563EB 30%, var(--rq-borda))', background: 'color-mix(in srgb, #2563EB 4%, var(--surface, #fefefe))', borderRadius: 12, padding: '10px 12px' }}>
                    <div className="rq-rot" style={{ marginBottom: 4 }}>Nota de entrada no Omie ({s.nota.conta || '—'})</div>
                    <div style={{ fontSize: 14.5, fontWeight: 500 }}>NF {s.nota.numero}</div>
                    <div style={{ fontSize: 14, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.nota.nome}</div>
                    <div className="rq-rot" style={{ marginTop: 4 }}>CNPJ {fmtCnpj(s.nota.cnpj)} · {dataBR(s.nota.data)}</div>
                    <div className="rq-num" style={{ fontSize: 18, marginTop: 4, color: igual ? '#15803d' : 'var(--rq-txt)' }}>{brl(s.nota.valor)}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 10 }}>
                  {s.motivos.map((m) => <span key={m} className="rq-pilula" style={{ ['--c' as any]: '#16A34A' }}><i className="fa-solid fa-check" /> {m}</span>)}
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                    <button type="button" className="rq-btn" style={{ height: 34 }}
                      onClick={() => setDoc({ titulo: `NF ${s.nota.numero} · ${s.nota.nome}`, url: `/api/requisicoes/nota-pdf?notaId=${s.nota.id}`, nome: `NF-${s.nota.numero}` })}>
                      <i className="fa-regular fa-file-pdf" /> Ver nota
                    </button>
                    <button className="rq-btn" style={{ height: 34 }} disabled={ocupado === s.nota.id} onClick={() => onRecusar(s)}>Não é</button>
                    <button className="rq-btn cheio" style={{ height: 34, ['--c' as any]: '#2563EB' }} disabled={ocupado === s.nota.id}
                      onClick={async () => {
                        setOcupado(s.nota.id);
                        const e = await onConfirmar(s);
                        setOcupado(null);
                        if (e) setErro((p) => ({ ...p, [s.nota.id]: e }));
                      }}>
                      <i className="fa-solid fa-link" /> {ocupado === s.nota.id ? 'Gravando…' : varias ? `É esta nota (${s.reqIds.length})` : 'É esta'}
                    </button>
                  </div>
                </div>
                {erro[s.nota.id] && <div style={{ color: '#B91C1C', fontSize: 13, marginTop: 6 }}>{erro[s.nota.id]}</div>}
              </div>
            );
          })}
        </div>
      </div>
      <div onClick={(e) => e.stopPropagation()}>
        <VisualizadorDocumento key={doc?.url} doc={doc} onClose={() => setDoc(null)} />
      </div>
    </div>
  );
}
