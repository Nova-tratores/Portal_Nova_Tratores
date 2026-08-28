'use client';
// Mapa ILUSTRADO do veículo: carro de perfil com um ÍCONE por sistema da
// taxonomia (motor, câmbio, volante, banco, mola, pneu, disco de freio…). Cada
// ícone acende na cor da PIOR gravidade aberta naquele sistema e mostra quantas
// são; clicar leva ao Histórico de pendências filtrado.
//
// Por que existe: a grade de azulejos responde "onde tem pendência", mas não
// "onde no carro" nem "quão perigoso". No desenho dá pra ver de relance que o
// problema é na direção (vermelho, no volante) e não na forração.
//
// SVG desenhado à mão, nada de imagem externa: herda as cores do tema, escala
// em qualquer largura e não pesa no carregamento.
//
// A âncora de cada ícone é o SISTEMA (mesma chave dos azulejos), então nenhum
// sistema fica sem lugar: o que não tem posição óbvia no perfil (Elétrica,
// Outros) ganha um ponto de propósito, senão sumiria da vista.
import { GRAVIDADE_COR, GRAVIDADE_LABEL, type ContagemGravidade } from '@/lib/frota/gravidade';

interface Ponto {
  sistema: string;
  rotulo: string;
  /** onde o ícone fica (centro) */
  x: number;
  y: number;
  /** rótulo: a linha-guia sai do ícone até aqui */
  lx: number;
  ly: number;
  anchor: 'start' | 'middle' | 'end';
}

// O carro ocupa ~0..760 × 150..335; o viewBox abre MUITO mais que isso porque
// os rótulos ficam FORA da silhueta — sem essa margem, "Porta-malas / outros" e
// "Elétrica / bateria" saem cortados nas pontas.
const VIEWBOX = '-170 18 1100 432';

// Rótulos de baixo em DUAS alturas alternadas: numa só, "Freios" caía em cima
// da roda traseira e da linha do chão.
const PONTOS: Ponto[] = [
  { sistema: 'Motor', rotulo: 'Motor', x: 612, y: 250, lx: 742, ly: 150, anchor: 'start' },
  { sistema: 'Ar-condicionado', rotulo: 'Ar-condicionado', x: 512, y: 206, lx: 566, ly: 88, anchor: 'middle' },
  { sistema: 'Direção', rotulo: 'Volante / direção', x: 458, y: 198, lx: 430, ly: 48, anchor: 'middle' },
  { sistema: 'Interior', rotulo: 'Bancos / interior', x: 372, y: 192, lx: 258, ly: 48, anchor: 'middle' },
  { sistema: 'Itens de segurança', rotulo: 'Cintos / segurança', x: 322, y: 208, lx: 104, ly: 88, anchor: 'middle' },
  { sistema: 'Outros', rotulo: 'Porta-malas / outros', x: 168, y: 236, lx: 26, ly: 150, anchor: 'end' },
  { sistema: 'Carroceria', rotulo: 'Carroceria', x: 118, y: 272, lx: 26, ly: 266, anchor: 'end' },
  { sistema: 'Suspensão', rotulo: 'Molas / suspensão', x: 232, y: 296, lx: 160, ly: 392, anchor: 'middle' },
  { sistema: 'Freios', rotulo: 'Freios', x: 292, y: 288, lx: 330, ly: 434, anchor: 'middle' },
  { sistema: 'Transmissão', rotulo: 'Câmbio', x: 402, y: 300, lx: 442, ly: 392, anchor: 'middle' },
  { sistema: 'Rodas e Pneus', rotulo: 'Rodas e pneus', x: 545, y: 288, lx: 606, ly: 434, anchor: 'middle' },
  { sistema: 'Elétrica', rotulo: 'Elétrica / bateria', x: 646, y: 268, lx: 742, ly: 266, anchor: 'start' },
];

const CINZA = '#94a3b8';
const R = 17; // raio do disco do ícone

/**
 * Glifo de cada sistema, desenhado num quadrado de -10..10 com o centro em 0,0
 * (o <g> pai já translada pro ponto). Traço, não preenchimento: fica legível em
 * qualquer cor e não vira mancha quando o ícone acende.
 */
