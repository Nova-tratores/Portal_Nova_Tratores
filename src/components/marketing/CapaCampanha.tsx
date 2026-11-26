'use client';
// Capa de uma campanha (18/11/2026, José: "coloca capa em ambas").
// Ordem: a foto escolhida na campanha → a capa da roleta ligada → a arte "BLACK DA NOVA"
// quando é Black Friday → capa gerada com o título, no mesmo estilo (23/11/2026).
import { TIPOS_ACAO, rotulo } from '@/lib/marketing/tipos';
import type { Acao, RoletaLigada } from '@/lib/marketing/tipos';


export default function CapaCampanha({ acao, roleta, proporcao = '16 / 7', raio = 0 }: {
  acao: Pick<Acao, 'nome' | 'tipo' | 'status'> & { id?: string; capa_url?: string | null; codigo?: string | null };
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

  // Sem foto (23/11/2026, José: "sempre fazer uma capa, com o título, tipo a da Black").
  // 24/11/2026 (José: "cada capa tem que ser diferente uma da outra"): a campanha sorteia, pelo próprio id,
  // uma paleta (8) e um desenho (4). Sorteio fixo: a mesma campanha tem sempre a mesma capa.
  // Faixa: o ano do fim do título ("Confraternização 2026" → 2026), senão o apelido, senão o tipo.
  const nome = String(acao.nome || '').trim();
  const semente = hash(String(acao.id || nome));
  const pal = PALETAS[semente % PALETAS.length];
  const desenho = Math.floor(semente / PALETAS.length) % 4;
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
  const id = `capa-${String(acao.id || nome).replace(/\W/g, '') || 'x'}`;
  const larg = (t: string, max: number) => Math.min(max, Math.max(140, t.length * 46));   // texto curto não estica
  const duas = linhas.length === 2;
  const tam = duas ? 86 : linhas[0].length > 9 ? 112 : 140;
  const corTitulo = pal.titulo.length > 1 ? `url(#${id})` : pal.titulo[0];
  const esquerda = desenho === 1;                 // desenho 1: título alinhado à esquerda
  const xT = esquerda ? 24 : 300;
  const ancora = esquerda ? 'start' : 'middle';
  const fonte = 'system-ui, sans-serif';
  // desenho 2 põe a faixa em cima, então o título desce
  const yLinha = (i: number) => (desenho === 2 && faixa)
    ? (duas ? 112 + i * 72 : 168)
    : (duas ? 78 + i * 76 : 140);

  return (
    <div style={{ ...box, background: `linear-gradient(${pal.angulo}deg, ${pal.fundo[0]}, ${pal.fundo[1]})`, display: 'grid', placeItems: 'center' }}>
      {/* enfeite do fundo: pode cortar à vontade (slice), não tem texto */}
      <svg viewBox="0 0 600 250" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} aria-hidden>
        {desenho === 0 && <>
          <circle cx="40" cy="30" r="120" fill={pal.enfeite} opacity=".14" />
          <circle cx="570" cy="230" r="150" fill={pal.enfeite} opacity=".12" />
        </>}
        {desenho === 1 && <>
          <rect x="0" y="0" width="10" height="250" fill={pal.faixa} />
          {[0, 1, 2, 3, 4].map((i) => <circle key={i} cx={470 + i * 26} cy={60 + i * 34} r={70 - i * 9} fill="none" stroke={pal.enfeite} strokeWidth="2" opacity=".25" />)}
        </>}
        {desenho === 2 && Array.from({ length: 14 }, (_, i) => (
          <rect key={i} x={-200 + i * 70} y="-40" width="26" height="340" fill={pal.enfeite} opacity=".08" transform={`rotate(25 ${-200 + i * 70} 125)`} />
        ))}
        {desenho === 3 && <>
          <text x="300" y="215" textAnchor="middle" fontWeight="900" fontSize="230" fill="none" stroke={pal.enfeite} strokeWidth="2" opacity=".18" fontFamily={fonte}>{(linhas[0] || '').slice(0, 5)}</text>
          <path d="M0 250 L600 170 L600 250 Z" fill={pal.faixa} opacity=".9" />
        </>}
      </svg>

      <svg viewBox="0 0 600 250" style={{ width: '78%', position: 'relative' }} aria-label={nome}>
        <defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          {pal.titulo.map((c, i) => <stop key={i} offset={i / Math.max(1, pal.titulo.length - 1)} stopColor={c} />)}
        </linearGradient></defs>
        {linhas.map((l, i) => (
          <text key={i} x={xT} y={yLinha(i)} textAnchor={ancora} fontWeight="800" fontSize={tam}
            textLength={larg(l, esquerda ? 552 : 576)} lengthAdjust="spacingAndGlyphs" fill={corTitulo} fontFamily={fonte}>{l}</text>
        ))}
        {faixa && (desenho === 2 ? (
          // desenho 2: a faixa vai em cima, como uma etiqueta
          <>
            <rect x={300 - larg(faixa, 300) / 2 - 18} y="6" width={larg(faixa, 300) + 36} height="44" rx="22" fill={pal.faixa} />
            <text x="300" y="38" textAnchor="middle" fontWeight="800" fontSize="30" textLength={larg(faixa, 300) * 0.8} lengthAdjust="spacingAndGlyphs" fill={pal.textoFaixa} fontFamily={fonte}>{faixa}</text>
          </>
        ) : desenho === 3 ? (
          // desenho 3: o ano no canto, em cima do triângulo
          <text x="580" y="236" textAnchor="end" fontWeight="800" fontSize="40" fill={pal.textoFaixa} fontFamily={fonte}>{faixa}</text>
        ) : (
          <>
            <rect x={esquerda ? 24 : 300 - larg(faixa, 460) / 2 - 24} y="172" width={larg(faixa, 460) + 48} height="62" rx="10" fill={pal.faixa} />
            <text x={esquerda ? 48 : 300} y="217" textAnchor={ancora} fontWeight="800" fontSize="44" textLength={larg(faixa, 460) * 0.86} lengthAdjust="spacingAndGlyphs" fill={pal.textoFaixa} fontFamily={fonte}>{faixa}</text>
          </>
        ))}
      </svg>
    </div>
  );
}

