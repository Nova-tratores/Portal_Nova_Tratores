// @ts-nocheck â€” script temporÃ¡rio fora do app (pngjs sem tipos)
/* Extrai a FORMA EXATA de cada peÃ§a a partir do PNG da arte (apagar depois).
   Como: dentro da caixa aproximada da peÃ§a, marca os pixels CLAROS que NÃƒO
   alcanÃ§am a borda da caixa (= regiÃµes fechadas pelos traÃ§os do desenho,
   como um balde de tinta), dilata pra tinta encostar no traÃ§o, vetoriza o
   contorno (marching squares) e simplifica (Douglas-Peucker).
   SaÃ­da: src/lib/frota/formas-cenas.ts + debug HTML no scratchpad. */
import { readFileSync, writeFileSync } from 'fs';
import { PNG } from 'pngjs';

type Caixa = [number, number, number, number];
interface Peca { cena: string; id: string; boxes: Caixa[] }

const PAD = 14;          // folga em volta da caixa aproximada
const CLARO = 175;       // luminÃ¢ncia mÃ­nima pra contar como "branco"
const DILATA = 2;        // engorda a regiÃ£o atÃ© o meio do traÃ§o
const AREA_MIN = 60;     // descarta ilhas menores que isto (px)
const TOL = 1.4;         // tolerÃ¢ncia da simplificaÃ§Ã£o (px)

const PECAS: Peca[] = [
  // cofre
  { cena: 'frente', id: 'motor', boxes: [[555, 185, 270, 200]] },
  { cena: 'frente', id: 'filtro', boxes: [[238, 240, 330, 155]] },
  { cena: 'frente', id: 'radiador', boxes: [[352, 478, 710, 85]] },
  { cena: 'frente', id: 'reservarrefec', boxes: [[215, 175, 140, 130]] },
  { cena: 'frente', id: 'escapcofre', boxes: [[475, 410, 110, 90]] },
  { cena: 'frente', id: 'bateria', boxes: [[925, 372, 260, 120]] },
  { cena: 'frente', id: 'fusiveis', boxes: [[985, 218, 200, 180]] },
  { cena: 'frente', id: 'alternador', boxes: [[675, 325, 120, 120]] },
  { cena: 'frente', id: 'palhetas', boxes: [[485, 15, 610, 82]] },
  { cena: 'frente', id: 'reservlimpador', boxes: [[185, 375, 140, 110]] },
  { cena: 'frente', id: 'cilindrofreio', boxes: [[842, 172, 140, 145]] },
  { cena: 'frente', id: 'escoras', boxes: [[205, 20, 80, 235], [1025, 20, 85, 235]] },
  { cena: 'frente', id: 'gradecofre', boxes: [[245, 585, 885, 160]] },
  { cena: 'frente', id: 'faroiscofre', boxes: [[90, 575, 145, 85], [1128, 575, 145, 85]] },
  // frente fechada
  { cena: 'carroceria', id: 'parabrisa', boxes: [[415, 58, 545, 160]] },
  { cena: 'carroceria', id: 'palhetasf', boxes: [[455, 212, 480, 40]] },
  { cena: 'carroceria', id: 'capo', boxes: [[345, 230, 665, 75]] },
  { cena: 'carroceria', id: 'retrovisores', boxes: [[250, 190, 125, 115], [1012, 198, 90, 92]] },
  { cena: 'carroceria', id: 'parachoque', boxes: [[398, 440, 690, 128]] },
  { cena: 'carroceria', id: 'farois', boxes: [[405, 303, 85, 95], [928, 303, 85, 95]] },
  { cena: 'carroceria', id: 'grade', boxes: [[508, 293, 380, 145]] },
  { cena: 'carroceria', id: 'suspdiant', boxes: [[438, 545, 540, 118]] },
  { cena: 'carroceria', id: 'pneus', boxes: [[348, 415, 158, 285], [962, 415, 158, 285]] },
  // traseira
  { cena: 'traseira', id: 'luzfreio', boxes: [[635, 32, 105, 35]] },
  { cena: 'traseira', id: 'vidrotras', boxes: [[430, 70, 505, 118]] },
  { cena: 'traseira', id: 'cacamba', boxes: [[410, 235, 578, 210]] },
  { cena: 'traseira', id: 'tampa', boxes: [[650, 250, 90, 55]] },
  { cena: 'traseira', id: 'lanternas', boxes: [[368, 265, 55, 135], [995, 265, 55, 135]] },
  { cena: 'traseira', id: 'parachoquetras', boxes: [[345, 462, 715, 100]] },
  { cena: 'traseira', id: 'susptras', boxes: [[470, 560, 75, 85], [860, 560, 75, 85]] },
  { cena: 'traseira', id: 'engate', boxes: [[635, 547, 130, 96]] },
  { cena: 'traseira', id: 'escapamento', boxes: [[905, 533, 110, 64]] },
  { cena: 'traseira', id: 'pneustras', boxes: [[355, 610, 95, 130], [950, 610, 100, 130]] },
  // cabine
  { cena: 'cabine', id: 'retrovint', boxes: [[638, 28, 175, 52]] },
  { cena: 'cabine', id: 'cintos', boxes: [[225, 30, 60, 145], [1202, 35, 72, 170]] },
  { cena: 'cabine', id: 'volante', boxes: [[290, 168, 280, 264]] },
  { cena: 'cabine', id: 'instrumentos', boxes: [[370, 225, 180, 65]] },
  { cena: 'cabine', id: 'multimidia', boxes: [[655, 252, 170, 95]] },
  { cena: 'cabine', id: 'difusores', boxes: [[606, 248, 54, 92], [826, 248, 58, 92]] },
  { cena: 'cabine', id: 'clima', boxes: [[650, 395, 175, 55]] },
  { cena: 'cabine', id: 'portaluvas', boxes: [[845, 378, 320, 95]] },
  { cena: 'cabine', id: 'cambio', boxes: [[655, 435, 135, 200]] },
  { cena: 'cabine', id: 'pedais', boxes: [[458, 480, 115, 65]] },
  { cena: 'cabine', id: 'portavidros', boxes: [[88, 455, 105, 85]] },
  { cena: 'cabine', id: 'bancos', boxes: [[168, 545, 390, 220], [800, 545, 400, 220]] },
  { cena: 'cabine', id: 'console', boxes: [[560, 575, 215, 185]] },
  // roda
  { cena: 'roda', id: 'pneu', boxes: [[300, 30, 260, 440], [445, 0, 510, 190], [235, 395, 330, 360], [835, 35, 300, 330]] },
  { cena: 'roda', id: 'aro', boxes: [[605, 320, 540, 448]] },
  { cena: 'roda', id: 'porcas', boxes: [[660, 495, 250, 250]] },
];

