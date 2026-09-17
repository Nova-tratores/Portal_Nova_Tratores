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
  { cena: 'frente', id: 'reservarrefec', boxes: [[200, 165, 165, 160]] },
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
  // lataria / carcaça (batidas): frente, traseira e LATERAL (silhueta)
  { cena: 'carroceria', id: 'lataria', boxes: [[250, 230, 210, 290], [945, 230, 215, 290]] },
  { cena: 'traseira', id: 'lataria', boxes: [[300, 190, 110, 290], [1000, 190, 110, 290], [330, 55, 100, 160], [975, 55, 100, 160]] },
  { cena: 'lateral', id: 'lataria', boxes: [[150, 228, 270, 80], [455, 115, 310, 60], [725, 120, 95, 300], [52, 280, 92, 235], [1180, 255, 145, 245], [880, 275, 240, 200]] },
  // roda
  { cena: 'roda', id: 'pneu', boxes: [[300, 30, 260, 440], [445, 0, 510, 190], [235, 395, 330, 360], [835, 35, 300, 330]] },
  { cena: 'roda', id: 'aro', boxes: [[605, 320, 540, 448]] },
  { cena: 'roda', id: 'porcas', boxes: [[660, 495, 250, 250]] },
  // ── CARRO (Fox) ── cofre
  { cena: 'c-frente', id: 'motor', boxes: [[465, 205, 360, 265]] },
  { cena: 'c-frente', id: 'filtro', boxes: [[878, 285, 230, 150]] },
  { cena: 'c-frente', id: 'radiador', boxes: [[428, 442, 590, 75]] },
  { cena: 'c-frente', id: 'reservarrefec', boxes: [[292, 262, 115, 105]] },
  { cena: 'c-frente', id: 'bateria', boxes: [[255, 352, 200, 125]] },
  { cena: 'c-frente', id: 'fusiveis', boxes: [[902, 170, 118, 80]] },
  { cena: 'c-frente', id: 'alternador', boxes: [[433, 275, 90, 160]] },
  { cena: 'c-frente', id: 'palhetas', boxes: [[300, 38, 810, 80]] },
  { cena: 'c-frente', id: 'cilindrofreio', boxes: [[313, 183, 104, 90]] },
  { cena: 'c-frente', id: 'escoras', boxes: [[272, 8, 50, 165], [1078, 8, 55, 435]] },
  { cena: 'c-frente', id: 'gradecofre', boxes: [[408, 570, 600, 135]] },
  { cena: 'c-frente', id: 'faroiscofre', boxes: [[182, 468, 205, 185], [1020, 468, 210, 185]] },
  // carro — frente fechada
  { cena: 'c-carroceria', id: 'parabrisa', boxes: [[400, 35, 610, 190]] },
  { cena: 'c-carroceria', id: 'palhetasf', boxes: [[440, 192, 510, 42]] },
  { cena: 'c-carroceria', id: 'capo', boxes: [[368, 238, 675, 88]] },
  { cena: 'c-carroceria', id: 'lataria', boxes: [[280, 295, 105, 300], [1025, 295, 105, 300], [300, 415, 240, 115], [870, 415, 240, 115]] },
  { cena: 'c-carroceria', id: 'retrovisores', boxes: [[238, 178, 130, 80], [1042, 178, 130, 80]] },
  { cena: 'c-carroceria', id: 'parachoque', boxes: [[318, 432, 775, 185]] },
  { cena: 'c-carroceria', id: 'farois', boxes: [[315, 328, 150, 92], [940, 328, 150, 92]] },
  { cena: 'c-carroceria', id: 'grade', boxes: [[492, 340, 420, 92]] },
  { cena: 'c-carroceria', id: 'suspdiant', boxes: [[418, 612, 575, 70]] },
  { cena: 'c-carroceria', id: 'pneus', boxes: [[288, 595, 135, 165], [988, 595, 135, 165]] },
  // carro — traseira
  { cena: 'c-traseira', id: 'luzfreio', boxes: [[628, 22, 155, 34]] },
  { cena: 'c-traseira', id: 'vidrotras', boxes: [[515, 45, 375, 155]] },
  { cena: 'c-traseira', id: 'tampa', boxes: [[462, 22, 470, 208]] },
  { cena: 'c-traseira', id: 'caixa', boxes: [[505, 240, 400, 245]] },
  { cena: 'c-traseira', id: 'lanternas', boxes: [[415, 355, 82, 128], [910, 355, 82, 128]] },
  { cena: 'c-traseira', id: 'lataria', boxes: [[400, 295, 76, 200], [932, 295, 76, 200]] },
  { cena: 'c-traseira', id: 'parachoquetras', boxes: [[408, 490, 595, 168]] },
  { cena: 'c-traseira', id: 'escapamento', boxes: [[528, 652, 104, 60]] },
  { cena: 'c-traseira', id: 'pneustras', boxes: [[448, 658, 88, 108], [875, 658, 88, 108]] },
  // carro — cabine
  { cena: 'c-cabine', id: 'retrovint', boxes: [[630, 48, 168, 60]] },
  { cena: 'c-cabine', id: 'volante', boxes: [[337, 178, 276, 284]] },
  { cena: 'c-cabine', id: 'instrumentos', boxes: [[405, 236, 162, 72]] },
  { cena: 'c-cabine', id: 'multimidia', boxes: [[645, 305, 155, 118]] },
  { cena: 'c-cabine', id: 'difusores', boxes: [[642, 246, 165, 56], [1038, 246, 100, 62]] },
  { cena: 'c-cabine', id: 'clima', boxes: [[645, 415, 150, 60]] },
  { cena: 'c-cabine', id: 'portaluvas', boxes: [[842, 362, 295, 112]] },
  { cena: 'c-cabine', id: 'cambio', boxes: [[660, 480, 142, 165]] },
  { cena: 'c-cabine', id: 'pedais', boxes: [[492, 458, 165, 92]] },
  { cena: 'c-cabine', id: 'portavidros', boxes: [[58, 415, 215, 150]] },
  { cena: 'c-cabine', id: 'cintos', boxes: [[552, 552, 70, 125], [812, 552, 70, 125]] },
  { cena: 'c-cabine', id: 'bancos', boxes: [[198, 565, 425, 200], [805, 565, 365, 200]] },
  { cena: 'c-cabine', id: 'console', boxes: [[618, 648, 195, 115]] },
  // carro — lataria da LATERAL (batidas na silhueta)
  { cena: 'c-lateral', id: 'lataria', boxes: [[10, 375, 90, 245], [560, 25, 660, 70], [1320, 270, 85, 215], [490, 545, 580, 60], [1230, 330, 120, 170]] },
  // ── MUNCK (Cargo com braço articulado) ── motor (cabine basculada)
  { cena: 'mk-frente', id: 'motor', boxes: [[590, 90, 290, 390]] },
  { cena: 'mk-frente', id: 'filtro', boxes: [[190, 245, 210, 310]] },
  { cena: 'mk-frente', id: 'radiador', boxes: [[450, 620, 530, 140]] },
  { cena: 'mk-frente', id: 'reservarrefec', boxes: [[195, 82, 112, 88]] },
  { cena: 'mk-frente', id: 'correia', boxes: [[505, 480, 265, 90]] },
  { cena: 'mk-frente', id: 'turbo', boxes: [[855, 195, 130, 190]] },
  { cena: 'mk-frente', id: 'alternador', boxes: [[500, 410, 110, 120]] },
  { cena: 'mk-frente', id: 'fusiveis', boxes: [[1120, 125, 150, 190]] },
  { cena: 'mk-frente', id: 'bateria', boxes: [[1065, 375, 200, 190]] },
  { cena: 'mk-frente', id: 'servofreio', boxes: [[905, 77, 170, 116]] },
  { cena: 'mk-frente', id: 'bombadir', boxes: [[837, 377, 96, 96], [952, 142, 96, 95]] },
  // munck — frente fechada
  { cena: 'mk-carroceria', id: 'braco', boxes: [[585, 20, 360, 185]] },
  { cena: 'mk-carroceria', id: 'parabrisa', boxes: [[500, 215, 410, 180]] },
  { cena: 'mk-carroceria', id: 'palhetasf', boxes: [[525, 345, 320, 50]] },
  { cena: 'mk-carroceria', id: 'retrovisores', boxes: [[420, 282, 58, 100], [933, 282, 58, 100]] },
  { cena: 'mk-carroceria', id: 'painelfrontal', boxes: [[498, 390, 415, 85]] },
  { cena: 'mk-carroceria', id: 'farois', boxes: [[505, 480, 90, 70], [815, 480, 90, 70]] },
  { cena: 'mk-carroceria', id: 'grade', boxes: [[595, 478, 222, 80]] },
  { cena: 'mk-carroceria', id: 'parachoque', boxes: [[482, 552, 445, 68]] },
  { cena: 'mk-carroceria', id: 'suspdiant', boxes: [[435, 615, 535, 70]] },
  { cena: 'mk-carroceria', id: 'pneus', boxes: [[432, 598, 105, 158], [868, 598, 105, 158]] },
  // munck — traseira
  // caixas que ABRAÇAM só o guindaste: uma caixa única englobava o painel
  // traseiro da cabine (região fechada gigante) e pintava a cabine junto
  // (a lança superior é uma região que encosta na cabine — qualquer caixa que
  // a contenha inteira engole também um pedaço do painel traseiro; fica de
  // fora e o resto do guindaste pinta)
  { cena: 'mk-traseira', id: 'braco', boxes: [[590, 25, 190, 400], [695, 235, 275, 190], [470, 125, 150, 200], [790, 55, 180, 210]] },
  { cena: 'mk-traseira', id: 'vidrotras', boxes: [[490, 110, 430, 195]] },
  { cena: 'mk-traseira', id: 'retrovisores', boxes: [[366, 196, 64, 100], [980, 196, 64, 100]] },
  { cena: 'mk-traseira', id: 'cacamba', boxes: [[390, 318, 630, 118]] },
  { cena: 'mk-traseira', id: 'chassitras', boxes: [[425, 428, 560, 78]] },
  { cena: 'mk-traseira', id: 'lanternas', boxes: [[450, 548, 100, 58], [850, 548, 100, 58]] },
  { cena: 'mk-traseira', id: 'parachoquetras', boxes: [[443, 540, 520, 80]] },
  { cena: 'mk-traseira', id: 'diferencial', boxes: [[595, 606, 250, 84]] },
  { cena: 'mk-traseira', id: 'pneustras', boxes: [[398, 478, 148, 275], [858, 478, 152, 275]] },
  // munck — cabine
  { cena: 'mk-cabine', id: 'tacografo', boxes: [[598, 14, 214, 62]] },
  { cena: 'mk-cabine', id: 'retrovint', boxes: [[628, 105, 150, 65]] },
  { cena: 'mk-cabine', id: 'volante', boxes: [[337, 307, 256, 236]] },
  { cena: 'mk-cabine', id: 'instrumentos', boxes: [[375, 352, 210, 90]] },
  { cena: 'mk-cabine', id: 'multimidia', boxes: [[610, 350, 238, 92]] },
  { cena: 'mk-cabine', id: 'clima', boxes: [[662, 425, 182, 42]] },
  { cena: 'mk-cabine', id: 'portaluvas', boxes: [[858, 348, 215, 180]] },
  { cena: 'mk-cabine', id: 'cambio', boxes: [[628, 518, 100, 148]] },
  { cena: 'mk-cabine', id: 'pedais', boxes: [[432, 550, 215, 92]] },
  { cena: 'mk-cabine', id: 'portas', boxes: [[85, 430, 250, 260], [1080, 425, 240, 270]] },
  { cena: 'mk-cabine', id: 'bancos', boxes: [[165, 615, 400, 150], [852, 625, 335, 140]] },
  { cena: 'mk-cabine', id: 'console', boxes: [[555, 655, 305, 110]] },
  // munck — braço articulado
  { cena: 'mk-braco', id: 'lanca', boxes: [[368, 15, 530, 155]] },
  { cena: 'mk-braco', id: 'extensoes', boxes: [[848, 148, 365, 262]] },
  { cena: 'mk-braco', id: 'cilindros', boxes: [[500, 118, 78, 275], [568, 105, 205, 78]] },
  { cena: 'mk-braco', id: 'mangueiras', boxes: [[385, 15, 88, 430], [938, 112, 165, 100]] },
  { cena: 'mk-braco', id: 'coluna', boxes: [[398, 128, 190, 345]] },
  { cena: 'mk-braco', id: 'comandos', boxes: [[225, 328, 185, 150]] },
  { cena: 'mk-braco', id: 'basegiro', boxes: [[428, 440, 172, 58]] },
  { cena: 'mk-braco', id: 'guincho', boxes: [[578, 393, 165, 128]] },
  { cena: 'mk-braco', id: 'gancho', boxes: [[1118, 250, 115, 278]] },
  { cena: 'mk-braco', id: 'chassimk', boxes: [[215, 480, 590, 195]] },
  { cena: 'mk-braco', id: 'patolas', boxes: [[215, 455, 75, 215], [650, 550, 85, 190], [290, 570, 340, 100]] },
  { cena: 'mk-braco', id: 'pneumk', boxes: [[700, 490, 245, 255]] },
  // munck — lataria da LATERAL (cabine/caçamba na silhueta)
  { cena: 'mk-lateral', id: 'lataria', boxes: [[138, 100, 315, 68], [68, 285, 85, 245], [95, 395, 345, 140], [660, 350, 705, 145]] },
];

const scratch = process.argv[2];
const imgs = new Map<string, { data: Buffer; width: number; height: number }>();
for (const cena of ['frente', 'carroceria', 'traseira', 'cabine', 'roda', 'lateral', 'c-frente', 'c-carroceria', 'c-traseira', 'c-cabine', 'c-lateral', 'mk-frente', 'mk-carroceria', 'mk-traseira', 'mk-cabine', 'mk-braco', 'mk-lateral']) {
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



