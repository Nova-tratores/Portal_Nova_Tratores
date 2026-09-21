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
import { lazy, Suspense, useMemo, useState } from 'react';
import { GRAVIDADE_COR, GRAVIDADE_LABEL, type ContagemGravidade, type Gravidade } from '@/lib/frota/gravidade';
import { SISTEMAS_FORA, type TipoSilhueta } from '@/lib/frota/silhueta';
import { FORMAS_CENAS } from '@/lib/frota/formas-cenas';
import PicapeArte from '@/components/frota/PicapeArte';
import CarroArte from '@/components/frota/CarroArte';
import MunckArte from '@/components/frota/MunckArte';
import CaminhaoArte from '@/components/frota/CaminhaoArte';

// Artes de CENA da picape (vetorizadas de imagens geradas pelo usuário) —
// pesadas (60–190KB cada), então só baixam quando a cena abre (React.lazy)
const PicapeFrenteArte = lazy(() => import('@/components/frota/PicapeFrenteArte'));
const PicapeFrenteMotorArte = lazy(() => import('@/components/frota/PicapeFrenteMotorArte'));
const PicapeTraseiraArte = lazy(() => import('@/components/frota/PicapeTraseiraArte'));
const PicapeInteriorArte = lazy(() => import('@/components/frota/PicapeInteriorArte'));
const RodaArte = lazy(() => import('@/components/frota/RodaArte'));
// Artes de cena do CARRO padrão (hatch/sedã — Fox do usuário), mesmo esquema
const CarroFrenteArte = lazy(() => import('@/components/frota/CarroFrenteArte'));
const CarroFrenteMotorArte = lazy(() => import('@/components/frota/CarroFrenteMotorArte'));
const CarroTraseiraArte = lazy(() => import('@/components/frota/CarroTraseiraArte'));
const CarroInteriorArte = lazy(() => import('@/components/frota/CarroInteriorArte'));
// Artes de cena do CAMINHÃO MUNCK (braço articulado — Cargo do usuário); tem
// uma cena a MAIS que os outros tipos: o close do braço/guindaste
const MunckFrenteArte = lazy(() => import('@/components/frota/MunckFrenteArte'));
const MunckFrenteMotorArte = lazy(() => import('@/components/frota/MunckFrenteMotorArte'));
const MunckTraseiraArte = lazy(() => import('@/components/frota/MunckTraseiraArte'));
const MunckInteriorArte = lazy(() => import('@/components/frota/MunckInteriorArte'));
const MunckBracoArte = lazy(() => import('@/components/frota/MunckBracoArte'));
// Artes de cena do CAMINHÃO comum (basculante do usuário) — mesmo esquema
const CaminhaoFrenteArte = lazy(() => import('@/components/frota/CaminhaoFrenteArte'));
const CaminhaoFrenteMotorArte = lazy(() => import('@/components/frota/CaminhaoFrenteMotorArte'));
const CaminhaoTraseiraArte = lazy(() => import('@/components/frota/CaminhaoTraseiraArte'));
const CaminhaoInteriorArte = lazy(() => import('@/components/frota/CaminhaoInteriorArte'));

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

// ── ANATOMIA INTERNA (modo raio-X) ─────────────────────────────────────────
// No zoom, a carroceria fica translúcida e estas peças aparecem DENTRO do
// carro, no lugar real (referência do usuário: corte esquemático de manual).
// A peça do sistema clicado acende na cor da gravidade do COMPONENTE casado
// (regex no nome, mesma filosofia do resto); as outras ficam em cinza
// fantasma. Coordenadas presas ao traço de cada silhueta.
interface PecaInterna {
  id: string;
  sistema: string;
  /** casa a peça com um componente da taxonomia (pra cor/contagem) */
  casa?: RegExp;
  rotulo: string;
  desenho: React.ReactNode;
  lx: number; ly: number; ax: number; ay: number; // rótulo + âncora da linha-guia
  anchor: 'start' | 'middle' | 'end';
  /** peça DA roda (disco/pneu/amortecedor): desenha por cima das rodas;
   *  as demais ficam atrás — a roda encobre o que invade a caixa dela */
  sobreRoda?: boolean;
}

const T = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const dRadiador = (x: number, y: number) => <g {...T}><rect x={x} y={y} width="13" height="26" rx="2" /><path d={`M${x + 4.5} ${y}v26M${x + 9} ${y}v26`} strokeWidth="1.4" /></g>;
const dMotor = (x: number, y: number) => <g {...T}><rect x={x} y={y + 8} width="42" height="22" rx="2" fill="currentColor" fillOpacity="0.14" /><rect x={x + 8} y={y} width="24" height="8" rx="1.5" /><path d={`M${x + 12} ${y}v-5M${x + 20} ${y}v-5M${x + 28} ${y}v-5`} strokeWidth="1.6" /><circle cx={x - 6} cy={y + 24} r="4.5" /></g>;
const dBateria = (x: number, y: number) => <g {...T}><rect x={x} y={y} width="22" height="13" rx="1.5" fill="currentColor" fillOpacity="0.14" /><path d={`M${x + 4} ${y}v-3M${x + 18} ${y}v-3`} strokeWidth="1.8" /><path d={`M${x + 3.5} ${y + 5}h4M${x + 14.5} ${y + 5}h4M${x + 16.5} ${y + 3}v4`} strokeWidth="1.4" /></g>;
const dFarol = (x: number, y: number) => <g {...T}><path d={`M${x} ${y}a7 6 0 010 12l-6-1v-10z`} fill="currentColor" fillOpacity="0.18" /><path d={`M${x + 9} ${y + 1}l6-2M${x + 10} ${y + 6}h6M${x + 9} ${y + 11}l6 2`} strokeWidth="1.4" /></g>;
const dLanterna = (x: number, y: number) => <g {...T}><rect x={x} y={y} width="8" height="16" rx="2" fill="currentColor" fillOpacity="0.2" /></g>;
const dEscap = (caminho: string, mx: number, my: number) => <g {...T}><path d={caminho} /><rect x={mx} y={my} width="42" height="11" rx="5" fill="currentColor" fillOpacity="0.14" /><path d={`M${mx + 42} ${my + 5.5}h8`} /></g>;
const dTanque = (x: number, y: number) => <g {...T}><rect x={x} y={y} width="44" height="14" rx="6" fill="currentColor" fillOpacity="0.14" /><path d={`M${x + 34} ${y}v-6`} strokeWidth="1.6" /></g>;
const dVolante = (x: number, y: number) => <g {...T}><circle cx={x} cy={y} r="7.5" /><circle cx={x} cy={y} r="2" /><path d={`M${x + 5} ${y + 6}l14 40`} /></g>;
const dBanco = (x: number, y: number) => <g {...T}><path d={`M${x} ${y}a4 4 0 014-4h2a4 4 0 014 4`} /><path d={`M${x + 2} ${y}l3 30h16`} /><path d={`M${x + 5} ${y + 30}l-4 12h24`} /></g>;
const dCambio = (x: number, y: number) => <g {...T}><rect x={x} y={y + 20} width="34" height="13" rx="2" fill="currentColor" fillOpacity="0.14" /><path d={`M${x + 16} ${y + 20}V${y + 2}`} /><circle cx={x + 16} cy={y - 1} r="3.6" fill="currentColor" fillOpacity="0.3" /></g>;
const dAmort = (cx: number, cy: number) => <g {...T}><path d={`M${cx} ${cy}v-6M${cx} ${cy - 28}v-6`} /><path d={`M${cx - 6} ${cy - 6}h12M${cx - 6} ${cy - 28}h12M${cx - 5} ${cy - 6}l10-3.6-10-3.6 10-3.6-10-3.6 10-3.6`} strokeWidth="1.8" /></g>;
const dDisco = (cx: number, cy: number) => <g {...T}><circle cx={cx} cy={cy} r="12" fill="currentColor" fillOpacity="0.12" /><circle cx={cx} cy={cy} r="4.5" /><path d={`M${cx + 8} ${cy - 12}a14 14 0 016 9`} strokeWidth="3.4" /></g>;
const dComp = (x: number, y: number) => <g {...T}><circle cx={x} cy={y} r="7" /><circle cx={x} cy={y} r="2.4" /><path d={`M${x - 7} ${y}h-6`} strokeWidth="1.6" /></g>;
const dAnelRoda = (cx: number, cy: number, r: number) => <g {...T}><circle cx={cx} cy={cy} r={r + 2} strokeWidth="4" /></g>;
const dPortas = (x: number, y: number, w: number, h: number) => <g {...T}><rect x={x} y={y} width={w} height={h} rx="6" strokeDasharray="7 5" /></g>;
const dKit = (x: number, y: number) => <g {...T}><path d={`M${x} ${y}l8 14h-16z`} /><rect x={x + 14} y={y + 2} width="7" height="13" rx="2.5" /></g>;
const dCaixa = (x: number, y: number) => <g {...T}><rect x={x} y={y} width="38" height="20" rx="2" fill="currentColor" fillOpacity="0.12" /><path d={`M${x} ${y + 7}h38`} strokeWidth="1.6" /></g>;
const dCinto = (x: number, y: number) => <g {...T}><path d={`M${x} ${y}l13 26`} strokeWidth="3.4" /><rect x={x + 9} y={y + 20} width="7" height="6" rx="1" fill="currentColor" fillOpacity="0.3" /></g>;

const ANATOMIA_CARRO: PecaInterna[] = [
  { id: 'radiador', sistema: 'Motor', casa: /arrefec|radiador/i, rotulo: 'Radiador', desenho: dRadiador(137, 234), lx: 92, ly: 200, ax: 143, ay: 234, anchor: 'end' },
  { id: 'motor', sistema: 'Motor', casa: /[óo]leo|lubrific/i, rotulo: 'Motor / óleo', desenho: dMotor(152, 222), lx: 172, ly: 182, ax: 180, ay: 226, anchor: 'middle' },
  { id: 'tanque', sistema: 'Motor', casa: /aliment|combust|bomba/i, rotulo: 'Tanque / bomba', desenho: dTanque(482, 278), lx: 504, ly: 330, ax: 504, ay: 292, anchor: 'middle' },
  { id: 'escap', sistema: 'Motor', casa: /escap|catalisador/i, rotulo: 'Escapamento', desenho: dEscap('M204 258 C250 286 380 291 555 291', 555, 285), lx: 312, ly: 322, ax: 340, ay: 290, anchor: 'middle' },
  { id: 'bateria', sistema: 'Elétrica', casa: /bateria/i, rotulo: 'Bateria', desenho: dBateria(208, 224), lx: 262, ly: 176, ax: 222, ay: 224, anchor: 'start' },
  { id: 'farol', sistema: 'Elétrica', casa: /farol|l[aâ]mpada|ilumin/i, rotulo: 'Faróis', desenho: dFarol(128, 238), lx: 66, ly: 288, ax: 126, ay: 248, anchor: 'end' },
  { id: 'lanterna', sistema: 'Elétrica', casa: /farol|l[aâ]mpada|ilumin/i, rotulo: 'Lanterna', desenho: dLanterna(654, 218), lx: 700, ly: 196, ax: 660, ay: 218, anchor: 'start' },
  { id: 'volante', sistema: 'Direção', rotulo: 'Volante / coluna', desenho: dVolante(330, 190), lx: 296, ly: 136, ax: 328, ay: 184, anchor: 'middle' },
  { id: 'banco1', sistema: 'Interior', casa: /banco|estofad/i, rotulo: 'Bancos', desenho: dBanco(390, 208), lx: 430, ly: 132, ax: 398, ay: 204, anchor: 'middle' },
  { id: 'banco2', sistema: 'Interior', casa: /banco|estofad/i, rotulo: '', desenho: dBanco(458, 208), lx: 0, ly: 0, ax: 0, ay: 0, anchor: 'middle' },
  { id: 'cinto', sistema: 'Itens de segurança', casa: /cinto/i, rotulo: 'Cintos', desenho: dCinto(388, 210), lx: 360, ly: 128, ax: 392, ay: 208, anchor: 'middle' },
  { id: 'kit', sistema: 'Itens de segurança', casa: /extintor|tri[aâ]ngulo|macaco/i, rotulo: 'Kit (extintor/triângulo)', desenho: dKit(596, 240), lx: 520, ly: 322, ax: 600, ay: 252, anchor: 'middle' },
  { id: 'cambio', sistema: 'Transmissão', casa: /c[aâ]mbio/i, rotulo: 'Câmbio', desenho: dCambio(342, 240), lx: 320, ly: 334, ax: 356, ay: 272, anchor: 'middle' },
  { id: 'amort1', sistema: 'Suspensão', casa: /amortecedor|mola/i, rotulo: 'Amortecedores', desenho: dAmort(212, 258), lx: 152, ly: 330, ax: 208, ay: 244, anchor: 'middle', sobreRoda: true },
  { id: 'amort2', sistema: 'Suspensão', casa: /amortecedor|mola/i, rotulo: '', desenho: dAmort(560, 258), lx: 0, ly: 0, ax: 0, ay: 0, anchor: 'middle', sobreRoda: true },
  { id: 'disco1', sistema: 'Freios', casa: /disco|pastilha|hidr[aá]ulica/i, rotulo: 'Discos / pastilhas', desenho: dDisco(212, 272), lx: 132, ly: 328, ax: 202, ay: 278, anchor: 'middle', sobreRoda: true },
  { id: 'disco2', sistema: 'Freios', casa: /disco|pastilha|hidr[aá]ulica/i, rotulo: '', desenho: dDisco(560, 272), lx: 0, ly: 0, ax: 0, ay: 0, anchor: 'middle', sobreRoda: true },
  { id: 'comp', sistema: 'Ar-condicionado', rotulo: 'Compressor', desenho: dComp(174, 258), lx: 166, ly: 300, ax: 192, ay: 256, anchor: 'middle' },
  { id: 'pneu1', sistema: 'Rodas e Pneus', casa: /pneu/i, rotulo: 'Pneus', desenho: dAnelRoda(212, 272, 33), lx: 268, ly: 330, ax: 232, ay: 296, anchor: 'middle', sobreRoda: true },
  { id: 'pneu2', sistema: 'Rodas e Pneus', casa: /pneu/i, rotulo: '', desenho: dAnelRoda(560, 272, 33), lx: 0, ly: 0, ax: 0, ay: 0, anchor: 'middle', sobreRoda: true },
  { id: 'portas', sistema: 'Carroceria', casa: /lataria|porta|ma[çc]aneta/i, rotulo: 'Portas / lataria', desenho: dPortas(300, 208, 214, 62), lx: 560, ly: 168, ax: 512, ay: 212, anchor: 'middle' },
  { id: 'malas', sistema: 'Outros', rotulo: 'Porta-malas', desenho: dCaixa(598, 230), lx: 616, ly: 170, ax: 616, ay: 230, anchor: 'middle' },
];

