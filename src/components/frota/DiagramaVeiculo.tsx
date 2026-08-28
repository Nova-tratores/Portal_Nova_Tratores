'use client';
// Mapa ILUSTRADO do veículo: silhueta de perfil com os pontos dos sistemas da
// taxonomia (motor, câmbio, volante, bancos, molas, pneus…). Cada ponto acende
// na cor da PIOR gravidade aberta naquele sistema, e o número diz quantas são.
//
// Por que existe: a grade de azulejos responde "onde tem pendência", mas não
// "onde no carro" nem "quão perigoso". Batendo o olho no desenho dá pra ver que
// o problema é na direção (vermelho, embaixo do volante) e não na forração.
//
// O desenho é SVG desenhado à mão — nada de imagem externa: precisa herdar as
// cores do tema, escalar em qualquer largura e não pesar no carregamento.
//
// A âncora de cada ponto é o SISTEMA da taxonomia (mesma chave dos azulejos),
// então nenhum sistema fica sem lugar no carro: o que não tem posição óbvia no
// perfil (Elétrica, Outros) ganha um ponto de propósito, senão sumiria da vista.
import { GRAVIDADE_COR, GRAVIDADE_LABEL, type ContagemGravidade } from '@/lib/frota/gravidade';

interface Ponto {
  sistema: string;
  /** rótulo curto no desenho (o nome do sistema às vezes é longo demais) */
  rotulo: string;
  /** ponto no carro */
  x: number;
  y: number;
  /** onde o texto fica: a linha-guia sai do ponto até ele */
  lx: number;
  ly: number;
  /** ancoragem do texto */
  anchor: 'start' | 'middle' | 'end';
}

// O carro é desenhado em 0..760 × 150..335, mas o viewBox abre MUITO mais que
// isso (negativo à esquerda, sobra à direita e embaixo): os rótulos ficam FORA
// da silhueta e precisam de margem, senão "Porta-malas / outros" e
// "Elétrica / bateria" saem cortados nas pontas — foi o que aconteceu na
// primeira versão.
const VIEWBOX = '-160 22 1080 424';

// Carro de perfil olhando pra direita. Rótulos de baixo em DUAS alturas
// alternadas: numa só, "Freios" caía em cima da roda traseira e da linha do chão.
const PONTOS: Ponto[] = [
  // ── de cima ──
  { sistema: 'Motor', rotulo: 'Motor', x: 605, y: 250, lx: 726, ly: 150, anchor: 'start' },
  { sistema: 'Ar-condicionado', rotulo: 'Ar-cond.', x: 520, y: 210, lx: 566, ly: 92, anchor: 'middle' },
  { sistema: 'Direção', rotulo: 'Volante / direção', x: 470, y: 196, lx: 432, ly: 52, anchor: 'middle' },
  { sistema: 'Interior', rotulo: 'Bancos / interior', x: 380, y: 190, lx: 262, ly: 52, anchor: 'middle' },
  { sistema: 'Itens de segurança', rotulo: 'Cintos / segurança', x: 330, y: 205, lx: 112, ly: 92, anchor: 'middle' },
  { sistema: 'Outros', rotulo: 'Porta-malas / outros', x: 175, y: 232, lx: 34, ly: 150, anchor: 'end' },
  // ── de baixo ──
  { sistema: 'Carroceria', rotulo: 'Carroceria', x: 120, y: 268, lx: 34, ly: 262, anchor: 'end' },
  { sistema: 'Suspensão', rotulo: 'Molas / suspensão', x: 232, y: 292, lx: 168, ly: 382, anchor: 'middle' },
  { sistema: 'Freios', rotulo: 'Freios', x: 292, y: 310, lx: 330, ly: 424, anchor: 'middle' },
  { sistema: 'Transmissão', rotulo: 'Câmbio', x: 400, y: 300, lx: 438, ly: 382, anchor: 'middle' },
  { sistema: 'Rodas e Pneus', rotulo: 'Rodas e pneus', x: 545, y: 322, lx: 600, ly: 424, anchor: 'middle' },
  { sistema: 'Elétrica', rotulo: 'Elétrica / bateria', x: 640, y: 268, lx: 726, ly: 262, anchor: 'start' },
];

const CINZA = '#cbd5e1';

