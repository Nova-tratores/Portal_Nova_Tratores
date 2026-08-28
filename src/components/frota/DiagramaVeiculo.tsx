'use client';
// Mapa ILUSTRADO do veículo: desenho de perfil com um ÍCONE por sistema da
// taxonomia. O ícone acende na cor da PIOR gravidade aberta naquele sistema,
// traz a contagem e, clicado, abre o Histórico de pendências filtrado.
//
// O DESENHO MUDA COM O TIPO do veículo (lib/frota/silhueta): carro, picape,
// caminhão, moto e carreta. A frota tem os cinco — pôr um sedã na BMW R 1250 GS
// seria informação errada, não só feia. Cada silhueta tem os SEUS pontos: o
// volante da moto não fica onde fica o de um carro.
//
// Todos olham para a ESQUERDA (mesma orientação da referência que o usuário
// mandou). Se algum dia um desenho for espelhado, os pontos dele têm que ser
// refeitos junto — as coordenadas são presas ao traço.
//
// SVG à mão, nada de imagem externa: herda o tema, escala em qualquer largura,
// não depende de rede e mantém os pontos no lugar certo.
import { GRAVIDADE_COR, GRAVIDADE_LABEL, type ContagemGravidade } from '@/lib/frota/gravidade';
import { SISTEMAS_FORA, type TipoSilhueta } from '@/lib/frota/silhueta';

interface Ponto {
  sistema: string;
  rotulo: string;
  x: number; y: number;      // centro do ícone, sobre o desenho
  lx: number; ly: number;    // rótulo (a linha-guia sai do ícone até aqui)
  anchor: 'start' | 'middle' | 'end';
}

const R = 17; // raio do disco do ícone
const CINZA = '#94a3b8';

// ── glifos ─────────────────────────────────────────────────────────────────
// Desenhados num quadrado -10..10 com centro em 0,0 (o <g> pai translada).
// Traço, não preenchimento: legível em qualquer cor e não vira mancha.
function Glifo({ sistema }: { sistema: string }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (sistema) {
    case 'Motor':
      return <g {...p}><rect x="-8" y="-2" width="14" height="9" rx="1.4" /><rect x="-3.5" y="-7" width="7" height="5" rx="1" /><path d="M6 1.5h3.2v3H6" /><circle cx="-5" cy="7" r="2.2" /></g>;
    case 'Transmissão': // dentes curtos e grossos: finos viravam um sol igual ao floco do ar
      return <g {...p}><circle cx="0" cy="0" r="5.4" /><circle cx="0" cy="0" r="2" /><g strokeWidth="2.8"><path d="M0-6v-2.8M0 6v2.8M-6 0h-2.8M6 0h2.8M-4.2-4.2l-2 -2M4.2 4.2l2 2M4.2-4.2l2-2M-4.2 4.2l-2 2" /></g></g>;
    case 'Direção':
      return <g {...p}><circle cx="0" cy="0" r="8" /><circle cx="0" cy="0" r="2.4" /><path d="M-8 0h5.6M8 0H2.4M0 2.4V8" /></g>;
    case 'Freios':
      return <g {...p}><circle cx="-1" cy="0" r="7.5" /><circle cx="-1" cy="0" r="2.6" /><path d="M5.6-4.2h3.2a1.6 1.6 0 011.6 1.6v5.2a1.6 1.6 0 01-1.6 1.6H5.6z" /></g>;
    case 'Suspensão':
      return <g {...p}><path d="M-6-8h12M-6 8h12" /><path d="M-5-8l10 3.2-10 3.2 10 3.2-10 3.2 10 3.2" /></g>;
    case 'Rodas e Pneus':
      return <g {...p}><circle cx="0" cy="0" r="8.5" /><circle cx="0" cy="0" r="3.6" /><path d="M0-8.5v-1.6M0 8.5v1.6M-8.5 0h-1.6M8.5 0h1.6" /></g>;
    case 'Elétrica':
      return <g {...p}><rect x="-9" y="-5" width="18" height="10" rx="1.6" /><path d="M-5.5-5v-2.2M4.5-5v-2.2" /><path d="M1.4-2.6L-1.4 0h2.6l-2.6 2.6" /></g>;
    case 'Ar-condicionado':
      return <g {...p}><path d="M0-9V9M-7.8-4.5L7.8 4.5M-7.8 4.5L7.8-4.5" /><path d="M-2.4-6.4L0-9l2.4 2.6M-2.4 6.4L0 9l2.4-2.6" /></g>;
    case 'Interior':
      return <g {...p}><path d="M-5-8.5a2 2 0 012 2V0h5a2 2 0 012 2v3.5" /><path d="M-6.5 0h9.5" /><path d="M-6.5 0v6.5h11" /></g>;
    case 'Itens de segurança': // escudo com o cinto: a faixa sozinha virava um risco solto
      return <g {...p}><path d="M0-9l7.5 3v6c0 4.2-3.2 7.6-7.5 9-4.3-1.4-7.5-4.8-7.5-9v-6z" /><path d="M-4.4-2.6L3.4 5.2" strokeWidth="2.4" /></g>;
    case 'Carroceria':
      return <g {...p}><path d="M-9 3v-2l2-.6 2-2.6h6l2 2.6 2 .6v2z" /><circle cx="-4.5" cy="3.4" r="1.8" /><circle cx="4.5" cy="3.4" r="1.8" /></g>;
    default: // Outros — caixa / porta-malas
      return <g {...p}><rect x="-8.5" y="-4" width="17" height="10" rx="1.4" /><path d="M-8.5 0h17M-3-4v-2.5a1.5 1.5 0 011.5-1.5h3A1.5 1.5 0 013-6.5V-4" /></g>;
  }
}