const ANATOMIA_HATCH: PecaInterna[] = [
  { id: 'radiador', sistema: 'Motor', casa: /arrefec|radiador/i, rotulo: 'Radiador', desenho: dRadiador(158, 236), lx: 108, ly: 202, ax: 164, ay: 236, anchor: 'end' },
  { id: 'motor', sistema: 'Motor', casa: /[óo]leo|lubrific/i, rotulo: 'Motor / óleo', desenho: dMotor(172, 224), lx: 192, ly: 186, ax: 200, ay: 228, anchor: 'middle' },
  { id: 'tanque', sistema: 'Motor', casa: /aliment|combust|bomba/i, rotulo: 'Tanque / bomba', desenho: dTanque(428, 278), lx: 450, ly: 330, ax: 450, ay: 292, anchor: 'middle' },
  { id: 'escap', sistema: 'Motor', casa: /escap|catalisador/i, rotulo: 'Escapamento', desenho: dEscap('M222 260 C260 286 340 291 468 291', 468, 285), lx: 318, ly: 322, ax: 340, ay: 290, anchor: 'middle' },
  { id: 'bateria', sistema: 'Elétrica', casa: /bateria/i, rotulo: 'Bateria', desenho: dBateria(222, 226), lx: 276, ly: 180, ax: 236, ay: 226, anchor: 'start' },
  { id: 'farol', sistema: 'Elétrica', casa: /farol|l[aâ]mpada|ilumin/i, rotulo: 'Faróis', desenho: dFarol(156, 240), lx: 96, ly: 290, ax: 154, ay: 250, anchor: 'end' },
  { id: 'lanterna', sistema: 'Elétrica', casa: /farol|l[aâ]mpada|ilumin/i, rotulo: 'Lanterna', desenho: dLanterna(538, 216), lx: 584, ly: 194, ax: 544, ay: 216, anchor: 'start' },
  { id: 'volante', sistema: 'Direção', rotulo: 'Volante / coluna', desenho: dVolante(328, 188), lx: 294, ly: 134, ax: 326, ay: 182, anchor: 'middle' },
  { id: 'banco1', sistema: 'Interior', casa: /banco|estofad/i, rotulo: 'Bancos', desenho: dBanco(392, 206), lx: 432, ly: 130, ax: 400, ay: 202, anchor: 'middle' },
  { id: 'banco2', sistema: 'Interior', casa: /banco|estofad/i, rotulo: '', desenho: dBanco(450, 206), lx: 0, ly: 0, ax: 0, ay: 0, anchor: 'middle' },
  { id: 'cinto', sistema: 'Itens de segurança', casa: /cinto/i, rotulo: 'Cintos', desenho: dCinto(390, 208), lx: 362, ly: 126, ax: 394, ay: 206, anchor: 'middle' },
  { id: 'kit', sistema: 'Itens de segurança', casa: /extintor|tri[aâ]ngulo|macaco/i, rotulo: 'Kit (extintor/triângulo)', desenho: dKit(500, 238), lx: 452, ly: 322, ax: 504, ay: 250, anchor: 'middle' },
  { id: 'cambio', sistema: 'Transmissão', casa: /c[aâ]mbio/i, rotulo: 'Câmbio', desenho: dCambio(340, 240), lx: 318, ly: 334, ax: 354, ay: 272, anchor: 'middle' },
  { id: 'amort1', sistema: 'Suspensão', casa: /amortecedor|mola/i, rotulo: 'Amortecedores', desenho: dAmort(212, 258), lx: 152, ly: 330, ax: 208, ay: 244, anchor: 'middle', sobreRoda: true },
  { id: 'amort2', sistema: 'Suspensão', casa: /amortecedor|mola/i, rotulo: '', desenho: dAmort(490, 258), lx: 0, ly: 0, ax: 0, ay: 0, anchor: 'middle', sobreRoda: true },
  { id: 'disco1', sistema: 'Freios', casa: /disco|pastilha|hidr[aá]ulica/i, rotulo: 'Discos / pastilhas', desenho: dDisco(212, 272), lx: 132, ly: 328, ax: 202, ay: 278, anchor: 'middle', sobreRoda: true },
  { id: 'disco2', sistema: 'Freios', casa: /disco|pastilha|hidr[aá]ulica/i, rotulo: '', desenho: dDisco(490, 272), lx: 0, ly: 0, ax: 0, ay: 0, anchor: 'middle', sobreRoda: true },
  { id: 'comp', sistema: 'Ar-condicionado', rotulo: 'Compressor', desenho: dComp(176, 258), lx: 176, ly: 302, ax: 202, ay: 258, anchor: 'middle' },
  { id: 'pneu1', sistema: 'Rodas e Pneus', casa: /pneu/i, rotulo: 'Pneus', desenho: dAnelRoda(212, 272, 33), lx: 268, ly: 330, ax: 232, ay: 296, anchor: 'middle', sobreRoda: true },
  { id: 'pneu2', sistema: 'Rodas e Pneus', casa: /pneu/i, rotulo: '', desenho: dAnelRoda(490, 272, 33), lx: 0, ly: 0, ax: 0, ay: 0, anchor: 'middle', sobreRoda: true },
  { id: 'portas', sistema: 'Carroceria', casa: /lataria|porta|ma[çc]aneta/i, rotulo: 'Portas / lataria', desenho: dPortas(298, 206, 160, 62), lx: 520, ly: 168, ax: 458, ay: 210, anchor: 'middle' },
  { id: 'malas', sistema: 'Outros', rotulo: 'Porta-malas', desenho: dCaixa(492, 228), lx: 510, ly: 168, ax: 510, ay: 228, anchor: 'middle' },
];

// exportado só pra render de verificação (scripts de preview)
export const ANATOMIAS: Partial<Record<TipoSilhueta, PecaInterna[]>> = {
  carro: ANATOMIA_CARRO, hatch: ANATOMIA_HATCH,
};

// ── CENAS DE PONTO DE VISTA ────────────────────────────────────────────────
// Pedido do usuário: clicar na frente do carro leva pra VISÃO de quem está
// parado NA FRENTE com o capô aberto (e assim por diante) — não só o zoom da
// lateral. Cada sistema mapeia pra uma cena desenhada: frente (capô aberto),
// cabine, conjunto de roda e traseira (porta-malas). A lateral se afasta com
// o zoom + fade e a cena entra crescendo — o "andar até lá" da transição.
// Peças de OUTROS sistemas aparecem em fantasma e são CLICÁVEIS (trocam a
// cena — clicou na bateria dentro da cabine? vai pra frente/Elétrica).
interface Cena {
  titulo: string; viewBox: string; fundo: React.ReactNode; pecas: PecaInterna[];
  /** fundo é ARTE detalhada (picape): as peças são PINTADAS por baixo do
   *  traço (camada .cena-baixo) em vez de desenhadas por cima */
  arte?: boolean;
}

const CENA_FRENTE: Cena = {
  titulo: 'Frente — capô aberto',
  viewBox: '0 0 800 520',
  fundo: (
    <>
      {/* rodas espiando por baixo */}
      <rect x="92" y="380" width="74" height="96" rx="16" fill="currentColor" />
      <rect x="634" y="380" width="74" height="96" rx="16" fill="currentColor" />
      {/* corpo frontal */}
      <path fill="currentColor" d="M108 448 C100 448 96 442 96 434 V252 C96 220 112 200 146 194 L654 194 C688 200 704 220 704 252 V434 C704 442 700 448 692 448 Z" />
      {/* vão do cofre + faróis + grade + placa (na cor do card, como os vidros) */}
      <rect x="200" y="206" width="400" height="128" rx="8" fill={BG} />
      <rect x="146" y="348" width="96" height="42" rx="12" fill={BG} />
      <rect x="558" y="348" width="96" height="42" rx="12" fill={BG} />
      <rect x="300" y="352" width="200" height="10" rx="5" fill={BG} />
      <rect x="300" y="370" width="200" height="10" rx="5" fill={BG} />
      <rect x="352" y="400" width="96" height="32" rx="4" fill={BG} />
      {/* capô ABERTO (visto por baixo) + escora */}
      <path fill="currentColor" d="M192 178 L608 178 L556 44 C554 38 550 36 544 36 L256 36 C250 36 246 38 244 44 Z" />
      <path d="M262 62 L538 62 L576 160 L224 160 Z" fill={BG} opacity="0.35" />
      <path d="M598 190 L560 60" stroke="currentColor" strokeWidth="7" strokeLinecap="round" fill="none" />
    </>
  ),
  pecas: [
    { id: 'radiador', sistema: 'Motor', casa: /arrefec|radiador/i, rotulo: 'Radiador', lx: 104, ly: 322, ax: 312, ay: 312, anchor: 'end',
      desenho: <g {...T} strokeWidth="3.2"><rect x="308" y="296" width="184" height="32" rx="4" /><path d="M330 296v32M352 296v32M374 296v32M396 296v32M418 296v32M440 296v32M462 296v32" strokeWidth="1.8" /></g> },
    { id: 'motor', sistema: 'Motor', casa: /[óo]leo|lubrific/i, rotulo: 'Motor / óleo', lx: 122, ly: 216, ax: 332, ay: 236, anchor: 'end',
      desenho: <g {...T} strokeWidth="3.2"><rect x="330" y="234" width="140" height="54" rx="5" fill="currentColor" fillOpacity="0.12" /><rect x="344" y="210" width="112" height="24" rx="4" /><path d="M362 210v-8M394 210v-8M426 210v-8" strokeWidth="2.4" /><circle cx="366" cy="222" r="6" /><circle cx="494" cy="238" r="15" /><circle cx="500" cy="276" r="10" /><path d="M480 230 C470 244 472 262 490 268" strokeWidth="2" /></g> },
    { id: 'bateria', sistema: 'Elétrica', casa: /bateria/i, rotulo: 'Bateria', lx: 104, ly: 130, ax: 232, ay: 218, anchor: 'end',
      desenho: <g {...T} strokeWidth="3.2"><rect x="216" y="216" width="72" height="46" rx="4" fill="currentColor" fillOpacity="0.12" /><path d="M228 216v-8M276 216v-8" strokeWidth="2.6" /><path d="M228 234h14M258 234h14M265 227v14" strokeWidth="2.2" /></g> },
    { id: 'fusiveis', sistema: 'Elétrica', casa: /chicote|fus[ií]vel|rel[eé]/i, rotulo: 'Fusíveis', lx: 705, ly: 130, ax: 572, ay: 216, anchor: 'start',
      desenho: <g {...T} strokeWidth="3.2"><rect x="518" y="212" width="66" height="44" rx="5" /><path d="M556 218l-12 14h10l-12 14" strokeWidth="2.4" /></g> },
    { id: 'farois', sistema: 'Elétrica', casa: /farol|l[aâ]mpada|ilumin/i, rotulo: 'Faróis', lx: 705, ly: 430, ax: 620, ay: 372, anchor: 'start',
      desenho: <g {...T} strokeWidth="3"><circle cx="194" cy="369" r="15" /><path d="M212 362l12-5M214 369h13M212 376l12 5" strokeWidth="2" /><circle cx="606" cy="369" r="15" /><path d="M588 362l-12-5M586 369h-13M588 376l-12 5" strokeWidth="2" /></g> },
    { id: 'compressor', sistema: 'Ar-condicionado', rotulo: 'Compressor', lx: 122, ly: 402, ax: 252, ay: 302, anchor: 'end',
      desenho: <g {...T} strokeWidth="3.2"><circle cx="256" cy="298" r="17" /><circle cx="256" cy="298" r="6" /><path d="M239 298h-12" strokeWidth="2.2" /></g> },
  ],
};

const CENA_CABINE: Cena = {
  titulo: 'Cabine',
  viewBox: '0 0 800 520',
  fundo: (
    <>
      {/* moldura do para-brisa + vidro */}
      <path fill="currentColor" fillRule="evenodd" d="M96 36 L704 36 L662 166 L138 166 Z M136 54 L664 54 L632 148 L168 148 Z" />
      <rect x="356" y="60" width="88" height="28" rx="6" fill="currentColor" />
      {/* painel */}
      <rect x="106" y="164" width="588" height="74" rx="10" fill="currentColor" />
      <rect x="178" y="176" width="146" height="48" rx="8" fill={BG} />
      <rect x="348" y="178" width="46" height="20" rx="4" fill={BG} />
      <rect x="406" y="178" width="46" height="20" rx="4" fill={BG} />
      {/* console central */}
      <rect x="366" y="236" width="68" height="150" rx="8" fill="currentColor" />
      {/* bancos */}
      <rect x="188" y="284" width="90" height="42" rx="14" fill="currentColor" />
      <rect x="148" y="318" width="176" height="184" rx="22" fill="currentColor" />
      <rect x="522" y="284" width="90" height="42" rx="14" fill="currentColor" />
      <rect x="478" y="318" width="176" height="184" rx="22" fill="currentColor" />
    </>
  ),
  pecas: [
    { id: 'volante', sistema: 'Direção', rotulo: 'Volante / coluna', lx: 152, ly: 452, ax: 210, ay: 310, anchor: 'end',
      desenho: <g {...T} strokeWidth="3.4"><circle cx="250" cy="270" r="56" strokeWidth="9" /><circle cx="250" cy="270" r="15" /><path d="M196 262h39M304 262h-39M250 285v38" strokeWidth="6" /></g> },
    { id: 'painelinstr', sistema: 'Elétrica', casa: /painel|instrumento/i, rotulo: 'Instrumentos', lx: 138, ly: 110, ax: 196, ay: 184, anchor: 'end',
      desenho: <g {...T} strokeWidth="2.6"><circle cx="222" cy="200" r="17" /><path d="M222 200l8-9" /><circle cx="280" cy="200" r="17" /><path d="M280 200l8-9" /></g> },
    { id: 'vents', sistema: 'Ar-condicionado', rotulo: 'Difusores', lx: 700, ly: 110, ax: 452, ay: 186, anchor: 'start',
      desenho: <g {...T} strokeWidth="2.2"><path d="M352 183h38M352 190h38M410 183h38M410 190h38" /></g> },
    { id: 'cambio', sistema: 'Transmissão', casa: /c[aâ]mbio|manopla/i, rotulo: 'Câmbio', lx: 400, ly: 462, ax: 400, ay: 322, anchor: 'middle',
      desenho: <g {...T} strokeWidth="3.4"><circle cx="400" cy="272" r="13" fill="currentColor" fillOpacity="0.25" /><path d="M400 285v33" strokeWidth="5" /><path d="M383 320a17 8 0 0034 0" /></g> },
    { id: 'bancos', sistema: 'Interior', casa: /banco|estofad/i, rotulo: 'Bancos', lx: 716, ly: 290, ax: 610, ay: 350, anchor: 'start',
      desenho: <g {...T} strokeWidth="3.4"><rect x="148" y="318" width="176" height="184" rx="22" /><rect x="188" y="284" width="90" height="42" rx="14" /><rect x="478" y="318" width="176" height="184" rx="22" /><rect x="522" y="284" width="90" height="42" rx="14" /></g> },
    { id: 'cinto', sistema: 'Itens de segurança', casa: /cinto/i, rotulo: 'Cintos', lx: 112, ly: 502, ax: 208, ay: 400, anchor: 'end',
      desenho: <g {...T}><path d="M182 330 L268 474" strokeWidth="7" /><rect x="248" y="436" width="22" height="18" rx="3" fill="currentColor" fillOpacity="0.3" /></g> },
  ],
};

const CENA_TRASEIRA: Cena = {
  titulo: 'Traseira — porta-malas',
  viewBox: '0 0 800 520',
  fundo: (
    <>
      <rect x="120" y="446" width="80" height="30" rx="8" fill="currentColor" />
      <rect x="600" y="446" width="80" height="30" rx="8" fill="currentColor" />
      {/* corpo traseiro */}
      <path fill="currentColor" d="M112 452 C104 452 100 446 100 438 V240 C100 212 114 196 142 190 L658 190 C686 196 700 212 700 240 V438 C700 446 696 452 688 452 Z" />
      {/* vão do porta-malas + lanternas + placa */}
      <rect x="196" y="202" width="408" height="138" rx="8" fill={BG} />
      <rect x="144" y="212" width="42" height="66" rx="8" fill={BG} />
      <rect x="614" y="212" width="42" height="66" rx="8" fill={BG} />
      <rect x="350" y="382" width="100" height="36" rx="4" fill={BG} />
      <path d="M120 360 H680" stroke={BG} strokeWidth="6" fill="none" />
      {/* tampa aberta + amortecedores da tampa */}
      <path fill="currentColor" d="M196 174 L604 174 L558 44 C556 38 552 36 546 36 L254 36 C248 36 244 38 242 44 Z" />
      <path d="M262 60 L538 60 L574 156 L226 156 Z" fill={BG} opacity="0.35" />
      <path d="M214 186 L250 62 M586 186 L550 62" stroke="currentColor" strokeWidth="6" strokeLinecap="round" fill="none" />
    </>
  ),
  pecas: [
    { id: 'caixa', sistema: 'Outros', rotulo: 'Porta-malas / carga', lx: 400, ly: 500, ax: 412, ay: 322, anchor: 'middle',
      desenho: <g {...T} strokeWidth="3.4"><rect x="362" y="238" width="104" height="84" rx="4" fill="currentColor" fillOpacity="0.1" /><path d="M362 268h104" strokeWidth="2.4" /><path d="M396 238v-12a8 8 0 018-8h20a8 8 0 018 8v12" strokeWidth="2.4" /></g> },
    { id: 'estepe', sistema: 'Rodas e Pneus', casa: /estepe|pneu/i, rotulo: 'Estepe', lx: 72, ly: 420, ax: 246, ay: 300, anchor: 'end',
      desenho: <g {...T}><circle cx="272" cy="268" r="48" strokeWidth="18" /><circle cx="272" cy="268" r="14" strokeWidth="3" />{[-90, 30, 150].map((a) => { const rad = a * Math.PI / 180; return <path key={a} d={`M${272 + 15 * Math.cos(rad)} ${268 + 15 * Math.sin(rad)}L${272 + 34 * Math.cos(rad)} ${268 + 34 * Math.sin(rad)}`} strokeWidth="5" />; })}</g> },
    { id: 'kit', sistema: 'Itens de segurança', casa: /extintor|tri[aâ]ngulo|macaco/i, rotulo: 'Kit segurança', lx: 645, ly: 420, ax: 562, ay: 306, anchor: 'start',
      desenho: <g {...T} strokeWidth="3"><path d="M520 314l17-30 17 30z" /><rect x="562" y="266" width="18" height="46" rx="6" /><path d="M566 266v-8h10v8M572 258l12-5" strokeWidth="2.2" /></g> },
    { id: 'lanternas', sistema: 'Elétrica', casa: /lanterna|farol|l[aâ]mpada|ilumin/i, rotulo: 'Lanternas', lx: 695, ly: 170, ax: 646, ay: 240, anchor: 'start',
      desenho: <g {...T} strokeWidth="3"><rect x="150" y="218" width="30" height="54" rx="6" /><path d="M156 232h18M156 246h18M156 260h18" strokeWidth="2" /><rect x="620" y="218" width="30" height="54" rx="6" /><path d="M626 232h18M626 246h18M626 260h18" strokeWidth="2" /></g> },
  ],
};

