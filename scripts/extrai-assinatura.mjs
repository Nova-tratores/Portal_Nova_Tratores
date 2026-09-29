// Extrai a assinatura (tinta azul/escura) de uma foto de papel e salva PNG
// com fundo transparente, recortada e normalizada (largura 1200px).
//   node scripts/extrai-assinatura.mjs <foto> <saida.png> [rotacao-graus]
import sharp from 'sharp';

const [entrada, saida, rot] = process.argv.slice(2);
if (!entrada || !saida) { console.error('uso: node scripts/extrai-assinatura.mjs <foto> <saida.png> [rotacao]'); process.exit(1); }

let img = sharp(entrada).rotate(); // respeita EXIF
if (rot) img = img.rotate(Number(rot), { background: '#fff' });
const { data, info } = await img.removeAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height;

// "tinta" = pixel mais azul e mais escuro que o papel ao redor. Estimativa do
// papel = mediana local grosseira (média por bloco 32px), pra aguentar sombra.
const B = 32, bw = Math.ceil(W / B), bh = Math.ceil(H / B);
const fundo = new Float32Array(bw * bh * 3);
const cont = new Uint32Array(bw * bh);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = (y * W + x) * 3, k = Math.floor(y / B) * bw + Math.floor(x / B);
  fundo[k * 3] += data[i]; fundo[k * 3 + 1] += data[i + 1]; fundo[k * 3 + 2] += data[i + 2]; cont[k]++;
}
for (let k = 0; k < bw * bh; k++) { fundo[k * 3] /= cont[k]; fundo[k * 3 + 1] /= cont[k]; fundo[k * 3 + 2] /= cont[k]; }

const out = Buffer.alloc(W * H * 4);
let minX = W, minY = H, maxX = 0, maxY = 0;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = (y * W + x) * 3, k = Math.floor(y / B) * bw + Math.floor(x / B);
  const r = data[i], g = data[i + 1], b = data[i + 2];
  const fr = fundo[k * 3], fg = fundo[k * 3 + 1], fb = fundo[k * 3 + 2];
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  const flum = 0.299 * fr + 0.587 * fg + 0.114 * fb;
  const escuro = flum - lum;                 // quanto mais escuro que o papel
  const azul = (b - (r + g) / 2) - (fb - (fr + fg) / 2); // quanto mais azul que o papel
  let a = Math.max(escuro * 3.2, azul * 6) ; // caneta azul: os dois ajudam
  a = Math.max(0, Math.min(255, a));
  if (a < 40) a = 0;                          // tira o ruído do papel/verso
  const o = (y * W + x) * 4;
  out[o] = 0x1c; out[o + 1] = 0x2a; out[o + 2] = 0x7a; out[o + 3] = a; // azul-caneta uniforme
  if (a > 90) { if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y; }
}
if (maxX <= minX) { console.error('não achei tinta'); process.exit(2); }
const pad = 24;
const left = Math.max(0, minX - pad), top = Math.max(0, minY - pad);
const width = Math.min(W, maxX + pad) - left, height = Math.min(H, maxY + pad) - top;
await sharp(out, { raw: { width: W, height: H, channels: 4 } })
  .extract({ left, top, width, height })
  .resize({ width: 1200, withoutEnlargement: false })
  .png({ compressionLevel: 9 })
  .toFile(saida);
console.log(`ok ${saida} (${width}x${height} px recortados)`);
