'use client';
// Aviso da tela Garantias: devoluções em garantia já faturadas (NF de retorno à fábrica) que não
// estão ligadas a nenhuma garantia. Fica aqui até alguém ligar ou marcar "sem garantia no portal".
// Abre sozinho com ?retornos=1 (link do sino); ?ficha=<id> já abre aquela devolução.
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { fetchAuth } from '@/lib/auth/client';
import LigarGarantia from './LigarGarantia';

interface Pendente {
  id: string; conta: string; nf: string | null; nfFabrica: string; fornecedor: string | null; valor: number | null;
  quem: string | null; faturadoEm: string | null; criadoEm: string; itens: Array<{ codigo: string | null; descricao: string | null; qtd: number }>;
  sugestoes: Array<{ numero: string }>;
}
const brl = (n: number | null) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function RetornosSemGarantia({ onMudou }: { onMudou?: () => void }) {
  const [lista, setLista] = useState<Pendente[] | null>(null);
  const daUrl = (k: string) => (typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get(k));
  const [aberto, setAberto] = useState(() => !!daUrl('retornos'));
  const [ficha, setFicha] = useState<string | null>(() => (daUrl('retornos') ? daUrl('ficha') : null));
  const [msg, setMsg] = useState('');

  const carregar = useCallback(() => {
    fetchAuth('/api/garantias/retorno-remessa?pendentesVinculo=1')
      .then((r) => (r.ok ? r.json() : { pendentes: [] }))
      .then((d) => setLista(d.pendentes || []))
      .catch(() => setLista([]));
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  if (!lista || lista.length === 0) return msg ? <div style={{ margin: '0 0 10px', fontSize: '.82rem', color: 'var(--portal-green-fg, #047857)' }}>{msg}</div> : null;

  return (
    <div style={{ margin: '0 0 12px', border: '1px solid var(--mx-pb-red, #fecaca)', background: 'var(--mx-p-red, #fef2f2)', borderRadius: 10, padding: '10px 12px', color: 'var(--portal-text, #0f172a)' }}>
      <button type="button" onClick={() => setAberto((a) => !a)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', minHeight: 40, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', color: 'inherit', fontFamily: 'inherit', padding: 0 }}>
        <AlertTriangle size={18} style={{ color: 'var(--portal-red-fg, #b91c1c)', flexShrink: 0 }} />
        <span style={{ fontSize: '.86rem' }}>
          <b>{lista.length === 1 ? '1 devolução em garantia sem garantia ligada' : `${lista.length} devoluções em garantia sem garantia ligada`}</b>
          <span style={{ color: 'var(--portal-text-secondary, #475569)' }}> · NF {lista.slice(0, 4).map((p) => p.nf || '?').join(', ')}{lista.length > 4 ? '…' : ''}. Ligue à garantia para fechar a pendência de devolução.</span>
        </span>
        <span style={{ marginLeft: 'auto' }}>{aberto ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</span>
      </button>
      {msg && <div style={{ fontSize: '.8rem', color: 'var(--portal-green-fg, #047857)', marginTop: 6 }}>{msg}</div>}
      {aberto && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          {lista.map((p) => (
            <div key={p.id} style={{ background: 'var(--portal-bg-card, #fefefe)', border: '1px solid var(--portal-border, #e2e8f0)', borderRadius: 8, padding: '8px 10px' }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: '.8rem' }}>
                <b>NF {p.nf || '?'}</b>
                <span>retorno da NF {p.nfFabrica} · {p.fornecedor}</span>
                <span>{brl(p.valor)}</span>
                <span style={{ color: 'var(--portal-text-secondary, #64748b)' }}>{p.conta} · {new Date(p.faturadoEm || p.criadoEm).toLocaleDateString('pt-BR')} · {p.quem}</span>
                {p.sugestoes.length > 0 && <span style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--portal-amber-fg, #92400e)' }}>sugerida: {p.sugestoes.map((s) => s.numero).join(', ')}</span>}
                <button type="button" onClick={() => setFicha((f) => (f === p.id ? null : p.id))}
                  style={{ marginLeft: 'auto', minHeight: 40, padding: '4px 12px', borderRadius: 8, border: 'none', background: '#b45309', color: '#fefefe', fontWeight: 600, cursor: 'pointer', fontSize: '.78rem' }}>
                  {ficha === p.id ? 'Fechar' : 'Resolver'}
                </button>
              </div>
              <div style={{ fontSize: '.72rem', color: 'var(--portal-text-secondary, #64748b)', marginTop: 2 }}>
                {p.itens.map((i) => `${i.qtd}× ${i.codigo || '?'} ${i.descricao || ''}`).join(' · ')}
              </div>
              {ficha === p.id && (
                <div style={{ marginTop: 8 }}>
                  <LigarGarantia fichaId={p.id} onMudou={(m) => { setMsg(m); setFicha(null); carregar(); onMudou?.(); }} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
