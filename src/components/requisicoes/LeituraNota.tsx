'use client';
// "Ler a nota" dentro da requisição: lê o anexo da nota (chave da DANFE → IA → Omie) e mostra o
// que achou. Nada é gravado sem "Usar estes dados". Selo verde = confirmada no Omie ou pela chave;
// amarelo = só a IA leu, confira (no teste de 23/10/2026 as confirmadas acertaram 10 de 10).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { fetchAuth } from '@/lib/auth/client';
import { parseValorMisto } from '@/lib/marketing/custos';

type Dados = { chave: string | null; cnpj: string | null; nome: string | null; numero: string | null; serie: string | null; data: string | null; valor: number | null };
type Resultado = { dados: Dados; fonte: 'omie' | 'chave' | 'ia'; notaOmieId: number | null; avisos: string[] };

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtCnpj = (c: string) => (c.length === 14 ? c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : c);
const dataBR = (iso: string | null) => (iso ? new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR') : '—');

export default function LeituraNota({ reqId, campos, gatilho, valorReq, fornecedorReq, numeroReq, onAplicar }: {
  reqId: number;
  /** campos com anexo de nota (foto_nf, foto_nf2…) — lê o primeiro, ou o do gatilho */
  campos: string[];
  /** muda quando acabou de anexar uma nota: lê sozinho */
  gatilho: { campo: string; em: number } | null;
  valorReq: unknown; fornecedorReq: string; numeroReq: string;
  onAplicar: (campos: Record<string, string>) => void;
}) {
  const [lendo, setLendo] = useState(false);
  const [res, setRes] = useState<Resultado | null>(null);
  const [erro, setErro] = useState('');
  const [aplicado, setAplicado] = useState(false);

  const ler = useCallback(async (campo: string) => {
    setLendo(true); setErro(''); setRes(null); setAplicado(false);
    try {
      const r = await fetchAuth('/api/requisicoes/ler-nota', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reqId, campo }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'não consegui ler a nota');
      setRes(j);
    } catch (e) { setErro(e instanceof Error ? e.message : 'não consegui ler a nota'); }
    finally { setLendo(false); }
  }, [reqId]);

  // acabou de anexar: lê sozinho (uma vez por anexo)
  const ultimo = useRef(0);
  useEffect(() => {
    if (!gatilho || gatilho.em === ultimo.current) return;
    ultimo.current = gatilho.em;
    // espera o anexo novo ser gravado na requisição (o servidor lê de lá)
    const t = setTimeout(() => { void ler(gatilho.campo); }, 1800);
    return () => clearTimeout(t);
  }, [gatilho, ler]);

  if (!campos.length && !res && !lendo) return null;
  const d = res?.dados;
  const confirmada = res && res.fonte !== 'ia';
  const cor = confirmada ? '#16A34A' : '#D97706';
  const vReq = parseValorMisto(valorReq);
  const difValor = d?.valor && vReq > 0 && Math.abs(d.valor - vReq) > 0.01;
  const jaIgual = d?.numero && String(numeroReq || '').replace(/\D/g, '').replace(/^0+/, '') === d.numero;

  const aplicar = () => {
    if (!d) return;
    const campos: Record<string, string> = {};
    if (d.numero) campos.numero_nota = d.numero;
    if (d.cnpj) campos.fornecedor_cnpj = fmtCnpj(d.cnpj);
    if (d.nome && !String(fornecedorReq || '').trim()) campos.fornecedor = d.nome;
    if (d.valor && !(vReq > 0)) campos.valor_despeza = d.valor.toFixed(2).replace('.', ',');
    onAplicar(campos);
    setAplicado(true);
  };

  return (
    <div style={{ border: '1px solid var(--border, #e2e8f0)', borderRadius: 14, padding: '10px 12px', marginBottom: 12, background: '#fefefe' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <i className="fa-solid fa-file-invoice" style={{ color: '#2563EB' }} />
        <span style={{ fontSize: 14, fontWeight: 500 }}>Ler a nota anexada</span>
        {!lendo && campos.map((c, i) => (
          <button key={c} type="button" onClick={() => ler(c)} className="text-[13px] px-2.5 py-1 rounded-lg border border-zinc-200 hover:border-blue-300">
            {campos.length > 1 ? `Ler nota ${i + 1}` : res ? 'Ler de novo' : 'Ler agora'}
          </button>
        ))}
        {lendo && <span style={{ fontSize: 13, color: '#475569' }}><i className="fa-solid fa-spinner fa-spin" /> Lendo a nota…</span>}
      </div>
      {erro && <div style={{ color: '#B91C1C', fontSize: 13, marginTop: 6 }}>{erro}</div>}
      {res && d && (
        <div style={{ marginTop: 8 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '2px 10px', borderRadius: 99, color: cor, background: `color-mix(in srgb, ${cor} 10%, #fefefe)` }}>
            <i className={`fa-solid ${confirmada ? 'fa-circle-check' : 'fa-triangle-exclamation'}`} />
            {res.fonte === 'omie' ? 'Confirmada no Omie' : res.fonte === 'chave' ? 'Confirmada pela chave da nota' : 'Lida da imagem — confira'}
          </span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '6px 14px', marginTop: 8, fontSize: 13.5 }}>
            <div><div style={{ fontSize: 12, color: '#64748b' }}>Nº da nota</div>{d.numero || '—'}</div>
            <div><div style={{ fontSize: 12, color: '#64748b' }}>Valor</div>{d.valor ? brl(d.valor) : '—'}</div>
            <div><div style={{ fontSize: 12, color: '#64748b' }}>Emissão</div>{dataBR(d.data)}</div>
            <div style={{ gridColumn: '1 / -1' }}><div style={{ fontSize: 12, color: '#64748b' }}>Fornecedor</div>{d.nome || '—'}{d.cnpj ? ` · ${fmtCnpj(d.cnpj)}` : ''}</div>
          </div>
          {difValor && (
            <div style={{ fontSize: 13, color: '#B45309', marginTop: 8 }}>
              A nota é {brl(d.valor!)} e a requisição está com {brl(vReq)}. Pode ser uma nota que junta várias requisições — confira antes de mudar o valor.
            </div>
          )}
          {res.avisos.map((a) => <div key={a} style={{ fontSize: 13, color: '#B45309', marginTop: 4 }}>{a}</div>)}
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            {jaIgual ? (
              <span style={{ fontSize: 13, color: '#15803d' }}><i className="fa-solid fa-check" /> O nº da nota já está certo na requisição.</span>
            ) : aplicado ? (
              <span style={{ fontSize: 13, color: '#15803d' }}><i className="fa-solid fa-check" /> Dados gravados na requisição.</span>
            ) : (d.numero || d.cnpj) ? (
              <button type="button" onClick={aplicar} className="text-[13.5px] px-3.5 py-2 rounded-[10px] text-white" style={{ background: confirmada ? '#16A34A' : '#D97706' }}>
                <i className="fa-solid fa-check" /> Usar estes dados
              </button>
            ) : null}
            {!aplicado && !jaIgual && <span style={{ fontSize: 12, color: '#64748b', alignSelf: 'center' }}>Grava nº da nota e CNPJ{!String(fornecedorReq || '').trim() ? ', o fornecedor' : ''}{!(vReq > 0) ? ' e o valor' : ''}.</span>}
          </div>
        </div>
      )}
    </div>
  );
}
