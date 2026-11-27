// =============================================================================
// Robô dos vídeos da Mahindra (27/11/2026). José: "pode fazer o robô então, pega os últimos 5 pra gente colocar no banco".
// Roda NESTE computador (o YouTube bloqueia download vindo do Railway). Para cada vídeo do canal Mahindra Brasil:
//   1. baixa o vídeo (yt-dlp, até 1080p, sem som);
//   2. tira 1 quadro a cada 2 s (FFmpeg) e fica com os mais nítidos e diferentes entre si (sharp);
//   3. a IA olha cada candidato (lerFoto): serve? descrição, etiquetas, nota;
//   4. os aprovados (nota 3+) vão para o Banco de fotos com origem "youtube" (vídeo + segundo).
// Vídeo que já tem foto no banco é pulado (dá para rodar todo dia sem repetir).
//
// Uso (na pasta do portal):
//   npx tsx scripts/robo-videos-mahindra.mts            → só vídeos novos (últimos 15 do canal)
//   npx tsx scripts/robo-videos-mahindra.mts --ultimos 5 → os 5 mais recentes
// Precisa: yt-dlp instalado (winget install yt-dlp.yt-dlp) e .env.local com Supabase + ANTHROPIC_API_KEY.
// =============================================================================
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'

const RAIZ = process.cwd()
for (const l of fs.readFileSync(path.join(RAIZ, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^(ANTHROPIC_API_KEY|NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|MARKETING_IA_MODELO)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '').trim()
}
const req = createRequire(path.join(RAIZ, 'package.json'))
const sharp = req('sharp') as typeof import('sharp')
const FFMPEG = (req('@ffmpeg-installer/ffmpeg') as { path: string }).path
const { salvarFoto } = await import('../src/lib/marketing/fotos/salvar')
const { lerFoto } = await import('../src/lib/marketing/fotos/ia')
const { supabaseAdmin: sb } = await import('../src/lib/server/supabase-admin')

const CANAL = 'UCapYFzJlSJhVvsPnkgNP76A'          // Mahindra Brasil (@mahindrabrasil6392)
const CANDIDATOS_POR_VIDEO = 12                     // quantos quadros a IA olha por vídeo (~1 centavo cada)
const MAX_POR_VIDEO = 8                             // quantos vão para o banco, no máximo
const NOTA_MINIMA = 3
const POR = 'Robô vídeos Mahindra'

const arg = (n: string) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined }
const ULTIMOS = Number(arg('--ultimos')) || 15

function ytdlp(): string {
  const local = path.join(process.env.LOCALAPPDATA || os.homedir(), 'nova-robo-videos', 'yt-dlp.exe')
  return process.env.YTDLP || (fs.existsSync(local) ? local : 'yt-dlp')
}

function rodar(cmd: string, args: string[], limiteMs = 15 * 60_000): Promise<void> {
  return new Promise((ok, falha) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let erro = ''
    p.stderr.on('data', (d) => { erro = (erro + String(d)).slice(-2000) })
    const t = setTimeout(() => { p.kill('SIGKILL'); falha(new Error(`${path.basename(cmd)} passou do tempo`)) }, limiteMs)
    p.on('error', (e) => { clearTimeout(t); falha(/ENOENT/.test(e.message) ? new Error(`não achei o ${path.basename(cmd)}. Instale com: winget install yt-dlp.yt-dlp`) : e) })
    p.on('close', (c) => { clearTimeout(t); c === 0 ? ok() : falha(new Error(`${path.basename(cmd)}: ${erro.trim().split('\n').pop() || `saiu com ${c}`}`)) })
  })
}

