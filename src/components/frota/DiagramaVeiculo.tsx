'use client';
// Mapa ILUSTRADO do veículo: desenho de perfil com um ÍCONE por sistema da
// taxonomia. O ícone acende na cor da PIOR gravidade aberta naquele sistema,
// traz a contagem e, clicado, abre o Histórico de pendências filtrado.
//
// O DESENHO MUDA COM O TIPO do veículo (lib/frota/silhueta): sedã, hatch,
// picape, caminhão rígido (chassi), moto de rua e carretinha — recriados à mão
// seguindo a prancha de referência que o usuário mandou ("vetores de veículos
// Brasil"). São desenhos PRÓPRIOS em SVG, não imagem importada: os pontos têm
// coordenadas presas ao traço, e o SVG herda o tema e escala sem perder nada.
//
// Todos olham para a ESQUERDA. Se algum dia um desenho for espelhado, os
// pontos dele têm que ser refeitos junto.
//
// Detalhes claros (vidros, frisos de porta, maçaneta, farol) são FUROS no path
// (fill-rule evenodd) ou traços na cor do CARD (var --portal-bg-card): no modo
// escuro eles acompanham o fundo — um branco fixo viraria um recorte aceso.
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
const BG = 'var(--portal-bg-card, #fff)';

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

// ── rodas ──────────────────────────────────────────────────────────────────
// Roda estilo referência: pneu grosso + aro de 5 raios. O primeiro círculo é
// na cor do CARD e um pouco maior que o pneu: ele "recorta" a carroceria atrás
// da roda e vira o respiro da caixa de roda — assim NENHUM corpo precisa de
// entalhe no path, e mudar o raio de uma roda não quebra o desenho.
function Roda({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  const anel = (raio: number) =>
    `M${cx - raio} ${cy}a${raio} ${raio} 0 1 0 ${2 * raio} 0a${raio} ${raio} 0 1 0 ${-2 * raio} 0Z`;
  const raios = [-90, -18, 54, 126, 198];
  return (
    <g>
      <circle cx={cx} cy={cy} r={r + 5} fill={BG} />
      <g fill="currentColor">
        <path fillRule="evenodd" d={`${anel(r)}${anel(r * 0.64)}`} />
        <circle cx={cx} cy={cy} r={r * 0.17} />
      </g>
      <g stroke="currentColor" strokeWidth={Math.max(3.5, r * 0.13)} strokeLinecap="round">
        {raios.map((a) => {
          const rad = (a * Math.PI) / 180;
          return <line key={a} x1={cx + r * 0.2 * Math.cos(rad)} y1={cy + r * 0.2 * Math.sin(rad)}
            x2={cx + r * 0.55 * Math.cos(rad)} y2={cy + r * 0.55 * Math.sin(rad)} />;
        })}
      </g>
    </g>
  );
}

interface Silhueta { viewBox: string; chao: string; corpo: React.ReactNode; rodas: { cx: number; cy: number; r: number }[]; pontos: Ponto[] }

// Sedã (referência: VW Voyage) — três volumes, teto arqueado, porta-malas curto.
const CARRO: Silhueta = {
  viewBox: '-160 14 1160 400', chao: 'M100 305 H700',
  rodas: [{ cx: 212, cy: 272, r: 33 }, { cx: 560, cy: 272, r: 33 }],
  corpo: (
    <>
      <path fill="currentColor" fillRule="evenodd" d="
        M122 272 C116 268 114 258 116 250 C117 240 122 236 130 234
        L150 230 L242 216 L306 162 C310 157 316 155 324 155
        L468 152 C480 152 488 156 496 164 L560 208
        L648 212 C660 214 668 220 668 230 L668 258 C668 266 664 272 656 272 Z
        M270 210 L310 166 L380 163 L380 210 Z
        M392 163 L462 161 L512 206 L392 210 Z
      " />
      <g stroke={BG} strokeWidth="2.5" fill="none">
        <path d="M386 212 V268" />
        <path d="M508 212 L512 268" />
        <path d="M250 216 L620 212" strokeWidth="1.6" opacity="0.6" />
      </g>
      <g fill={BG}>
        <rect x="334" y="220" width="26" height="6" rx="3" />
        <rect x="452" y="218" width="26" height="6" rx="3" />
        <path d="M126 240 L162 236 L162 245 L126 247 Z" />
        <path d="M646 216 L666 220 L666 232 L646 229 Z" />
      </g>
      {/* retrovisor sobre o vidro */}
      <path fill="currentColor" d="M302 168 L282 157 L288 170 Z" />
    </>
  ),
  pontos: [
    { sistema: 'Motor', rotulo: 'Motor', x: 174, y: 234, lx: -20, ly: 110, anchor: 'end' },
    { sistema: 'Elétrica', rotulo: 'Elétrica / bateria', x: 140, y: 258, lx: -20, ly: 250, anchor: 'end' },
    { sistema: 'Ar-condicionado', rotulo: 'Ar-condicionado', x: 282, y: 206, lx: 172, ly: 58, anchor: 'middle' },
    { sistema: 'Direção', rotulo: 'Volante / direção', x: 332, y: 184, lx: 342, ly: 42, anchor: 'middle' },
    { sistema: 'Interior', rotulo: 'Bancos / interior', x: 408, y: 176, lx: 512, ly: 42, anchor: 'middle' },
    { sistema: 'Itens de segurança', rotulo: 'Cintos / segurança', x: 466, y: 190, lx: 680, ly: 58, anchor: 'middle' },
    { sistema: 'Outros', rotulo: 'Porta-malas / outros', x: 610, y: 226, lx: 800, ly: 150, anchor: 'start' },
    { sistema: 'Carroceria', rotulo: 'Carroceria', x: 640, y: 256, lx: 800, ly: 258, anchor: 'start' },
    { sistema: 'Freios', rotulo: 'Freios', x: 212, y: 272, lx: 164, ly: 380, anchor: 'middle' },
    { sistema: 'Transmissão', rotulo: 'Câmbio', x: 358, y: 278, lx: 352, ly: 380, anchor: 'middle' },
    { sistema: 'Suspensão', rotulo: 'Molas / suspensão', x: 470, y: 280, lx: 522, ly: 380, anchor: 'middle' },
    { sistema: 'Rodas e Pneus', rotulo: 'Rodas e pneus', x: 560, y: 272, lx: 690, ly: 380, anchor: 'middle' },
  ],
};

// Hatch (referência: VW Fox) — dois volumes, teto alto, traseira quase vertical.
const HATCH: Silhueta = {
  viewBox: '-160 14 1160 400', chao: 'M110 305 H620',
  rodas: [{ cx: 212, cy: 272, r: 33 }, { cx: 490, cy: 272, r: 33 }],
  corpo: (
    <>
      <path fill="currentColor" fillRule="evenodd" d="
        M150 272 C144 268 142 258 144 250 C145 241 150 237 158 235
        L172 232 L252 220 L308 160 C312 155 318 153 326 153
        L478 150 C488 150 494 153 500 158 L556 232
        C560 240 560 250 558 258 C557 266 552 272 544 272 Z
        M276 208 L312 164 L376 161 L376 208 Z
        M388 161 L448 159 L448 208 L388 208 Z
        M460 159 L488 157 L520 202 L460 206 Z
      " />
      <g stroke={BG} strokeWidth="2.5" fill="none">
        <path d="M382 210 V268" />
        <path d="M454 210 L458 264" />
      </g>
      <g fill={BG}>
        <rect x="330" y="218" width="24" height="6" rx="3" />
        <rect x="428" y="216" width="24" height="6" rx="3" />
        <path d="M156 240 L190 236 L190 246 L156 248 Z" />
        <path d="M532 214 L544 212 L548 236 L536 238 Z" />
      </g>
      <path fill="currentColor" d="M304 166 L284 155 L290 168 Z" />
    </>
  ),
  pontos: [
    { sistema: 'Motor', rotulo: 'Motor', x: 188, y: 234, lx: -20, ly: 110, anchor: 'end' },
    { sistema: 'Elétrica', rotulo: 'Elétrica / bateria', x: 156, y: 256, lx: -20, ly: 250, anchor: 'end' },
    { sistema: 'Ar-condicionado', rotulo: 'Ar-condicionado', x: 286, y: 206, lx: 172, ly: 58, anchor: 'middle' },
    { sistema: 'Direção', rotulo: 'Volante / direção', x: 330, y: 182, lx: 342, ly: 42, anchor: 'middle' },
    { sistema: 'Interior', rotulo: 'Bancos / interior', x: 410, y: 176, lx: 512, ly: 42, anchor: 'middle' },
    { sistema: 'Itens de segurança', rotulo: 'Cintos / segurança', x: 470, y: 184, lx: 680, ly: 58, anchor: 'middle' },
    { sistema: 'Outros', rotulo: 'Porta-malas / outros', x: 528, y: 226, lx: 800, ly: 150, anchor: 'start' },
    { sistema: 'Carroceria', rotulo: 'Carroceria', x: 542, y: 254, lx: 800, ly: 258, anchor: 'start' },
    { sistema: 'Freios', rotulo: 'Freios', x: 212, y: 272, lx: 164, ly: 380, anchor: 'middle' },
    { sistema: 'Transmissão', rotulo: 'Câmbio', x: 350, y: 278, lx: 352, ly: 380, anchor: 'middle' },
    { sistema: 'Suspensão', rotulo: 'Molas / suspensão', x: 430, y: 278, lx: 500, ly: 380, anchor: 'middle' },
    { sistema: 'Rodas e Pneus', rotulo: 'Rodas e pneus', x: 490, y: 272, lx: 660, ly: 380, anchor: 'middle' },
  ],
};

// Picape compacta (referência: VW Saveiro) — cabine simples + caçamba baixa.
const PICAPE: Silhueta = {
  viewBox: '-160 14 1160 400', chao: 'M100 305 H700',
  rodas: [{ cx: 212, cy: 272, r: 33 }, { cx: 560, cy: 272, r: 33 }],
  corpo: (
    <>
      <path fill="currentColor" fillRule="evenodd" d="
        M126 272 C120 268 118 258 119 248 C120 238 126 234 134 232
        L154 230 L246 216 L308 162 C312 157 318 155 326 155
        L396 155 C404 155 410 159 412 166 L426 208
        L446 212 L668 210 L672 214 L672 260 C672 268 668 272 660 272 Z
        M272 210 L312 168 L388 165 L408 210 Z
      " />
      <g stroke={BG} strokeWidth="2.5" fill="none">
        <path d="M414 212 L418 268" />
        <path d="M448 222 H664" strokeWidth="2" opacity="0.7" />
        <path d="M664 214 V266" strokeWidth="2" opacity="0.7" />
      </g>
      <g fill={BG}>
        <rect x="348" y="220" width="24" height="6" rx="3" />
        <path d="M130 240 L166 236 L166 245 L130 247 Z" />
      </g>
      <path fill="currentColor" d="M304 168 L284 157 L290 170 Z" />
    </>
  ),
  pontos: [
    { sistema: 'Motor', rotulo: 'Motor', x: 174, y: 232, lx: -20, ly: 110, anchor: 'end' },
    { sistema: 'Elétrica', rotulo: 'Elétrica / bateria', x: 140, y: 256, lx: -20, ly: 250, anchor: 'end' },
    { sistema: 'Ar-condicionado', rotulo: 'Ar-condicionado', x: 276, y: 204, lx: 172, ly: 58, anchor: 'middle' },
    { sistema: 'Direção', rotulo: 'Volante / direção', x: 324, y: 182, lx: 336, ly: 42, anchor: 'middle' },
    { sistema: 'Interior', rotulo: 'Bancos / interior', x: 388, y: 176, lx: 508, ly: 42, anchor: 'middle' },
    { sistema: 'Itens de segurança', rotulo: 'Cintos / segurança', x: 420, y: 196, lx: 676, ly: 58, anchor: 'middle' },
    { sistema: 'Outros', rotulo: 'Caçamba / outros', x: 560, y: 232, lx: 800, ly: 150, anchor: 'start' },
    { sistema: 'Carroceria', rotulo: 'Carroceria', x: 640, y: 250, lx: 800, ly: 258, anchor: 'start' },
    { sistema: 'Freios', rotulo: 'Freios', x: 212, y: 272, lx: 164, ly: 380, anchor: 'middle' },
    { sistema: 'Transmissão', rotulo: 'Câmbio', x: 346, y: 278, lx: 346, ly: 380, anchor: 'middle' },
    { sistema: 'Suspensão', rotulo: 'Molas / suspensão', x: 470, y: 278, lx: 500, ly: 380, anchor: 'middle' },
    { sistema: 'Rodas e Pneus', rotulo: 'Rodas e pneus', x: 560, y: 272, lx: 690, ly: 380, anchor: 'middle' },
  ],
};

// Caminhão rígido de 2 eixos (referência) — cabine alta + CHASSI exposto,
// tanque de combustível e bateria sob o quadro. Os caminhões reais da frota
// levam implemento, mas o chassi é o denominador comum.
const CAMINHAO: Silhueta = {
  viewBox: '-160 14 1160 400', chao: 'M100 305 H740',
  rodas: [{ cx: 200, cy: 269, r: 36 }, { cx: 560, cy: 269, r: 36 }],
  corpo: (
    <>
      {/* cabine */}
      <path fill="currentColor" fillRule="evenodd" d="
        M134 269 L134 166 C134 152 141 145 154 145 L240 145
        C250 145 256 151 258 160 L258 269 Z
        M150 158 L244 158 L244 200 L156 204 Z
      " />
      {/* chassi com ponta escalonada */}
      <path fill="currentColor" d="M258 240 H692 L704 242 V252 L692 254 H258 Z" />
      {/* tanque e bateria sob o quadro */}
      <rect fill="currentColor" x="306" y="258" width="76" height="26" rx="5" />
      <rect fill="currentColor" x="396" y="258" width="36" height="20" rx="3" />
      <g stroke={BG} strokeWidth="2.5" fill="none">
        <path d="M202 152 V262" />
        <path d="M262 247 H688" strokeWidth="1.6" opacity="0.6" />
      </g>
      <g fill={BG}>
        <rect x="210" y="206" width="22" height="6" rx="3" />
        <rect x="140" y="230" width="44" height="5" rx="2" />
        <rect x="140" y="239" width="44" height="5" rx="2" />
      </g>
    </>
  ),
  pontos: [
    { sistema: 'Motor', rotulo: 'Motor', x: 246, y: 250, lx: -20, ly: 110, anchor: 'end' },
    { sistema: 'Elétrica', rotulo: 'Elétrica / bateria', x: 414, y: 266, lx: 800, ly: 330, anchor: 'start' },
    { sistema: 'Ar-condicionado', rotulo: 'Ar-condicionado', x: 168, y: 158, lx: 150, ly: 58, anchor: 'middle' },
    { sistema: 'Direção', rotulo: 'Volante / direção', x: 178, y: 184, lx: 300, ly: 42, anchor: 'middle' },
    { sistema: 'Interior', rotulo: 'Cabine / interior', x: 234, y: 164, lx: 470, ly: 42, anchor: 'middle' },
    { sistema: 'Itens de segurança', rotulo: 'Cintos / segurança', x: 208, y: 210, lx: 640, ly: 58, anchor: 'middle' },
    { sistema: 'Outros', rotulo: 'Carga / implemento', x: 500, y: 247, lx: 800, ly: 150, anchor: 'start' },
    { sistema: 'Carroceria', rotulo: 'Carroceria', x: 660, y: 247, lx: 800, ly: 258, anchor: 'start' },
    { sistema: 'Freios', rotulo: 'Freios', x: 200, y: 269, lx: 164, ly: 380, anchor: 'middle' },
    { sistema: 'Transmissão', rotulo: 'Câmbio', x: 288, y: 262, lx: 330, ly: 380, anchor: 'middle' },
    { sistema: 'Suspensão', rotulo: 'Molas / suspensão', x: 470, y: 258, lx: 500, ly: 380, anchor: 'middle' },
    { sistema: 'Rodas e Pneus', rotulo: 'Rodas e pneus', x: 560, y: 269, lx: 690, ly: 380, anchor: 'middle' },
  ],
};

// Moto de rua (referência) — garfo, farol, tanque, motor, escapamento, balança.
const MOTO: Silhueta = {
  viewBox: '-160 14 1160 400', chao: 'M120 305 H660',
  rodas: [{ cx: 205, cy: 261, r: 44 }, { cx: 545, cy: 261, r: 44 }],
  corpo: (
    <>
      <g fill="currentColor">
        {/* garfo + guidão */}
        <path d="M232 148 L246 152 L216 268 L202 264 Z" />
        <path d="M226 146 C234 132 250 126 266 128 L268 138 C254 136 242 141 236 152 Z" />
        {/* farol */}
        <circle cx="243" cy="170" r="13" />
        {/* para-lama dianteiro */}
        <path d="M160 240 A52 52 0 0 1 250 232 L241 241 A40 40 0 0 0 171 247 Z" />
        {/* tanque + tubo do quadro */}
        <path d="M264 182 C272 160 304 150 342 152 L366 158 L360 188 L300 196 L270 194 Z" />
        {/* motor + cilindro */}
        <path d="M310 200 L394 202 L400 248 L318 246 Z" />
        <path d="M284 194 L318 182 L328 204 L294 216 Z" />
        {/* escapamento + ponteira */}
        <path d="M328 248 C392 258 470 262 542 262 L542 274 C466 274 386 268 324 260 Z" />
        <path d="M470 254 L560 254 C566 254 568 258 568 262 L568 266 C568 270 566 272 560 272 L470 272 Z" />
        {/* banco + rabeta */}
        <path d="M368 166 L474 156 C490 154 500 158 502 166 L474 180 L372 190 Z" />
        {/* amortecedor + balança */}
        <path d="M448 178 L494 244 L480 252 L436 186 Z" />
        <path d="M416 234 L550 256 L546 270 L412 248 Z" />
        {/* para-lama traseiro */}
        <path d="M498 224 A54 54 0 0 1 590 244 L580 252 A42 42 0 0 0 508 234 Z" />
      </g>
    </>
  ),
  pontos: [
    { sistema: 'Direção', rotulo: 'Guidão / direção', x: 250, y: 144, lx: 236, ly: 42, anchor: 'middle' },
    { sistema: 'Itens de segurança', rotulo: 'Itens de segurança', x: 478, y: 160, lx: 560, ly: 58, anchor: 'middle' },
    { sistema: 'Elétrica', rotulo: 'Elétrica / bateria', x: 243, y: 170, lx: -20, ly: 150, anchor: 'end' },
    { sistema: 'Suspensão', rotulo: 'Suspensão', x: 468, y: 208, lx: 800, ly: 150, anchor: 'start' },
    { sistema: 'Outros', rotulo: 'Escapamento / outros', x: 512, y: 262, lx: 800, ly: 268, anchor: 'start' },
    { sistema: 'Motor', rotulo: 'Motor', x: 352, y: 222, lx: 300, ly: 380, anchor: 'middle' },
    { sistema: 'Transmissão', rotulo: 'Transmissão', x: 428, y: 244, lx: 470, ly: 380, anchor: 'middle' },
    { sistema: 'Freios', rotulo: 'Freios', x: 205, y: 261, lx: 140, ly: 380, anchor: 'middle' },
    { sistema: 'Rodas e Pneus', rotulo: 'Rodas e pneus', x: 545, y: 261, lx: 660, ly: 380, anchor: 'middle' },
  ],
};

// Carretinha (referência) — caixa com tábuas, lança em A, engate e pé de apoio.
const CARRETA: Silhueta = {
  viewBox: '-160 14 1160 400', chao: 'M140 305 H700',
  rodas: [{ cx: 470, cy: 272, r: 33 }],
  corpo: (
    <>
      <path fill="currentColor" d="M298 190 H646 V262 H298 Z" />
      <g stroke={BG} strokeWidth="2" fill="none" opacity="0.75">
        <path d="M306 206 H638" />
        <path d="M306 224 H638" />
        <path d="M306 242 H638" />
      </g>
      <g fill="currentColor">
        {/* lança + engate */}
        <path d="M298 242 L204 226 L200 238 L298 254 Z" />
        <path d="M176 216 C170 216 166 220 166 226 L166 232 C166 238 170 242 176 242 L206 242 L206 216 Z" />
        {/* pé de apoio com rodinha */}
        <rect x="240" y="240" width="8" height="44" />
        <circle cx="244" cy="292" r="9" />
      </g>
      <circle cx="244" cy="292" r="3" fill={BG} />
    </>
  ),
  pontos: [
    { sistema: 'Outros', rotulo: 'Carga / outros', x: 452, y: 220, lx: 560, ly: 58, anchor: 'middle' },
    { sistema: 'Carroceria', rotulo: 'Carroceria / engate', x: 222, y: 232, lx: 170, ly: 58, anchor: 'middle' },
    { sistema: 'Itens de segurança', rotulo: 'Itens de segurança', x: 616, y: 240, lx: 800, ly: 200, anchor: 'start' },
    { sistema: 'Suspensão', rotulo: 'Molas / suspensão', x: 404, y: 258, lx: 300, ly: 380, anchor: 'middle' },
    { sistema: 'Freios', rotulo: 'Freios', x: 498, y: 258, lx: 620, ly: 380, anchor: 'middle' },
    { sistema: 'Rodas e Pneus', rotulo: 'Rodas e pneus', x: 470, y: 296, lx: 470, ly: 380, anchor: 'middle' },
  ],
};

const SILHUETAS: Record<TipoSilhueta, Silhueta> = {
  carro: CARRO, hatch: HATCH, picape: PICAPE, caminhao: CAMINHAO, moto: MOTO, carreta: CARRETA,
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
