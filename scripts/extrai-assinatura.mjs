// Extrai a assinatura (tinta AZUL de caneta) de uma foto de papel e salva PNG
// com fundo transparente, recortada e normalizada (largura 1200px).
//   node scripts/extrai-assinatura.mjs <foto> <saida.png> [rotacao-graus]
// Texto cinza que transparece do verso e pontinhos do papel são descartados
// (exige azul de verdade + remove componentes pequenos).
import sharp from 'sharp';

const [entrada, saida, rot] = process.argv.slice(2);
if (!entrada || !saida) { console.error('uso: node scripts/extrai-assinatura.mjs <foto> <saida.png> [rotacao]'); process.exit(1); }

let img = sharp(entrada).rotate(); // respeita EXIF
if (rot) img = img.rotate(Number(rot), { background: '#fff' });
const { data, info } = await img.removeAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height;

// estimativa do papel = média por bloco 32px (aguenta sombra/gradiente)
const B = 32, bw = Math.ceil(W / B), bh = Math.ceil(H / B);
const fundo = new Float32Array(bw * bh * 3);
const cont = new Uint32Array(bw * bh);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = (y * W + x) * 3, k = Math.floor(y / B) * bw + Math.floor(x / B);
  fundo[k * 3] += data[i]; fundo[k * 3 + 1] += data[i + 1]; fundo[k * 3 + 2] += data[i + 2]; cont[k]++;
}
for (let k = 0; k < bw * bh; k++) { fundo[k * 3] /= cont[k]; fundo[k * 3 + 1] /= cont[k]; fundo[k * 3 + 2] /= cont[k]; }

const out = Buffer.alloc(W * H * 4);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = (y * W + x) * 3, k = Math.floor(y / B) * bw + Math.floor(x / B);
  const r = data[i], g = data[i + 1], b = data[i + 2];
  const fr = fundo[k * 3], fg = fundo[k * 3 + 1], fb = fundo[k * 3 + 2];
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  const flum = 0.299 * fr + 0.587 * fg + 0.114 * fb;
  const escuro = flum - lum;                                   // mais escuro que o papel
  const azul = (b - (r + g) / 2) - (fb - (fr + fg) / 2);       // mais azul que o papel
  // caneta AZUL: exige azul de verdade (texto cinza do verso some)
  let a = azul > 10 ? Math.max(escuro * 3.2, azul * 6) : 0;
  a = Math.max(0, Math.min(255, a));
  if (a < 60) a = 0;
  const o = (y * W + x) * 4;
  out[o] = 0x1c; out[o + 1] = 0x2a; out[o + 2] = 0x7a; out[o + 3] = a; // azul-caneta uniforme
}

// remove manchas pequenas: mantém só componentes conectados grandes (>= 0,04% da imagem)
{
  const vis = new Uint8Array(W * H); const MIN = Math.round(W * H * 0.0004);
  const pilha = new Int32Array(W * H);
  for (let y0 = 0; y0 < H; y0++) for (let x0 = 0; x0 < W; x0++) {
    const i0 = y0 * W + x0;
    if (vis[i0] || out[i0 * 4 + 3] === 0) continue;
    let n = 0, top = 0; pilha[top++] = i0; vis[i0] = 1; const comp = [];
    while (top) {
      const i = pilha[--top]; comp.push(i); n++; const x = i % W, y = (i / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx; if (!vis[j] && out[j * 4 + 3] > 0) { vis[j] = 1; pilha[top++] = j; }
      }
    }
    if (n < MIN) for (const i of comp) out[i * 4 + 3] = 0;
  }
}

let minX = W, minY = H, maxX = 0, maxY = 0;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (out[(y * W + x) * 4 + 3] > 90) { if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y; }
if (maxX <= minX) { console.error('não achei tinta'); process.exit(2); }
const pad = 24;
const left = Math.max(0, minX - pad), top = Math.max(0, minY - pad);
const width = Math.min(W, maxX + pad) - left, height = Math.min(H, maxY + pad) - top;
await sharp(out, { raw: { width: W, height: H, channels: 4 } })
  .extract({ left, top, width, height })
  .resize({ width: 1200, withoutEnlargement: true })
  .png({ compressionLevel: 9 })
  .toFile(saida);
console.log(`ok ${saida} (${width}x${height} px recortados)`);
