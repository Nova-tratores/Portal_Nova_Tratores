// Trava contra rota de API sem checagem de quem chama (tema 1 da auditoria, 19/10/2026).
//
// Toda rota em src/app/api precisa citar um dos guardas abaixo, OU estar em
// PUBLICAS (aberta de propósito, com o motivo), OU ainda estar na lista de
// pendentes (rotas-pendentes.json = o que faltava fechar quando a trava entrou).
// A lista de pendentes só pode DIMINUIR: rota nova sem guarda quebra o teste, e
// rota pendente que ganhou guarda também (tire-a da lista).
//
// Regerar a lista (só ao fechar rotas): node scripts/rotas-pendentes.mjs
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import pendentesJson from './rotas-pendentes.json'

export const GUARDA = /protegerRota|autenticar\(|exigirAdmin|exigirPermissao|exigirAcessoModulo|guardar\w*\(|negarSem\w*|CRON_SECRET|temModulo\w*\(|podePPV|protegerRotaOuInterna|validarToken\w*\(|tokenValido\w*\(/

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
const API = join(RAIZ, 'src', 'app', 'api')

function rotas(dir: string): string[] {
  const out: string[] = []
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome)
    if (statSync(p).isDirectory()) out.push(...rotas(p))
    else if (/^route\.(ts|js|tsx|jsx)$/.test(nome)) out.push(relative(RAIZ, p).split(sep).join('/'))
  }
  return out
}

describe('rotas de API com guarda', () => {
  const todas = rotas(API)
  const pendentes = new Set<string>(pendentesJson as string[])
  const abertas = todas.filter((f) =>
    !GUARDA.test(readFileSync(join(RAIZ, f), 'utf8'))
    && !Object.keys(PUBLICAS).some((pre) => f.startsWith(pre)))

  it('nenhuma rota nova sem guarda', () => {
    const novas = abertas.filter((f) => !pendentes.has(f))
    expect(novas, 'rota sem protegerRota/autenticar/CRON_SECRET: proteja-a (ou ponha em PUBLICAS com o motivo)').toEqual([])
  })

  it('a lista de pendentes só diminui (tire as que já têm guarda ou foram apagadas)', () => {
    const abertasSet = new Set(abertas)
    const sobrando = [...pendentes].filter((f) => !abertasSet.has(f))
    expect(sobrando, 'rode node scripts/rotas-pendentes.mjs').toEqual([])
  })
})