/** Paletas das capas geradas: fundo (2 cores), título (1 cor ou degradê), faixa, texto da faixa e enfeite. */
const PALETAS: { fundo: [string, string]; angulo: number; titulo: string[]; faixa: string; textoFaixa: string; enfeite: string }[] = [
  { fundo: ['#0d0d0d', '#1c1c1c'], angulo: 135, titulo: ['#9C7424', '#F6DC8A', '#E5B94E', '#8A651C'], faixa: '#E31837', textoFaixa: '#0d0d0d', enfeite: '#E5B94E' }, // ouro
  { fundo: ['#0f3d2e', '#1f6b45'], angulo: 160, titulo: ['#F5E9C8'], faixa: '#F2B705', textoFaixa: '#0f3d2e', enfeite: '#F2B705' },                                // campo
  { fundo: ['#0b1d3a', '#1d4a8a'], angulo: 140, titulo: ['#FFFFFF'], faixa: '#E31837', textoFaixa: '#FFFFFF', enfeite: '#7fb2ff' },                                // noite
  { fundo: ['#7d0a1c', '#C8102E'], angulo: 120, titulo: ['#FFFFFF'], faixa: '#111111', textoFaixa: '#FFFFFF', enfeite: '#FFFFFF' },                                // Mahindra
  { fundo: ['#6e260b', '#E0791A'], angulo: 170, titulo: ['#FFF7E6'], faixa: '#2B1405', textoFaixa: '#FFD27A', enfeite: '#FFD27A' },                                // pôr do sol
  { fundo: ['#F4EAD8', '#E6D2AE'], angulo: 150, titulo: ['#8F2D14'], faixa: '#2F4F2F', textoFaixa: '#F4EAD8', enfeite: '#8F2D14' },                                // terra
  { fundo: ['#2A0F45', '#5B1F8A'], angulo: 135, titulo: ['#FFE3F6', '#FF9BD2'], faixa: '#FF4FA3', textoFaixa: '#2A0F45', enfeite: '#FF9BD2' },                     // festa
  { fundo: ['#053B40', '#0A6B73'], angulo: 145, titulo: ['#E6FFFB'], faixa: '#FFCC4D', textoFaixa: '#053B40', enfeite: '#7FE0D6' },                                // petróleo
];

/** Número fixo a partir de um texto (o mesmo id dá sempre a mesma capa). */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
