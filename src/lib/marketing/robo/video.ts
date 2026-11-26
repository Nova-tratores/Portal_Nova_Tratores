// =============================================================================
// Vídeo do post (26/11/2026, José: "tem que gerar para todas as redes"). TikTok e YouTube Shorts só aceitam vídeo:
// a arte em pé (1080×1920) vira um MP4 de 8 s com uma aproximação lenta (efeito "Ken Burns"), sem som.
// FFmpeg vem do pacote @ffmpeg-installer/ffmpeg (traz o programa pronto para Windows e Linux; nada a instalar no Railway).
// =============================================================================
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const SEGUNDOS = 8
const FPS = 30

/** Caminho do ffmpeg resolvido na hora (fora do empacotamento do Next, que quebraria o caminho do binário). */
function ffmpeg(): string {
  const req = createRequire(path.join(process.cwd(), 'package.json'))
  return (req('@ffmpeg-installer/ffmpeg') as { path: string }).path
}

/** JPG/PNG em pé (1080×1920) → MP4 H.264 de 8 s com zoom suave de 100% a 108%. */
export async function videoDaArte(imagem: Buffer): Promise<Buffer> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-video-'))
  const entrada = path.join(dir, 'arte.jpg'), saida = path.join(dir, 'post.mp4')
  try {
    await fs.writeFile(entrada, imagem)
    const quadros = SEGUNDOS * FPS
    const args = [
      '-y', '-loglevel', 'error', '-loop', '1', '-i', entrada,
      // aumenta antes do zoom (evita tremido), aproxima devagar pelo centro e volta a 1080×1920
      '-vf', `scale=1620:2880,zoompan=z='min(1+0.08*on/${quadros},1.08)':d=${quadros}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=${FPS},format=yuv420p`,
      '-t', String(SEGUNDOS), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-movflags', '+faststart', saida,
    ]
    await new Promise<void>((ok, falha) => {
      const p = spawn(ffmpeg(), args, { stdio: ['ignore', 'ignore', 'pipe'] })
      let erro = ''
      p.stderr.on('data', (d) => { erro += String(d) })
      const limite = setTimeout(() => { p.kill('SIGKILL'); falha(new Error('o vídeo passou de 2 minutos')) }, 120_000)
      p.on('error', (e) => { clearTimeout(limite); falha(e) })
      p.on('close', (cod) => {
        clearTimeout(limite)
        if (cod === 0) ok(); else falha(new Error(`ffmpeg: ${erro.slice(0, 300) || `saiu com ${cod}`}`))
      })
    })
    return await fs.readFile(saida)
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}