// ── CENAS DA PICAPE: as ARTES DO USUÁRIO ───────────────────────────────────
// Quatro vistas vetorizadas pelo próprio usuário (cofre aberto, frente,
// traseira com caçamba e cabine). Sobre arte detalhada NÃO se desenha peça
// por cima: como a arte é traço sobre fundo claro, a peça é PINTADA por uma
// mancha de cor POR BAIXO do traço (`pt-fill`, camada .cena-baixo) — o branco
// da peça "recebe tinta" e as linhas ficam por cima. O mesmo shape vira a
// área clicável invisível na camada de cima (`pt-fill` some via CSS e o
// `pt-hit` transparente pega o clique). Coordenadas presas ao traço
// (viewBox 0 0 1408 768), conferidas por render.
const marca = (x: number, y: number, w: number, h: number, rx = 24) => (
  <g>
    <rect className="pt-fill" fill="currentColor" x={x} y={y} width={w} height={h} rx={rx} />
    <rect className="pt-hit" fill="transparent" x={x} y={y} width={w} height={h} rx={rx} />
  </g>
);
const marcaO = (cx: number, cy: number, rx: number, ry: number) => (
  <g>
    <ellipse className="pt-fill" fill="currentColor" cx={cx} cy={cy} rx={rx} ry={ry} />
    <ellipse className="pt-hit" fill="transparent" cx={cx} cy={cy} rx={rx} ry={ry} />
  </g>
);

const CENA_P_MOTOR: Cena = {
  titulo: 'Cofre do motor — capô aberto',
  viewBox: '0 0 1408 768',
  arte: true,
  fundo: <Suspense fallback={null}><PicapeFrenteMotorArte /></Suspense>,
  pecas: [
    { id: 'motor', sistema: 'Motor', casa: /[óo]leo|lubrific/i, rotulo: 'Motor / óleo', lx: 1330, ly: 160, ax: 828, ay: 235, anchor: 'end', desenho: marca(555, 185, 270, 200, 20) },
    { id: 'filtro', sistema: 'Motor', casa: /aliment|combust|bomba|filtro/i, rotulo: 'Filtro de ar', lx: 30, ly: 320, ax: 245, ay: 305, anchor: 'start', desenho: marca(238, 240, 330, 155, 18) },
    { id: 'radiador', sistema: 'Motor', casa: /arrefec|radiador/i, rotulo: 'Radiador', lx: 300, ly: 745, ax: 450, ay: 540, anchor: 'middle', desenho: marca(352, 478, 710, 85, 30) },
    { id: 'reservarrefec', sistema: 'Motor', casa: /arrefec|reservat/i, rotulo: 'Reserv. arrefecimento', lx: 30, ly: 160, ax: 278, ay: 210, anchor: 'start', desenho: marca(272, 185, 75, 85, 18) },
    { id: 'escapcofre', sistema: 'Motor', casa: /escap|coletor/i, rotulo: 'Coletor / escape', lx: 30, ly: 470, ax: 495, ay: 462, anchor: 'start', desenho: marcaO(530, 455, 55, 45) },
    { id: 'bateria', sistema: 'Elétrica', casa: /bateria/i, rotulo: 'Bateria', lx: 1330, ly: 660, ax: 1130, ay: 480, anchor: 'end', desenho: marca(925, 372, 260, 120, 18) },
    { id: 'fusiveis', sistema: 'Elétrica', casa: /fus[ií]vel|rel[eé]|chicote/i, rotulo: 'Fusíveis / relés', lx: 1330, ly: 30, ax: 1085, ay: 240, anchor: 'end', desenho: marca(1002, 232, 145, 112, 16) },
    { id: 'alternador', sistema: 'Elétrica', casa: /partida|arranque|alternador|correia/i, rotulo: 'Alternador / correia', lx: 1010, ly: 745, ax: 748, ay: 440, anchor: 'middle', desenho: marcaO(735, 385, 60, 60) },
    { id: 'palhetas', sistema: 'Elétrica', casa: /palheta|limpador/i, rotulo: 'Palhetas', lx: 700, ly: 30, ax: 700, ay: 50, anchor: 'middle', desenho: marca(485, 15, 610, 82, 20) },
    { id: 'reservlimpador', sistema: 'Elétrica', casa: /limpador|reservat/i, rotulo: 'Reserv. do limpador', lx: 30, ly: 620, ax: 235, ay: 478, anchor: 'start', desenho: marcaO(255, 430, 70, 55) },
    { id: 'cilindrofreio', sistema: 'Freios', casa: /fluido|hidr[aá]ulica|cilindro/i, rotulo: 'Cilindro de freio', lx: 1330, ly: 480, ax: 952, ay: 262, anchor: 'end', desenho: marcaO(905, 245, 58, 58) },
    { id: 'escoras', sistema: 'Carroceria', casa: /capo|cap[oô]|dobradi[çc]|lataria/i, rotulo: 'Escoras do capô', lx: 90, ly: 30, ax: 240, ay: 110, anchor: 'start', desenho: <g>{marca(205, 20, 80, 235, 26)}{marca(1025, 20, 85, 235, 26)}</g> },
    { id: 'gradecofre', sistema: 'Carroceria', casa: /grade|lataria/i, rotulo: 'Grade', lx: 700, ly: 745, ax: 690, ay: 700, anchor: 'middle', desenho: marca(245, 585, 885, 160, 30) },
    { id: 'faroiscofre', sistema: 'Elétrica', casa: /farol|l[aâ]mpada|ilumin/i, rotulo: 'Faróis', lx: 30, ly: 720, ax: 130, ay: 645, anchor: 'start', desenho: <g>{marca(90, 575, 145, 85, 20)}{marca(1128, 575, 145, 85, 20)}</g> },
  ],
};

const CENA_P_FRENTE: Cena = {
  titulo: 'Frente',
  viewBox: '0 0 1408 768',
  arte: true,
  fundo: <Suspense fallback={null}><PicapeFrenteArte /></Suspense>,
  pecas: [
    { id: 'parabrisa', sistema: 'Carroceria', casa: /vidro|para.?brisa/i, rotulo: 'Para-brisa', lx: 700, ly: 32, ax: 700, ay: 62, anchor: 'middle', desenho: marca(415, 58, 545, 160, 20) },
    { id: 'palhetasf', sistema: 'Elétrica', casa: /palheta|limpador/i, rotulo: 'Palhetas', lx: 1350, ly: 200, ax: 932, ay: 230, anchor: 'end', desenho: marca(455, 212, 480, 40, 14) },
    { id: 'capo', sistema: 'Carroceria', casa: /capo|cap[oô]/i, rotulo: 'Capô', lx: 1350, ly: 300, ax: 1008, ay: 268, anchor: 'end', desenho: marca(345, 230, 665, 75, 20) },
    { id: 'lataria', sistema: 'Carroceria', casa: /lataria|funilaria|pintura|amassad|para.?lama|carroceria/i, rotulo: 'Lataria / para-lamas', lx: 20, ly: 258, ax: 300, ay: 295, anchor: 'start', desenho: <g>{marca(250, 230, 210, 290, 24)}{marca(945, 230, 215, 290, 24)}</g> },
    { id: 'retrovisores', sistema: 'Carroceria', casa: /retrovisor|espelho/i, rotulo: 'Retrovisores', lx: 20, ly: 180, ax: 270, ay: 225, anchor: 'start', desenho: <g>{marca(265, 198, 98, 92, 16)}{marca(1012, 198, 90, 92, 16)}</g> },
    { id: 'parachoque', sistema: 'Carroceria', casa: /para.?choque/i, rotulo: 'Para-choque', lx: 1350, ly: 520, ax: 1085, ay: 490, anchor: 'end', desenho: marca(398, 440, 690, 128, 24) },
    { id: 'farois', sistema: 'Elétrica', casa: /farol|l[aâ]mpada|ilumin/i, rotulo: 'Faróis', lx: 30, ly: 330, ax: 408, ay: 348, anchor: 'start', desenho: <g>{marca(405, 303, 85, 95, 16)}{marca(928, 303, 85, 95, 16)}</g> },
    { id: 'grade', sistema: 'Motor', casa: /arrefec|radiador/i, rotulo: 'Grade / radiador', lx: 1350, ly: 400, ax: 886, ay: 368, anchor: 'end', desenho: marca(508, 293, 380, 145, 24) },
    { id: 'suspdiant', sistema: 'Suspensão', casa: /amortecedor|mola|bandeja|barra|pivô|piv[oô]/i, rotulo: 'Suspensão dianteira', lx: 700, ly: 745, ax: 700, ay: 665, anchor: 'middle', desenho: marca(438, 545, 540, 118, 20) },
    { id: 'pneus', sistema: 'Rodas e Pneus', casa: /pneu/i, rotulo: 'Pneus', lx: 30, ly: 560, ax: 355, ay: 555, anchor: 'start', desenho: <g>{marca(348, 415, 158, 285, 40)}{marca(962, 415, 158, 285, 40)}</g> },
  ],
};

const CENA_P_TRASEIRA: Cena = {
  titulo: 'Traseira — caçamba',
  viewBox: '0 0 1408 768',
  arte: true,
  fundo: <Suspense fallback={null}><PicapeTraseiraArte /></Suspense>,
  pecas: [
    { id: 'luzfreio', sistema: 'Elétrica', casa: /luz|l[aâ]mpada|lanterna|ilumin/i, rotulo: 'Luz de freio', lx: 1330, ly: 40, ax: 742, ay: 50, anchor: 'end', desenho: marca(635, 32, 105, 35, 12) },
    { id: 'vidrotras', sistema: 'Carroceria', casa: /vidro/i, rotulo: 'Vidro traseiro', lx: 60, ly: 60, ax: 435, ay: 120, anchor: 'start', desenho: marca(430, 70, 505, 118, 18) },
    { id: 'lataria', sistema: 'Carroceria', casa: /lataria|funilaria|pintura|amassad|para.?lama|carroceria/i, rotulo: 'Lataria / para-lamas', lx: 60, ly: 190, ax: 352, ay: 250, anchor: 'start', desenho: <g>{marca(300, 190, 110, 290, 20)}{marca(1000, 190, 110, 290, 20)}</g> },
    { id: 'cacamba', sistema: 'Outros', rotulo: 'Caçamba / carga', lx: 340, ly: 32, ax: 520, ay: 240, anchor: 'middle', desenho: marca(410, 235, 578, 210, 18) },
    { id: 'tampa', sistema: 'Carroceria', casa: /porta|fechadura|trava/i, rotulo: 'Tampa / fechadura', lx: 1330, ly: 250, ax: 742, ay: 275, anchor: 'end', desenho: marca(650, 250, 90, 55, 12) },
    { id: 'lanternas', sistema: 'Elétrica', casa: /lanterna|farol|ilumin/i, rotulo: 'Lanternas', lx: 60, ly: 320, ax: 370, ay: 330, anchor: 'start', desenho: <g>{marca(368, 265, 55, 135, 12)}{marca(995, 265, 55, 135, 12)}</g> },
    { id: 'parachoquetras', sistema: 'Carroceria', casa: /para.?choque/i, rotulo: 'Para-choque', lx: 60, ly: 480, ax: 350, ay: 505, anchor: 'start', desenho: marca(345, 462, 715, 100, 20) },
    { id: 'susptras', sistema: 'Suspensão', casa: /mola|feixe|amortecedor/i, rotulo: 'Suspensão traseira', lx: 60, ly: 640, ax: 472, ay: 600, anchor: 'start', desenho: <g>{marca(470, 560, 75, 85, 14)}{marca(860, 560, 75, 85, 14)}</g> },
    { id: 'engate', sistema: 'Outros', casa: /engate|reboque/i, rotulo: 'Engate de reboque', lx: 700, ly: 745, ax: 700, ay: 645, anchor: 'middle', desenho: marcaO(700, 595, 65, 48) },
    { id: 'escapamento', sistema: 'Motor', casa: /escap/i, rotulo: 'Escapamento', lx: 1330, ly: 590, ax: 1015, ay: 570, anchor: 'end', desenho: marcaO(960, 565, 55, 32) },
    { id: 'pneustras', sistema: 'Rodas e Pneus', casa: /pneu/i, rotulo: 'Pneus', lx: 1330, ly: 700, ax: 1052, ay: 672, anchor: 'end', desenho: <g>{marca(355, 610, 95, 130, 30)}{marca(950, 610, 100, 130, 30)}</g> },
  ],
};

const CENA_P_INTERIOR: Cena = {
  titulo: 'Cabine',
  viewBox: '0 0 1408 768',
  arte: true,
  fundo: <Suspense fallback={null}><PicapeInteriorArte /></Suspense>,
  pecas: [
    { id: 'retrovint', sistema: 'Carroceria', casa: /retrovisor|espelho/i, rotulo: 'Retrovisor interno', lx: 830, ly: 40, ax: 815, ay: 45, anchor: 'start', desenho: marca(638, 28, 175, 52, 12) },
    { id: 'cintos', sistema: 'Itens de segurança', casa: /cinto/i, rotulo: 'Cintos', lx: 1330, ly: 100, ax: 1205, ay: 100, anchor: 'end', desenho: <g>{marca(225, 30, 60, 145, 18)}{marca(1202, 35, 72, 170, 18)}</g> },
    { id: 'volante', sistema: 'Direção', rotulo: 'Volante / coluna', lx: 60, ly: 110, ax: 335, ay: 210, anchor: 'start', desenho: marcaO(430, 300, 140, 132) },
    { id: 'instrumentos', sistema: 'Elétrica', casa: /painel|instrumento/i, rotulo: 'Instrumentos', lx: 60, ly: 32, ax: 425, ay: 230, anchor: 'start', desenho: marca(370, 225, 180, 65, 12) },
    { id: 'multimidia', sistema: 'Elétrica', casa: /som|multim|r[aá]dio/i, rotulo: 'Multimídia', lx: 500, ly: 32, ax: 668, ay: 256, anchor: 'middle', desenho: marca(655, 252, 170, 95, 10) },
    { id: 'difusores', sistema: 'Ar-condicionado', rotulo: 'Difusores do ar', lx: 1330, ly: 200, ax: 884, ay: 280, anchor: 'end', desenho: <g>{marca(606, 248, 54, 92, 10)}{marca(826, 248, 58, 92, 10)}</g> },
    { id: 'clima', sistema: 'Ar-condicionado', rotulo: 'Controles do ar', lx: 1330, ly: 310, ax: 825, ay: 420, anchor: 'end', desenho: marca(650, 395, 175, 55, 12) },
    { id: 'portaluvas', sistema: 'Interior', casa: /porta.?luvas|painel/i, rotulo: 'Porta-luvas', lx: 1330, ly: 480, ax: 1165, ay: 425, anchor: 'end', desenho: marca(845, 378, 320, 95, 14) },
    { id: 'cambio', sistema: 'Transmissão', casa: /c[aâ]mbio|manopla/i, rotulo: 'Câmbio', lx: 1330, ly: 580, ax: 790, ay: 520, anchor: 'end', desenho: marca(655, 435, 135, 200, 24) },
    { id: 'pedais', sistema: 'Freios', casa: /pedal|fluido|hidr[aá]ulica/i, rotulo: 'Pedais', lx: 60, ly: 560, ax: 462, ay: 512, anchor: 'start', desenho: marca(458, 480, 115, 65, 14) },
    { id: 'portavidros', sistema: 'Carroceria', casa: /porta|trava|fechadura|vidro/i, rotulo: 'Porta / vidros', lx: 60, ly: 400, ax: 140, ay: 460, anchor: 'start', desenho: marca(88, 455, 105, 85, 16) },
    { id: 'bancos', sistema: 'Interior', casa: /banco|estofad/i, rotulo: 'Bancos', lx: 200, ly: 745, ax: 320, ay: 670, anchor: 'middle', desenho: <g>{marca(168, 545, 390, 220, 30)}{marca(800, 545, 400, 220, 30)}</g> },
    { id: 'console', sistema: 'Interior', casa: /console|apoio|acabamento/i, rotulo: 'Console central', lx: 660, ly: 745, ax: 665, ay: 710, anchor: 'middle', desenho: marca(560, 575, 215, 185, 24) },
  ],
};