function Glifo({ sistema }: { sistema: string }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (sistema) {
    case 'Motor': // bloco do motor: corpo + cabeçote + polia
      return (
        <g {...p}>
          <rect x="-8" y="-2" width="14" height="9" rx="1.4" />
          <rect x="-3.5" y="-7" width="7" height="5" rx="1" />
          <path d="M6 1.5h3.2v3H6" />
          <circle cx="-5" cy="7" r="2.2" />
        </g>
      );
    // engrenagem com DENTES curtos e grossos: com traços longos e finos ela
    // virava um sol e ficava igual ao floco do ar-condicionado
    case 'Transmissão':
      return (
        <g {...p}>
          <circle cx="0" cy="0" r="5.4" />
          <circle cx="0" cy="0" r="2" />
          <g strokeWidth="2.8">
            <path d="M0-6v-2.8M0 6v2.8M-6 0h-2.8M6 0h2.8M-4.2-4.2l-2 -2M4.2 4.2l2 2M4.2-4.2l2-2M-4.2 4.2l-2 2" />
          </g>
        </g>
      );
    case 'Direção': // volante
      return <g {...p}><circle cx="0" cy="0" r="8" /><circle cx="0" cy="0" r="2.4" /><path d="M-8 0h5.6M8 0H2.4M0 2.4V8" /></g>;
    case 'Freios': // disco + pinça
      return <g {...p}><circle cx="-1" cy="0" r="7.5" /><circle cx="-1" cy="0" r="2.6" /><path d="M5.6-4.2h3.2a1.6 1.6 0 011.6 1.6v5.2a1.6 1.6 0 01-1.6 1.6H5.6z" /></g>;
    case 'Suspensão': // mola helicoidal
      return <g {...p}><path d="M-6-8h12M-6 8h12" /><path d="M-5-8l10 3.2-10 3.2 10 3.2-10 3.2 10 3.2" /></g>;
    case 'Rodas e Pneus': // pneu com banda de rodagem
      return <g {...p}><circle cx="0" cy="0" r="8.5" /><circle cx="0" cy="0" r="3.6" /><path d="M0-8.5v-1.6M0 8.5v1.6M-8.5 0h-1.6M8.5 0h1.6" /></g>;
    case 'Elétrica': // bateria com raio
      return <g {...p}><rect x="-9" y="-5" width="18" height="10" rx="1.6" /><path d="M-5.5-5v-2.2M4.5-5v-2.2" /><path d="M1.4-2.6L-1.4 0h2.6l-2.6 2.6" /></g>;
    case 'Ar-condicionado': // floco de neve
      return <g {...p}><path d="M0-9V9M-7.8-4.5L7.8 4.5M-7.8 4.5L7.8-4.5" /><path d="M-2.4-6.4L0-9l2.4 2.6M-2.4 6.4L0 9l2.4-2.6" /></g>;
    case 'Interior': // banco
      return <g {...p}><path d="M-5-8.5a2 2 0 012 2V0h5a2 2 0 012 2v3.5" /><path d="M-6.5 0h9.5" /><path d="M-6.5 0v6.5h11" /></g>;
    case 'Itens de segurança': // escudo com o cinto atravessado (lê melhor que
      // só a faixa: no tamanho do ícone a faixa sozinha virava um risco solto)
      return (
        <g {...p}>
          <path d="M0-9l7.5 3v6c0 4.2-3.2 7.6-7.5 9-4.3-1.4-7.5-4.8-7.5-9v-6z" />
          <path d="M-4.4-2.6L3.4 5.2" strokeWidth="2.4" />
        </g>
      );
    case 'Carroceria': // silhueta do carro
      return <g {...p}><path d="M-9 3v-2l2-.6 2-2.6h6l2 2.6 2 .6v2z" /><circle cx="-4.5" cy="3.4" r="1.8" /><circle cx="4.5" cy="3.4" r="1.8" /></g>;
    default: // Outros — caixa/porta-malas
      return <g {...p}><rect x="-8.5" y="-4" width="17" height="10" rx="1.4" /><path d="M-8.5 0h17M-3-4v-2.5a1.5 1.5 0 011.5-1.5h3A1.5 1.5 0 013-6.5V-4" /></g>;
  }
}