const scratch = process.argv[2];
const imgs = new Map<string, { data: Buffer; width: number; height: number }>();
for (const cena of ['frente', 'carroceria', 'traseira', 'cabine', 'roda']) {
  const png = PNG.sync.read(readFileSync(`${scratch}/arte-${cena}.png`));
  imgs.set(cena, { data: png.data, width: png.width, height: png.height });
}

function claro(img: { data: Buffer; width: number }, x: number, y: number) {
  const i = (y * img.width + x) * 4;
  return (img.data[i] + img.data[i + 1] + img.data[i + 2]) / 3 > CLARO;
}

/** mÃ¡scara (0/1) do interior fechado da caixa; coords locais da caixa */
function mascaraFechada(img: { data: Buffer; width: number; height: number }, cx: Caixa): Uint8Array | null {
  const x0 = Math.max(0, cx[0] - PAD), y0 = Math.max(0, cx[1] - PAD);
  const x1 = Math.min(img.width - 1, cx[0] + cx[2] + PAD), y1 = Math.min(img.height - 1, cx[1] + cx[3] + PAD);
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const ext = new Uint8Array(w * h);
  const fila: number[] = [];
  const tenta = (lx: number, ly: number) => {
    if (lx < 0 || ly < 0 || lx >= w || ly >= h) return;
    const k = ly * w + lx;
    if (ext[k]) return;
    if (!claro(img, x0 + lx, y0 + ly)) return;
    ext[k] = 1; fila.push(k);
  };
  for (let lx = 0; lx < w; lx++) { tenta(lx, 0); tenta(lx, h - 1); }
  for (let ly = 0; ly < h; ly++) { tenta(0, ly); tenta(w - 1, ly); }
  while (fila.length) {
    const k = fila.pop()!; const lx = k % w, ly = (k / w) | 0;
    tenta(lx + 1, ly); tenta(lx - 1, ly); tenta(lx, ly + 1); tenta(lx, ly - 1);
  }
  // interior = claro e nÃ£o-exterior
  let n = 0;
  const dentro = new Uint8Array(w * h);
  for (let ly = 0; ly < h; ly++) for (let lx = 0; lx < w; lx++) {
    const k = ly * w + lx;
    if (!ext[k] && claro(img, x0 + lx, y0 + ly)) { dentro[k] = 1; n++; }
  }
  if (n < AREA_MIN) return null;
  // remove ilhas pequenas (rotulagem por flood)
  const vis = new Uint8Array(w * h);
  for (let s = 0; s < w * h; s++) {
    if (!dentro[s] || vis[s]) continue;
    const comp: number[] = [s]; vis[s] = 1;
    for (let q = 0; q < comp.length; q++) {
      const k = comp[q]; const lx = k % w, ly = (k / w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = lx + dx, ny = ly + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const nk = ny * w + nx;
        if (dentro[nk] && !vis[nk]) { vis[nk] = 1; comp.push(nk); }
      }
    }
    if (comp.length < AREA_MIN) for (const k of comp) dentro[k] = 0;
  }
  // dilata (fecha traÃ§os finos internos e encosta no traÃ§o da borda)
  let m = dentro;
  for (let d = 0; d < DILATA; d++) {
    const out = new Uint8Array(w * h);
    for (let ly = 0; ly < h; ly++) for (let lx = 0; lx < w; lx++) {
      const k = ly * w + lx;
      if (m[k] || (lx > 0 && m[k - 1]) || (lx < w - 1 && m[k + 1]) || (ly > 0 && m[k - w]) || (ly < h - 1 && m[k + w])) out[k] = 1;
    }
    m = out;
  }
  (m as unknown as { _meta?: number[] })._meta = [x0, y0, w, h];
  return m;
}