// ── CENA DA RODA (arte do usuário, todos os tipos) ─────────────────────────
// Close 3/4 de pneu + aro; o freio fica ATRÁS do aro (mancha central).
const CENA_RODA_ARTE: Cena = {
  titulo: 'Conjunto de roda',
  viewBox: '0 0 1408 768',
  arte: true,
  fundo: <Suspense fallback={null}><RodaArte /></Suspense>,
  pecas: [
    { id: 'pneu', sistema: 'Rodas e Pneus', casa: /pneu/i, rotulo: 'Pneu', lx: 60, ly: 60, ax: 330, ay: 130, anchor: 'start',
      desenho: <g>{marcaO(430, 250, 130, 220)}{marcaO(700, 95, 255, 95)}{marca(235, 395, 330, 360, 80)}{marcaO(985, 200, 150, 165)}</g> },
    { id: 'aro', sistema: 'Rodas e Pneus', casa: /roda|aro|calota|alinhamento|balancea|rolamento/i, rotulo: 'Roda / aro', lx: 1330, ly: 150, ax: 1090, ay: 380, anchor: 'end', desenho: marcaO(875, 585, 270, 265) },
    { id: 'freiosroda', sistema: 'Freios', casa: /disco|pastilha|pin[çc]a|tambor|lona/i, rotulo: 'Freio (atrás do aro)', lx: 1330, ly: 420, ax: 1042, ay: 500, anchor: 'end', desenho: marcaO(875, 580, 200, 185) },
    { id: 'porcas', sistema: 'Rodas e Pneus', casa: /parafuso|porca|fixa[çc]|cubo/i, rotulo: 'Porcas / fixação', lx: 1330, ly: 640, ax: 898, ay: 638, anchor: 'end', desenho: marcaO(785, 620, 125, 125) },
  ],
};

// ── CENAS DO CARRO PADRÃO (hatch/sedã): as ARTES DO USUÁRIO ────────────────
// Mesmo esquema da picape: tinta por baixo do traço, forma exata quando o
// extrator achou o contorno (chaves "c-frente:id" etc. em formas-cenas).
// Coordenadas medidas com grid DENTRO do svg (viewBox 0 0 1408 768).
const CENA_C_MOTOR: Cena = {
  titulo: 'Cofre do motor — capô aberto',
  viewBox: '0 0 1408 768',
  arte: true,
  fundo: <Suspense fallback={null}><CarroFrenteMotorArte /></Suspense>,
  pecas: [
    { id: 'motor', sistema: 'Motor', casa: /[óo]leo|lubrific/i, rotulo: 'Motor / óleo', lx: 1330, ly: 160, ax: 800, ay: 300, anchor: 'end', desenho: marca(465, 205, 360, 265, 20) },
    { id: 'filtro', sistema: 'Motor', casa: /aliment|combust|bomba|filtro/i, rotulo: 'Filtro de ar', lx: 1330, ly: 290, ax: 1080, ay: 355, anchor: 'end', desenho: marca(878, 285, 230, 150, 18) },
    { id: 'radiador', sistema: 'Motor', casa: /arrefec|radiador/i, rotulo: 'Radiador', lx: 300, ly: 745, ax: 500, ay: 495, anchor: 'middle', desenho: marca(428, 442, 590, 75, 18) },
    { id: 'reservarrefec', sistema: 'Motor', casa: /arrefec|reservat/i, rotulo: 'Reserv. arrefecimento', lx: 30, ly: 200, ax: 305, ay: 295, anchor: 'start', desenho: marca(292, 262, 115, 105, 18) },
    { id: 'bateria', sistema: 'Elétrica', casa: /bateria/i, rotulo: 'Bateria', lx: 30, ly: 430, ax: 275, ay: 415, anchor: 'start', desenho: marca(255, 352, 200, 125, 16) },
    { id: 'fusiveis', sistema: 'Elétrica', casa: /fus[ií]vel|rel[eé]|chicote/i, rotulo: 'Fusíveis / relés', lx: 1330, ly: 80, ax: 1015, ay: 200, anchor: 'end', desenho: marca(902, 170, 118, 80, 12) },
    { id: 'alternador', sistema: 'Elétrica', casa: /partida|arranque|alternador|correia/i, rotulo: 'Alternador / correia', lx: 30, ly: 560, ax: 465, ay: 400, anchor: 'start', desenho: marcaO(478, 355, 45, 80) },
    { id: 'palhetas', sistema: 'Elétrica', casa: /palheta|limpador/i, rotulo: 'Palhetas', lx: 700, ly: 28, ax: 700, ay: 65, anchor: 'middle', desenho: marca(300, 38, 810, 80, 20) },
    { id: 'cilindrofreio', sistema: 'Freios', casa: /fluido|hidr[aá]ulica|cilindro/i, rotulo: 'Cilindro de freio', lx: 30, ly: 90, ax: 355, ay: 225, anchor: 'start', desenho: marcaO(365, 228, 52, 45) },
    { id: 'escoras', sistema: 'Carroceria', casa: /capo|cap[oô]|dobradi[çc]|lataria/i, rotulo: 'Escoras do capô', lx: 90, ly: 30, ax: 285, ay: 90, anchor: 'start', desenho: <g>{marca(272, 8, 50, 165, 16)}{marca(1078, 8, 55, 435, 16)}</g> },
    { id: 'gradecofre', sistema: 'Carroceria', casa: /grade|lataria/i, rotulo: 'Grade', lx: 700, ly: 745, ax: 700, ay: 690, anchor: 'middle', desenho: marca(408, 570, 600, 135, 24) },
    { id: 'faroiscofre', sistema: 'Elétrica', casa: /farol|l[aâ]mpada|ilumin/i, rotulo: 'Faróis', lx: 30, ly: 720, ax: 240, ay: 600, anchor: 'start', desenho: <g>{marca(182, 468, 205, 185, 24)}{marca(1020, 468, 210, 185, 24)}</g> },
  ],
};

const CENA_C_FRENTE: Cena = {
  titulo: 'Frente',
  viewBox: '0 0 1408 768',
  arte: true,
  fundo: <Suspense fallback={null}><CarroFrenteArte /></Suspense>,
  pecas: [
    { id: 'parabrisa', sistema: 'Carroceria', casa: /vidro|para.?brisa/i, rotulo: 'Para-brisa', lx: 700, ly: 24, ax: 700, ay: 60, anchor: 'middle', desenho: marca(400, 35, 610, 190, 20) },
    { id: 'palhetasf', sistema: 'Elétrica', casa: /palheta|limpador/i, rotulo: 'Palhetas', lx: 1350, ly: 150, ax: 945, ay: 212, anchor: 'end', desenho: marca(440, 192, 510, 42, 14) },
    { id: 'capo', sistema: 'Carroceria', casa: /capo|cap[oô]/i, rotulo: 'Capô', lx: 1350, ly: 260, ax: 1040, ay: 280, anchor: 'end', desenho: marca(368, 238, 675, 88, 20) },
    { id: 'lataria', sistema: 'Carroceria', casa: /lataria|funilaria|pintura|amassad|para.?lama|carroceria/i, rotulo: 'Lataria / para-lamas', lx: 20, ly: 300, ax: 300, ay: 350, anchor: 'start', desenho: <g>{marca(280, 295, 105, 300, 24)}{marca(1025, 295, 105, 300, 24)}</g> },
    { id: 'retrovisores', sistema: 'Carroceria', casa: /retrovisor|espelho/i, rotulo: 'Retrovisores', lx: 20, ly: 170, ax: 255, ay: 210, anchor: 'start', desenho: <g>{marca(238, 178, 130, 80, 16)}{marca(1042, 178, 130, 80, 16)}</g> },
    { id: 'parachoque', sistema: 'Carroceria', casa: /para.?choque/i, rotulo: 'Para-choque', lx: 1350, ly: 490, ax: 1090, ay: 505, anchor: 'end', desenho: marca(318, 432, 775, 185, 24) },
    { id: 'farois', sistema: 'Elétrica', casa: /farol|l[aâ]mpada|ilumin/i, rotulo: 'Faróis', lx: 30, ly: 380, ax: 325, ay: 375, anchor: 'start', desenho: <g>{marca(315, 328, 150, 92, 16)}{marca(940, 328, 150, 92, 16)}</g> },
    { id: 'grade', sistema: 'Motor', casa: /arrefec|radiador/i, rotulo: 'Grade / radiador', lx: 1350, ly: 380, ax: 908, ay: 385, anchor: 'end', desenho: marca(492, 340, 420, 92, 20) },
    { id: 'suspdiant', sistema: 'Suspensão', casa: /amortecedor|mola|bandeja|barra|pivô|piv[oô]/i, rotulo: 'Suspensão dianteira', lx: 700, ly: 745, ax: 700, ay: 660, anchor: 'middle', desenho: marca(418, 612, 575, 70, 18) },
    { id: 'pneus', sistema: 'Rodas e Pneus', casa: /pneu/i, rotulo: 'Pneus', lx: 30, ly: 610, ax: 295, ay: 645, anchor: 'start', desenho: <g>{marca(288, 595, 135, 165, 36)}{marca(988, 595, 135, 165, 36)}</g> },
  ],
};

const CENA_C_TRASEIRA: Cena = {
  titulo: 'Traseira — porta-malas aberto',
  viewBox: '0 0 1408 768',
  arte: true,
  fundo: <Suspense fallback={null}><CarroTraseiraArte /></Suspense>,
  pecas: [
    { id: 'luzfreio', sistema: 'Elétrica', casa: /luz|l[aâ]mpada|lanterna|ilumin/i, rotulo: 'Luz de freio', lx: 1330, ly: 40, ax: 788, ay: 40, anchor: 'end', desenho: marca(628, 22, 155, 34, 10) },
    { id: 'vidrotras', sistema: 'Carroceria', casa: /vidro/i, rotulo: 'Vidro traseiro', lx: 60, ly: 60, ax: 520, ay: 105, anchor: 'start', desenho: marca(515, 45, 375, 155, 20) },
    { id: 'tampa', sistema: 'Carroceria', casa: /porta|fechadura|trava/i, rotulo: 'Tampa / fechadura', lx: 1330, ly: 150, ax: 920, ay: 130, anchor: 'end', desenho: marca(462, 22, 470, 208, 24) },
    { id: 'caixa', sistema: 'Outros', rotulo: 'Porta-malas / carga', lx: 60, ly: 250, ax: 515, ay: 305, anchor: 'start', desenho: marca(505, 240, 400, 245, 18) },
    { id: 'lanternas', sistema: 'Elétrica', casa: /lanterna|farol|ilumin/i, rotulo: 'Lanternas', lx: 60, ly: 390, ax: 425, ay: 410, anchor: 'start', desenho: <g>{marca(415, 355, 82, 128, 14)}{marca(910, 355, 82, 128, 14)}</g> },
    { id: 'lataria', sistema: 'Carroceria', casa: /lataria|funilaria|pintura|amassad|para.?lama|carroceria/i, rotulo: 'Lataria / para-lamas', lx: 1330, ly: 290, ax: 1000, ay: 350, anchor: 'end', desenho: <g>{marca(400, 295, 76, 200, 18)}{marca(932, 295, 76, 200, 18)}</g> },
    { id: 'parachoquetras', sistema: 'Carroceria', casa: /para.?choque/i, rotulo: 'Para-choque', lx: 60, ly: 540, ax: 415, ay: 560, anchor: 'start', desenho: marca(408, 490, 595, 168, 22) },
    { id: 'escapamento', sistema: 'Motor', casa: /escap/i, rotulo: 'Escapamento', lx: 700, ly: 745, ax: 615, ay: 700, anchor: 'middle', desenho: marcaO(580, 682, 52, 30) },
    { id: 'pneustras', sistema: 'Rodas e Pneus', casa: /pneu/i, rotulo: 'Pneus', lx: 60, ly: 700, ax: 455, ay: 700, anchor: 'start', desenho: <g>{marca(448, 658, 88, 108, 26)}{marca(875, 658, 88, 108, 26)}</g> },
  ],
};

const CENA_C_INTERIOR: Cena = {
  titulo: 'Cabine',
  viewBox: '0 0 1408 768',
  arte: true,
  fundo: <Suspense fallback={null}><CarroInteriorArte /></Suspense>,
  pecas: [
    { id: 'retrovint', sistema: 'Carroceria', casa: /retrovisor|espelho/i, rotulo: 'Retrovisor interno', lx: 950, ly: 40, ax: 800, ay: 70, anchor: 'start', desenho: marca(630, 48, 168, 60, 12) },
    { id: 'volante', sistema: 'Direção', rotulo: 'Volante / coluna', lx: 60, ly: 140, ax: 370, ay: 245, anchor: 'start', desenho: marcaO(475, 320, 138, 142) },
    { id: 'instrumentos', sistema: 'Elétrica', casa: /painel|instrumento/i, rotulo: 'Instrumentos', lx: 60, ly: 32, ax: 425, ay: 250, anchor: 'start', desenho: marca(405, 236, 162, 72, 12) },
    { id: 'multimidia', sistema: 'Elétrica', casa: /som|multim|r[aá]dio/i, rotulo: 'Multimídia', lx: 520, ly: 30, ax: 660, ay: 312, anchor: 'middle', desenho: marca(645, 305, 155, 118, 10) },
    { id: 'difusores', sistema: 'Ar-condicionado', rotulo: 'Difusores do ar', lx: 1330, ly: 200, ax: 1095, ay: 275, anchor: 'end', desenho: <g>{marca(642, 246, 165, 56, 10)}{marca(1038, 246, 100, 62, 10)}</g> },
    { id: 'clima', sistema: 'Ar-condicionado', rotulo: 'Controles do ar', lx: 1330, ly: 300, ax: 798, ay: 440, anchor: 'end', desenho: marca(645, 415, 150, 60, 12) },
    { id: 'portaluvas', sistema: 'Interior', casa: /porta.?luvas|painel/i, rotulo: 'Porta-luvas', lx: 1330, ly: 420, ax: 1140, ay: 420, anchor: 'end', desenho: marca(842, 362, 295, 112, 14) },
    { id: 'cambio', sistema: 'Transmissão', casa: /c[aâ]mbio|manopla/i, rotulo: 'Câmbio', lx: 1330, ly: 560, ax: 805, ay: 560, anchor: 'end', desenho: marca(660, 480, 142, 165, 22) },
    { id: 'pedais', sistema: 'Freios', casa: /pedal|fluido|hidr[aá]ulica/i, rotulo: 'Pedais', lx: 60, ly: 520, ax: 495, ay: 500, anchor: 'start', desenho: marca(492, 458, 165, 92, 14) },
    { id: 'portavidros', sistema: 'Carroceria', casa: /porta|trava|fechadura|vidro/i, rotulo: 'Porta / vidros', lx: 60, ly: 400, ax: 110, ay: 440, anchor: 'start', desenho: marca(58, 415, 215, 150, 16) },
    { id: 'cintos', sistema: 'Itens de segurança', casa: /cinto/i, rotulo: 'Cintos', lx: 1330, ly: 660, ax: 878, ay: 615, anchor: 'end', desenho: <g>{marca(552, 552, 70, 125, 18)}{marca(812, 552, 70, 125, 18)}</g> },
    { id: 'bancos', sistema: 'Interior', casa: /banco|estofad/i, rotulo: 'Bancos', lx: 200, ly: 745, ax: 350, ay: 685, anchor: 'middle', desenho: <g>{marca(198, 565, 425, 200, 30)}{marca(805, 565, 365, 200, 30)}</g> },
    { id: 'console', sistema: 'Interior', casa: /console|apoio|acabamento/i, rotulo: 'Console central', lx: 660, ly: 745, ax: 700, ay: 720, anchor: 'middle', desenho: marca(618, 648, 195, 115, 20) },
  ],
};