export default function DiagramaVeiculo({ porSistema, selecionado, onSelecionar }: {
  porSistema: Map<string, ContagemGravidade>;
  selecionado: string | null;
  onSelecionar: (sistema: string) => void;
}) {
  const traco = 'var(--portal-text-muted, #94a3b8)';
  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg viewBox={VIEWBOX} style={{ width: '100%', minWidth: 580, height: 'auto', display: 'block' }}
        role="img" aria-label="Mapa do veículo com as pendências por sistema">
        {/* ── carroceria ── */}
        <g fill="none" stroke={traco} strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round">
          <path d="M92 288 L92 252 Q94 232 120 226 L214 214 L286 166 Q296 155 316 154 L470 154 Q494 155 507 170 L558 218 L650 232 Q676 238 678 260 L678 288 Z" />
          {/* vidros: traseiro, dianteiro e montante central */}
          <path d="M234 212 L298 170 L384 170 L384 212 Z" strokeWidth="2" />
          <path d="M400 170 L466 170 Q482 171 490 180 L516 212 L400 212 Z" strokeWidth="2" />
          {/* portas */}
          <path d="M300 212 L300 286" strokeWidth="1.6" opacity="0.7" />
          <path d="M392 214 L392 286" strokeWidth="1.6" opacity="0.7" />
          <path d="M498 218 L498 286" strokeWidth="1.6" opacity="0.7" />
          {/* maçanetas */}
          <path d="M330 238 h22" strokeWidth="2.4" />
          <path d="M428 238 h22" strokeWidth="2.4" />
          {/* retrovisor */}
          <path d="M392 206 l-16 -5 v8 z" strokeWidth="1.8" />
          {/* faróis e lanterna */}
          <path d="M646 250 q16 0 22 8 l-22 2 z" strokeWidth="1.8" />
          <path d="M96 250 h20 v12 H96 z" strokeWidth="1.8" />
          {/* para-choques */}
          <path d="M678 272 h14" strokeWidth="3" />
          <path d="M92 272 H78" strokeWidth="3" />
          {/* caixas de roda */}
          <path d="M248 288 a44 44 0 0 1 88 0" strokeWidth="2" opacity="0.65" />
          <path d="M501 288 a44 44 0 0 1 88 0" strokeWidth="2" opacity="0.65" />
          {/* vinco lateral */}
          <path d="M236 258 H520" strokeWidth="1.4" strokeDasharray="6 6" opacity="0.5" />
        </g>
        {/* rodas: pneu, aro e raios */}
        <g fill="none" stroke={traco}>
          {[292, 545].map((cx) => (
            <g key={cx}>
              <circle cx={cx} cy="288" r="44" strokeWidth="2.6" />
              <circle cx={cx} cy="288" r="32" strokeWidth="1.6" opacity="0.6" />
              <circle cx={cx} cy="288" r="13" strokeWidth="2" />
              {[0, 60, 120, 180, 240, 300].map((a) => {
                const r0 = 13, r1 = 30, rad = (a * Math.PI) / 180;
                return <line key={a} x1={cx + r0 * Math.cos(rad)} y1={288 + r0 * Math.sin(rad)}
                  x2={cx + r1 * Math.cos(rad)} y2={288 + r1 * Math.sin(rad)} strokeWidth="1.5" opacity="0.55" />;
              })}
            </g>
          ))}
        </g>
        <path d="M50 336 L716 336" stroke="var(--portal-border, #e2e8f0)" strokeWidth="2" />

        {/* ── ícones dos sistemas ── */}
        {PONTOS.map((p) => {
          const c = porSistema.get(p.sistema);
          const pior = c?.pior || null;
          const cor = pior ? GRAVIDADE_COR[pior].forte : CINZA;
          const aceso = !!pior;
          const ativo = selecionado === p.sistema;
          const titulo = aceso
            ? `${p.sistema}: ${c!.total} pendência(s) — pior: ${GRAVIDADE_LABEL[pior!]}. Clique para ver no histórico.`
            : `${p.sistema}: sem pendência aberta`;
          return (
            <g key={p.sistema} onClick={() => onSelecionar(p.sistema)} style={{ cursor: 'pointer' }}>
              <title>{titulo}</title>
              <line x1={p.x} y1={p.y} x2={p.lx} y2={p.ly} stroke={cor} strokeWidth={aceso ? 2 : 1.2} opacity={aceso ? 0.9 : 0.4} />
              {/* disco de fundo: separa o ícone do desenho do carro atrás dele */}
              <circle cx={p.x} cy={p.y} r={R} fill={aceso ? GRAVIDADE_COR[pior!].bg : 'var(--portal-bg-card, #fff)'}
                stroke={ativo ? '#1e40af' : cor} strokeWidth={ativo ? 3 : aceso ? 2.4 : 1.6}>
                {/* pisca só grave/crítica: piscar tudo não chama atenção pra nada */}
                {(pior === 'grave' || pior === 'critica') && (
                  <animate attributeName="opacity" values="1;0.45;1" dur="1.4s" repeatCount="indefinite" />
                )}
              </circle>
              <g transform={`translate(${p.x} ${p.y})`} color={aceso ? GRAVIDADE_COR[pior!].cor : CINZA} style={{ pointerEvents: 'none' }}>
                <Glifo sistema={p.sistema} />
              </g>
              {/* contagem num balão no canto do ícone */}
              {aceso && (
                <g style={{ pointerEvents: 'none' }}>
                  <circle cx={p.x + 13} cy={p.y - 13} r="9" fill={cor} stroke="var(--portal-bg-card, #fff)" strokeWidth="2" />
                  <text x={p.x + 13} y={p.y - 9.6} textAnchor="middle" fontSize="11" fontWeight="800" fill="#fff">{c!.total}</text>
                </g>
              )}
              <text x={p.lx} y={p.ly} textAnchor={p.anchor} fontSize="13.5" fontWeight={aceso ? 800 : 600}
                fill={aceso ? GRAVIDADE_COR[pior!].cor : 'var(--portal-text-secondary, #64748b)'} style={{ pointerEvents: 'none' }}>
                {p.rotulo}
              </text>
              {aceso && (
                <text x={p.lx} y={p.ly + 15} textAnchor={p.anchor} fontSize="11.5" fontWeight="700"
                  fill={GRAVIDADE_COR[pior!].cor} opacity="0.85" style={{ pointerEvents: 'none' }}>
                  {c!.total} · {GRAVIDADE_LABEL[pior!].toLowerCase()}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