/** marching squares â†’ loops de vÃ©rtices (coords globais) */
function contornos(m: Uint8Array, meta: number[]): number[][][] {
  const [x0, y0, w, h] = meta;
  const at = (lx: number, ly: number) => (lx < 0 || ly < 0 || lx >= w || ly >= h ? 0 : m[ly * w + lx]);
  // arestas entre vÃ©rtices da grade (w+1)x(h+1)
  const segs = new Map<string, [number, number][]>(); // chave "x,y" origem â†’ destinos
  const add = (ax: number, ay: number, bx: number, by: number) => {
    const k = `${ax},${ay}`;
    if (!segs.has(k)) segs.set(k, []);
    segs.get(k)!.push([bx, by]);
  };
  for (let ly = -1; ly < h; ly++) for (let lx = -1; lx < w; lx++) {
    const tl = at(lx, ly), tr = at(lx + 1, ly), bl = at(lx, ly + 1), br = at(lx + 1, ly + 1);
    const caso = (tl ? 8 : 0) | (tr ? 4 : 0) | (br ? 2 : 0) | (bl ? 1 : 0);
    const L: [number, number] = [lx, ly + 1], R: [number, number] = [lx + 1, ly + 1], T: [number, number] = [lx + 1, ly], B: [number, number] = [lx + 1, ly + 2];
    // pontos mÃ©dios (em coordenadas x2 pra ficar inteiro): usamos grade de meio passo
    const cT: [number, number] = [2 * lx + 2, 2 * ly + 1];
    const cB: [number, number] = [2 * lx + 2, 2 * ly + 3];
    const cL: [number, number] = [2 * lx + 1, 2 * ly + 2];
    const cR: [number, number] = [2 * lx + 3, 2 * ly + 2];
    const liga = (a: [number, number], b: [number, number]) => add(a[0], a[1], b[0], b[1]);
    switch (caso) {
      case 1: liga(cB, cL); break;
      case 2: liga(cR, cB); break;
      case 3: liga(cR, cL); break;
      case 4: liga(cT, cR); break;
      case 5: liga(cT, cL); liga(cB, cR); break;
      case 6: liga(cT, cB); break;
      case 7: liga(cT, cL); break;
      case 8: liga(cL, cT); break;
      case 9: liga(cB, cT); break;
      case 10: liga(cL, cB); liga(cR, cT); break;
      case 11: liga(cR, cT); break;
      case 12: liga(cL, cR); break;
      case 13: liga(cB, cR); break;
      case 14: liga(cL, cB); break;
    }
    void L; void R; void T; void B;
  }
  const loops: number[][][] = [];
  const usados = new Set<string>();
  for (const [ini, dests] of segs) {
    for (let di = 0; di < dests.length; di++) {
      const chaveSeg = `${ini}>${di}`;
      if (usados.has(chaveSeg)) continue;
      // percorre
      let [cx, cy] = ini.split(',').map(Number);
      let alvo = dests[di];
      usados.add(chaveSeg);
      const loop: number[][] = [[cx, cy]];
      let guard = 0;
      while (guard++ < 500000) {
        loop.push([alvo[0], alvo[1]]);
        const k = `${alvo[0]},${alvo[1]}`;
        const prox = segs.get(k);
        if (!prox) break;
        let achou = -1;
        for (let i = 0; i < prox.length; i++) {
          if (!usados.has(`${k}>${i}`)) { achou = i; break; }
        }
        if (achou < 0) break;
        usados.add(`${k}>${achou}`);
        cx = alvo[0]; cy = alvo[1];
        alvo = prox[achou];
        if (alvo[0] === loop[0][0] && alvo[1] === loop[0][1]) { break; }
      }
      if (loop.length > 6) loops.push(loop);
    }
  }
  // meio-passo â†’ coords reais globais
  return loops.map((lp) => lp.map(([mx, my]) => [x0 + mx / 2, y0 + my / 2]));
}