// ── CENAS DO CAMINHÃO MUNCK (braço articulado): ARTES DO USUÁRIO ───────────
// Cargo 1517 com guindaste. Mesmo esquema do carro/picape, com uma cena
// EXTRA: o close do braço (o que diferencia o munck). Cabine avançada:
// o motor fica sob a cabine (a arte mostra ele de cima, cabine basculada).
const CENA_MK_MOTOR: Cena = {
  titulo: 'Motor — cabine basculada',
  viewBox: '0 0 1408 768',
  arte: true,
  fundo: <Suspense fallback={null}><MunckFrenteMotorArte /></Suspense>,
  pecas: [
    { id: 'motor', sistema: 'Motor', casa: /[óo]leo|lubrific/i, rotulo: 'Motor / óleo', lx: 700, ly: 28, ax: 700, ay: 100, anchor: 'middle', desenho: marca(590, 90, 290, 390, 20) },
    { id: 'filtro', sistema: 'Motor', casa: /aliment|combust|bomba|filtro/i, rotulo: 'Filtro de ar', lx: 30, ly: 320, ax: 200, ay: 380, anchor: 'start', desenho: marca(190, 245, 210, 310, 20) },
    { id: 'radiador', sistema: 'Motor', casa: /arrefec|radiador|ventoinha/i, rotulo: 'Radiador / ventoinha', lx: 700, ly: 745, ax: 700, ay: 715, anchor: 'middle', desenho: marca(450, 620, 530, 140, 24) },
    { id: 'reservarrefec', sistema: 'Motor', casa: /arrefec|reservat/i, rotulo: 'Reserv. arrefecimento', lx: 30, ly: 90, ax: 205, ay: 125, anchor: 'start', desenho: marca(195, 82, 112, 88, 16) },
    { id: 'correia', sistema: 'Motor', casa: /correia|polia/i, rotulo: 'Correia / polias', lx: 300, ly: 745, ax: 560, ay: 560, anchor: 'middle', desenho: marca(505, 480, 265, 90, 16) },
    { id: 'turbo', sistema: 'Motor', casa: /turbo|turbina|duto|admiss/i, rotulo: 'Turbina / dutos de ar', lx: 1330, ly: 280, ax: 978, ay: 290, anchor: 'end', desenho: marca(855, 195, 130, 190, 20) },
    { id: 'alternador', sistema: 'Elétrica', casa: /partida|arranque|alternador/i, rotulo: 'Alternador', lx: 30, ly: 560, ax: 508, ay: 490, anchor: 'start', desenho: marcaO(555, 470, 55, 60) },
    { id: 'fusiveis', sistema: 'Elétrica', casa: /fus[ií]vel|rel[eé]|chicote/i, rotulo: 'Fusíveis / relés', lx: 1330, ly: 130, ax: 1268, ay: 200, anchor: 'end', desenho: marca(1120, 125, 150, 190, 16) },
    { id: 'bateria', sistema: 'Elétrica', casa: /bateria/i, rotulo: 'Bateria', lx: 1330, ly: 560, ax: 1262, ay: 505, anchor: 'end', desenho: marca(1065, 375, 200, 190, 16) },
    { id: 'servofreio', sistema: 'Freios', casa: /servo|cilindro|fluido|hidr[aá]ulica|ar do freio/i, rotulo: 'Servo-freio', lx: 1000, ly: 28, ax: 990, ay: 85, anchor: 'middle', desenho: marcaO(990, 135, 85, 58) },
    { id: 'bombadir', sistema: 'Direção', casa: /dire[çc][aã]o|bomba/i, rotulo: 'Direção hidráulica', lx: 1330, ly: 400, ax: 935, ay: 428, anchor: 'end', desenho: <g>{marcaO(885, 425, 48, 48)}{marca(952, 142, 96, 95, 16)}</g> },
  ],
};

const CENA_MK_FRENTE: Cena = {
  titulo: 'Frente',
  viewBox: '0 0 1408 768',
  arte: true,
  fundo: <Suspense fallback={null}><MunckFrenteArte /></Suspense>,
  pecas: [
    { id: 'braco', sistema: 'Outros', casa: /munck|guindaste|bra[çc]o|lan[çc]a/i, rotulo: 'Braço (munck)', lx: 1330, ly: 60, ax: 948, ay: 110, anchor: 'end', desenho: marca(585, 20, 360, 185, 20) },
    { id: 'parabrisa', sistema: 'Carroceria', casa: /vidro|para.?brisa/i, rotulo: 'Para-brisa', lx: 30, ly: 230, ax: 505, ay: 280, anchor: 'start', desenho: marca(500, 215, 410, 180, 20) },
    { id: 'palhetasf', sistema: 'Elétrica', casa: /palheta|limpador/i, rotulo: 'Palhetas', lx: 30, ly: 360, ax: 530, ay: 370, anchor: 'start', desenho: marca(525, 345, 320, 50, 14) },
    { id: 'retrovisores', sistema: 'Carroceria', casa: /retrovisor|espelho/i, rotulo: 'Retrovisores', lx: 1330, ly: 300, ax: 992, ay: 320, anchor: 'end', desenho: <g>{marca(420, 282, 58, 100, 16)}{marca(933, 282, 58, 100, 16)}</g> },
    { id: 'painelfrontal', sistema: 'Carroceria', casa: /capo|cap[oô]|painel|lataria|funilaria|pintura|amassad/i, rotulo: 'Painel frontal', lx: 30, ly: 450, ax: 503, ay: 430, anchor: 'start', desenho: marca(498, 390, 415, 85, 16) },
    { id: 'farois', sistema: 'Elétrica', casa: /farol|l[aâ]mpada|ilumin/i, rotulo: 'Faróis', lx: 30, ly: 540, ax: 510, ay: 515, anchor: 'start', desenho: <g>{marca(505, 480, 90, 70, 14)}{marca(815, 480, 90, 70, 14)}</g> },
    { id: 'grade', sistema: 'Motor', casa: /arrefec|radiador/i, rotulo: 'Grade / radiador', lx: 1330, ly: 470, ax: 820, ay: 515, anchor: 'end', desenho: marca(595, 478, 222, 80, 14) },
    { id: 'parachoque', sistema: 'Carroceria', casa: /para.?choque/i, rotulo: 'Para-choque', lx: 1330, ly: 590, ax: 930, ay: 585, anchor: 'end', desenho: marca(482, 552, 445, 68, 18) },
    { id: 'suspdiant', sistema: 'Suspensão', casa: /amortecedor|mola|feixe|barra|eixo/i, rotulo: 'Suspensão dianteira', lx: 700, ly: 745, ax: 700, ay: 690, anchor: 'middle', desenho: marca(435, 615, 535, 70, 16) },
    { id: 'pneus', sistema: 'Rodas e Pneus', casa: /pneu/i, rotulo: 'Pneus', lx: 30, ly: 680, ax: 440, ay: 670, anchor: 'start', desenho: <g>{marca(432, 598, 105, 158, 30)}{marca(868, 598, 105, 158, 30)}</g> },
  ],
};

const CENA_MK_TRASEIRA: Cena = {
  titulo: 'Traseira',
  viewBox: '0 0 1408 768',
  arte: true,
  fundo: <Suspense fallback={null}><MunckTraseiraArte /></Suspense>,
  pecas: [
    { id: 'braco', sistema: 'Outros', casa: /munck|guindaste|bra[çc]o|lan[çc]a|gancho/i, rotulo: 'Braço (munck)', lx: 1330, ly: 80, ax: 962, ay: 150, anchor: 'end', desenho: marca(475, 20, 490, 400, 24) },
    { id: 'vidrotras', sistema: 'Carroceria', casa: /vidro/i, rotulo: 'Vidro traseiro', lx: 30, ly: 100, ax: 495, ay: 160, anchor: 'start', desenho: marca(490, 110, 430, 195, 18) },
    { id: 'retrovisores', sistema: 'Carroceria', casa: /retrovisor|espelho/i, rotulo: 'Retrovisores', lx: 30, ly: 240, ax: 370, ay: 245, anchor: 'start', desenho: <g>{marca(366, 196, 64, 100, 16)}{marca(980, 196, 64, 100, 16)}</g> },
    { id: 'cacamba', sistema: 'Carroceria', casa: /ca[çc]amba|carroceria|assoalho|guarda/i, rotulo: 'Caçamba / carroceria', lx: 30, ly: 360, ax: 395, ay: 375, anchor: 'start', desenho: marca(390, 318, 630, 118, 16) },
    { id: 'chassitras', sistema: 'Carroceria', casa: /chassi|quadro|travessa|longarina/i, rotulo: 'Chassi / travessa', lx: 1330, ly: 440, ax: 985, ay: 465, anchor: 'end', desenho: marca(425, 428, 560, 78, 14) },
    { id: 'lanternas', sistema: 'Elétrica', casa: /lanterna|farol|ilumin|luz/i, rotulo: 'Lanternas', lx: 30, ly: 580, ax: 455, ay: 575, anchor: 'start', desenho: <g>{marca(450, 548, 100, 58, 10)}{marca(850, 548, 100, 58, 10)}</g> },
    { id: 'parachoquetras', sistema: 'Carroceria', casa: /para.?choque/i, rotulo: 'Para-choque', lx: 1330, ly: 560, ax: 963, ay: 580, anchor: 'end', desenho: marca(443, 540, 520, 80, 14) },
    { id: 'diferencial', sistema: 'Transmissão', casa: /diferencial|eixo|cardan/i, rotulo: 'Diferencial / eixo', lx: 700, ly: 745, ax: 720, ay: 692, anchor: 'middle', desenho: marcaO(720, 648, 125, 42) },
    { id: 'pneustras', sistema: 'Rodas e Pneus', casa: /pneu/i, rotulo: 'Pneus', lx: 30, ly: 700, ax: 405, ay: 690, anchor: 'start', desenho: <g>{marca(398, 478, 148, 275, 36)}{marca(858, 478, 152, 275, 36)}</g> },
  ],
};

const CENA_MK_INTERIOR: Cena = {
  titulo: 'Cabine',
  viewBox: '0 0 1408 768',
  arte: true,
  fundo: <Suspense fallback={null}><MunckInteriorArte /></Suspense>,
  pecas: [
    { id: 'tacografo', sistema: 'Itens de segurança', casa: /tac[oó]grafo|disco/i, rotulo: 'Tacógrafo', lx: 1010, ly: 40, ax: 815, ay: 45, anchor: 'start', desenho: marca(598, 14, 214, 62, 12) },
    { id: 'retrovint', sistema: 'Carroceria', casa: /retrovisor|espelho/i, rotulo: 'Retrovisor interno', lx: 30, ly: 110, ax: 630, ay: 138, anchor: 'start', desenho: marca(628, 105, 150, 65, 12) },
    { id: 'volante', sistema: 'Direção', rotulo: 'Volante / coluna', lx: 30, ly: 280, ax: 355, ay: 370, anchor: 'start', desenho: marcaO(465, 425, 128, 118) },
    { id: 'instrumentos', sistema: 'Elétrica', casa: /painel|instrumento/i, rotulo: 'Instrumentos', lx: 30, ly: 390, ax: 378, ay: 395, anchor: 'start', desenho: marca(375, 352, 210, 90, 12) },
    { id: 'multimidia', sistema: 'Elétrica', casa: /som|multim|r[aá]dio|bot[aã]o|chave/i, rotulo: 'Rádio / botões', lx: 1330, ly: 250, ax: 845, ay: 395, anchor: 'end', desenho: marca(610, 350, 238, 92, 10) },
    { id: 'clima', sistema: 'Ar-condicionado', rotulo: 'Controles do ar', lx: 1330, ly: 350, ax: 842, ay: 445, anchor: 'end', desenho: marca(662, 425, 182, 42, 10) },
    { id: 'portaluvas', sistema: 'Interior', casa: /porta.?luvas|painel/i, rotulo: 'Porta-luvas', lx: 1330, ly: 450, ax: 1070, ay: 440, anchor: 'end', desenho: marca(858, 348, 215, 180, 16) },
    { id: 'cambio', sistema: 'Transmissão', casa: /c[aâ]mbio|manopla/i, rotulo: 'Câmbio', lx: 1330, ly: 580, ax: 726, ay: 585, anchor: 'end', desenho: marca(628, 518, 100, 148, 20) },
    { id: 'pedais', sistema: 'Freios', casa: /pedal|fluido|hidr[aá]ulica/i, rotulo: 'Pedais', lx: 30, ly: 560, ax: 438, ay: 590, anchor: 'start', desenho: marca(432, 550, 215, 92, 14) },
    { id: 'portas', sistema: 'Carroceria', casa: /porta|trava|fechadura|vidro/i, rotulo: 'Portas / vidros', lx: 30, ly: 660, ax: 120, ay: 640, anchor: 'start', desenho: <g>{marca(85, 430, 250, 260, 20)}{marca(1080, 425, 240, 270, 20)}</g> },
    { id: 'bancos', sistema: 'Interior', casa: /banco|estofad/i, rotulo: 'Bancos', lx: 300, ly: 745, ax: 330, ay: 700, anchor: 'middle', desenho: <g>{marca(165, 615, 400, 150, 30)}{marca(852, 625, 335, 140, 30)}</g> },
    { id: 'console', sistema: 'Interior', casa: /console|apoio|acabamento|t[uú]nel/i, rotulo: 'Console / túnel do motor', lx: 1010, ly: 745, ax: 830, ay: 722, anchor: 'middle', desenho: marca(555, 655, 305, 110, 24) },
  ],
};

const CENA_MK_BRACO: Cena = {
  titulo: 'Braço articulado (munck)',
  viewBox: '0 0 1408 768',
  arte: true,
  fundo: <Suspense fallback={null}><MunckBracoArte /></Suspense>,
  pecas: [
    { id: 'lanca', sistema: 'Outros', casa: /lan[çc]a|bra[çc]o/i, rotulo: 'Lança principal', lx: 30, ly: 40, ax: 375, ay: 62, anchor: 'start', desenho: marca(368, 15, 530, 155, 24) },
    { id: 'extensoes', sistema: 'Outros', casa: /extens|telesc[oó]p/i, rotulo: 'Lanças extensíveis', lx: 1330, ly: 130, ax: 1132, ay: 210, anchor: 'end', desenho: marca(848, 148, 365, 262, 24) },
    { id: 'cilindros', sistema: 'Outros', casa: /cilindro|pist[aã]o|hidr[aá]ulic/i, rotulo: 'Cilindros hidráulicos', lx: 640, ly: 28, ax: 640, ay: 112, anchor: 'middle', desenho: <g>{marca(500, 118, 78, 275, 20)}{marca(568, 105, 205, 78, 18)}</g> },
    { id: 'mangueiras', sistema: 'Outros', casa: /mangueira|hidr[aá]ulic/i, rotulo: 'Mangueiras hidráulicas', lx: 1010, ly: 28, ax: 1010, ay: 118, anchor: 'middle', desenho: <g>{marca(385, 15, 88, 430, 20)}{marca(938, 112, 165, 100, 20)}</g> },
    { id: 'coluna', sistema: 'Outros', casa: /coluna|pedestal|torre/i, rotulo: 'Coluna do guindaste', lx: 30, ly: 130, ax: 405, ay: 200, anchor: 'start', desenho: marca(398, 128, 190, 345, 24) },
    { id: 'comandos', sistema: 'Outros', casa: /comando|alavanca|v[aá]lvula|man[oô]metro/i, rotulo: 'Comandos hidráulicos', lx: 30, ly: 300, ax: 232, ay: 380, anchor: 'start', desenho: marca(225, 328, 185, 150, 16) },
    { id: 'basegiro', sistema: 'Outros', casa: /base|giro|coroa|rolamento/i, rotulo: 'Base giratória', lx: 30, ly: 490, ax: 432, ay: 470, anchor: 'start', desenho: marca(428, 440, 172, 58, 14) },
    { id: 'guincho', sistema: 'Outros', casa: /guincho|tambor|cabo de a[çc]o/i, rotulo: 'Guincho / cabo', lx: 620, ly: 745, ax: 660, ay: 522, anchor: 'middle', desenho: marca(578, 393, 165, 128, 20) },
    { id: 'gancho', sistema: 'Outros', casa: /gancho|moit[aã]o/i, rotulo: 'Gancho', lx: 1330, ly: 470, ax: 1218, ay: 470, anchor: 'end', desenho: marca(1118, 250, 115, 278, 24) },
    { id: 'chassimk', sistema: 'Carroceria', casa: /chassi|quadro|longarina/i, rotulo: 'Quadro / chassi', lx: 30, ly: 690, ax: 230, ay: 610, anchor: 'start', desenho: marca(215, 480, 590, 195, 20) },
    { id: 'patolas', sistema: 'Outros', casa: /patola|estabiliza|sapata/i, rotulo: 'Patolas / estabilizadores', lx: 240, ly: 745, ax: 258, ay: 668, anchor: 'middle', desenho: <g>{marca(215, 455, 75, 215, 16)}{marca(650, 550, 85, 190, 16)}{marca(290, 570, 340, 100, 16)}</g> },
    { id: 'pneumk', sistema: 'Rodas e Pneus', casa: /pneu/i, rotulo: 'Pneus', lx: 1010, ly: 745, ax: 860, ay: 715, anchor: 'middle', desenho: marca(700, 490, 245, 255, 40) },
  ],
};