type Video = { id: string; titulo: string; publicado: string }
async function videosDoCanal(): Promise<Video[]> {
  const xml = await (await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${CANAL}`)).text()
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, e]) => ({
    id: e.match(/<yt:videoId>([^<]+)/)?.[1] || '',
    titulo: (e.match(/<title>([^<]*)/)?.[1] || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'"),
    publicado: e.match(/<published>([^<]+)/)?.[1] || '',
  })).filter((v) => v.id)
}

/** "Impressão digital" pequena do quadro, para não pegar dois quase iguais. */
async function digital(arq: string) {
  return sharp(arq).resize(16, 9, { fit: 'fill' }).grayscale().raw().toBuffer()
}
const distancia = (a: Buffer, b: Buffer) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length }

async function fazerVideo(v: Video) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), `nova-yt-${v.id}-`))
  try {
    console.log(`\n▶ ${v.titulo} (${v.publicado.slice(0, 10)}) — baixando…`)
    await rodar(ytdlp(), ['-q', '--no-warnings', '--no-playlist', '-f', 'bv*[height<=1080][ext=mp4]/bv*[height<=1080]/b[height<=1080]',
      '-o', path.join(dir, 'video.%(ext)s'), `https://www.youtube.com/watch?v=${v.id}`])
    const video = (await fsp.readdir(dir)).find((f) => f.startsWith('video.'))
    if (!video) throw new Error('o download não gerou arquivo')

    console.log('  tirando quadros…')
    await rodar(FFMPEG, ['-loglevel', 'error', '-i', path.join(dir, video), '-vf', 'fps=1/2', '-q:v', '2', path.join(dir, 'q%04d.jpg')])
    const quadros = (await fsp.readdir(dir)).filter((f) => /^q\d+\.jpg$/.test(f)).sort()

    // nitidez + brilho de cada quadro (sem quadro preto/estourado de transição)
    const medidos: { arq: string; segundo: number; nitidez: number; dig: Buffer }[] = []
    for (const q of quadros) {
      const arq = path.join(dir, q)
      const st = await sharp(arq).stats()
      const brilho = st.channels.slice(0, 3).reduce((s, c) => s + c.mean, 0) / 3
      if (brilho < 35 || brilho > 225) continue
      medidos.push({ arq, segundo: (Number(q.slice(1, 5)) - 1) * 2, nitidez: st.sharpness, dig: await digital(arq) })
    }
    // os mais nítidos, pulando os parecidos com algum já escolhido
    const escolhidos: typeof medidos = []
    for (const m of [...medidos].sort((a, b) => b.nitidez - a.nitidez)) {
      if (escolhidos.length >= CANDIDATOS_POR_VIDEO) break
      if (escolhidos.every((e) => distancia(e.dig, m.dig) > 18)) escolhidos.push(m)
    }
    console.log(`  ${quadros.length} quadros → ${escolhidos.length} candidatos para a IA`)

    let salvos = 0
    for (const c of escolhidos.sort((a, b) => a.segundo - b.segundo)) {
      if (salvos >= MAX_POR_VIDEO) break
      const bytes = await fsp.readFile(c.arq)
      const leitura = await lerFoto({ jpeg: await sharp(bytes).resize({ width: 1024, height: 1024, fit: 'inside' }).jpeg({ quality: 80 }).toBuffer() })
      const mm = `${Math.floor(c.segundo / 60)}:${String(c.segundo % 60).padStart(2, '0')}`
      if (!leitura.serve || (leitura.nota ?? 0) < NOTA_MINIMA) { console.log(`  · ${mm} não serve (${leitura.motivo || `nota ${leitura.nota}`})`); continue }
      await salvarFoto(bytes, { origem: 'youtube', origem_id: v.id, origem_titulo: v.titulo.slice(0, 200), segundo: c.segundo }, POR, leitura)
      salvos++
      console.log(`  ✓ ${mm} nota ${leitura.nota}: ${leitura.descricao}`)
    }
    return salvos
  } finally {
    await fsp.rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

const todos = (await videosDoCanal()).slice(0, ULTIMOS)
const { data: ja } = await sb.from('mkt_fotos').select('origem_id').eq('origem', 'youtube').in('origem_id', todos.map((v) => v.id))
const feitos = new Set(((ja || []) as { origem_id: string }[]).map((x) => x.origem_id))
const fila = todos.filter((v) => !feitos.has(v.id))
console.log(`Canal Mahindra Brasil: ${todos.length} vídeos olhados, ${fila.length} novos.`)

let total = 0
for (const v of fila) {
  try { total += await fazerVideo(v) } catch (e) { console.log(`  ✗ ${v.titulo}: ${(e as Error).message}`) }
}
console.log(`\nPronto: ${total} foto(s) novas no Banco de fotos.`)
