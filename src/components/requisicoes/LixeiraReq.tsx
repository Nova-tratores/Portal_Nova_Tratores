'use client';
// Aba Lixeira das Requisições (visual novo): busca, total, cartões com ícone do tipo e
// "Restaurar" (volta para Pedido realizado). Nada é apagado de vez — a lixeira só guarda.
import React, { useMemo, useState } from 'react';
import { brl, normalizarTipo, valorReq, visualTipo, type Req } from '@/lib/requisicoes/inteligencia';
import { paraBusca } from '@/lib/texto';
import { IconeQuadrado } from './visualReq';

export default function LixeiraReq({ requisicoes, nomeDe, podeRestaurar, onRestaurar }: {
  requisicoes: Req[];
  nomeDe: (s: string) => string;
  podeRestaurar: boolean;
  onRestaurar: (r: Req) => Promise<void> | void;
}) {
  const [busca, setBusca] = useState('');
  const [restaurando, setRestaurando] = useState<number | null>(null);
  const lixo = useMemo(() => requisicoes.filter((r) => r.status === 'lixeira').sort((a, b) => Number(b.id) - Number(a.id)), [requisicoes]);
  const lista = useMemo(() => {
    const q = paraBusca(busca).trim();
    if (!q) return lixo;
    return lixo.filter((r) => paraBusca([r.id, r.titulo, r.fornecedor, r.tipo, nomeDe(r.solicitante), r.criado_por].join(' ')).includes(q));
  }, [lixo, busca, nomeDe]);
  const total = lista.reduce((s, r) => s + valorReq(r), 0);

  if (lixo.length === 0) {
    return (
      <div className="rq-card" style={{ textAlign: 'center', padding: '56px 20px' }}>
        <IconeQuadrado icone="fa-trash-can" cor="#64748B" tamanho={48} />
        <div style={{ fontSize: 17, fontWeight: 500, marginTop: 12 }}>Lixeira vazia</div>
        <div className="rq-rot" style={{ marginTop: 4 }}>Requisições excluídas aparecem aqui e podem ser restauradas.</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 320px', maxWidth: 520 }}>
          <i className="fa-solid fa-magnifying-glass" style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--rq-apag)', fontSize: 13 }} />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nº, título, fornecedor ou quem pediu…"
            style={{ width: '100%', height: 38, padding: '0 12px 0 36px', borderRadius: 11, border: '1px solid var(--rq-borda)', background: 'var(--surface, #fefefe)', color: 'var(--rq-txt)', fontSize: 14, outline: 'none' }} />
        </div>
        <span className="rq-rot">{lista.length} de {lixo.length} · {brl(total)}</span>
        <span className="rq-rot" style={{ marginLeft: 'auto' }}>Restaurar devolve para &quot;Pedido realizado&quot;.</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(300px, 100%), 1fr))', gap: 12 }}>
        {lista.map((r, i) => {
          const v = visualTipo(r.tipo);
          const auto = r.origem === 'auto_alimentacao_os';
          return (
            <div key={r.id} className="rq-card rq-entra" style={{ ['--c' as any]: v.cor, animationDelay: `${Math.min(i, 12) * 30}ms` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <IconeQuadrado icone={v.icone} cor={v.cor} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <span className="rq-req-num" style={{ ['--c' as any]: v.cor }}><small>REQ</small>{r.id}</span>
                  <div className="rq-req-tipo">{normalizarTipo(r.tipo)}</div>
                </div>
                <div className="rq-num" style={{ fontSize: 17 }}>{brl(valorReq(r))}</div>
              </div>
              <div className="rq-req-titulo" style={{ marginTop: 10 }}>{r.titulo || 'Sem título'}</div>
              <div className="rq-req-meta">
                {r.data && <span><i className="fa-regular fa-calendar" />{new Date(r.data + 'T12:00:00').toLocaleDateString('pt-BR')}</span>}
                <span><i className="fa-solid fa-user" />{nomeDe(r.solicitante) || r.criado_por || '—'}</span>
                {r.fornecedor && <span><i className="fa-solid fa-store" />{r.fornecedor}</span>}
              </div>
              {auto && <div className="rq-req-selos"><span className="rq-pilula" style={{ ['--c' as any]: '#64748B' }} title="Saiu sozinha: o item de alimentação saiu da OS ou a OS foi cancelada">automática (OS)</span></div>}
              {podeRestaurar && (
                <div className="rq-req-rodape" style={{ justifyContent: 'flex-end' }}>
                  <button className="rq-btn" style={{ ['--c' as any]: '#EA580C', height: 34 }} disabled={restaurando === r.id}
                    onClick={async () => { setRestaurando(r.id); try { await onRestaurar(r); } finally { setRestaurando(null); } }}>
                    <i className="fa-solid fa-rotate-left" style={{ color: '#EA580C' }} /> {restaurando === r.id ? 'Restaurando…' : 'Restaurar'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {lista.length === 0 && <div className="rq-rot" style={{ textAlign: 'center', padding: 30 }}>Nada na lixeira com essa busca.</div>}
    </div>
  );
}