// ── CENAS DO CAMINHÃO comum (basculante): ARTES DO USUÁRIO ─────────────────
// Ford Cargo com caçamba basculante. Cabine avançada como o munck: o motor
// aparece de cima (cabine basculada), e o chassi segue à direita mostrando
// câmbio, reservatórios de ar e tanque.
const CENA_CM_MOTOR: Cena = {
  titulo: 'Motor — cabine basculada',
  viewBox: '0 0 1408 768',
  arte: true,
  fundo: <Suspense fallback={null}><CaminhaoFrenteMotorArte /></Suspense>,
  pecas: [
    { id: 'motor', sistema: 'Motor', casa: /[óo]leo|lubrific/i, rotulo: 'Motor / óleo', lx: 700, ly: 28, ax: 700, ay: 100, anchor: 'middle', desenho: marca(520, 95, 360, 430, 20) },
    { id: 'filtro', sistema: 'Motor', casa: /aliment|filtro/i, rotulo: 'Filtro de ar', lx: 30, ly: 420, ax: 330, ay: 420, anchor: 'start', desenho: marca(325, 335, 160, 170, 16) },
    { id: 'radiador', sistema: 'Motor', casa: /arrefec|radiador|ventoinha/i, rotulo: 'Radiador / ventoinha', lx: 620, ly: 745, ax: 660, ay: 668, anchor: 'middle', desenho: marca(525, 535, 355, 130, 18) },
    { id: 'turbo', sistema: 'Motor', casa: /turbo|turbina|duto|admiss/i, rotulo: 'Turbina / dutos de ar', lx: 1000, ly: 28, ax: 897, ay: 300, anchor: 'middle', desenho: marca(850, 295, 95, 310, 20) },
    { id: 'tanque', sistema: 'Motor', casa: /combust|tanque|bomba/i, rotulo: 'Tanque de combustível', lx: 1160, ly: 745, ax: 1300, ay: 678, anchor: 'middle', desenho: marca(1245, 525, 163, 150, 16) },
    { id: 'bateria', sistema: 'Elétrica', casa: /bateria/i, rotulo: 'Bateria', lx: 30, ly: 100, ax: 345, ay: 140, anchor: 'start', desenho: marca(340, 95, 145, 90, 14) },
    { id: 'fusiveis', sistema: 'Elétrica', casa: /fus[ií]vel|rel[eé]/i, rotulo: 'Fusíveis / relés', lx: 30, ly: 265, ax: 400, ay: 272, anchor: 'start', desenho: marca(395, 230, 80, 85, 12) },
    { id: 'modulo', sistema: 'Elétrica', casa: /m[oó]dulo|central|inje[çc]|chicote/i, rotulo: 'Módulo / chicote', lx: 1330, ly: 200, ax: 1098, ay: 230, anchor: 'end', desenho: marca(980, 170, 115, 135, 14) },
    { id: 'alternador', sistema: 'Elétrica', casa: /partida|arranque|alternador/i, rotulo: 'Alternador', lx: 900, ly: 745, ax: 830, ay: 522, anchor: 'middle', desenho: marca(780, 435, 95, 85, 16) },
    { id: 'arfreio', sistema: 'Freios', casa: /servo|ar do freio|cilindro|fluido|compressor|reservat/i, rotulo: 'Ar do freio / reservatórios', lx: 1330, ly: 70, ax: 1290, ay: 100, anchor: 'end', desenho: <g>{marca(845, 95, 150, 95, 14)}{marca(1180, 60, 185, 175, 16)}</g> },
    { id: 'bombadir', sistema: 'Direção', casa: /dire[çc][aã]o|bomba/i, rotulo: 'Direção hidráulica', lx: 1330, ly: 430, ax: 998, ay: 430, anchor: 'end', desenho: marca(925, 375, 70, 110, 14) },
    { id: 'cambio', sistema: 'Transmissão', casa: /c[aâ]mbio|caixa|embreagem|cardan/i, rotulo: 'Câmbio / cardan', lx: 1330, ly: 320, ax: 1240, ay: 340, anchor: 'end', desenho: marca(1135, 325, 180, 140, 16) },
  ],
};

const CENA_CM_FRENTE: Cena = {
  titulo: 'Frente',
  viewBox: '0 0 1408 768',
  arte: true,
  fundo: <Suspense fallback={null}><CaminhaoFrenteArte /></Suspense>,
  pecas: [
    { id: 'parabrisa', sistema: 'Carroceria', casa: /vidro|para.?brisa/i, rotulo: 'Para-brisa', lx: 30, ly: 150, ax: 460, ay: 180, anchor: 'start', desenho: marca(455, 70, 505, 220, 20) },
    { id: 'palhetasf', sistema: 'Elétrica', casa: /palheta|limpador/i, rotulo: 'Palhetas', lx: 30, ly: 280, ax: 520, ay: 262, anchor: 'start', desenho: marca(515, 235, 390, 50, 14) },
    { id: 'retrovisores', sistema: 'Carroceria', casa: /retrovisor|espelho/i, rotulo: 'Retrovisores', lx: 1330, ly: 130, ax: 1058, ay: 160, anchor: 'end', desenho: <g>{marca(357, 92, 72, 172, 16)}{marca(985, 92, 72, 172, 16)}</g> },
    { id: 'painelfrontal', sistema: 'Carroceria', casa: /capo|cap[oô]|painel|lataria|funilaria|pintura|amassad/i, rotulo: 'Painel frontal', lx: 30, ly: 380, ax: 455, ay: 370, anchor: 'start', desenho: marca(450, 292, 510, 168, 16) },
    { id: 'grade', sistema: 'Motor', casa: /arrefec|radiador/i, rotulo: 'Grade / radiador', lx: 1330, ly: 420, ax: 832, ay: 425, anchor: 'end', desenho: <g>{marca(592, 393, 238, 72, 14)}{marca(595, 490, 222, 100, 14)}</g> },
    { id: 'farois', sistema: 'Elétrica', casa: /farol|l[aâ]mpada|ilumin/i, rotulo: 'Faróis', lx: 30, ly: 530, ax: 458, ay: 520, anchor: 'start', desenho: <g>{marca(452, 465, 85, 110, 14)}{marca(875, 465, 85, 110, 14)}</g> },
    { id: 'parachoque', sistema: 'Carroceria', casa: /para.?choque/i, rotulo: 'Para-choque', lx: 1330, ly: 550, ax: 995, ay: 530, anchor: 'end', desenho: marca(420, 458, 572, 145, 18) },
    { id: 'suspdiant', sistema: 'Suspensão', casa: /amortecedor|mola|feixe|barra|eixo/i, rotulo: 'Suspensão dianteira', lx: 700, ly: 745, ax: 700, ay: 668, anchor: 'middle', desenho: marca(398, 588, 615, 75, 16) },
    { id: 'pneus', sistema: 'Rodas e Pneus', casa: /pneu/i, rotulo: 'Pneus', lx: 30, ly: 680, ax: 405, ay: 660, anchor: 'start', desenho: <g>{marca(398, 588, 185, 160, 30)}{marca(828, 588, 185, 160, 30)}</g> },
  ],
};

const CENA_CM_TRASEIRA: Cena = {
  titulo: 'Traseira',
  viewBox: '0 0 1408 768',
  arte: true,
  fundo: <Suspense fallback={null}><CaminhaoTraseiraArte /></Suspense>,
  pecas: [
    { id: 'cacamba', sistema: 'Carroceria', casa: /ca[çc]amba|carroceria|assoalho|guarda|tampa/i, rotulo: 'Caçamba / carroceria', lx: 30, ly: 140, ax: 335, ay: 160, anchor: 'start', desenho: marca(330, 70, 745, 285, 16) },
    { id: 'chassitras', sistema: 'Carroceria', casa: /chassi|quadro|travessa|longarina/i, rotulo: 'Chassi / travessa', lx: 1330, ly: 380, ax: 1068, ay: 390, anchor: 'end', desenho: <g>{marca(345, 345, 720, 90, 14)}{marca(475, 390, 455, 130, 14)}</g> },
    { id: 'paralamas', sistema: 'Carroceria', casa: /para.?lama|lameiro/i, rotulo: 'Para-lamas', lx: 30, ly: 430, ax: 358, ay: 460, anchor: 'start', desenho: <g>{marca(352, 388, 180, 230, 14)}{marca(878, 388, 180, 230, 14)}</g> },
    { id: 'suspensao', sistema: 'Suspensão', casa: /mola|amortecedor|feixe|bolsa|estabiliza/i, rotulo: 'Molas / amortecedores', lx: 30, ly: 580, ax: 390, ay: 555, anchor: 'start', desenho: <g>{marca(380, 440, 200, 185, 16)}{marca(830, 440, 200, 185, 16)}</g> },
    { id: 'diferencial', sistema: 'Transmissão', casa: /diferencial|eixo|cardan/i, rotulo: 'Diferencial / eixo', lx: 700, ly: 745, ax: 702, ay: 636, anchor: 'middle', desenho: marcaO(702, 585, 58, 48) },
    { id: 'escape', sistema: 'Motor', casa: /escap|silenc/i, rotulo: 'Escapamento', lx: 1330, ly: 500, ax: 932, ay: 540, anchor: 'end', desenho: marca(748, 505, 180, 80, 14) },
    { id: 'parachoquetras', sistema: 'Carroceria', casa: /para.?choque/i, rotulo: 'Para-choque', lx: 1330, ly: 630, ax: 1062, ay: 632, anchor: 'end', desenho: marca(352, 608, 706, 50, 12) },
    { id: 'lanternas', sistema: 'Elétrica', casa: /lanterna|farol|ilumin|luz/i, rotulo: 'Lanternas / placa', lx: 30, ly: 655, ax: 600, ay: 634, anchor: 'start', desenho: <g>{marca(596, 610, 48, 48, 8)}{marca(766, 610, 48, 48, 8)}</g> },
    { id: 'pneustras', sistema: 'Rodas e Pneus', casa: /pneu/i, rotulo: 'Pneus', lx: 30, ly: 720, ax: 368, ay: 700, anchor: 'start', desenho: <g>{marca(360, 650, 190, 90, 20)}{marca(860, 650, 190, 90, 20)}</g> },
  ],
};

const CENA_CM_INTERIOR: Cena = {
  titulo: 'Cabine',
  viewBox: '0 0 1408 768',
  arte: true,
  fundo: <Suspense fallback={null}><CaminhaoInteriorArte /></Suspense>,
  pecas: [
    { id: 'tacografo', sistema: 'Itens de segurança', casa: /tac[oó]grafo|disco/i, rotulo: 'Console / tacógrafo', lx: 1010, ly: 40, ax: 930, ay: 100, anchor: 'start', desenho: marca(495, 75, 440, 100, 14) },
    { id: 'cinto', sistema: 'Itens de segurança', casa: /cinto/i, rotulo: 'Cinto de segurança', lx: 1330, ly: 220, ax: 1150, ay: 235, anchor: 'end', desenho: marca(1112, 192, 40, 95, 8) },
    { id: 'portas', sistema: 'Carroceria', casa: /porta|trava|fechadura|vidro/i, rotulo: 'Porta / fechaduras', lx: 200, ly: 745, ax: 210, ay: 718, anchor: 'middle', desenho: marca(20, 20, 370, 720, 24) },
    { id: 'volante', sistema: 'Direção', rotulo: 'Volante / coluna', lx: 30, ly: 250, ax: 522, ay: 350, anchor: 'start', desenho: marcaO(610, 385, 100, 90) },
    { id: 'instrumentos', sistema: 'Elétrica', casa: /painel|instrumento/i, rotulo: 'Instrumentos', lx: 700, ly: 28, ax: 620, ay: 318, anchor: 'middle', desenho: marca(545, 318, 148, 75, 12) },
    { id: 'multimidia', sistema: 'Elétrica', casa: /som|multim|r[aá]dio|bot[aã]o|chave/i, rotulo: 'Rádio / central', lx: 1330, ly: 330, ax: 768, ay: 370, anchor: 'end', desenho: marca(680, 332, 85, 95, 10) },
    { id: 'clima', sistema: 'Ar-condicionado', rotulo: 'Ventilação / clima', lx: 30, ly: 430, ax: 445, ay: 430, anchor: 'start', desenho: marca(438, 342, 108, 185, 12) },
    { id: 'portaluvas', sistema: 'Interior', casa: /porta.?luvas|painel/i, rotulo: 'Porta-luvas', lx: 1330, ly: 420, ax: 1010, ay: 375, anchor: 'end', desenho: marca(855, 325, 152, 112, 14) },
    { id: 'cambio', sistema: 'Transmissão', casa: /c[aâ]mbio|manopla/i, rotulo: 'Câmbio', lx: 700, ly: 745, ax: 770, ay: 548, anchor: 'middle', desenho: marca(733, 413, 82, 130, 16) },
    { id: 'freiomao', sistema: 'Freios', casa: /freio de m[aã]o|estacionamento/i, rotulo: 'Freio de mão', lx: 1330, ly: 490, ax: 915, ay: 500, anchor: 'end', desenho: marca(800, 460, 112, 90, 12) },
    { id: 'pedais', sistema: 'Freios', casa: /pedal|fluido|hidr[aá]ulica/i, rotulo: 'Pedais', lx: 460, ly: 745, ax: 520, ay: 630, anchor: 'middle', desenho: marca(450, 540, 155, 85, 14) },
    { id: 'bancos', sistema: 'Interior', casa: /banco|estofad/i, rotulo: 'Bancos', lx: 1330, ly: 570, ax: 1168, ay: 490, anchor: 'end', desenho: marca(950, 245, 215, 370, 24) },
    { id: 'console', sistema: 'Interior', casa: /console|apoio|acabamento|t[uú]nel/i, rotulo: 'Console / túnel do motor', lx: 1010, ly: 745, ax: 870, ay: 668, anchor: 'middle', desenho: marca(560, 515, 375, 180, 20) },
  ],
};

// exportado só pra render de verificação (scripts de preview)
export const CENAS: Record<string, Cena> = {
  frente: CENA_FRENTE, cabine: CENA_CABINE, roda: CENA_RODA_ARTE, traseira: CENA_TRASEIRA,
};

// qual cena cada sistema abre (Carroceria fica na LATERAL em raio-X — é o
// corpo inteiro, nenhuma vista parcial mostra melhor que a lateral)
const CENA_DO_SISTEMA: Record<string, string> = {
  'Motor': 'frente', 'Elétrica': 'frente', 'Ar-condicionado': 'frente',
  'Direção': 'cabine', 'Interior': 'cabine', 'Itens de segurança': 'cabine', 'Transmissão': 'cabine',
  'Freios': 'roda', 'Suspensão': 'roda', 'Rodas e Pneus': 'roda',
  'Outros': 'traseira',
};

// exportado só pra render de verificação (scripts de preview)
export const CENAS_PICAPE: Record<string, Cena> = {
  frente: CENA_P_MOTOR, carroceria: CENA_P_FRENTE, traseira: CENA_P_TRASEIRA,
  cabine: CENA_P_INTERIOR, roda: CENA_RODA_ARTE,
};
// na picape a Carroceria TEM vista própria (a frente fechada do usuário) e a
// Suspensão vai pra frente fechada (a arte da roda não mostra suspensão;
// a vista frontal tem a suspensão dianteira em destaque)
const CENA_DO_SISTEMA_PICAPE: Record<string, string> = {
  ...CENA_DO_SISTEMA, 'Carroceria': 'carroceria', 'Suspensão': 'carroceria',
};

