'use client';
// Peças comuns das opções do bloco Oportunidades (página de teste, 19/10/2026).
import type { ClienteIV } from '@/lib/inteligencia-vendas/tipos';
import { QUADRANTES, quadranteDe, type Quadrante } from '../vivo/kit';

export const TX = 'var(--portal-text, #0f172a)';
export const MU = 'var(--portal-text-muted, #64748b)';
export const BD = 'var(--portal-border, #e2e8f0)';
export const CARD = 'var(--portal-bg-card, #fefefe)';
export const SUAVE = 'var(--portal-bg-secondary, #f1f5f9)';

export const tipo = (c: ClienteIV) => QUADRANTES.find((q) => q.id === quadranteDe(c))!;
export const tipoDe = (id: Quadrante) => QUADRANTES.find((q) => q.id === id)!;

/** Quanto o cliente movimenta com a gente (peças 12 m + propostas abertas + máquinas). */
export const valorCliente = (c: ClienteIV) => c.pecas12m + c.valorPropostasAbertas + c.valorMaquinas;

export const reais = (n: number) => {
  if (!n) return 'R$ 0';
  if (n >= 1e6) return `R$ ${(n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  if (n >= 1e3) return `R$ ${Math.round(n / 1e3).toLocaleString('pt-BR')} mil`;
  return `R$ ${Math.round(n).toLocaleString('pt-BR')}`;
};

const soDig = (s: string) => s.replace(/\D/g, '');
/** Telefone para link: com DDD, sem o 55. */
export function foneLimpo(t: string): string {
  let d = soDig(t);
  if (d.startsWith('55') && d.length > 11) d = d.slice(2);
  return d.length >= 10 ? d : '';
}
export function foneBonito(t: string): string {
  const d = foneLimpo(t);
  if (!d) return t || '';
  return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
}

export function Avatar({ nome, cor, tam = 44 }: { nome: string; cor: string; tam?: number }) {
  const ini = nome.split(/\s+/).filter((p) => p.length > 2).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || nome.slice(0, 2).toUpperCase();
  return (
    <span style={{ width: tam, height: tam, borderRadius: tam / 3, flexShrink: 0, display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: tam * 0.36, color: cor, background: `${cor}18`, border: `1px solid ${cor}40` }}>{ini}</span>
  );
}

export function SeloTipo({ c, grande }: { c: ClienteIV; grande?: boolean }) {
  const q = tipo(c);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: grande ? '5px 12px' : '3px 10px', borderRadius: 999, fontSize: grande ? 14 : 12.5, fontWeight: 700, color: q.cor, background: `${q.cor}14`, whiteSpace: 'nowrap' }}>
      <span style={{ width: 7, height: 7, borderRadius: 7, background: q.cor }} />{q.nome}
    </span>
  );
}

export function Temperatura({ score }: { score: number }) {
  const cor = score >= 50 ? '#dc2626' : score >= 35 ? '#ea580c' : score >= 20 ? '#ca8a04' : '#64748b';
  const rot = score >= 50 ? 'Quente' : score >= 35 ? 'Morno' : 'Frio';
  return (
    <span title={`Score ${score} de 100`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: cor, whiteSpace: 'nowrap' }}>
      <span style={{ display: 'inline-flex', gap: 2 }}>
        {[20, 35, 50].map((lim) => <span key={lim} style={{ width: 5, height: 14, borderRadius: 2, background: score >= lim ? cor : '#e2e8f0' }} />)}
      </span>
      {rot}
    </span>
  );
}

/** Ligar · WhatsApp · Ficha — as ações que importam no bloco. */
export function Acoes({ c, onFicha, compacto }: { c: ClienteIV; onFicha: () => void; compacto?: boolean }) {
  const f = foneLimpo(c.telefone);
  const b = (cor: string, cheio: boolean): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: compacto ? 34 : 40, padding: compacto ? '0 10px' : '0 14px',
    borderRadius: 10, fontSize: 14, fontWeight: 700, textDecoration: 'none', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
    border: `1px solid ${cheio ? cor : BD}`, background: cheio ? cor : CARD, color: cheio ? '#fefefe' : TX,
  });
  return (
    <span style={{ display: 'inline-flex', gap: 6 }} onClick={(e) => e.stopPropagation()}>
      {f && <a href={`tel:${f}`} style={b('#0f172a', false)} title={`Ligar ${foneBonito(c.telefone)}`}><i className="fas fa-phone" />{!compacto && 'Ligar'}</a>}
      {f && <a href={`https://wa.me/55${f}`} target="_blank" rel="noreferrer" style={b('#16a34a', true)} title="Abrir no WhatsApp"><i className="fab fa-whatsapp" />{!compacto && 'WhatsApp'}</a>}
      <button type="button" onClick={onFicha} style={b('#0f172a', false)} title="Ver tudo do cliente"><i className="fas fa-id-card" />{!compacto && 'Ficha'}</button>
    </span>
  );
}

export function EstilosOport() {
  return (
    <style>{`
      @keyframes opEntra { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }
      .op-entra { animation: opEntra .45s cubic-bezier(.2,.8,.2,1) both }
      .op-item { transition: background .15s, box-shadow .15s, transform .15s }
      .op-item:hover { box-shadow: 0 6px 20px rgba(15,23,42,.08); transform: translateY(-1px) }
      @keyframes opTroca { from { opacity: 0; transform: translateX(40px) scale(.98) } to { opacity: 1; transform: none } }
      .op-troca { animation: opTroca .45s cubic-bezier(.2,.9,.2,1) both }
      @keyframes opSai { to { opacity: 0; transform: translateX(-60px) rotate(-2deg) } }
      @keyframes opBolha { from { r: 0 } }
      @media (prefers-reduced-motion: reduce) { .op-entra, .op-troca { animation: none !important } }
    `}</style>
  );
}
