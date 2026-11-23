'use client';
// Capa de uma campanha (18/11/2026, José: "coloca capa em ambas").
// Ordem: a foto escolhida na campanha → a capa da roleta ligada → a arte "BLACK DA NOVA"
// quando é Black Friday → capa gerada com o título, no mesmo estilo (23/11/2026).
import { TIPOS_ACAO, rotulo } from '@/lib/marketing/tipos';
import type { Acao, RoletaLigada } from '@/lib/marketing/tipos';


export default function CapaCampanha({ acao, roleta, proporcao = '16 / 7', raio = 0 }: {
  acao: Pick<Acao, 'nome' | 'tipo' | 'status'> & { capa_url?: string | null; codigo?: string | null };
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

  // Sem foto (23/11/2026, José: "sempre fazer uma capa, com o título, tipo a da Black"):
  // mesma linguagem da BLACK DA NOVA — título dourado em cima, faixa vermelha embaixo.
  // Faixa: o ano do fim do título ("Confraternização 2026" → 2026), senão o apelido, senão o tipo.
  const nome = String(acao.nome || '').trim();
  const ano = /\s(20\d{2})$/.exec(nome)?.[1] ?? null;
  const titulo = (ano ? nome.slice(0, -ano.length) : nome).trim().toUpperCase() || 'CAMPANHA';
  const faixa = (ano || acao.codigo || rotulo(TIPOS_ACAO, acao.tipo) || '').toString().toUpperCase();
  // título longo quebra em duas linhas (na palavra mais perto do meio)
  const linhas = (() => {
    if (titulo.length <= 12 || !titulo.includes(' ')) return [titulo];
    const palavras = titulo.split(/\s+/);
    let melhor = 1, dif = Infinity;
    for (let i = 1; i < palavras.length; i++) {
      const d = Math.abs(palavras.slice(0, i).join(' ').length - palavras.slice(i).join(' ').length);
      if (d < dif) { dif = d; melhor = i; }
    }
    return [palavras.slice(0, melhor).join(' '), palavras.slice(melhor).join(' ')];
  })();
  const id = `ouro-${nome.replace(/\W/g, '') || 'capa'}`;
  const larg = (t: string, max: number) => Math.min(max, Math.max(140, t.length * 46));   // texto curto não estica
  const duas = linhas.length === 2;
  const tam = duas ? 86 : linhas[0].length > 9 ? 112 : 140;
  return (
    <div style={{ ...box, display: 'grid', placeItems: 'center' }}>
      <svg viewBox="0 0 600 250" style={{ width: '78%' }} aria-label={nome}>
        <defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#9C7424" /><stop offset=".4" stopColor="#F6DC8A" /><stop offset=".6" stopColor="#E5B94E" /><stop offset="1" stopColor="#8A651C" /></linearGradient></defs>
        {linhas.map((l, i) => (
          <text key={i} x="300" y={duas ? 78 + i * 76 : 140} textAnchor="middle" fontWeight="800" fontSize={tam}
            textLength={larg(l, 576)} lengthAdjust="spacingAndGlyphs" fill={`url(#${id})`} fontFamily="system-ui, sans-serif">{l}</text>
        ))}
        {faixa && <>
          <rect x={300 - larg(faixa, 460) / 2 - 24} y="172" width={larg(faixa, 460) + 48} height="62" rx="10" fill="#E31837" stroke={`url(#${id})`} strokeWidth="3" />
          <text x="300" y="217" textAnchor="middle" fontWeight="800" fontSize="44" textLength={larg(faixa, 460) * 0.86} lengthAdjust="spacingAndGlyphs" fill="#0d0d0d" fontFamily="system-ui, sans-serif">{faixa}</text>
        </>}
      </svg>
    </div>
  );
}