// exportado só pra render de verificação (scripts de preview). Chaves com
// prefixo "c-" pra não colidir com as formas exatas da picape em FORMAS_CENAS.
export const CENAS_CARRO: Record<string, Cena> = {
  'c-frente': CENA_C_MOTOR, 'c-carroceria': CENA_C_FRENTE, 'c-traseira': CENA_C_TRASEIRA,
  'c-cabine': CENA_C_INTERIOR, roda: CENA_RODA_ARTE,
};
// no carro o Ar-condicionado abre a CABINE (difusores/controles ficam lá);
// Carroceria e Suspensão abrem a vista frontal, como na picape
const CENA_DO_SISTEMA_CARRO: Record<string, string> = {
  'Motor': 'c-frente', 'Elétrica': 'c-frente', 'Ar-condicionado': 'c-cabine',
  'Direção': 'c-cabine', 'Interior': 'c-cabine', 'Itens de segurança': 'c-cabine', 'Transmissão': 'c-cabine',
  'Freios': 'roda', 'Rodas e Pneus': 'roda',
  'Outros': 'c-traseira', 'Carroceria': 'c-carroceria', 'Suspensão': 'c-carroceria',
};

// exportado só pra render de verificação (scripts de preview). Chaves "mk-"
// pra não colidir com picape/carro em FORMAS_CENAS.
export const CENAS_MUNCK: Record<string, Cena> = {
  'mk-frente': CENA_MK_MOTOR, 'mk-carroceria': CENA_MK_FRENTE, 'mk-traseira': CENA_MK_TRASEIRA,
  'mk-cabine': CENA_MK_INTERIOR, 'mk-braco': CENA_MK_BRACO, roda: CENA_RODA_ARTE,
};
// no munck OUTROS abre o BRAÇO (é o equipamento que define o veículo — a
// taxonomia não tem sistema próprio pra ele); o resto segue o padrão do carro
const CENA_DO_SISTEMA_MUNCK: Record<string, string> = {
  'Motor': 'mk-frente', 'Elétrica': 'mk-frente', 'Ar-condicionado': 'mk-cabine',
  'Direção': 'mk-cabine', 'Interior': 'mk-cabine', 'Itens de segurança': 'mk-cabine', 'Transmissão': 'mk-cabine',
  'Freios': 'roda', 'Rodas e Pneus': 'roda',
  'Outros': 'mk-braco', 'Carroceria': 'mk-carroceria', 'Suspensão': 'mk-carroceria',
};

// exportado só pra render de verificação (scripts de preview). Chaves "cm-"
// pra não colidir com os outros tipos em FORMAS_CENAS.
export const CENAS_CAMINHAO: Record<string, Cena> = {
  'cm-frente': CENA_CM_MOTOR, 'cm-carroceria': CENA_CM_FRENTE, 'cm-traseira': CENA_CM_TRASEIRA,
  'cm-cabine': CENA_CM_INTERIOR, roda: CENA_RODA_ARTE,
};
// no caminhão basculante a TRASEIRA concentra caçamba, suspensão e o
// levante — Carroceria, Suspensão e Outros abrem lá; o Câmbio real aparece
// no chassi da vista do motor (não na cabine)
const CENA_DO_SISTEMA_CAMINHAO: Record<string, string> = {
  'Motor': 'cm-frente', 'Elétrica': 'cm-frente', 'Transmissão': 'cm-frente',
  'Ar-condicionado': 'cm-cabine', 'Direção': 'cm-cabine', 'Interior': 'cm-cabine', 'Itens de segurança': 'cm-cabine',
  'Freios': 'roda', 'Rodas e Pneus': 'roda',
  'Outros': 'cm-traseira', 'Carroceria': 'cm-traseira', 'Suspensão': 'cm-traseira',
};

// ── seletor de vistas: navegar direto entre as cenas, sem passar por um
// sistema — na vista "solta" TODAS as peças aparecem coloridas pelo estado ──
type Vista = { key: string | null; rot: string };
const VISTAS_PICAPE: Vista[] = [
  { key: null, rot: 'Lateral' },
  { key: 'carroceria', rot: 'Frente' },
  { key: 'frente', rot: 'Cofre do motor' },
  { key: 'cabine', rot: 'Cabine' },
  { key: 'traseira', rot: 'Traseira' },
  { key: 'roda', rot: 'Roda' },
];
const VISTAS_GENERICAS: Vista[] = [
  { key: null, rot: 'Lateral' },
  { key: 'frente', rot: 'Frente' },
  { key: 'cabine', rot: 'Cabine' },
  { key: 'traseira', rot: 'Traseira' },
  { key: 'roda', rot: 'Roda' },
];
void VISTAS_GENERICAS; // reserva pra tipos futuros sem arte própria
const VISTAS_CARRO: Vista[] = [
  { key: null, rot: 'Lateral' },
  { key: 'c-carroceria', rot: 'Frente' },
  { key: 'c-frente', rot: 'Cofre do motor' },
  { key: 'c-cabine', rot: 'Cabine' },
  { key: 'c-traseira', rot: 'Traseira' },
  { key: 'roda', rot: 'Roda' },
];
const VISTAS_MUNCK: Vista[] = [
  { key: null, rot: 'Lateral' },
  { key: 'mk-carroceria', rot: 'Frente' },
  { key: 'mk-frente', rot: 'Motor' },
  { key: 'mk-cabine', rot: 'Cabine' },
  { key: 'mk-braco', rot: 'Braço' },
  { key: 'mk-traseira', rot: 'Traseira' },
  { key: 'roda', rot: 'Roda' },
];
const VISTAS_CAMINHAO: Vista[] = [
  { key: null, rot: 'Lateral' },
  { key: 'cm-carroceria', rot: 'Frente' },
  { key: 'cm-frente', rot: 'Motor' },
  { key: 'cm-cabine', rot: 'Cabine' },
  { key: 'cm-traseira', rot: 'Traseira' },
  { key: 'roda', rot: 'Roda' },
];

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

// Picape — ARTE DO USUÁRIO (corte lateral estilo manual, vetorizada de imagem
// gerada por IA). Já mostra as entranhas de fábrica (motor, câmbio, cardan,
// tanque, feixes, discos), então esta silhueta NÃO usa capô nem raio-X — as
// cenas de ponto de vista continuam. Rodas fazem parte da arte.
const PICAPE: Silhueta = {
  viewBox: '-180 -20 1760 820', chao: 'M0 0',
  rodas: [],
  corpo: <PicapeArte />,
  pontos: [
    { sistema: 'Motor', rotulo: 'Motor', x: 300, y: 360, lx: -20, ly: 150, anchor: 'end' },
    { sistema: 'Elétrica', rotulo: 'Elétrica / bateria', x: 400, y: 272, lx: -20, ly: 330, anchor: 'end' },
    { sistema: 'Ar-condicionado', rotulo: 'Ar-condicionado', x: 238, y: 436, lx: 120, ly: 718, anchor: 'middle' },
    { sistema: 'Direção', rotulo: 'Volante / direção', x: 563, y: 300, lx: 545, ly: 55, anchor: 'middle' },
    { sistema: 'Interior', rotulo: 'Bancos / interior', x: 700, y: 420, lx: 725, ly: 55, anchor: 'middle' },
    { sistema: 'Itens de segurança', rotulo: 'Cintos / segurança', x: 768, y: 300, lx: 905, ly: 55, anchor: 'middle' },
    { sistema: 'Outros', rotulo: 'Caçamba / outros', x: 1110, y: 330, lx: 1130, ly: 55, anchor: 'middle' },
    { sistema: 'Carroceria', rotulo: 'Carroceria', x: 1330, y: 390, lx: 1400, ly: 290, anchor: 'start' },
    { sistema: 'Freios', rotulo: 'Freios', x: 299, y: 542, lx: 300, ly: 718, anchor: 'middle' },
    { sistema: 'Transmissão', rotulo: 'Câmbio', x: 520, y: 500, lx: 540, ly: 718, anchor: 'middle' },
    { sistema: 'Suspensão', rotulo: 'Molas / suspensão', x: 1000, y: 470, lx: 850, ly: 718, anchor: 'middle' },
    { sistema: 'Rodas e Pneus', rotulo: 'Rodas e pneus', x: 1073, y: 548, lx: 1160, ly: 718, anchor: 'middle' },
  ],
};

// Carro padrão (hatch/sedã) — ARTE DO USUÁRIO (corte lateral estilo manual,
// Fox vetorizado). Como na picape: o corte já mostra motor, câmbio, freios,
// suspensão e bancos, então NÃO usa capô nem raio-X — as cenas continuam.
const CARRO_ARTE_LATERAL: Silhueta = {
  viewBox: '-180 -20 1760 820', chao: 'M0 0',
  rodas: [],
  corpo: <CarroArte />,
  pontos: [
    { sistema: 'Motor', rotulo: 'Motor', x: 260, y: 400, lx: -20, ly: 150, anchor: 'end' },
    { sistema: 'Elétrica', rotulo: 'Elétrica / bateria', x: 362, y: 338, lx: -20, ly: 330, anchor: 'end' },
    { sistema: 'Ar-condicionado', rotulo: 'Ar-condicionado', x: 140, y: 470, lx: 100, ly: 718, anchor: 'middle' },
    { sistema: 'Direção', rotulo: 'Volante / direção', x: 615, y: 250, lx: 545, ly: 55, anchor: 'middle' },
    { sistema: 'Interior', rotulo: 'Bancos / interior', x: 750, y: 430, lx: 745, ly: 55, anchor: 'middle' },
    { sistema: 'Itens de segurança', rotulo: 'Cintos / segurança', x: 858, y: 300, lx: 935, ly: 55, anchor: 'middle' },
    { sistema: 'Outros', rotulo: 'Porta-malas / outros', x: 1240, y: 472, lx: 1150, ly: 55, anchor: 'middle' },
    { sistema: 'Carroceria', rotulo: 'Carroceria', x: 1358, y: 390, lx: 1400, ly: 290, anchor: 'start' },
    { sistema: 'Freios', rotulo: 'Freios', x: 300, y: 600, lx: 300, ly: 718, anchor: 'middle' },
    { sistema: 'Transmissão', rotulo: 'Câmbio', x: 430, y: 480, lx: 540, ly: 718, anchor: 'middle' },
    { sistema: 'Suspensão', rotulo: 'Molas / suspensão', x: 1125, y: 545, lx: 860, ly: 718, anchor: 'middle' },
    { sistema: 'Rodas e Pneus', rotulo: 'Rodas e pneus', x: 1215, y: 640, lx: 1180, ly: 718, anchor: 'middle' },
  ],
};

// Caminhão MUNCK — ARTE DO USUÁRIO (Cargo 1517 com guindaste articulado,
// vista lateral). Cabine avançada: motor sob a cabine; braço recolhido sobre
// a caçamba, patolas abaixadas. Sem raio-X — as cenas continuam.
const MUNCK_ARTE_LATERAL: Silhueta = {
  viewBox: '-180 -20 1760 820', chao: 'M0 0',
  rodas: [],
  corpo: <MunckArte />,
  pontos: [
    { sistema: 'Ar-condicionado', rotulo: 'Ar-condicionado', x: 120, y: 300, lx: -20, ly: 150, anchor: 'end' },
    { sistema: 'Direção', rotulo: 'Volante / direção', x: 245, y: 330, lx: -20, ly: 330, anchor: 'end' },
    { sistema: 'Elétrica', rotulo: 'Elétrica / bateria', x: 455, y: 480, lx: -20, ly: 500, anchor: 'end' },
    { sistema: 'Interior', rotulo: 'Bancos / interior', x: 350, y: 290, lx: 300, ly: 55, anchor: 'middle' },
    { sistema: 'Itens de segurança', rotulo: 'Cintos / segurança', x: 420, y: 380, lx: 470, ly: 55, anchor: 'middle' },
    { sistema: 'Outros', rotulo: 'Braço (munck)', x: 1290, y: 200, lx: 1400, ly: 150, anchor: 'start' },
    { sistema: 'Carroceria', rotulo: 'Caçamba / carroceria', x: 1320, y: 430, lx: 1400, ly: 420, anchor: 'start' },
    { sistema: 'Motor', rotulo: 'Motor', x: 330, y: 495, lx: 150, ly: 718, anchor: 'middle' },
    { sistema: 'Freios', rotulo: 'Freios', x: 370, y: 620, lx: 400, ly: 718, anchor: 'middle' },
    { sistema: 'Transmissão', rotulo: 'Câmbio / cardan', x: 560, y: 550, lx: 620, ly: 718, anchor: 'middle' },
    { sistema: 'Suspensão', rotulo: 'Molas / suspensão', x: 900, y: 550, lx: 840, ly: 718, anchor: 'middle' },
    { sistema: 'Rodas e Pneus', rotulo: 'Rodas e pneus', x: 1020, y: 650, lx: 1060, ly: 718, anchor: 'middle' },
  ],
};