// ── silhuetas ──────────────────────────────────────────────────────────────
// Estilo SILHUETA CHEIA (referência que o usuário mandou): corpo preenchido com
// vidros VAZADOS de verdade — buraco no path (fill-rule evenodd), não retângulo
// branco por cima. A diferença aparece no modo escuro: um retângulo branco
// ficaria branco; o buraco deixa o fundo do card passar.
//
// Cada roda é uma rosca (pneu cheio + miolo vazado) desenhada em cima da caixa
// de roda, que é um entalhe do MESMO raio no corpo — por isso a roda encaixa
// exata e não sobra degrau. Mexer no raio de uma exige mexer no da outra.
function Roda({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  const rin = r * 0.42;
  const anel = (raio: number) =>
    `M${cx - raio} ${cy}a${raio} ${raio} 0 1 0 ${2 * raio} 0a${raio} ${raio} 0 1 0 ${-2 * raio} 0Z`;
  return (
    <g fill="currentColor">
      <path fillRule="evenodd" d={`${anel(r)}${anel(rin)}`} />
      <circle cx={cx} cy={cy} r={r * 0.16} />
    </g>
  );
}

interface Silhueta { viewBox: string; chao: string; corpo: React.ReactNode; rodas: { cx: number; cy: number; r: number }[]; pontos: Ponto[] }

const CARRO: Silhueta = {
  // Proporção refeita em 28/08: a 1ª versão tinha 4,8:1 de comprimento por
  // altura (sedã real fica perto de 3,4:1) e balanço traseiro maior que o
  // dianteiro — saía com cara de limusine rabuda.
  viewBox: '-160 14 1160 400', chao: 'M100 305 H660',
  rodas: [{ cx: 212, cy: 272, r: 33 }, { cx: 548, cy: 272, r: 33 }],
  corpo: (
    <path fill="currentColor" fillRule="evenodd" d="
      M126 272 C120 266 118 256 119 246 C120 234 126 228 138 226
      L240 216 L252 212 L316 146 C322 141 329 139 338 139
      L462 139 C472 139 479 142 485 149 L536 196 L616 202
      C630 204 638 210 638 222 L638 262 C638 268 634 272 628 272
      L581 272 A33 33 0 0 0 515 272 L245 272 A33 33 0 0 0 179 272 L126 272 Z
      M284 194 L322 154 L360 153 L360 194 Z
      M372 153 L436 152 L436 193 L372 193 Z
      M448 152 L462 152 C468 152 472 154 476 159 L502 192 L448 192 Z
    " />
  ),
  pontos: [
    { sistema: 'Motor', rotulo: 'Motor', x: 174, y: 234, lx: -20, ly: 110, anchor: 'end' },
    { sistema: 'Elétrica', rotulo: 'Elétrica / bateria', x: 140, y: 258, lx: -20, ly: 250, anchor: 'end' },
    { sistema: 'Ar-condicionado', rotulo: 'Ar-condicionado', x: 282, y: 206, lx: 172, ly: 58, anchor: 'middle' },
    { sistema: 'Direção', rotulo: 'Volante / direção', x: 332, y: 184, lx: 342, ly: 42, anchor: 'middle' },
    { sistema: 'Interior', rotulo: 'Bancos / interior', x: 408, y: 176, lx: 512, ly: 42, anchor: 'middle' },
    { sistema: 'Itens de segurança', rotulo: 'Cintos / segurança', x: 466, y: 190, lx: 680, ly: 58, anchor: 'middle' },
    { sistema: 'Outros', rotulo: 'Porta-malas / outros', x: 596, y: 224, lx: 800, ly: 150, anchor: 'start' },
    { sistema: 'Carroceria', rotulo: 'Carroceria', x: 626, y: 256, lx: 800, ly: 258, anchor: 'start' },
    { sistema: 'Freios', rotulo: 'Freios', x: 212, y: 272, lx: 164, ly: 380, anchor: 'middle' },
    { sistema: 'Transmissão', rotulo: 'Câmbio', x: 358, y: 278, lx: 352, ly: 380, anchor: 'middle' },
    { sistema: 'Suspensão', rotulo: 'Molas / suspensão', x: 470, y: 280, lx: 522, ly: 380, anchor: 'middle' },
    { sistema: 'Rodas e Pneus', rotulo: 'Rodas e pneus', x: 548, y: 272, lx: 690, ly: 380, anchor: 'middle' },
  ],
};

const PICAPE: Silhueta = {
  viewBox: '-160 14 1160 400', chao: 'M100 305 H660',
  rodas: [{ cx: 212, cy: 272, r: 33 }, { cx: 548, cy: 272, r: 33 }],
  corpo: (
    <path fill="currentColor" fillRule="evenodd" d="
      M126 272 C120 266 118 254 119 244 C120 232 126 226 138 224
      L236 214 L248 210 L306 144 C312 139 319 137 328 137
      L424 137 C434 137 441 141 446 149 L474 196 L474 204
      L638 204 L638 262 C638 268 634 272 628 272
      L581 272 A33 33 0 0 0 515 272 L245 272 A33 33 0 0 0 179 272 L126 272 Z
      M278 192 L312 152 L350 151 L350 192 Z
      M362 151 L422 150 C428 150 432 153 435 158 L452 190 L362 190 Z
      M488 216 L610 216 L610 258 L488 258 Z
    " />
  ),
  pontos: [
    { sistema: 'Motor', rotulo: 'Motor', x: 174, y: 232, lx: -20, ly: 110, anchor: 'end' },
    { sistema: 'Elétrica', rotulo: 'Elétrica / bateria', x: 140, y: 256, lx: -20, ly: 250, anchor: 'end' },
    { sistema: 'Ar-condicionado', rotulo: 'Ar-condicionado', x: 276, y: 204, lx: 172, ly: 58, anchor: 'middle' },
    { sistema: 'Direção', rotulo: 'Volante / direção', x: 324, y: 182, lx: 336, ly: 42, anchor: 'middle' },
    { sistema: 'Interior', rotulo: 'Bancos / interior', x: 398, y: 174, lx: 508, ly: 42, anchor: 'middle' },
    { sistema: 'Itens de segurança', rotulo: 'Cintos / segurança', x: 444, y: 192, lx: 676, ly: 58, anchor: 'middle' },
    { sistema: 'Outros', rotulo: 'Caçamba / outros', x: 590, y: 224, lx: 800, ly: 150, anchor: 'start' },
    { sistema: 'Carroceria', rotulo: 'Carroceria', x: 626, y: 254, lx: 800, ly: 258, anchor: 'start' },
    { sistema: 'Freios', rotulo: 'Freios', x: 212, y: 272, lx: 164, ly: 380, anchor: 'middle' },
    { sistema: 'Transmissão', rotulo: 'Câmbio', x: 352, y: 278, lx: 352, ly: 380, anchor: 'middle' },
    { sistema: 'Suspensão', rotulo: 'Molas / suspensão', x: 470, y: 280, lx: 522, ly: 380, anchor: 'middle' },
    { sistema: 'Rodas e Pneus', rotulo: 'Rodas e pneus', x: 548, y: 272, lx: 690, ly: 380, anchor: 'middle' },
  ],
};

const CAMINHAO: Silhueta = {
  viewBox: '-165 18 1215 432', chao: 'M60 318 H730',
  rodas: [{ cx: 178, cy: 262, r: 36 }, { cx: 516, cy: 262, r: 36 }, { cx: 600, cy: 262, r: 36 }],
  corpo: (
    <path fill="currentColor" fillRule="evenodd" d="
      M112 262 C112 250 110 158 116 150 C119 146 124 144 131 144
      L246 144 C253 144 258 148 260 156 L272 212 L272 126 L640 126 L640 262
      L636 262 A36 36 0 0 0 564 262 L552 262 A36 36 0 0 0 480 262
      L214 262 A36 36 0 0 0 142 262 L112 262 Z
      M130 158 L242 158 L250 202 L130 202 Z
      M296 148 L618 148 L618 168 L296 168 Z
    " />
  ),
  pontos: [
    { sistema: 'Motor', rotulo: 'Motor', x: 196, y: 232, lx: -30, ly: 120, anchor: 'end' },
    { sistema: 'Elétrica', rotulo: 'Elétrica / bateria', x: 150, y: 244, lx: -30, ly: 250, anchor: 'end' },
    { sistema: 'Ar-condicionado', rotulo: 'Ar-condicionado', x: 108, y: 172, lx: 96, ly: 62, anchor: 'middle' },
    { sistema: 'Direção', rotulo: 'Volante / direção', x: 168, y: 208, lx: 250, ly: 62, anchor: 'middle' },
    { sistema: 'Interior', rotulo: 'Cabine / interior', x: 208, y: 172, lx: 400, ly: 62, anchor: 'middle' },
    { sistema: 'Itens de segurança', rotulo: 'Cintos / segurança', x: 232, y: 180, lx: 560, ly: 62, anchor: 'middle' },
    { sistema: 'Outros', rotulo: 'Baú / carga', x: 494, y: 176, lx: 862, ly: 140, anchor: 'start' },
    { sistema: 'Carroceria', rotulo: 'Carroceria', x: 618, y: 232, lx: 862, ly: 250, anchor: 'start' },
    { sistema: 'Freios', rotulo: 'Freios', x: 178, y: 262, lx: 130, ly: 404, anchor: 'middle' },
    { sistema: 'Transmissão', rotulo: 'Câmbio', x: 320, y: 248, lx: 330, ly: 404, anchor: 'middle' },
    { sistema: 'Suspensão', rotulo: 'Molas / suspensão', x: 430, y: 248, lx: 500, ly: 404, anchor: 'middle' },
    { sistema: 'Rodas e Pneus', rotulo: 'Rodas e pneus', x: 558, y: 262, lx: 700, ly: 404, anchor: 'middle' },
  ],
};

const MOTO: Silhueta = {
  viewBox: '-165 18 1215 432', chao: 'M120 318 H660',
  rodas: [{ cx: 230, cy: 262, r: 54 }, { cx: 560, cy: 262, r: 54 }],
  corpo: (
    <g fill="currentColor">
      <path d="M224 262 L268 158 L284 164 L240 268 Z" />
      <path d="M256 148 L336 134 L338 148 L258 162 Z" />
      <path d="M282 178 C306 160 352 156 396 166 L402 186 L344 196 L296 190 Z" />
      <path d="M404 168 L486 166 C504 166 514 172 516 182 L470 190 L410 192 Z" />
      <path d="M348 200 L404 204 L412 246 L352 242 Z" />
      <path d="M412 226 L564 258 L560 272 L408 240 Z" />
      <path d="M416 238 C470 248 518 254 552 256 L550 266 C514 264 462 256 412 246 Z" />
      <path d="M452 186 L490 242 L478 250 L440 194 Z" />
    </g>
  ),
  pontos: [
    { sistema: 'Direção', rotulo: 'Guidão / direção', x: 296, y: 150, lx: 236, ly: 52, anchor: 'middle' },
    { sistema: 'Itens de segurança', rotulo: 'Itens de segurança', x: 470, y: 180, lx: 560, ly: 52, anchor: 'middle' },
    { sistema: 'Elétrica', rotulo: 'Elétrica / bateria', x: 268, y: 186, lx: -30, ly: 128, anchor: 'end' },
    { sistema: 'Suspensão', rotulo: 'Molas / suspensão', x: 480, y: 216, lx: 830, ly: 150, anchor: 'start' },
    { sistema: 'Outros', rotulo: 'Escapamento / outros', x: 546, y: 252, lx: 830, ly: 262, anchor: 'start' },
    { sistema: 'Motor', rotulo: 'Motor', x: 380, y: 222, lx: 330, ly: 400, anchor: 'middle' },
    { sistema: 'Freios', rotulo: 'Freios', x: 236, y: 258, lx: 150, ly: 400, anchor: 'middle' },
    { sistema: 'Transmissão', rotulo: 'Transmissão', x: 430, y: 240, lx: 500, ly: 400, anchor: 'middle' },
    { sistema: 'Rodas e Pneus', rotulo: 'Rodas e pneus', x: 556, y: 258, lx: 680, ly: 400, anchor: 'middle' },
  ],
};

const CARRETA: Silhueta = {
  viewBox: '-165 18 1215 432', chao: 'M120 318 H660',
  rodas: [{ cx: 430, cy: 262, r: 34 }],
  corpo: (
    <g fill="currentColor">
      <path fillRule="evenodd" d="
        M280 168 L622 168 L622 262 L464 262 A34 34 0 0 0 396 262 L280 262 Z
        M296 184 L606 184 L606 246 L296 246 Z
      " />
      <path d="M280 232 L188 232 L162 222 L157 234 L184 246 L280 246 Z" />
      <path fillRule="evenodd" d="
        M150 228 a11 11 0 1 0 22 0 a11 11 0 1 0 -22 0 Z
        M156 228 a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0 Z
      " />
      <path d="M292 262 L304 262 L304 298 L292 298 Z" />
      <path d="M280 300 L316 300 L316 308 L280 308 Z" />
    </g>
  ),
  pontos: [
    { sistema: 'Outros', rotulo: 'Carga / outros', x: 448, y: 200, lx: 560, ly: 66, anchor: 'middle' },
    { sistema: 'Carroceria', rotulo: 'Carroceria / engate', x: 300, y: 190, lx: 180, ly: 66, anchor: 'middle' },
    { sistema: 'Itens de segurança', rotulo: 'Itens de segurança', x: 600, y: 240, lx: 862, ly: 200, anchor: 'start' },
    { sistema: 'Suspensão', rotulo: 'Molas / suspensão', x: 508, y: 250, lx: 560, ly: 404, anchor: 'middle' },
    { sistema: 'Freios', rotulo: 'Freios', x: 430, y: 262, lx: 330, ly: 404, anchor: 'middle' },
    { sistema: 'Rodas e Pneus', rotulo: 'Rodas e pneus', x: 372, y: 250, lx: 160, ly: 404, anchor: 'middle' },
  ],
};

const SILHUETAS: Record<TipoSilhueta, Silhueta> = {
  carro: CARRO, picape: PICAPE, caminhao: CAMINHAO, moto: MOTO, carreta: CARRETA,
};

export default function DiagramaVeiculo({ tipo, porSistema, selecionado, onSelecionar }: {
  tipo: TipoSilhueta;
  porSistema: Map<string, ContagemGravidade>;
  selecionado: string | null;
  onSelecionar: (sistema: string) => void;
}) {
  const s = SILHUETAS[tipo] || CARRO;
  const fora = new Set(SISTEMAS_FORA[tipo] || []);
  const pontos = s.pontos.filter((p) => !fora.has(p.sistema));

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg viewBox={s.viewBox} style={{ width: '100%', minWidth: 580, height: 'auto', display: 'block' }}
        role="img" aria-label={`Mapa do veículo (${tipo}) com as pendências por sistema`}>
        <g color="var(--portal-text-muted, #64748b)">
          {s.corpo}
          {s.rodas.map((r) => <Roda key={`${r.cx}-${r.cy}`} {...r} />)}
        </g>
        <path d={s.chao} stroke="var(--portal-border, #e2e8f0)" strokeWidth="2.5" fill="none" />

        {pontos.map((p) => {
          const c = porSistema.get(p.sistema);
          const pior = c?.pior || null;
          const cor = pior ? GRAVIDADE_COR[pior].forte : CINZA;
          const aceso = !!pior;
          const ativo = selecionado === p.sistema;
          return (
            <g key={p.sistema} onClick={() => onSelecionar(p.sistema)} style={{ cursor: 'pointer' }}>
              <title>{aceso
                ? `${p.sistema}: ${c!.total} pendência(s) — pior: ${GRAVIDADE_LABEL[pior!]}. Clique para ver no histórico.`
                : `${p.sistema}: sem pendência aberta`}</title>
              <line x1={p.x} y1={p.y} x2={p.lx} y2={p.ly} stroke={cor} strokeWidth={aceso ? 2 : 1.2} opacity={aceso ? 0.9 : 0.38} />
              {/* disco de fundo: separa o ícone do desenho atrás dele */}
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
