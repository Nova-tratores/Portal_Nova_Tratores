// Regras puras da trava de rotas sem guarda (rotas-gate.test.ts + scripts/rotas-pendentes.mjs).
//
// Confere POR MÉTODO exportado (GET, POST…), não pelo arquivo inteiro: um POST
// protegido não pode esconder um GET aberto no mesmo route.ts. Vale como guarda o
// próprio corpo do método OU uma função local que ele chama (ex.: GET → handler(req)).

export const GUARDA = /protegerRota|autenticar\(|exigirAdmin|exigirPermissao|exigirAcessoModulo|guardar\w*\(|negarSem\w*|CRON_SECRET|temModulo\w*\(|podePPV|protegerRotaOuInterna|validarToken\w*\(|tokenValido\w*\(/

const METODOS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']

/** Corta o arquivo em blocos de nível de topo: cada um começa numa declaração de função/const. */
function blocos(src: string): { nome: string; corpo: string }[] {
  const re = /^(?:export\s+)?(?:async\s+)?function\s+(\w+)|^(?:export\s+)?const\s+(\w+)\s*=/gm
  const marcas: { nome: string; ini: number }[] = []
  for (const m of src.matchAll(re)) marcas.push({ nome: m[1] || m[2], ini: m.index ?? 0 })
  return marcas.map((m, i) => ({ nome: m.nome, corpo: src.slice(m.ini, marcas[i + 1]?.ini ?? src.length) }))
}

/** Métodos exportados que não passam por nenhuma guarda. */
export function metodosSemGuarda(src: string): string[] {
  const bs = blocos(src)
  const porNome = new Map(bs.map((b) => [b.nome, b.corpo]))
  // export { handler as GET }
  for (const m of src.matchAll(/export\s*\{([^}]+)\}/g)) {
    for (const par of m[1].split(',')) {
      const [orig, alias] = par.split(/\s+as\s+/).map((s) => s.trim())
      if (alias && METODOS.includes(alias) && porNome.has(orig)) porNome.set(alias, `${porNome.get(alias) || ''}\n${orig}(`)
    }
  }
  const guardado = (corpo: string, visto = new Set<string>()): boolean => {
    if (GUARDA.test(corpo)) return true
    for (const m of corpo.matchAll(/\b(\w+)\s*\(/g)) {
      const n = m[1]
      if (visto.has(n) || !porNome.has(n)) continue
      visto.add(n)
      if (guardado(porNome.get(n)!, visto)) return true
    }
    return false
  }
  return METODOS.filter((met) => porNome.has(met) && !guardado(porNome.get(met)!, new Set([met])))
}
