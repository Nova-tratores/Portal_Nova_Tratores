'use client';
// Mapa ILUSTRADO do veículo: desenho de perfil com um ÍCONE por sistema da
// taxonomia. O ícone acende na cor da PIOR gravidade aberta naquele sistema.
//
// MODO ZOOM (pedido do usuário): clicar num sistema faz a "câmera" deslizar
// até aquela região do carro (transição de transform no SVG — não é 3D) e um
// painel de PEÇAS explode ao lado: cada componente da taxonomia vira um chip
// com um mini-ícone desenhado (amortecedor, disco, bateria, vela, palheta…),
// colorido pela gravidade da pendência aberta nele — cinza quando está ok.
// No Motor dos carros/picape o CAPÔ levanta e aparece o bloco do motor.
// Os mini-ícones são desenhos PRÓPRIOS (a prancha de referência do usuário é
// de banco de imagens — inspiração, nunca cópia).
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
import { useMemo, useState } from 'react';
import { GRAVIDADE_COR, GRAVIDADE_LABEL, type ContagemGravidade, type Gravidade } from '@/lib/frota/gravidade';
import { SISTEMAS_FORA, type TipoSilhueta } from '@/lib/frota/silhueta';

interface Ponto {
  sistema: string;
  rotulo: string;
  x: number; y: number;      // centro do ícone, sobre o desenho
  lx: number; ly: number;    // rótulo (a linha-guia sai do ícone até aqui)
  anchor: 'start' | 'middle' | 'end';
}

/** Uma peça (componente da taxonomia) no painel de detalhe do sistema. */
export interface PecaDetalhe {
  id: string;
  rotulo: string;      // componente || subsistema || 'Geral'
  subsistema: string;  // agrupador visual
  total: number;       // pendências abertas nesta peça
  pior: Gravidade | null;
}

const R = 17; // raio do disco do ícone
const CINZA = '#94a3b8';
const BG = 'var(--portal-bg-card, #fff)';

// ── glifos dos SISTEMAS ────────────────────────────────────────────────────
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

// ── mini-ícones das PEÇAS (painel de detalhe) ──────────────────────────────
// Um glifo por "família" de peça, escolhido por palavra no nome do componente
// (mesma filosofia das REGRAS_TEXTO do motor de pendências). Desenhos próprios
// no mesmo quadrado -10..10, traço fino.
const FAMILIAS: [RegExp, string][] = [
  [/[óo]leo|lubrific|fluido/i, 'gota'],
  [/arrefec|radiador|ventoinha|h[ée]lice/i, 'radiador'],
  [/combust[ií]vel|bomba|tanque|aliment|inje[çc]/i, 'bomba'],
  [/escap|catalisador|silencioso/i, 'escapamento'],
  [/correia|polia|tensor/i, 'correia'],
  [/junta|retentor|veda[çc]/i, 'junta'],
  [/vela|igni[çc]/i, 'vela'],
  [/bateria/i, 'bateria'],
  [/farol|l[aâ]mpada|ilumin|lanterna|seta/i, 'farol'],
  [/partida|arranque|alternador/i, 'partida'],
  [/palheta|limpador/i, 'palheta'],
  [/painel|instrumento/i, 'painel'],
  [/buzina|som|alto.?falante/i, 'buzina'],
  [/chicote|fus[ií]vel|rel[eé]|el[eé]tric/i, 'raio'],
  [/pastilha|lona/i, 'pastilha'],
  [/tambor/i, 'tambor'],
  [/freio de m[aã]o|estacionamento/i, 'freiomao'],
  [/disco|pin[çc]a|hidr[aá]ulica|flex[ií]v/i, 'disco'],
  [/amortecedor|mola|batente/i, 'amortecedor'],
  [/bucha|piv[oô]|bandeja|terminal|barra|axial/i, 'articulacao'],
  [/embreagem|plat[oô]|atuador/i, 'embreagem'],
  [/c[aâ]mbio|caixa|manopla|trambulador/i, 'cambio'],
  [/cardan|diferencial|homocin|semi.?eixo|junta fixa/i, 'cardan'],
  [/volante|dire[çc][aã]o|coluna/i, 'volante'],
  [/pneu|estepe/i, 'pneu'],
  [/roda|aro|alinhamento|balancea|rolamento|cubo/i, 'roda'],
  [/porta|ma[çc]aneta|fechadura|dobradi[çc]a|trava/i, 'porta'],
  [/vidro|para.?brisa/i, 'vidro'],
  [/retrovisor|espelho/i, 'retrovisor'],
  [/lataria|pintura|funilaria|para.?choque|capo|cap[oô]/i, 'lataria'],
  [/banco|estofad/i, 'banco'],
  [/tapete|forra[çc]|teto/i, 'tapete'],
  [/compressor|g[aá]s|carga|filtro de cabine|ar.?condicionado/i, 'floco'],
  [/cinto/i, 'cinto'],
  [/extintor/i, 'extintor'],
  [/tri[aâ]ngulo/i, 'triangulo'],
  [/macaco|chave de roda/i, 'macaco'],
];

