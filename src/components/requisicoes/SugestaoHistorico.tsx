'use client';
// Bloco da nova requisição que "lembra" o histórico (lib/requisicoes/inteligencia.ts):
//  - fornecedor e valor de costume para o tipo (e para o carro, se houver histórico dele) → botão "Usar"
//  - campos de fornecedor e valor já na criação (antes só dava para pôr depois, por isso 46% ficavam sem fornecedor)
//  - aviso de requisição parecida aberta nos últimos 15 dias
import React, { useMemo } from 'react';
import { brl, normalizarTipo, parecidas, ROTULO_FASE, sugerir, valorReq, type Req } from '@/lib/requisicoes/inteligencia';

const fmtBR = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function SugestaoHistorico({ historico, tipo, veiculo, titulo, fornecedor, valor, onFornecedor, onValor }: {
  historico: Req[];
  tipo: string; veiculo?: string; titulo?: string;
  fornecedor: string; valor: string;
  onFornecedor: (v: string) => void;
  onValor: (v: string) => void;
}) {
  const hoje = useMemo(() => new Date(), []);
  const sug = useMemo(() => (tipo ? sugerir(historico, { tipo, veiculo }) : null), [historico, tipo, veiculo]);
  const iguais = useMemo(() => (tipo ? parecidas(historico, { tipo, veiculo, titulo }, hoje) : []), [historico, tipo, veiculo, titulo, hoje]);
  // nomes de fornecedor já usados nesse tipo, para o autocompletar
  const nomes = useMemo(() => {
    const t = normalizarTipo(tipo);
    const m = new Map<string, number>();
    for (const r of historico) {
      const f = String(r.fornecedor || '').trim();
      if (!f) continue;
      m.set(f, (m.get(f) || 0) + (normalizarTipo(r.tipo) === t ? 5 : 1));
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60).map(([f]) => f);
  }, [historico, tipo]);
  if (!tipo) return null;

  const caixa: React.CSSProperties = { border: '1px solid var(--border, #e2e8f0)', borderRadius: 16, padding: '14px 16px', background: 'var(--surface, #fefefe)' };
  const campo = 'w-full px-4 py-3 rounded-xl border border-zinc-200 bg-zinc-50 focus:border-orange-500 focus:ring-4 focus:ring-orange-500/20 outline-none transition-all text-base text-black';
  const chip: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 10, border: '1px solid color-mix(in srgb, #16A34A 30%, transparent)', background: 'color-mix(in srgb, #16A34A 8%, var(--surface, #fefefe))', color: '#15803d', fontSize: 13.5, cursor: 'pointer' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {iguais.length > 0 && (
        <div style={{ ...caixa, borderColor: 'color-mix(in srgb, #D97706 40%, transparent)', background: 'color-mix(in srgb, #D97706 6%, var(--surface, #fefefe))' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14.5, fontWeight: 500, color: '#B45309' }}>
            <i className="fa-solid fa-clone" /> Já existe {iguais.length === 1 ? 'uma requisição parecida' : `${iguais.length} requisições parecidas`} nos últimos 15 dias
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
            {iguais.map((r) => (
              <a key={r.id} href={`/requisicoes?req=${r.id}`} target="_blank" rel="noreferrer" style={{ fontSize: 13.5, color: 'var(--portal-text, #0f172a)', textDecoration: 'none' }}>
                <span style={{ color: '#B45309' }}>#{r.id}</span> · {r.titulo || 'sem título'} · {brl(valorReq(r))} · {ROTULO_FASE[String(r.status)] || r.status}
                {r.data ? ` · ${new Date(r.data + 'T12:00:00').toLocaleDateString('pt-BR')}` : ''}
              </a>
            ))}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--portal-text-secondary, #475569)', marginTop: 6 }}>Confira antes de criar outra. Se for mesmo nova, pode seguir.</div>
        </div>
      )}

      <div style={caixa}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14.5, fontWeight: 500 }}>
          <i className="fa-solid fa-wand-magic-sparkles" style={{ color: '#16A34A' }} /> Fornecedor e valor <span style={{ fontWeight: 400, fontSize: 12.5, color: 'var(--portal-text-muted, #64748b)' }}>(pode deixar para depois)</span>
        </div>
        {sug && (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 10 }}>
            <span style={{ fontSize: 13, color: 'var(--portal-text-secondary, #475569)' }}>
              De costume {sug.porCarro ? 'neste carro' : 'neste tipo'} ({sug.base} requisições):
            </span>
            {sug.fornecedor && (
              <button type="button" style={chip} onClick={() => onFornecedor(sug.fornecedor!)} title={`Usado em ${sug.vezesFornecedor} delas`}>
                <i className="fa-solid fa-store" /> {sug.fornecedor}
              </button>
            )}
            {sug.valores.map((v) => (
              <button key={v} type="button" style={chip} onClick={() => onValor(fmtBR(v))}>
                <i className="fa-solid fa-tag" /> {brl(v)}
              </button>
            ))}
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3" style={{ marginTop: 10 }}>
          <div>
            <input list="req-fornecedores-hist" value={fornecedor} onChange={(e) => onFornecedor(e.target.value)} placeholder="Fornecedor" className={campo} />
            <datalist id="req-fornecedores-hist">{nomes.map((n) => <option key={n} value={n} />)}</datalist>
          </div>
          <input value={valor} inputMode="decimal" placeholder="Valor (R$)" className={campo}
            onChange={(e) => onValor(e.target.value)}
            onBlur={(e) => { const n = Number(e.target.value.replace(/\./g, '').replace(',', '.')); if (e.target.value && Number.isFinite(n)) onValor(fmtBR(n)); }} />
        </div>
      </div>
    </div>
  );
}
