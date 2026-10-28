// Ditado do relatório no app (José, 22/10/2026): POST multipart { audio, diagnostico?, servico? }
// → { texto, diagnostico, servico }. O técnico revisa antes de usar.
import { NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { corsAppMecanicos } from '@/lib/mecanicos/cors-app'
import { organizarDitado, transcreverArquivo } from '@/lib/mecanicos/relatorio-app-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 90

const LIMITE = 24 * 1024 * 1024

export function OPTIONS(req: Request) { return new NextResponse(null, { status: 204, headers: corsAppMecanicos(req, 'POST, OPTIONS') }) }

export async function POST(req: Request) {
  const cors = corsAppMecanicos(req, 'POST, OPTIONS')
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401, headers: cors })
  try {
    const fd = await req.formData()
    const audio = fd.get('audio')
    if (!(audio instanceof Blob) || !audio.size) return NextResponse.json({ error: 'Sem áudio.' }, { status: 400, headers: cors })
    if (audio.size > LIMITE) return NextResponse.json({ error: 'Áudio muito longo — grave em partes.' }, { status: 400, headers: cors })
    const nome = (audio as File).name || (/mp4|m4a|aac/.test(audio.type) ? 'ditado.m4a' : 'ditado.webm')
    const texto = await transcreverArquivo(await audio.arrayBuffer(), nome)
    if (!texto) return NextResponse.json({ error: 'Não deu para entender o áudio. Tente de novo, mais perto do celular.' }, { status: 422, headers: cors })
    const r = await organizarDitado(texto, { diagnostico: String(fd.get('diagnostico') || ''), servico: String(fd.get('servico') || '') })
    return NextResponse.json({ texto, ...r }, { headers: cors })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500, headers: cors })
  }
}
