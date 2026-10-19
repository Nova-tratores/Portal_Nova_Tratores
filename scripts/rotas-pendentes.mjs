// Regrava src/lib/auth/__tests__/rotas-pendentes.json com os métodos de rota de API
// ("arquivo#MÉTODO") que ainda não têm guarda (ver src/lib/auth/rotas-gate.ts).
// Rodar da raiz do repositório, SÓ depois de fechar rotas — a lista nunca deve crescer.
//   node scripts/rotas-pendentes.mjs   (Node 22.6+ importa o .ts direto)
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { metodosSemGuarda } from '../src/lib/auth/rotas-gate.ts'

const teste = readFileSync('src/lib/auth/__tests__/rotas-gate.test.ts', 'utf8')
const PUBLICAS = [...teste.matchAll(/^\s+'(src\/app\/api\/[^']+)':/gm)].map((m) => m[1])

const raiz = process.cwd()
const rotas = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n)
  if (statSync(p).isDirectory()) return rotas(p)
  return /^route\.(ts|js|tsx|jsx)$/.test(n) ? [relative(raiz, p).split(sep).join('/')] : []
})
const abertas = rotas(join(raiz, 'src', 'app', 'api'))
  .filter((f) => !PUBLICAS.some((p) => f.startsWith(p)))
  .flatMap((f) => metodosSemGuarda(readFileSync(f, 'utf8')).map((m) => `${f}#${m}`))
  .sort()
writeFileSync('src/lib/auth/__tests__/rotas-pendentes.json', JSON.stringify(abertas, null, 1) + '\n')
console.log(`${abertas.length} métodos pendentes em ${new Set(abertas.map((a) => a.split('#')[0])).size} rotas`)