function familiaDe(nome: string): string {
  for (const [re, fam] of FAMILIAS) if (re.test(nome)) return fam;
  return 'chave';
}

function MiniGlifo({ nome }: { nome: string }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (familiaDe(nome)) {
    case 'gota': return <g {...p}><path d="M0-8C3-3.6 5.2-1 5.2 2.2a5.2 5.2 0 11-10.4 0C-5.2-1-3-3.6 0-8z" /></g>;
    case 'radiador': return <g {...p}><rect x="-7" y="-6" width="14" height="12" rx="1.2" /><path d="M-3.5-6v12M0-6v12M3.5-6v12" /></g>;
    case 'bomba': return <g {...p}><rect x="-7" y="-7" width="9" height="14" rx="1" /><path d="M-5.5-3.5h6" /><path d="M2-5h2.4l2.6 2.6V4a1.6 1.6 0 01-3.2 0" /></g>;
    case 'escapamento': return <g {...p}><rect x="-8" y="-4" width="13" height="8" rx="3.4" /><path d="M5 0h4M-8 0h-1.6" /><path d="M-4-4v8M0-4v8" /></g>;
    case 'correia': return <g {...p}><circle cx="-3.6" cy="-1" r="3.4" /><circle cx="4.6" cy="3" r="2.4" /><path d="M-3.2-4.4C1.6-5.4 6-1 6.8 2M-3.4 2.4C.4 5.6 3 5.6 4.6 5.4" /></g>;
    case 'junta': return <g {...p}><circle cx="0" cy="0" r="6.4" /><circle cx="0" cy="0" r="2.6" /><path d="M0-6.4v-1.6M0 6.4v1.6M-6.4 0h-1.6M6.4 0h1.6" /></g>;
    case 'vela': return <g {...p}><path d="M-1.6-9h3.2v3.4h-3.2z" /><path d="M-3-5.6h6l-1 3.6h-4z" /><path d="M-2-2h4v4.6h-4z" /><path d="M0 2.6V8" /></g>;
    case 'bateria': return <g {...p}><rect x="-8" y="-4" width="16" height="9" rx="1.4" /><path d="M-5-4v-2M5-4v-2" /><path d="M-6 .5h3M3 .5h3M4.5-1v3" /></g>;
    case 'farol': return <g {...p}><path d="M-3-6h1.6a6 6 0 010 12H-3a8.8 8.8 0 010-12z" /><path d="M3.4-4h4.6M4.4 0h4.6M3.4 4h4.6" /></g>;
    case 'partida': return <g {...p}><rect x="-8.5" y="-3.4" width="10" height="7.4" rx="2" /><circle cx="5" cy="0.3" r="3" /><path d="M5-2.7v-2.4M5 3.3v2.4M2-0.5l-1.5-1" /></g>;
    case 'palheta': return <g {...p}><path d="M-8 7L3-4" /><path d="M1-6.4l5.4 5.4" strokeWidth="2.6" /><path d="M-8 7l-1 2" /></g>;
    case 'painel': return <g {...p}><rect x="-8" y="-5" width="16" height="10" rx="1.8" /><circle cx="-3.6" cy="0" r="2.5" /><circle cx="3.6" cy="0" r="2.5" /><path d="M-3.6 0l1.4-1.6M3.6 0l1.4-1.6" /></g>;
    case 'buzina': return <g {...p}><path d="M-6-2.6v5.2l5.4 3.8V-6.4z" /><path d="M2.4-3.4a5 5 0 010 6.8M5.2-5.6a8.6 8.6 0 010 11.2" /></g>;
    case 'raio': return <g {...p}><path d="M2-9L-4.4 1h4l-2 8L6-2H1.6z" /></g>;
    case 'pastilha': return <g {...p}><path d="M-4.6-6.4a9 9 0 010 12.8" /><path d="M-.6-6.4a9 9 0 010 12.8" /><circle cx="-3" cy="0" r="0.5" fill="currentColor" /><circle cx="-3.4" cy="-3.4" r="0.5" fill="currentColor" /><circle cx="-3.4" cy="3.4" r="0.5" fill="currentColor" /></g>;
    case 'tambor': return <g {...p}><circle cx="0" cy="0" r="7.2" /><circle cx="0" cy="0" r="4.4" /><circle cx="0" cy="0" r="1" /></g>;
    case 'freiomao': return <g {...p}><path d="M-7 6.5h4.4L6.6-5.4" /><circle cx="7.2" cy="-6.2" r="1.5" /><path d="M-5.6 6.5a3 3 0 106 0" /></g>;
    case 'disco': return <g {...p}><circle cx="-1" cy="0" r="7" /><circle cx="-1" cy="0" r="2.4" /><path d="M5.4-4h3a1.5 1.5 0 011.5 1.5v5A1.5 1.5 0 018.4 4h-3z" /></g>;
    case 'amortecedor': return <g {...p}><path d="M0-9v2.6M0 6.4V9" /><rect x="-2.6" y="-6.4" width="5.2" height="3.6" rx="1" /><path d="M-4.4-2.4h8.8M-4.4-.4l8.8 1.6M-4.4 1.6l8.8 1.6M-4.4 4h8.8" /></g>;
    case 'articulacao': return <g {...p}><circle cx="-4.4" cy="4.6" r="2.6" /><path d="M-2.4 2.6L4.4-5.4" /><circle cx="5.6" cy="-6.6" r="1.8" /></g>;
    case 'embreagem': return <g {...p}><circle cx="0" cy="0" r="7" /><circle cx="0" cy="0" r="1.8" /><path d="M0-7v2.6M0 7v-2.6M-7 0h2.6M7 0h-2.6M-5-5l1.9 1.9M5 5l-1.9-1.9M5-5l-1.9 1.9M-5 5l1.9-1.9" /></g>;
    case 'cambio': return <g {...p}><circle cx="0" cy="-5.4" r="3.4" /><path d="M-1.8-6.4h3.6M-1.8-4.4h3.6" /><path d="M0-2v10.6" /><path d="M-3.4 8.6h6.8" /></g>;
    case 'cardan': return <g {...p}><path d="M-9 0h4.6M4.4 0H9" /><circle cx="-.2" cy="0" r="2.8" /><path d="M-.2-2.8v-2.2M-.2 2.8v2.2" /></g>;
    case 'volante': return <g {...p}><circle cx="0" cy="0" r="7.6" /><circle cx="0" cy="0" r="2.2" /><path d="M-7.6 0h5.4M7.6 0H2.2M0 2.2v5.4" /></g>;
    case 'pneu': return <g {...p}><circle cx="0" cy="0" r="8" /><circle cx="0" cy="0" r="4.4" /><path d="M0-8v-1.4M0 8v1.4M-8 0h-1.4M8 0h1.4M-5.7-5.7l-1 -1M5.7 5.7l1 1M5.7-5.7l1-1M-5.7 5.7l-1 1" /></g>;
    case 'roda': return <g {...p}><circle cx="0" cy="0" r="7.4" /><circle cx="0" cy="0" r="1.8" /><path d="M0-1.8V-7.4M1.7-.6l5.4-1.7M1-1.4 1.1 1.5M1.1 1.5l3.3 4.5M-1.1 1.5l-3.3 4.5M-1.7-.6l-5.4-1.7" /></g>;
    case 'porta': return <g {...p}><path d="M-7-7h10.6l3.4 3.4V7h-14z" /><path d="M-7-1.6h14" opacity="0.6" /><path d="M1 1.4h3.6" strokeWidth="2" /></g>;
    case 'vidro': return <g {...p}><path d="M-8 6L-3.4-6h11L8 6z" /><path d="M-1.6-4.2L-5 4.6" opacity="0.6" /></g>;
    case 'retrovisor': return <g {...p}><path d="M-6.4-5.6a7.6 7.6 0 019.8 1.6c1.4 1.8 1.2 4-.6 5l-7.6 1.2c-2-.8-2.6-5.4-1.6-7.8z" /><path d="M-2.6 2.6L-4.6 8.4" /></g>;
    case 'lataria': return <g {...p}><path d="M-9 3v-2l2-.6 2-2.6h6l2 2.6 2 .6v2z" /><circle cx="-4.5" cy="3.4" r="1.8" /><circle cx="4.5" cy="3.4" r="1.8" /></g>;
    case 'banco': return <g {...p}><path d="M-4.6-8.4a2 2 0 012 2v6h4.6a2 2 0 012 2v3.2" /><path d="M-6-0.4h9.2" /><path d="M-6-0.4v6.4h10.6" /></g>;
    case 'tapete': return <g {...p}><rect x="-7" y="-5" width="14" height="10" rx="1.4" /><path d="M-4-2h8M-4 1h8" opacity="0.6" /></g>;
    case 'floco': return <g {...p}><path d="M0-8V8M-7-4l14 8M-7 4l14-8" /></g>;
    case 'cinto': return <g {...p}><path d="M-6.4-8.4L4 5" /><path d="M-7.4 3.4h5.8l6.2 5" /><rect x="-2.4" y="1.4" width="4.4" height="4" rx="0.8" /></g>;
    case 'extintor': return <g {...p}><rect x="-3" y="-4" width="6" height="12" rx="2" /><path d="M-1-4v-2.6h2V-4" /><path d="M1-7.6l4.6-1.6" /></g>;
    case 'triangulo': return <g {...p}><path d="M0-8l8 14H-8z" /><path d="M0-3.6L4.4 4h-8.8z" /></g>;
    case 'macaco': return <g {...p}><path d="M-8 7.4h16" /><path d="M-6 7.4l6-5.4 6 5.4M-6-3.4l6 5.4 6-5.4" /><path d="M-8-3.4h16" /></g>;
    default: return <g {...p}><path d="M-8.4 8.4l6.6-6.6" /><path d="M-1.2 1.2a5 5 0 106.2-6.2l-3 3-2.2-2.2 3-3a5 5 0 00-6.2 6.2z" /></g>;
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

interface Capo { d: string; hinge: [number, number]; motor: React.ReactNode }
interface Silhueta { viewBox: string; chao: string; corpo: React.ReactNode; rodas: { cx: number; cy: number; r: number }[]; pontos: Ponto[]; capo?: Capo }

// bloco de motor que aparece quando o capô levanta — desenhado DEPOIS do
// corpo, em traços na cor do CARD (a mesma linguagem dos vidros): sobre a
// carroceria sólida ele lê como "gravado" no cofre
const blocoMotor = (x: number, y: number) => (
  <g stroke={BG} strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round">
    <rect x={x} y={y} width="54" height="22" rx="3" />
    <path d={`M${x + 11} ${y}v-7M${x + 27} ${y}v-7M${x + 43} ${y}v-7`} />
    <path d={`M${x + 6} ${y - 7}h10M${x + 22} ${y - 7}h10M${x + 38} ${y - 7}h10`} />
    <circle cx={x + 14} cy={y + 11} r="4.5" />
    <path d={`M${x + 26} ${y + 11}h20`} opacity="0.8" />
  </g>
);

// Sedã (referência: VW Voyage) — três volumes, teto arqueado, porta-malas curto.
const CARRO: Silhueta = {
  viewBox: '-160 14 1160 400', chao: 'M100 305 H700',
  rodas: [{ cx: 212, cy: 272, r: 33 }, { cx: 560, cy: 272, r: 33 }],
  capo: {
    d: 'M122 246 L150 230 L244 216 L250 231 L136 252 Z',
    hinge: [244, 216],
    motor: blocoMotor(160, 234),
  },
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
  capo: {
    d: 'M150 247 L172 232 L254 220 L260 234 L164 253 Z',
    hinge: [254, 220],
    motor: blocoMotor(166, 238),
  },
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
  capo: {
    d: 'M126 244 L154 230 L248 216 L254 230 L140 250 Z',
    hinge: [248, 216],
    motor: blocoMotor(162, 234),
  },
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

export default function DiagramaVeiculo({ tipo, porSistema, selecionado, onSelecionar, pecasPorSistema, onAbrirHistorico }: {
  tipo: TipoSilhueta;
  porSistema: Map<string, ContagemGravidade>;
  selecionado: string | null;
  onSelecionar: (sistema: string) => void;
  /** peças (componentes da taxonomia) por sistema — liga o modo zoom + painel */
  pecasPorSistema?: Map<string, PecaDetalhe[]>;
  /** botão "ver no histórico" do painel de peças */
  onAbrirHistorico?: (sistema: string) => void;
}) {
  const s = SILHUETAS[tipo] || CARRO;
  const fora = new Set(SISTEMAS_FORA[tipo] || []);
  const pontos = s.pontos.filter((p) => !fora.has(p.sistema));

  // ── modo zoom: a "câmera" desliza até o ponto do sistema clicado ──
  const [zoom, setZoom] = useState<string | null>(null);
  const pontoZoom = zoom ? pontos.find((p) => p.sistema === zoom) || null : null;

  // geometria do viewBox (todas as silhuetas usam o mesmo)
  const vb = useMemo(() => {
    const [x, y, w, h] = s.viewBox.split(' ').map(Number);
    return { x, y, w, h, cy: y + h / 2 };
  }, [s.viewBox]);

  // A região com zoom fica a ~28% da largura — o painel de peças ocupa a
  // metade direita; centralizar no meio deixaria o alvo escondido atrás dele.
  const ESCALA = 2.1;
  const alvoX = vb.x + vb.w * 0.28;
  const transformCena = pontoZoom
    ? `translate(${alvoX - ESCALA * pontoZoom.x}px, ${vb.cy - ESCALA * pontoZoom.y}px) scale(${ESCALA})`
    : 'translate(0px, 0px) scale(1)';

  const capoAberto = !!(zoom === 'Motor' && s.capo);
  const pecas = zoom ? pecasPorSistema?.get(zoom) || [] : [];
  const contZoom = zoom ? porSistema.get(zoom) : undefined;

  const clicar = (sistema: string) => {
    if (pecasPorSistema) {
      setZoom((z) => (z === sistema ? null : sistema));
      onSelecionar(sistema);
      return;
    }
    onSelecionar(sistema); // sem dados de peças: comportamento antigo
  };

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <div style={{ position: 'relative', minWidth: 580 }}>
        <svg viewBox={s.viewBox} style={{ width: '100%', height: 'auto', display: 'block' }}
          role="img" aria-label={`Mapa do veículo (${tipo}) com as pendências por sistema`}
          onClick={() => { if (zoom) setZoom(null); }}>
          <g style={{ transform: transformCena, transition: 'transform .85s cubic-bezier(.45,0,.18,1)', transformOrigin: '0 0' }}>
            <g color="var(--portal-text-muted, #64748b)">
              {s.corpo}
              {/* motor "gravado" no cofre (traços na cor do card, como os
                  vidros) — só aparece quando o capô levanta */}
              {s.capo && (
                <g style={{ opacity: capoAberto ? 1 : 0, transition: 'opacity .5s .4s' }}>{s.capo.motor}</g>
              )}
              {/* capô como "tampa" por cima do bico: levanta girando na
                  dobradiça. A rotação é montada à mão (translate→rotate→
                  translate) — transform-origin com px mede do canto do
                  viewBox, que aqui começa em -160, e girava fora do lugar.
                  Ângulo NEGATIVO porque o carro olha pra esquerda e o y do
                  SVG cresce pra baixo — positivo abaixaria a frente. */}
              {s.capo && (() => {
                const [hx, hy] = s.capo!.hinge;
                const ang = capoAberto ? -34 : 0;
                return (
                  <g style={{
                    transform: `translate(${hx}px, ${hy}px) rotate(${ang}deg) translate(${-hx}px, ${-hy}px)`,
                    transition: 'transform .7s .25s cubic-bezier(.4,0,.2,1)',
                  }}>
                    <path d={s.capo!.d} fill="currentColor" stroke={BG} strokeWidth="2.5" strokeLinejoin="round" />
                  </g>
                );
              })()}
              {s.rodas.map((r) => <Roda key={`${r.cx}-${r.cy}`} {...r} />)}
            </g>
            <path d={s.chao} stroke="var(--portal-border, #e2e8f0)" strokeWidth="2.5" fill="none"
              style={{ opacity: zoom ? 0 : 1, transition: 'opacity .4s' }} />

            {pontos.map((p) => {
              const c = porSistema.get(p.sistema);
              const pior = c?.pior || null;
              const cor = pior ? GRAVIDADE_COR[pior].forte : CINZA;
              const aceso = !!pior;
              const ativo = selecionado === p.sistema;
              // no zoom os pontos somem (o painel de peças assume) — só o disco
              // do sistema aberto fica, como âncora visual
              const some = zoom ? (zoom === p.sistema ? 0.25 : 0) : 1;
              return (
                <g key={p.sistema} onClick={(e) => { e.stopPropagation(); clicar(p.sistema); }}
                  style={{ cursor: 'pointer', opacity: some, transition: 'opacity .45s', pointerEvents: zoom && zoom !== p.sistema ? 'none' : 'auto' }}>
                  <title>{aceso
                    ? `${p.sistema}: ${c!.total} pendência(s) — pior: ${GRAVIDADE_LABEL[pior!]}. Clique para ver as peças.`
                    : `${p.sistema}: sem pendência aberta. Clique para ver as peças.`}</title>
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
          </g>
        </svg>

        {/* ── PAINEL DE PEÇAS: explode ao lado da região com zoom ── */}
        {zoom && pecasPorSistema && (
          <div style={{
            position: 'absolute', top: 8, right: 8, bottom: 8, width: 'min(46%, 330px)',
            display: 'flex', flexDirection: 'column',
            background: 'var(--portal-bg-card, #fff)', border: '1.5px solid var(--portal-border, #e2e8f0)',
            boxShadow: '0 12px 40px rgba(0,0,0,.18)', borderRadius: 0,
            animation: 'diagrama-painel .45s cubic-bezier(.3,0,.2,1)',
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: '1px solid var(--portal-border, #e2e8f0)' }}>
              <span style={{ color: contZoom?.pior ? GRAVIDADE_COR[contZoom.pior].forte : CINZA, display: 'flex' }}>
                <svg width="22" height="22" viewBox="-11 -11 22 22"><Glifo sistema={zoom} /></svg>
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--portal-text)', lineHeight: 1.1 }}>{zoom}</div>
                <div style={{ fontSize: 11, color: contZoom?.pior ? GRAVIDADE_COR[contZoom.pior].cor : 'var(--portal-text-secondary)', fontWeight: 700 }}>
                  {contZoom?.total
                    ? `${contZoom.total} pendência${contZoom.total > 1 ? 's' : ''} · pior: ${GRAVIDADE_LABEL[contZoom.pior!].toLowerCase()}`
                    : 'nenhuma pendência aberta'}
                </div>
              </div>
              <button onClick={() => setZoom(null)} title="Fechar"
                style={{ marginLeft: 'auto', width: 26, height: 26, border: '1px solid var(--portal-border, #e2e8f0)', background: 'transparent', color: 'var(--portal-text-secondary)', cursor: 'pointer', fontSize: 14, fontWeight: 700, lineHeight: 1 }}>
                ×
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: 10, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))', gap: 7, alignContent: 'start' }}>
              {pecas.map((pc, i) => {
                const cg = pc.pior ? GRAVIDADE_COR[pc.pior] : null;
                const chip = (
                  <div key={pc.id}
                    title={cg ? `${pc.rotulo}: ${pc.total} pendência(s) — ${GRAVIDADE_LABEL[pc.pior!]}. Clique para ver no histórico.` : `${pc.rotulo}: ok`}
                    onClick={cg && onAbrirHistorico ? () => onAbrirHistorico(zoom) : undefined}
                    className={pc.pior === 'grave' || pc.pior === 'critica' ? 'sist-blink' : undefined}
                    style={{
                      position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                      padding: '9px 4px 7px', textAlign: 'center',
                      background: cg ? cg.bg : 'var(--portal-bg-secondary, #f8fafc)',
                      border: `1.5px solid ${cg ? cg.forte : 'var(--portal-border, #e2e8f0)'}`,
                      color: cg ? cg.cor : 'var(--portal-text-secondary)',
                      cursor: cg && onAbrirHistorico ? 'pointer' : 'default',
                      animation: `diagrama-peca .4s ${0.06 * i + 0.15}s cubic-bezier(.3,0,.2,1) backwards`,
                    }}>
                    <span style={{ color: cg ? cg.forte : CINZA, display: 'flex' }}>
                      <svg width="30" height="30" viewBox="-11.5 -11.5 23 23"><MiniGlifo nome={pc.rotulo} /></svg>
                    </span>
                    <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.2, textTransform: 'uppercase', lineHeight: 1.15 }}>{pc.rotulo}</span>
                    {pc.total > 0 && (
                      <span style={{ position: 'absolute', top: 3, right: 3, minWidth: 15, height: 15, borderRadius: 999, background: cg!.forte, color: '#fff', fontSize: 9.5, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px' }}>
                        {pc.total}
                      </span>
                    )}
                  </div>
                );
                return chip;
              })}
              {pecas.length === 0 && (
                <div style={{ gridColumn: '1 / -1', fontSize: 12, color: 'var(--portal-text-secondary)', padding: 8 }}>
                  Sem peças cadastradas na taxonomia para este sistema.
                </div>
              )}
            </div>

            {(contZoom?.total || 0) > 0 && onAbrirHistorico && (
              <button onClick={() => onAbrirHistorico(zoom)}
                style={{ margin: 10, marginTop: 0, padding: '9px 12px', border: 'none', background: '#1e40af', color: '#fff', fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}>
                Ver no Histórico de pendências →
              </button>
            )}
          </div>
        )}

        <style>{`
          @keyframes diagrama-painel { from { opacity: 0; transform: translateX(24px) scale(.94); } to { opacity: 1; transform: none; } }
          @keyframes diagrama-peca { from { opacity: 0; transform: translateY(10px) scale(.7); } to { opacity: 1; transform: none; } }
          @media (prefers-reduced-motion: reduce) {
            @keyframes diagrama-painel { from { opacity: 0 } to { opacity: 1 } }
            @keyframes diagrama-peca { from { opacity: 0 } to { opacity: 1 } }
          }
        `}</style>
      </div>
    </div>
  );
}