export default function DiagramaVeiculo({ porSistema, selecionado, onSelecionar }: {
  /** contagem por gravidade de cada sistema (só os que têm pendência aberta) */
  porSistema: Map<string, ContagemGravidade>;
  selecionado: string | null;
  onSelecionar: (sistema: string) => void;
}) {
  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg viewBox={VIEWBOX} style={{ width: '100%', minWidth: 560, height: 'auto', display: 'block' }}
        role="img" aria-label="Mapa do veículo com as pendências por sistema">
        {/* ── silhueta ── */}
        <g fill="none" stroke="var(--portal-text-muted, #94a3b8)" strokeWidth="2.5" strokeLinejoin="round">
          {/* corpo: traseira à esquerda, capô à direita */}
          <path d="M96 286 L96 250 Q98 232 122 226 L214 214 L286 166 Q296 156 314 155 L470 155 Q492 156 504 170 L556 218 L648 232 Q672 238 674 258 L674 286 Z" />
          {/* linha do vidro (cabine) */}
          <path d="M232 212 L300 168 L468 168 L520 212 Z" strokeWidth="2" />
          {/* montante central */}
          <path d="M392 168 L392 212" strokeWidth="2" />
          {/* vinco da porta */}
          <path d="M236 246 L520 246" strokeWidth="1.5" strokeDasharray="5 5" opacity="0.55" />
        </g>
        {/* rodas */}
        <g>
          <circle cx="292" cy="288" r="44" fill="none" stroke="var(--portal-text-muted, #94a3b8)" strokeWidth="2.5" />
          <circle cx="292" cy="288" r="19" fill="none" stroke="var(--portal-text-muted, #94a3b8)" strokeWidth="2" />
          <circle cx="545" cy="288" r="44" fill="none" stroke="var(--portal-text-muted, #94a3b8)" strokeWidth="2.5" />
          <circle cx="545" cy="288" r="19" fill="none" stroke="var(--portal-text-muted, #94a3b8)" strokeWidth="2" />
        </g>
        {/* chão */}
        <path d="M60 334 L700 334" stroke="var(--portal-border, #e2e8f0)" strokeWidth="2" />

        {/* ── pontos dos sistemas ── */}
        {PONTOS.map((p) => {
          const c = porSistema.get(p.sistema);
          const pior = c?.pior || null;
          const cor = pior ? GRAVIDADE_COR[pior].forte : CINZA;
          const aceso = !!pior;
          const ativo = selecionado === p.sistema;
          const titulo = aceso
            ? `${p.sistema}: ${c!.total} pendência(s) — pior: ${GRAVIDADE_LABEL[pior!]}`
            : `${p.sistema}: sem pendência aberta`;
          return (
            <g key={p.sistema} onClick={() => onSelecionar(p.sistema)} style={{ cursor: 'pointer' }}>
              <title>{titulo}</title>
              {/* linha-guia ponto → rótulo */}
              <line x1={p.x} y1={p.y} x2={p.lx} y2={p.ly} stroke={cor} strokeWidth={aceso ? 2 : 1.2} opacity={aceso ? 0.85 : 0.45} />
              {/* alvo maior e invisível: dedo no celular não acerta um ponto de 7px */}
              <circle cx={p.x} cy={p.y} r={18} fill="transparent" />
              <circle cx={p.x} cy={p.y} r={aceso ? 9 : 5.5} fill={cor}
                stroke={ativo ? '#1e40af' : '#fff'} strokeWidth={ativo ? 3 : 2}>
                {/* pisca só o que é grave ou crítico — piscar tudo não chama atenção pra nada */}
                {(pior === 'grave' || pior === 'critica') && (
                  <animate attributeName="opacity" values="1;0.35;1" dur="1.3s" repeatCount="indefinite" />
                )}
              </circle>
              {/* contador dentro do ponto quando há mais de uma */}
              {aceso && c!.total > 1 && (
                <text x={p.x} y={p.y + 3.6} textAnchor="middle" fontSize="10" fontWeight="800" fill="#fff" style={{ pointerEvents: 'none' }}>
                  {c!.total}
                </text>
              )}
              <text x={p.lx} y={p.ly} textAnchor={p.anchor} fontSize="13"
                fontWeight={aceso ? 800 : 600}
                fill={aceso ? GRAVIDADE_COR[pior!].cor : 'var(--portal-text-secondary, #64748b)'}
                style={{ pointerEvents: 'none' }}>
                {p.rotulo}
              </text>
              {aceso && (
                <text x={p.lx} y={p.ly + 15} textAnchor={p.anchor} fontSize="11" fontWeight="700"
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
