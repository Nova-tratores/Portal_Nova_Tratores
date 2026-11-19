'use client';
// Capa de uma campanha (18/11/2026, José: "coloca capa em ambas").
// Ordem: a foto escolhida na campanha → a capa da roleta ligada → a arte "BLACK DA NOVA"
// quando é Black Friday → um quadro na cor do tipo com o ícone dele.
import { cor as corDe, STATUS_ACAO } from '@/lib/marketing/tipos';
import type { Acao, RoletaLigada } from '@/lib/marketing/tipos';
import { IconeTipoAcao } from './ui';

export default function CapaCampanha({ acao, roleta, proporcao = '16 / 7', raio = 0 }: {
  acao: Pick<Acao, 'nome' | 'tipo' | 'status'> & { capa_url?: string | null };
  roleta?: RoletaLigada | null;
  proporcao?: string;
  raio?: number;
}) {
  const foto = acao.capa_url || roleta?.capa || null;
  const box: React.CSSProperties = {
    aspectRatio: proporcao, width: '100%', overflow: 'hidden', position: 'relative',
    borderRadius: raio, background: '#0d0d0d',
  };

  if (foto) {
    return (
      <div style={box}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={foto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      </div>
    );
  }

  if (/black/i.test(`${roleta?.slug ?? ''} ${acao.nome}`)) {
    const id = `ouro-${acao.nome.replace(/\W/g, '')}`;
    return (
      <div style={{ ...box, display: 'grid', placeItems: 'center' }}>
        <svg viewBox="0 0 600 250" style={{ width: '70%' }} aria-label="Black da Nova">
          <defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#9C7424" /><stop offset=".4" stopColor="#F6DC8A" /><stop offset=".6" stopColor="#E5B94E" /><stop offset="1" stopColor="#8A651C" /></linearGradient></defs>
          <text x="300" y="140" textAnchor="middle" fontWeight="800" fontSize="150" textLength="576" lengthAdjust="spacingAndGlyphs" fill={`url(#${id})`} fontFamily="system-ui, sans-serif">BLACK</text>
          <rect x="70" y="160" width="460" height="74" rx="10" fill="#E31837" stroke={`url(#${id})`} strokeWidth="3" />
          <text x="300" y="214" textAnchor="middle" fontWeight="800" fontSize="54" textLength="380" lengthAdjust="spacingAndGlyphs" fill="#0d0d0d" fontFamily="system-ui, sans-serif">DA NOVA</text>
        </svg>
      </div>
    );
  }

  const c = corDe(STATUS_ACAO, acao.status);
  return (
    <div style={{ ...box, background: `color-mix(in srgb, ${c} 14%, var(--portal-bg-card, #fff))`, display: 'grid', placeItems: 'center' }}>
      <IconeTipoAcao tipo={acao.tipo} cor={c} tamanho={56} />
    </div>
  );
}