// Caminhão comum — ARTE DO USUÁRIO (basculante em corte lateral). Cabine
// avançada com motor embaixo, caçamba com levante hidráulico, tanque e
// escape sob o quadro. Sem raio-X — as cenas continuam.
const CAMINHAO_ARTE_LATERAL: Silhueta = {
  viewBox: '-180 -20 1760 820', chao: 'M0 0',
  rodas: [],
  corpo: <CaminhaoArte />,
  pontos: [
    { sistema: 'Ar-condicionado', rotulo: 'Ar-condicionado', x: 165, y: 175, lx: -20, ly: 150, anchor: 'end' },
    { sistema: 'Direção', rotulo: 'Volante / direção', x: 150, y: 345, lx: -20, ly: 330, anchor: 'end' },
    { sistema: 'Elétrica', rotulo: 'Elétrica / bateria', x: 48, y: 440, lx: -20, ly: 500, anchor: 'end' },
    { sistema: 'Interior', rotulo: 'Bancos / interior', x: 275, y: 330, lx: 300, ly: 55, anchor: 'middle' },
    { sistema: 'Itens de segurança', rotulo: 'Cintos / segurança', x: 375, y: 320, lx: 470, ly: 55, anchor: 'middle' },
    { sistema: 'Outros', rotulo: 'Levante / implemento', x: 560, y: 150, lx: 640, ly: 55, anchor: 'middle' },
    { sistema: 'Carroceria', rotulo: 'Caçamba / carroceria', x: 1050, y: 260, lx: 1400, ly: 240, anchor: 'start' },
    { sistema: 'Motor', rotulo: 'Motor', x: 220, y: 520, lx: 150, ly: 718, anchor: 'middle' },
    { sistema: 'Freios', rotulo: 'Freios', x: 330, y: 615, lx: 400, ly: 718, anchor: 'middle' },
    { sistema: 'Transmissão', rotulo: 'Câmbio / cardan', x: 490, y: 555, lx: 560, ly: 718, anchor: 'middle' },
    { sistema: 'Suspensão', rotulo: 'Molas / suspensão', x: 880, y: 545, lx: 800, ly: 718, anchor: 'middle' },
    { sistema: 'Rodas e Pneus', rotulo: 'Rodas e pneus', x: 1075, y: 655, lx: 1060, ly: 718, anchor: 'middle' },
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

// exportado só pra render de verificação (scripts de preview)
// carro e hatch usam a MESMA arte lateral do usuário (Fox); os desenhos à mão
// CARRO/HATCH ficam de reserva pra tipos sem arte
export const SILHUETAS: Record<TipoSilhueta, Silhueta> = {
  carro: CARRO_ARTE_LATERAL, hatch: CARRO_ARTE_LATERAL, picape: PICAPE,
  caminhao: CAMINHAO_ARTE_LATERAL, munck: MUNCK_ARTE_LATERAL, moto: MOTO, carreta: CARRETA,
};
void HATCH; // desenho antigo preservado (referência/reserva)
void CAMINHAO; // idem — caminhão à mão vira reserva

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
  // vista escolhida no seletor (null = lateral); com vista SEM zoom, a cena
  // mostra todas as peças coloridas e o clique numa peça foca o sistema dela
  const [vista, setVista] = useState<string | null>(null);
  const pontoZoom = zoom ? pontos.find((p) => p.sistema === zoom) || null : null;

  // geometria do viewBox (a arte da picape usa um MAIOR que o das outras —
  // k escala discos/rótulos dos pontos pro tamanho aparente ficar o mesmo)
  const vb = useMemo(() => {
    const [x, y, w, h] = s.viewBox.split(' ').map(Number);
    return { x, y, w, h, cy: y + h / 2, k: w / 1160 };
  }, [s.viewBox]);
  const k = vb.k;

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

  // raio-X: com zoom + anatomia, a carroceria esmaece e as peças internas
  // aparecem no lugar real. Tipos com ARTE lateral (carro/hatch/picape) não
  // usam: o corte do usuário já mostra as entranhas de fábrica
  const arteLateral = tipo === 'carro' || tipo === 'hatch' || tipo === 'picape' || tipo === 'munck' || tipo === 'caminhao';
  const anatomia = pecasPorSistema && !arteLateral ? ANATOMIAS[tipo] : undefined;
  const raioX = !!(zoom && anatomia);

  // cena de ponto de vista: a lateral se afasta (zoom+fade) e entra a vista
  // de quem foi ATÉ a região — frente com capô aberto, cabine, roda, traseira.
  // Vale pros tipos "carro" (a picape usa cena mesmo SEM raio-X próprio: a
  // arte lateral dela já é um corte de fábrica)
  const temCenas = !!pecasPorSistema && arteLateral;
  // picape, carro/hatch e munck usam as CENAS DO USUÁRIO (artes próprias)
  const mapaCenas =
    tipo === 'picape' ? CENAS_PICAPE : tipo === 'munck' ? CENAS_MUNCK :
    tipo === 'caminhao' ? CENAS_CAMINHAO : CENAS_CARRO;
  const mapaSistemaCena =
    tipo === 'picape' ? CENA_DO_SISTEMA_PICAPE : tipo === 'munck' ? CENA_DO_SISTEMA_MUNCK :
    tipo === 'caminhao' ? CENA_DO_SISTEMA_CAMINHAO : CENA_DO_SISTEMA_CARRO;
  const cenaKey = temCenas ? (vista ?? (zoom ? mapaSistemaCena[zoom] : undefined)) : undefined;
  const cena = cenaKey ? mapaCenas[cenaKey] : undefined;
  const vistas =
    tipo === 'picape' ? VISTAS_PICAPE : tipo === 'munck' ? VISTAS_MUNCK :
    tipo === 'caminhao' ? VISTAS_CAMINHAO : VISTAS_CARRO;
  // rótulos/linhas das cenas foram calibrados num viewBox de 800 de largura;
  // as artes da picape usam 1408 — kc mantém o tamanho aparente
  const kc = cena ? Number(cena.viewBox.split(' ')[2]) / 800 : 1;

  const clicar = (sistema: string) => {
    if (pecasPorSistema) {
      setZoom((z) => (z === sistema ? null : sistema));
      onSelecionar(sistema);
      return;
    }
    onSelecionar(sistema); // sem dados de peças: comportamento antigo
  };

  // uma peça interna do raio-X: cor da gravidade do componente casado; peça
  // de OUTRO sistema fica fantasma; rótulo com linha-guia só no sistema aberto
  const desenharPecaInterna = (pt: PecaInterna, i: number) => {
    const doSistema = pt.sistema === zoom;
    const pc = doSistema && pt.casa ? pecas.find((x) => pt.casa!.test(x.rotulo)) : undefined;
    const cg = pc?.pior ? GRAVIDADE_COR[pc.pior] : null;
    const cor = doSistema ? (cg ? cg.forte : '#3b82f6') : 'var(--portal-text-muted, #64748b)';
    return (
      <g key={pt.id} color={cor}
        style={{
          opacity: doSistema ? 1 : 0.3,
          animation: `diagrama-xray .45s ${0.1 + i * 0.035}s cubic-bezier(.3,0,.2,1) backwards`,
        }}>
        {pt.desenho}
        {doSistema && pt.rotulo && (
          <g style={{ pointerEvents: 'none' }}>
            <line x1={pt.ax} y1={pt.ay} x2={pt.lx} y2={pt.ly + 3} stroke={cor} strokeWidth="1.1" opacity="0.8" />
            <text x={pt.lx} y={pt.ly} textAnchor={pt.anchor} fontSize="12" fontWeight="800" fill={cor}
              stroke="var(--portal-bg-card, #fff)" strokeWidth="3.5" paintOrder="stroke">
              {pt.rotulo}{pc && pc.total > 0 ? ` · ${pc.total}` : ''}
            </text>
          </g>
        )}
      </g>
    );
  };

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      {/* ── seletor de vistas: pula direto pra qualquer cena ── */}
      {temCenas && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '0 0 10px' }}>
          {vistas.map((v) => {
            const ativa = (cenaKey ?? null) === v.key;
            return (
              <button key={v.rot} type="button"
                onClick={() => { setVista(v.key); setZoom(null); }}
                title={v.key ? `Ver ${v.rot.toLowerCase()} com todas as peças` : 'Voltar pra vista lateral'}
                style={{
                  padding: '5px 12px', fontSize: 11.5, fontWeight: 800, cursor: 'pointer',
                  textTransform: 'uppercase', letterSpacing: '.4px', borderRadius: 0,
                  border: `1.5px solid ${ativa ? '#1e40af' : 'var(--portal-border, #e2e8f0)'}`,
                  background: ativa ? '#1e40af' : 'var(--portal-bg-card, #fefefe)',
                  color: ativa ? '#fefefe' : 'var(--portal-text-secondary, #64748b)',
                }}>
                {v.rot}
              </button>
            );
          })}
        </div>
      )}
      <div style={{ position: 'relative', minWidth: 580 }}>
        <svg viewBox={s.viewBox}
          style={{ width: '100%', height: 'auto', display: 'block', opacity: cena ? 0 : 1, transition: 'opacity .45s .2s' }}
          role="img" aria-label={`Mapa do veículo (${tipo}) com as pendências por sistema`}
          onClick={() => { if (zoom) setZoom(null); }}>
          <g style={{ transform: transformCena, transition: 'transform .85s cubic-bezier(.45,0,.18,1)', transformOrigin: '0 0' }}>
            <g color="var(--portal-text-muted, #64748b)"
              style={{ opacity: raioX ? 0.16 : 1, transition: 'opacity .6s .15s' }}>
              {/* LATARIA pintada na lateral (batida/amassado): a forma exata
                  da carcaça extraída da arte, na cor da pendência aberta em
                  lataria/funilaria — por baixo do traço, como nas cenas */}
              {arteLateral && pecasPorSistema && (() => {
                const d = FORMAS_CENAS[
                  tipo === 'picape' ? 'lateral:lataria' : tipo === 'munck' ? 'mk-lateral:lataria' :
                  tipo === 'caminhao' ? 'cm-lateral:lataria' : 'c-lateral:lataria'
                ];
                const pcL = (pecasPorSistema.get('Carroceria') || [])
                  .find((x) => /lataria|funilaria|pintura|amassad|para.?lama|carroceria/i.test(x.rotulo));
                if (!d || !pcL?.pior) return null;
                return <path fillRule="evenodd" fill={GRAVIDADE_COR[pcL.pior].forte} opacity={0.45} d={d} />;
              })()}
              {s.corpo}
              {/* motor "gravado" no cofre (traços na cor do card, como os
                  vidros) — só quando o capô levanta SEM o raio-X (com o
                  raio-X a peça 'motor' da anatomia assume o lugar) */}
              {s.capo && !anatomia && (
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
            </g>
            {/* raio-X ATRÁS das rodas: a roda encobre o que invade a caixa dela */}
            {raioX && anatomia!.map((pt, i) => (pt.sobreRoda ? null : desenharPecaInterna(pt, i)))}
            {/* rodas FORA do fade do raio-X: ancoram o desenho, como na referência */}
            <g color="var(--portal-text-muted, #64748b)">
              {s.rodas.map((r) => <Roda key={`${r.cx}-${r.cy}`} {...r} />)}
            </g>
            {/* peças DA roda (disco/pneu/amortecedor) por cima */}
            {raioX && anatomia!.map((pt, i) => (pt.sobreRoda ? desenharPecaInterna(pt, i) : null))}
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
                  <line x1={p.x} y1={p.y} x2={p.lx} y2={p.ly} stroke={cor} strokeWidth={(aceso ? 2 : 1.2) * k} opacity={aceso ? 0.9 : 0.38} />
                  {/* disco de fundo: separa o ícone do desenho atrás dele */}
                  <circle cx={p.x} cy={p.y} r={R * k} fill={aceso ? GRAVIDADE_COR[pior!].bg : 'var(--portal-bg-card, #fff)'}
                    stroke={ativo ? '#1e40af' : cor} strokeWidth={(ativo ? 3 : aceso ? 2.4 : 1.6) * k}>
                    {/* pisca só grave/crítica: piscar tudo não chama atenção pra nada */}
                    {(pior === 'grave' || pior === 'critica') && (
                      <animate attributeName="opacity" values="1;0.45;1" dur="1.4s" repeatCount="indefinite" />
                    )}
                  </circle>
                  <g transform={`translate(${p.x} ${p.y}) scale(${k})`} color={aceso ? GRAVIDADE_COR[pior!].cor : CINZA} style={{ pointerEvents: 'none' }}>
                    <Glifo sistema={p.sistema} />
                  </g>
                  {aceso && (
                    <g style={{ pointerEvents: 'none' }}>
                      <circle cx={p.x + 13 * k} cy={p.y - 13 * k} r={9 * k} fill={cor} stroke="var(--portal-bg-card, #fff)" strokeWidth={2 * k} />
                      <text x={p.x + 13 * k} y={p.y - 9.6 * k} textAnchor="middle" fontSize={11 * k} fontWeight="800" fill="#fff">{c!.total}</text>
                    </g>
                  )}
                  <text x={p.lx} y={p.ly} textAnchor={p.anchor} fontSize={13.5 * k} fontWeight={aceso ? 800 : 600}
                    fill={aceso ? GRAVIDADE_COR[pior!].cor : 'var(--portal-text-secondary, #64748b)'} style={{ pointerEvents: 'none' }}>
                    {p.rotulo}
                  </text>
                  {aceso && (
                    <text x={p.lx} y={p.ly + 15 * k} textAnchor={p.anchor} fontSize={11.5 * k} fontWeight="700"
                      fill={GRAVIDADE_COR[pior!].cor} opacity="0.85" style={{ pointerEvents: 'none' }}>
                      {c!.total} · {GRAVIDADE_LABEL[pior!].toLowerCase()}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        {/* ── CENA DE PONTO DE VISTA: entra por cima da lateral ── */}
        {cena && (
          <div onClick={() => { if (zoom) setZoom(null); else setVista(null); }}
            style={{
              position: 'absolute', inset: 0, paddingRight: zoom ? 'min(46%, 338px)' : 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              animation: 'diagrama-cena .65s cubic-bezier(.3,0,.18,1)',
              transition: 'padding-right .45s cubic-bezier(.3,0,.2,1)',
            }}>
            <svg viewBox={cena.viewBox} style={{ width: '100%', height: '100%', display: 'block' }}
              role="img" aria-label={cena.titulo}>
              <style>{`
                .cena-baixo .pt-hit{display:none}
                .cena-cima .pt-fill{opacity:0;transition:opacity .2s}
                .cena-cima g.pt-alvo:hover .pt-fill{opacity:.14}
                .so-hit .pt-fill{display:none}
              `}</style>
              {/* TINTA: em cena de ARTE a peça é pintada POR BAIXO do traço.
                  Quando existe a FORMA EXATA extraída da própria arte
                  (formas-cenas, chave "cena:id"), a tinta segue o contorno
                  real da peça; senão cai na mancha aproximada (marca/marcaO) */}
              {cena.arte && (
                <g className="cena-baixo">
                  {cena.pecas.map((pt, i) => {
                    const doSistema = pt.sistema === zoom;
                    const pcsB = pecasPorSistema?.get(pt.sistema) || [];
                    const pcB = pt.casa ? pcsB.find((x) => pt.casa!.test(x.rotulo)) : undefined;
                    const cgB = (!zoom || doSistema) && pcB?.pior ? GRAVIDADE_COR[pcB.pior] : null;
                    // pinta: peça com pendência (sempre) e, no zoom, a peça do
                    // sistema focado mesmo sem pendência (azul suave)
                    if (!cgB && !(zoom && doSistema)) return null;
                    const dForma = FORMAS_CENAS[`${cenaKey}:${pt.id}`];
                    return (
                      <g key={pt.id} color={cgB ? cgB.forte : '#3b82f6'} opacity={cgB ? (dForma ? 0.55 : 0.42) : (dForma ? 0.3 : 0.2)}
                        style={{ animation: `diagrama-xray .5s ${0.25 + i * 0.045}s cubic-bezier(.3,0,.2,1) backwards` }}>
                        {dForma ? <path fillRule="evenodd" fill="currentColor" d={dForma} /> : pt.desenho}
                      </g>
                    );
                  })}
                </g>
              )}
              <g color="var(--portal-text-muted, #64748b)">{cena.fundo}</g>
              <g className="cena-cima">
                {cena.pecas.map((pt, i) => {
                  // sem zoom (vista solta) TODAS as peças acendem, cada uma pela
                  // própria gravidade; com zoom só o sistema focado fica aceso
                  const modoTodas = !zoom;
                  const doSistema = pt.sistema === zoom;
                  const pcs = pecasPorSistema?.get(pt.sistema) || [];
                  const pc = pt.casa ? pcs.find((x) => pt.casa!.test(x.rotulo)) : undefined;
                  const temPend = !!pc?.pior;
                  const cg = (doSistema || modoTodas) && temPend ? GRAVIDADE_COR[pc!.pior!] : null;
                  const cor = cg ? cg.forte
                    : modoTodas ? 'var(--portal-text-secondary, #64748b)'
                    : doSistema ? '#3b82f6' : 'var(--portal-text-muted, #64748b)';
                  // na cena de arte o fantasma vira só um rótulo fraco (a arte
                  // continua limpa); nas cenas desenhadas ele segue esmaecido
                  const mostraRotulo = modoTodas || doSistema || cena.arte;
                  const opRotulo = modoTodas ? (cg ? 1 : 0.8) : doSistema ? 1 : 0.35;
                  // com forma exata, o hover acende o contorno real; o shape
                  // aproximado vira só área de clique (fill escondido)
                  const dForma = cena.arte ? FORMAS_CENAS[`${cenaKey}:${pt.id}`] : undefined;
                  return (
                    <g key={pt.id} color={cor} className="pt-alvo"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (modoTodas || !doSistema) { setZoom(pt.sistema); onSelecionar(pt.sistema); }
                        else if ((pc?.total || 0) > 0 && onAbrirHistorico) onAbrirHistorico(zoom!);
                      }}
                      style={{
                        cursor: 'pointer',
                        opacity: modoTodas ? (cg ? 1 : 0.72) : doSistema ? 1 : (cena.arte ? 1 : 0.28),
                        animation: `diagrama-xray .45s ${0.25 + i * 0.045}s cubic-bezier(.3,0,.2,1) backwards`,
                      }}>
                      <title>{doSistema
                        ? (pc && pc.total > 0 ? `${pt.rotulo}: ${pc.total} pendência(s). Clique para ver no histórico.` : `${pt.rotulo}: ok`)
                        : `${pt.rotulo} — clique para focar ${pt.sistema}`}</title>
                      <g className={dForma ? 'so-hit' : undefined}>{pt.desenho}</g>
                      {dForma && <path className="pt-fill" fillRule="evenodd" fill="currentColor" d={dForma} style={{ pointerEvents: 'none' }} />}
                      {mostraRotulo && pt.rotulo && (
                        <g style={{ pointerEvents: 'none' }} opacity={opRotulo}>
                          <line x1={pt.ax} y1={pt.ay} x2={pt.lx} y2={pt.ly + 4 * kc} stroke={cor} strokeWidth={1.4 * kc} opacity={modoTodas && !cg ? 0.45 : 0.8} />
                          <text x={pt.lx} y={pt.ly} textAnchor={pt.anchor} fontSize={17 * kc} fontWeight="800" fill={cor}
                            stroke="var(--portal-bg-card, #fff)" strokeWidth={5 * kc} paintOrder="stroke">
                            {pt.rotulo}{pc && pc.total > 0 ? ` · ${pc.total}` : ''}
                          </text>
                        </g>
                      )}
                    </g>
                  );
                })}
              </g>
              {/* sem título dentro do desenho: colidia com os rótulos das
                  peças (os chips de vista e o painel já dizem onde se está) */}
            </svg>
          </div>
        )}

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
          @keyframes diagrama-xray { from { opacity: 0; } }
          @keyframes diagrama-cena { from { opacity: 0; transform: scale(.55); } to { opacity: 1; transform: none; } }
          @media (prefers-reduced-motion: reduce) {
            @keyframes diagrama-painel { from { opacity: 0 } to { opacity: 1 } }
            @keyframes diagrama-peca { from { opacity: 0 } to { opacity: 1 } }
          }
        `}</style>
      </div>
    </div>
  );
}
