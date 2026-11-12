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
  'src/app/api/catalogo/figura/': 'desenho do catálogo de peças (sem preço/cliente), lido pelo link público /carrinho/[token]',
  'src/app/api/assinar/': 'assinatura do cliente por link único: token na URL',
  'src/app/api/assinatura-link/': 'a pessoa da equipe grava a própria assinatura por link único (token, 7 dias, uso único)',
  'src/app/api/garantia-cliente/evento/': 'página pública do QR da garantia (só registra evento)',
  'src/app/api/garantia-cliente/duvida/': 'página pública do QR da garantia (formulário de dúvida)',
  'src/app/api/garantia-cliente/trator/': 'página pública do QR por trator: código aleatório na URL, devolve só modelo/entrega/revisões (sem nome nem chassi inteiro), freio por IP',
  'src/app/api/publico/': 'páginas públicas do portal',
  'src/app/api/push/notificacao/': 'chamada pelo gatilho do banco a cada aviso do sino; só traz o id, cada aviso sai 1 vez',
  'src/app/api/push/inscrever/trocar/': 'service worker troca a inscrição sem login; exige o endpoint antigo (segredo do aparelho)',
  'src/app/api/whatsapp/webhook/': 'webhook da Meta: GET confere o hub.verify_token; POST exige a assinatura X-Hub-Signature-256 (WHATSAPP_APP_SECRET)',
  'src/app/api/clientes/webhook/route.ts': 'webhook da Omie: só processa appKey de conta conhecida e relê OS/PV na própria Omie (status/ fica travado)',
  'src/app/api/assistente/novazap/': 'NovaZap (fork do Chatwoot): header x-tratorilson-token (TRATORILSON_TOKEN)',
  'src/app/api/tratorilson/assumir/': 'NovaZap (fork do Chatwoot): header x-tratorilson-token (TRATORILSON_TOKEN)',
  'src/app/api/chatwoot/vincular/': 'app do Chatwoot em iframe: secret no corpo = CHATWOOT_APP_SECRET; fecha se a variável faltar',
  'src/app/api/versao/': 'só devolve o BUILD_ID (AutoAtualiza)',
  'src/app/api/agendador/saude/': 'vigia externo do agendador: só diz se o laço bateu nos últimos 10 min, sem dados',
  'src/app/api/ocorrencias/catalogo/': 'catálogo estático (rótulos e cores) lido pelo app NT_Mecanicos sem login; sem dado sensível',
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
  it('guarda citada só em comentário não vale (caso catalogo/criar-doc)', () => {
    const src = `export async function POST(req) {
  // vai como chamada de sistema, valendo mesmo sem CRON_SECRET no ambiente
  /* protegerRota fica pra depois */
  const u = 'https://x.com/a'; return fetch(u)
}`
    expect(metodosSemGuarda(src)).toEqual(['POST'])
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
