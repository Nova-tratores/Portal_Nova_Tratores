// Regrava src/lib/auth/__tests__/rotas-pendentes.json com as rotas de API que
// ainda não têm guarda (ver rotas-gate.test.ts). Rodar da raiz do repositório,
// SÓ depois de fechar rotas — a lista nunca deve crescer.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const teste = readFileSync('src/lib/auth/__tests__/rotas-gate.test.ts', 'utf8')
const GUARDA = new RegExp(teste.match(/export const GUARDA = \/(.+)\/\n/)[1])
const PUBLICAS = [...teste.matchAll(/^\s+'(src\/app\/api\/[^']+)':/gm)].map((m) => m[1])

const raiz = process.cwd()
const rotas = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n)
  if (statSync(p).isDirectory()) return rotas(p)
  return /^route\.(ts|js|tsx|jsx)$/.test(n) ? [relative(raiz, p).split(sep).join('/')] : []
})
const abertas = rotas(join(raiz, 'src', 'app', 'api'))
  .filter((f) => !GUARDA.test(readFileSync(f, 'utf8')) && !PUBLICAS.some((p) => f.startsWith(p)))
  .sort()
writeFileSync('src/lib/auth/__tests__/rotas-pendentes.json', JSON.stringify(abertas, null, 1) + '\n')
console.log(`${abertas.length} rotas pendentes`)