function rdp(pts: number[][], tol: number): number[][] {
  if (pts.length < 4) return pts;
  const d2 = (p: number[], a: number[], b: number[]) => {
    const vx = b[0] - a[0], vy = b[1] - a[1];
    const l2 = vx * vx + vy * vy;
    if (!l2) { const dx = p[0] - a[0], dy = p[1] - a[1]; return dx * dx + dy * dy; }
    let t = ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / l2;
    t = Math.max(0, Math.min(1, t));
    const dx = p[0] - (a[0] + t * vx), dy = p[1] - (a[1] + t * vy);
    return dx * dx + dy * dy;
  };
  const marca = new Uint8Array(pts.length); marca[0] = marca[pts.length - 1] = 1;
  const pilha: [number, number][] = [[0, pts.length - 1]];
  while (pilha.length) {
    const [a, b] = pilha.pop()!;
    let imax = -1, dmax = 0;
    for (let i = a + 1; i < b; i++) {
      const d = d2(pts[i], pts[a], pts[b]);
      if (d > dmax) { dmax = d; imax = i; }
    }
    if (dmax > tol * tol && imax > 0) { marca[imax] = 1; pilha.push([a, imax], [imax, b]); }
  }
  return pts.filter((_, i) => marca[i]);
}

function area(lp: number[][]) {
  let s = 0;
  for (let i = 0; i < lp.length - 1; i++) s += lp[i][0] * lp[i + 1][1] - lp[i + 1][0] * lp[i][1];
  return Math.abs(s / 2);
}

const FORMAS: Record<string, string> = {};
const relat: string[] = [];
for (const p of PECAS) {
  const img = imgs.get(p.cena)!;
  const partes: string[] = [];
  let nloops = 0;
  for (const cx of p.boxes) {
    const m = mascaraFechada(img, cx);
    if (!m) continue;
    const meta = (m as unknown as { _meta: number[] })._meta;
    let loops = contornos(m, meta);
    loops = loops.map((lp) => rdp(lp, TOL)).filter((lp) => lp.length > 3 && area(lp) > 50);
    nloops += loops.length;
    for (const lp of loops) {
      partes.push('M' + lp.map(([x, y]) => `${Math.round(x * 2) / 2} ${Math.round(y * 2) / 2}`).join('L') + 'Z');
    }
  }
  if (partes.length) FORMAS[`${p.cena}:${p.id}`] = partes.join('');
  relat.push(`${p.cena}:${p.id} â†’ ${partes.length ? 'OK' : 'VAZIO'} (${nloops} loops, ${partes.join('').length} chars)`);
}

const total = Object.values(FORMAS).join('').length;
const ts = `// GERADO POR SCRIPT (extrai-formas) a partir das artes do usuÃ¡rio â€” NÃƒO editar Ã  mÃ£o.
// Forma EXATA de cada peÃ§a: preenchimento das regiÃµes fechadas pelos traÃ§os
// do desenho (balde de tinta vetorizado). Chave "cena:id"; d com subpaths
// (usar fill-rule evenodd). PeÃ§a sem entrada usa a mancha aproximada.
export const FORMAS_CENAS: Record<string, string> = ${JSON.stringify(FORMAS, null, 0)};
`;
writeFileSync('src/lib/frota/formas-cenas.ts', ts);
console.log(relat.join('\n'));
console.log(`\ntotal: ${Object.keys(FORMAS).length} formas, ${(total / 1024).toFixed(0)}KB`);

