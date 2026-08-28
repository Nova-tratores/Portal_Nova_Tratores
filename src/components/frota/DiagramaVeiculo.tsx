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
function Roda({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  const raios = [0, 45, 90, 135, 180, 225, 270, 315];
  return (
    <g fill="none" stroke="currentColor">
      <circle cx={cx} cy={cy} r={r} strokeWidth="3" />
      <circle cx={cx} cy={cy} r={r * 0.74} strokeWidth="2.2" opacity="0.85" />
      <circle cx={cx} cy={cy} r={r * 0.29} strokeWidth="2.4" />
      {raios.map((a) => {
        const rad = (a * Math.PI) / 180;
        return <line key={a} x1={cx + r * 0.29 * Math.cos(rad)} y1={cy + r * 0.29 * Math.sin(rad)}
          x2={cx + r * 0.68 * Math.cos(rad)} y2={cy + r * 0.68 * Math.sin(rad)} strokeWidth="2" opacity="0.7" />;
      })}
    </g>
  );
}

interface Silhueta { viewBox: string; chao: string; corpo: React.ReactNode; rodas: { cx: number; cy: number; r: number }[]; pontos: Ponto[] }

const CARRO: Silhueta = {
  viewBox: '-165 18 1215 432', chao: 'M60 318 H720',
  rodas: [{ cx: 181, cy: 286, r: 31 }, { cx: 560, cy: 286, r: 31 }],
  corpo: (
    <>
      <g fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round">
        <path d="M80 268C80 240 84 232 108 226L206 208C232 176 252 158 286 152L452 148C486 148 508 158 528 176L582 214L658 226C686 232 700 244 700 262L700 276C700 282 696 286 690 286L664 286" />
        <path d="M212 286 L529 286" />
        <path d="M591 286 L664 286" />
        <path d="M150 286 L92 286C84 286 80 282 80 276Z" />
        <path d="M150 286 A31 31 0 0 1 212 286" />
        <path d="M529 286 A31 31 0 0 1 591 286" />
      </g>
      <g fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round">
        <path d="M232 204L268 168C274 162 282 160 292 160L360 158L360 204Z" />
        <path d="M372 158L440 156L440 202L372 202Z" />
        <path d="M452 156L470 156C486 157 496 162 506 172L534 202L452 202Z" />
      </g>
      <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" opacity="0.9">
        <path d="M366 158L366 284" /><path d="M446 156L446 284" />
        <path d="M300 226h26" strokeWidth="3.4" strokeLinecap="round" />
        <path d="M392 224h26" strokeWidth="3.4" strokeLinecap="round" />
        <path d="M232 200l-20-6v10z" />
        <path d="M84 244h24v14H84Z" />
        <path d="M660 236C676 238 686 244 690 252L660 250Z" />
        <path d="M214 279H527" strokeWidth="2.4" opacity="0.7" />
      </g>
    </>
  ),
  pontos: [
    { sistema: 'Motor', rotulo: 'Motor', x: 158, y: 246, lx: -30, ly: 108, anchor: 'end' },
    { sistema: 'Elétrica', rotulo: 'Elétrica / bateria', x: 112, y: 264, lx: -30, ly: 236, anchor: 'end' },
    { sistema: 'Ar-condicionado', rotulo: 'Ar-condicionado', x: 252, y: 214, lx: 150, ly: 66, anchor: 'middle' },
    { sistema: 'Direção', rotulo: 'Volante / direção', x: 306, y: 192, lx: 330, ly: 48, anchor: 'middle' },
    { sistema: 'Interior', rotulo: 'Bancos / interior', x: 404, y: 186, lx: 520, ly: 48, anchor: 'middle' },
    { sistema: 'Itens de segurança', rotulo: 'Cintos / segurança', x: 470, y: 200, lx: 700, ly: 66, anchor: 'middle' },
    { sistema: 'Outros', rotulo: 'Porta-malas / outros', x: 638, y: 240, lx: 862, ly: 150, anchor: 'start' },
    { sistema: 'Carroceria', rotulo: 'Carroceria', x: 676, y: 272, lx: 862, ly: 268, anchor: 'start' },
    { sistema: 'Freios', rotulo: 'Freios', x: 181, y: 286, lx: 130, ly: 404, anchor: 'middle' },
    { sistema: 'Transmissão', rotulo: 'Câmbio', x: 352, y: 292, lx: 336, ly: 404, anchor: 'middle' },
    { sistema: 'Suspensão', rotulo: 'Molas / suspensão', x: 470, y: 294, lx: 520, ly: 404, anchor: 'middle' },
    { sistema: 'Rodas e Pneus', rotulo: 'Rodas e pneus', x: 560, y: 286, lx: 706, ly: 404, anchor: 'middle' },
  ],
};

const PICAPE: Silhueta = {
  viewBox: '-165 18 1215 432', chao: 'M60 318 H720',
  rodas: [{ cx: 181, cy: 286, r: 31 }, { cx: 560, cy: 286, r: 31 }],
  corpo: (
    <>
      <g fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round">
        {/* frente + cabine curta + caçamba aberta atrás */}
        <path d="M80 262C80 236 84 228 108 222L204 204C228 174 246 158 278 152L400 150C428 152 442 164 456 182L482 216L700 216L700 276C700 282 696 286 690 286L664 286" />
        <path d="M212 286 L529 286" />
        <path d="M591 286 L664 286" />
        <path d="M150 286 L92 286C84 286 80 282 80 270Z" />
        <path d="M150 286 A31 31 0 0 1 212 286" />
        <path d="M529 286 A31 31 0 0 1 591 286" />
        {/* borda e nervuras da caçamba */}
        <path d="M482 216 L482 286" strokeWidth="2.4" />
        <path d="M496 228 H690" strokeWidth="2" opacity="0.55" />
      </g>
      <g fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round">
        <path d="M228 200L262 166C268 160 276 158 286 158L344 157L344 200Z" />
        <path d="M356 157L400 156C418 158 428 166 436 178L452 200L356 200Z" />
      </g>
      <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" opacity="0.9">
        <path d="M350 157L350 284" />
        <path d="M288 226h26" strokeWidth="3.4" strokeLinecap="round" />
        <path d="M228 196l-20-6v10z" />
        <path d="M84 240h24v14H84Z" />
        <path d="M214 279H478" strokeWidth="2.4" opacity="0.7" />
      </g>
    </>
  ),
  pontos: [
    { sistema: 'Motor', rotulo: 'Motor', x: 156, y: 242, lx: -30, ly: 108, anchor: 'end' },
    { sistema: 'Elétrica', rotulo: 'Elétrica / bateria', x: 112, y: 262, lx: -30, ly: 236, anchor: 'end' },
    { sistema: 'Ar-condicionado', rotulo: 'Ar-condicionado', x: 248, y: 212, lx: 150, ly: 66, anchor: 'middle' },
    { sistema: 'Direção', rotulo: 'Volante / direção', x: 300, y: 190, lx: 322, ly: 48, anchor: 'middle' },
    { sistema: 'Interior', rotulo: 'Bancos / interior', x: 388, y: 186, lx: 508, ly: 48, anchor: 'middle' },
    { sistema: 'Itens de segurança', rotulo: 'Cintos / segurança', x: 440, y: 204, lx: 690, ly: 66, anchor: 'middle' },
    { sistema: 'Outros', rotulo: 'Caçamba / outros', x: 600, y: 244, lx: 862, ly: 150, anchor: 'start' },
    { sistema: 'Carroceria', rotulo: 'Carroceria', x: 676, y: 268, lx: 862, ly: 268, anchor: 'start' },
    { sistema: 'Freios', rotulo: 'Freios', x: 181, y: 286, lx: 130, ly: 404, anchor: 'middle' },
    { sistema: 'Transmissão', rotulo: 'Câmbio', x: 346, y: 292, lx: 336, ly: 404, anchor: 'middle' },
    { sistema: 'Suspensão', rotulo: 'Molas / suspensão', x: 470, y: 294, lx: 520, ly: 404, anchor: 'middle' },
    { sistema: 'Rodas e Pneus', rotulo: 'Rodas e pneus', x: 560, y: 286, lx: 706, ly: 404, anchor: 'middle' },
  ],
};

const CAMINHAO: Silhueta = {
  viewBox: '-165 18 1215 432', chao: 'M60 318 H730',
  rodas: [{ cx: 172, cy: 282, r: 35 }, { cx: 542, cy: 282, r: 35 }, { cx: 626, cy: 282, r: 35 }],
  corpo: (
    <>
      <g fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round">
        {/* cabine alta na frente */}
        <path d="M84 250L84 150C84 142 90 136 98 136L232 136C242 136 248 142 250 150L262 214L262 250" />
        {/* chassi e baú */}
        <path d="M262 250 L262 262 L700 262" />
        <path d="M290 262 L290 128 L700 128 L700 262" />
        <path d="M84 250 L84 262 L137 262" />
        <path d="M207 262 L262 262" />
        <path d="M137 262 A35 35 0 0 1 207 262" />
        <path d="M507 262 A35 35 0 0 1 577 262" />
        <path d="M591 262 A35 35 0 0 1 661 262" />
      </g>
      <g fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round">
        <path d="M98 150L230 150L240 196L98 196Z" />
        <path d="M300 140 L690 140 L690 250 L300 250 Z" opacity="0.75" />
        <path d="M300 196 H690" strokeWidth="1.8" opacity="0.5" />
      </g>
      <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" opacity="0.9">
        <path d="M110 214h24" strokeWidth="3.4" strokeLinecap="round" />
        <path d="M88 226h20v16H88Z" />
        <path d="M262 214 L290 214" opacity="0.6" />
      </g>
    </>
  ),
  pontos: [
    { sistema: 'Motor', rotulo: 'Motor', x: 150, y: 250, lx: -30, ly: 120, anchor: 'end' },
    { sistema: 'Elétrica', rotulo: 'Elétrica / bateria', x: 232, y: 250, lx: -30, ly: 250, anchor: 'end' },
    { sistema: 'Ar-condicionado', rotulo: 'Ar-condicionado', x: 108, y: 172, lx: 96, ly: 62, anchor: 'middle' },
    { sistema: 'Direção', rotulo: 'Volante / direção', x: 168, y: 208, lx: 250, ly: 62, anchor: 'middle' },
    { sistema: 'Interior', rotulo: 'Cabine / interior', x: 208, y: 172, lx: 400, ly: 62, anchor: 'middle' },
    { sistema: 'Itens de segurança', rotulo: 'Cintos / segurança', x: 302, y: 176, lx: 560, ly: 62, anchor: 'middle' },
    { sistema: 'Outros', rotulo: 'Baú / carga', x: 494, y: 176, lx: 862, ly: 140, anchor: 'start' },
    { sistema: 'Carroceria', rotulo: 'Carroceria', x: 660, y: 214, lx: 862, ly: 250, anchor: 'start' },
    { sistema: 'Freios', rotulo: 'Freios', x: 172, y: 282, lx: 130, ly: 404, anchor: 'middle' },
    { sistema: 'Transmissão', rotulo: 'Câmbio', x: 300, y: 274, lx: 330, ly: 404, anchor: 'middle' },
    { sistema: 'Suspensão', rotulo: 'Molas / suspensão', x: 430, y: 274, lx: 500, ly: 404, anchor: 'middle' },
    { sistema: 'Rodas e Pneus', rotulo: 'Rodas e pneus', x: 584, y: 282, lx: 700, ly: 404, anchor: 'middle' },
  ],
};

const MOTO: Silhueta = {
  viewBox: '-165 18 1215 432', chao: 'M120 318 H660',
  rodas: [{ cx: 236, cy: 258, r: 60 }, { cx: 556, cy: 258, r: 60 }],
  corpo: (
    <>
      <g fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round">
        {/* garfo dianteiro (dois tubos) até a mesa, e guidão */}
        <path d="M236 258 L292 152" />
        <path d="M248 262 L302 158" strokeWidth="2.2" opacity="0.75" />
        <path d="M270 150 L330 138" strokeWidth="3.4" />
        <path d="M292 152 L300 168" strokeWidth="2.4" />
        {/* farol */}
        <path d="M272 168C260 176 258 190 264 200L288 184Z" strokeWidth="2.4" />
        {/* quadro: tubo superior + tubo do berço */}
        <path d="M300 168 L392 182 L470 186" />
        <path d="M306 188 L344 226 L420 230" />
        {/* tanque */}
        <path d="M312 176C340 158 380 156 404 166L406 190L346 200L312 192Z" />
        {/* banco + rabeta */}
        <path d="M406 178C440 168 478 166 502 172L508 186L470 194L408 196Z" />
        {/* motor */}
        <path d="M344 200 L410 204 L416 244 L350 240Z" strokeWidth="2.6" />
        {/* balança traseira até o eixo */}
        <path d="M420 232 L556 258" strokeWidth="2.8" />
        {/* amortecedor traseiro */}
        <path d="M462 188 L492 244" strokeWidth="2.6" />
        {/* escapamento */}
        <path d="M416 236C462 244 512 250 546 252" strokeWidth="2.6" />
      </g>
    </>
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
  rodas: [{ cx: 430, cy: 282, r: 33 }],
  corpo: (
    <>
      <g fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round">
        {/* caixa */}
        <path d="M280 176 L620 176 L620 262 L280 262 Z" />
        {/* chassi + lança de engate */}
        <path d="M280 250 L190 250 L160 236" />
        <circle cx="152" cy="232" r="10" strokeWidth="2.6" />
        <path d="M280 262 L395 262" />
        <path d="M465 262 L620 262" />
        <path d="M395 262 A33 33 0 0 1 465 262" />
        {/* pé de apoio */}
        <path d="M300 262 L300 300 M286 300 H314" strokeWidth="2.6" />
      </g>
      <g fill="none" stroke="currentColor" strokeWidth="2" opacity="0.55">
        <path d="M280 216 H620" />
      </g>
    </>
  ),
  pontos: [
    { sistema: 'Outros', rotulo: 'Carga / outros', x: 448, y: 200, lx: 560, ly: 66, anchor: 'middle' },
    { sistema: 'Carroceria', rotulo: 'Carroceria / engate', x: 300, y: 190, lx: 180, ly: 66, anchor: 'middle' },
    { sistema: 'Itens de segurança', rotulo: 'Itens de segurança', x: 600, y: 240, lx: 862, ly: 200, anchor: 'start' },
    { sistema: 'Suspensão', rotulo: 'Molas / suspensão', x: 500, y: 268, lx: 560, ly: 404, anchor: 'middle' },
    { sistema: 'Freios', rotulo: 'Freios', x: 430, y: 282, lx: 330, ly: 404, anchor: 'middle' },
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
