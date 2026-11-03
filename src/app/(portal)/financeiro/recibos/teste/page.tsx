'use client';
// PÁGINA DE TESTE (José, 03/11/2026): os 3 modelos de impressão do recibo lado a lado, com um exemplo.
// A tela de verdade (/financeiro/recibos) já deixa trocar o modelo; aqui é só para escolher o padrão.
import { useEffect, useState } from 'react';
import FinanceiroNav from '@/components/financeiro/FinanceiroNav';
import { fetchAuth } from '@/lib/auth/client';
import { MODELOS } from '@/lib/recibos/tipos';

const EXEMPLO = {
  empresa: 'Nova Tratores', tipo: 'recebemos', pessoa_nome: 'João da Silva Exemplo', pessoa_doc: '12345678909', valor: 1234.5,
  referente: 'pagamento da OS 0846 — revisão de 300 horas do trator Mahindra 6075', forma: 'PIX',
  data_pagto: new Date().toISOString().slice(0, 10), cidade: 'Piraju - SP', com_assinatura: true, mostrar_qr: true,
};

export default function TesteRecibos() {
  const [tipo, setTipo] = useState<'recebemos' | 'pagamos'>('recebemos');
  const [urls, setUrls] = useState<Record<number, string>>({});
  const [erro, setErro] = useState('');
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const lista = await Promise.all(MODELOS.map(async (m) => {
          const r = await fetchAuth('/api/recibos/previa', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...EXEMPLO, tipo, pessoa_nome: tipo === 'pagamos' ? 'Carlos Freteiro Exemplo' : EXEMPLO.pessoa_nome,
              referente: tipo === 'pagamos' ? 'frete de peças de Bauru a Piraju' : EXEMPLO.referente, modelo: m.id }) });
          if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erro || 'Erro ao gerar');
          return [m.id, URL.createObjectURL(await r.blob())] as const;
        }));
        if (vivo) { setUrls(Object.fromEntries(lista)); setErro(''); }
      } catch (e) { if (vivo) setErro((e as Error).message); }
    })();
    return () => { vivo = false; };
  }, [tipo]);
  const pill = (a: boolean): React.CSSProperties => ({ padding: '7px 14px', borderRadius: 999, fontSize: 14, cursor: 'pointer',
    border: `1px solid ${a ? '#93c5fd' : 'var(--border, #e2e8f0)'}`, background: a ? '#eff6ff' : 'var(--surface, #fefefe)', color: a ? '#1d4ed8' : 'var(--portal-text, #0f172a)' });
  return (
    <>
      <FinanceiroNav />
      <div style={{ padding: 'clamp(12px, 2vw, 28px)', display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 14, color: '#475569' }}>Escolha o modelo de impressão do recibo. Exemplo:</span>
          <button style={pill(tipo === 'recebemos')} onClick={() => setTipo('recebemos')}>Recebemos de um cliente</button>
          <button style={pill(tipo === 'pagamos')} onClick={() => setTipo('pagamos')}>Pagamos um freteiro</button>
        </div>
        {erro && <div style={{ color: '#b91c1c', fontSize: 14 }}>{erro}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(380px, 100%), 1fr))', gap: 14 }}>
          {MODELOS.map((m) => (
            <div key={m.id} style={{ background: 'var(--surface, #fefefe)', border: '1px solid var(--border, #e2e8f0)', borderRadius: 16, padding: 12, display: 'grid', gap: 8 }}>
              <div style={{ fontSize: 16, color: 'var(--portal-text, #0f172a)' }}>Opção {m.id} — {m.nome}</div>
              <div style={{ fontSize: 13, color: '#64748b' }}>{m.detalhe}</div>
              {urls[m.id]
                ? <iframe title={m.nome} src={`${urls[m.id]}#toolbar=0&view=FitH`} style={{ width: '100%', height: 620, border: 0, borderRadius: 10 }} />
                : <div style={{ height: 620, display: 'grid', placeItems: 'center', color: '#94a3b8' }}>Gerando…</div>}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
