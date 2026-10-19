// Trava contra rota de API sem checagem de quem chama (tema 1 da auditoria, 19/10/2026).
//
// Cada MÉTODO exportado (GET, POST…) de src/app/api/**/route.* precisa passar por
// uma guarda (ver ../rotas-gate.ts), OU o arquivo estar em PUBLICAS (aberto de
// propósito, com o motivo), OU o par "arquivo#MÉTODO" ainda estar na lista de
// pendentes (rotas-pendentes.json = o que faltava fechar). A lista só DIMINUI:
// método novo sem guarda quebra o teste, e pendente que ganhou guarda também.
//
// Regerar a lista (só ao fechar rotas): node scripts/rotas-pendentes.mjs
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { metodosSemGuarda } from '../rotas-gate'
import pendentesJson from './rotas-pendentes.json'

// Abertas de propósito: o acesso é validado de outro jeito (token na URL, assinatura
// do webhook) ou são páginas públicas. Prefixo de caminho → motivo.
export const PUBLICAS: Record<string, string> = {
  'src/app/api/q/': 'questionário por link único: token na URL validado no servidor',
  'src/app/api/assinar/': 'assinatura do cliente por link único: token na URL',
  'src/app/api/garantia-cliente/evento/': 'página pública do QR da garantia (só registra evento)',
  'src/app/api/garantia-cliente/duvida/': 'página pública do QR da garantia (formulário de dúvida)',
  'src/app/api/publico/': 'páginas públicas do portal',
}

const RAIZ = process.cwd()

function rotas(dir: string): string[] {
  const out: string[] = []
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome)
    if (statSync(p).isDirectory()) out.push(...rotas(p))
    else if (/^route\.(ts|js|tsx|jsx)$/.test(nome)) out.push(relative(RAIZ, p).split(sep).join('/'))
  }
  return out
}

describe('metodosSemGuarda', () => {
  it('pega o GET aberto ao lado de um POST protegido', () => {
    const src = `export async function GET(req) { return Response.json([]) }
export async function POST(req) { const g = await protegerRota(req, []); return g }`
    expect(metodosSemGuarda(src)).toEqual(['GET'])
  })
  it('aceita a guarda numa função local chamada pelo método', () => {
    const src = `async function handler(req) { const g = await protegerRotaOuInterna(req, []); return g }
export async function GET(req) { return handler(req) }
export async function POST(req) { return handler(req) }`
    expect(metodosSemGuarda(src)).toEqual([])
  })
  it('aceita export { handler as GET }', () => {
    const src = `async function handler(req) { if (!autenticar(req)) return 1 }
export { handler as GET, handler as POST }`
    expect(metodosSemGuarda(src)).toEqual([])
  })
})

describe('rotas de API com guarda', () => {
  const abertas = rotas(join(RAIZ, 'src', 'app', 'api'))
    .filter((f) => !Object.keys(PUBLICAS).some((pre) => f.startsWith(pre)))
    .flatMap((f) => metodosSemGuarda(readFileSync(join(RAIZ, f), 'utf8')).map((m) => `${f}#${m}`))
  const pendentes = new Set<string>(pendentesJson as string[])

  it('nenhum método novo sem guarda', () => {
    const novas = abertas.filter((f) => !pendentes.has(f))
    expect(novas, 'método de rota sem protegerRota/autenticar/CRON_SECRET: proteja-o (ou ponha em PUBLICAS com o motivo)').toEqual([])
  })

  it('a lista de pendentes só diminui (tire os que já têm guarda ou foram apagados)', () => {
    const abertasSet = new Set(abertas)
    const sobrando = [...pendentes].filter((f) => !abertasSet.has(f))
    expect(sobrando, 'rode node scripts/rotas-pendentes.mjs').toEqual([])
  })
})
