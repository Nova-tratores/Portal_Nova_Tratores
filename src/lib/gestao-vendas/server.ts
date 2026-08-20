// Acesso a dados do Gestão de Vendas no SERVIDOR (service role — ignora RLS).
// As rotas de API validam login+permissão antes de chamar estas funções.

import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { resolverClientesViaOmie } from './clientes-omie'
import { contaOmie } from '@/lib/omie/contas'
import { carregarVendedoresOmie, invalidarCacheMatching } from '@/lib/omie/matching'
import type { Autenticado } from '@/lib/auth/server'
import type {
  AjusteVenda,
  CustoMensalVendedor,
  PedidoVendaRelatorio,
  VendaEnriquecida,
  VendaItem,
  Vendedor,
} from './tipos'

// Permissão do módulo: admin, 'gestao-vendas' ou qualquer granular 'gestao-vendas:*'
export function podeGestaoVendas(auth: Autenticado): boolean {
  return (
    auth.isAdmin ||
    auth.modulos.includes('gestao-vendas') ||
    auth.modulos.some((m) => m.startsWith('gestao-vendas:'))
  )
}

// PostgREST corta em 1000 linhas por resposta — pagina com .range() até esgotar.
const PAGE = 1000

async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const all: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const rows = data ?? []
    all.push(...rows)
    if (rows.length < PAGE) break
  }
  return all
}

const CHUNK = 200

export async function buscarVendasEnriquecidas(
  mes: number,
  ano: number,
  conta: string, // 'NOVA' | 'CASTRO' | 'TODAS'
): Promise<VendaEnriquecida[]> {
  const todas = conta === 'TODAS'
  const vendas = await fetchAll<VendaItem>((from, to) => {
    let q = supabaseAdmin
      .from('vendas_itens')
      .select('*')
      .eq('mes', mes)
      .eq('ano', ano)
    if (!todas) q = q.ilike('conta_omie', conta)
    return q
      .order('valor_total', { ascending: false })
      .order('id', { ascending: true })
      .range(from, to)
  })

  // lookups nas tabelas master (nomes de cliente, família real, categoria, vendedor do pedido)
  const codCli = [...new Set(vendas.map((v) => v.codigo_cliente).filter((c): c is string => !!c && /^\d+$/.test(c)))].map(Number)
  const codProd = [...new Set(vendas.map((v) => v.codigo_produto).filter((c): c is string => !!c && /^\d+$/.test(c)))].map(Number)
  const codCat = [...new Set(vendas.map((v) => v.codigo_categoria).filter((c): c is string => !!c))]
  const numPedidos = [...new Set(vendas.map((v) => v.numero_pedido).filter((n): n is string => !!n))]

  // clientes com chave conta-aware (o mesmo código Omie pode existir nas duas contas)
  const clientes = new Map<string, string>()
  // fallback: cadastro sincronizado ativamente (a tabela `clientes` anda desatualizada
  // e não traz clientes recém-criados → apareciam como #código na tela)
  const clientesCadastro = new Map<string, string>()
  // último recurso persistido: nomes já resolvidos via Omie (gv_clientes_omie_cache)
  const clientesCache = new Map<string, string>() // conta|cod → nome (só os com nome)
  const clientesJaConsultados = new Set<string>() // conta|cod já vistos no cache (mesmo NULL)
  const familias = new Map<string, string | null>()
  const categorias = new Map<string, string>()

  // empresa da tabela portal_nt_clientes_cadastro_omie → conta (NOVA/CASTRO)
  const empresaParaConta = (e: string | null | undefined): string => {
    const s = (e ?? '').toUpperCase()
    if (s.includes('NOVA')) return 'NOVA'
    if (s.includes('CASTRO')) return 'CASTRO'
    return s
  }

  const buscas: PromiseLike<void>[] = []

  for (let i = 0; i < codCli.length; i += CHUNK) {
    const slice = codCli.slice(i, i + CHUNK)
    buscas.push(
      (todas
        ? supabaseAdmin
            .from('clientes')
            .select('codigo_cliente_omie, razao_social, nome_fantasia, conta_omie')
            .in('codigo_cliente_omie', slice)
        : supabaseAdmin
            .from('clientes')
            .select('codigo_cliente_omie, razao_social, nome_fantasia, conta_omie')
            .in('codigo_cliente_omie', slice)
            .ilike('conta_omie', conta)
      ).then(({ data, error }) => {
        if (error) throw new Error(`clientes: ${error.message}`)
        for (const c of data ?? []) {
          const nome = c.razao_social ?? c.nome_fantasia
          if (nome) clientes.set(`${(c.conta_omie ?? '').toUpperCase()}|${c.codigo_cliente_omie}`, nome)
        }
      }),
    )
  }

  for (let i = 0; i < codCli.length; i += CHUNK) {
    const slice = codCli.slice(i, i + CHUNK)
    buscas.push(
      supabaseAdmin
        .from('portal_nt_clientes_cadastro_omie')
        .select('cod_cli, empresa, razao_social, nome_fantasia')
        .in('cod_cli', slice)
        .then(({ data, error }) => {
          if (error) throw new Error(`portal_nt_clientes_cadastro_omie: ${error.message}`)
          for (const c of data ?? []) {
            const nome = c.razao_social || c.nome_fantasia
            if (nome) clientesCadastro.set(`${empresaParaConta(c.empresa)}|${c.cod_cli}`, nome)
          }
        }),
    )
  }

  // cache Omie (best-effort: se a migration não estiver aplicada, ignora e segue)
  for (let i = 0; i < codCli.length; i += CHUNK) {
    const slice = codCli.slice(i, i + CHUNK)
    buscas.push(
      supabaseAdmin
        .from('gv_clientes_omie_cache')
        .select('cod_cli, conta, nome')
        .in('cod_cli', slice)
        .then(({ data, error }) => {
          if (error) return // tabela ausente / erro → cache indisponível, não quebra
          for (const c of data ?? []) {
            const chave = `${(c.conta ?? '').toUpperCase()}|${c.cod_cli}`
            clientesJaConsultados.add(chave)
            if (c.nome) clientesCache.set(chave, c.nome)
          }
        }),
    )
  }

  for (let i = 0; i < codProd.length; i += CHUNK) {
    const slice = codProd.slice(i, i + CHUNK)
    buscas.push(
      supabaseAdmin
        .from('produtos')
        .select('codigo_produto, familia_nome')
        .in('codigo_produto', slice)
        .then(({ data, error }) => {
          if (error) throw new Error(`produtos: ${error.message}`)
          for (const p of data ?? []) familias.set(String(p.codigo_produto), p.familia_nome)
        }),
    )
  }

  for (let i = 0; i < codCat.length; i += CHUNK) {
    const slice = codCat.slice(i, i + CHUNK)
    buscas.push(
      supabaseAdmin
        .from('cache_categorias_relatorio')
        .select('codigo, descricao')
        .in('codigo', slice)
        .then(({ data, error }) => {
          if (error) throw new Error(`cache_categorias_relatorio: ${error.message}`)
          for (const c of data ?? []) {
            if (c.descricao) categorias.set(c.codigo, c.descricao)
          }
        }),
    )
  }

  // vendas_itens.vendedor vem vazio do sync — o nome do vendedor vive em
  // pedidos_venda_relatorio (por numero_venda + empresa)
  const vendedorPorPedido = new Map<string, string>()
  for (let i = 0; i < numPedidos.length; i += CHUNK) {
    const slice = numPedidos.slice(i, i + CHUNK)
    buscas.push(
      supabaseAdmin
        .from('pedidos_venda_relatorio')
        .select('numero_venda, empresa, vendedor')
        .in('numero_venda', slice)
        .then(({ data, error }) => {
          if (error) throw new Error(`pedidos_venda_relatorio: ${error.message}`)
          for (const p of data ?? []) {
            if (p.vendedor) vendedorPorPedido.set(`${(p.empresa ?? '').toUpperCase()}|${p.numero_venda}`, p.vendedor)
          }
        }),
    )
  }

  await Promise.all(buscas)

  const chaveCliente = (v: VendaItem): string | null =>
    v.codigo_cliente && /^\d+$/.test(v.codigo_cliente)
      ? `${(v.conta_omie ?? '').toUpperCase()}|${Number(v.codigo_cliente)}`
      : null

  // resolução em cascata p/ não cair no #código interno da Omie:
  // 1º master `clientes` · 2º cadastro sincronizado (traz clientes recentes)
  // · 3º cache Omie persistido · 4º nome denormalizado na própria venda
  const nomeCliente = (v: VendaItem): string | null => {
    const chave = chaveCliente(v)
    return (
      (chave ? clientes.get(chave) : null) ??
      (chave ? clientesCadastro.get(chave) : null) ??
      (chave ? clientesCache.get(chave) : null) ??
      (v.nome_cliente?.trim() || null)
    )
  }

  // ÚLTIMO recurso: os que sobraram sem nome (e nunca consultados no cache) vão
  // à Omie (best-effort, com teto/tempo). O resultado alimenta o mesmo Map e
  // fica cacheado em gv_clientes_omie_cache pros próximos carregamentos.
  const naoResolvidos = new Map<string, { conta: string; codigo: number }>()
  for (const v of vendas) {
    const chave = chaveCliente(v)
    if (!chave || clientesJaConsultados.has(chave) || nomeCliente(v)) continue
    naoResolvidos.set(chave, {
      conta: (v.conta_omie ?? '').toUpperCase(),
      codigo: Number(v.codigo_cliente),
    })
  }
  if (naoResolvidos.size > 0) {
    try {
      const resolvidos = await resolverClientesViaOmie([...naoResolvidos.values()])
      for (const [k, nome] of resolvidos) clientesCache.set(k, nome)
    } catch {
      // best-effort: se a Omie falhar, mantém o #código
    }
  }

  return vendas.map((v) => ({
    ...v,
    vendedor:
      v.vendedor?.trim() ||
      (v.numero_pedido
        ? vendedorPorPedido.get(`${(v.conta_omie ?? '').toUpperCase()}|${v.numero_pedido}`) ?? null
        : null),
    cliente_nome: nomeCliente(v),
    produto_familia_real: v.codigo_produto ? familias.get(v.codigo_produto) ?? null : null,
    categoria_descricao: v.codigo_categoria ? categorias.get(v.codigo_categoria) ?? null : null,
  }))
}

export async function buscarAjustes(mes: number, ano: number, conta: string): Promise<AjusteVenda[]> {
  return fetchAll<AjusteVenda>((from, to) => {
    let q = supabaseAdmin
      .from('comissao_ajustes_vendas')
      .select('*')
      .eq('mes', mes)
      .eq('ano', ano)
    if (conta !== 'TODAS') q = q.ilike('conta_omie', conta)
    return q.order('id', { ascending: true }).range(from, to)
  })
}

export async function buscarVendedoresAtivos(): Promise<Vendedor[]> {
  const { data, error } = await supabaseAdmin
    .from('vendedores')
    .select('id, nome, email, ativo, codigo')
    .eq('ativo', true)
    // oficiais (com código) primeiro; importados do Omie / manuais (código null) depois, por nome
    .order('codigo', { ascending: true, nullsFirst: false })
    .order('nome', { ascending: true })
  if (error) throw new Error(`vendedores: ${error.message}`)
  return data ?? []
}

// ---------- gestão da lista de vendedores (adicionar manual / sincronizar Omie) ----------

// nome normalizado p/ dedup (maiúsc/minúsc + acentos + espaços não contam)
const normVendedorNome = (s: string): string =>
  (s ?? '').trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, ' ')

// Tira o "cargo" do nome do vendedor Omie, guardando só o nome da pessoa:
//   "Técnico: Fernando Leonel"        → "Fernando Leonel"
//   "Aux: Fabricio Correia"           → "Fabricio Correia"
//   "¨..MOTORISTA: CARIVALDO¨.."       → "CARIVALDO"
//   "Técnico Externo:" (sem nome)     → ""  (descartado por quem chama)
// Regra: remove tudo até o primeiro ":" (o rótulo de cargo) e limpa decorações
// nas pontas. Nomes sem ":" (ex.: "Zezo - José Antonio Camargo") ficam intactos.
const limparNomeVendedorOmie = (raw: string): string => {
  let s = (raw ?? '').trim()
  const i = s.indexOf(':')
  if (i >= 0) s = s.slice(i + 1)
  s = s.replace(/[¨"']/g, ' ')
  s = s.replace(/^[\s.\-–—]+|[\s.\-–—]+$/g, '')
  return s.replace(/\s+/g, ' ').trim()
}

// slug estável p/ montar o email-placeholder (a coluna email é NOT NULL + UNIQUE)
const slugVendedor = (s: string): string =>
  (s ?? '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '').slice(0, 40) || 'vendedor'

// gera um email único que não colide com os já usados (respeita a constraint UNIQUE)
function emailPlaceholderUnico(nome: string, usados: Set<string>): string {
  const slug = slugVendedor(nome)
  let cand = `${slug}@sem-email.novatratores`
  let i = 2
  while (usados.has(cand.toLowerCase())) {
    cand = `${slug}-${i}@sem-email.novatratores`
    i++
  }
  usados.add(cand.toLowerCase())
  return cand
}

type VendedorMin = { id: number; nome: string; email: string; ativo: boolean; codigo: number | null }

async function buscarTodosVendedores(): Promise<VendedorMin[]> {
  const { data, error } = await supabaseAdmin
    .from('vendedores')
    .select('id, nome, email, ativo, codigo')
  if (error) throw new Error(`vendedores: ${error.message}`)
  return data ?? []
}

// Adiciona um vendedor à lista. Sem email → gera placeholder único.
// Se já existir pelo nome: reativa (se inativo) ou recusa como duplicado.
export async function adicionarVendedor(nomeRaw: string, emailRaw?: string | null): Promise<Vendedor> {
  const nome = (nomeRaw ?? '').trim()
  if (!nome) throw new Error('Informe o nome do vendedor.')

  const todos = await buscarTodosVendedores()
  const existente = todos.find((v) => normVendedorNome(v.nome) === normVendedorNome(nome))
  if (existente) {
    if (!existente.ativo) {
      const { data, error } = await supabaseAdmin
        .from('vendedores')
        .update({ ativo: true })
        .eq('id', existente.id)
        .select('id, nome, email, ativo, codigo')
        .single()
      if (error) throw new Error(error.message)
      return data
    }
    throw new Error(`Já existe um vendedor "${existente.nome}" na lista.`)
  }

  const usados = new Set(todos.map((v) => (v.email ?? '').toLowerCase()))
  const email = emailRaw && emailRaw.trim() ? emailRaw.trim() : emailPlaceholderUnico(nome, usados)

  const { data, error } = await supabaseAdmin
    .from('vendedores')
    .insert({ nome, email, ativo: true, codigo: null })
    .select('id, nome, email, ativo, codigo')
    .single()
  if (error) throw new Error(error.message)
  return data
}

// Lista os candidatos a vendedor vindos das duas contas Omie que AINDA NÃO estão
// na lista (dedup por nome, cargo removido). Ignora os com "/" (técnicos
// combinados: "Fulano // Beltrano"). NÃO grava nada — é só a lista pro usuário
// escolher quais adicionar.
export async function listarCandidatosVendedoresOmie(): Promise<string[]> {
  const contas = [
    { name: 'Nova Tratores', ...contaOmie('Nova Tratores') },
    { name: 'Castro Peças', ...contaOmie('Castro Peças') },
  ].filter((c) => c.key && c.secret)

  // nomes únicos vindos do Omie (1ª grafia vista vence), pulando os com "/"
  const nomesOmie = new Map<string, string>()
  for (const acc of contas) {
    try {
      invalidarCacheMatching(acc) // força releitura (novos vendedores no Omie desde o último clique)
      const lista = await carregarVendedoresOmie(acc)
      for (const v of lista) {
        const original = (v.nome ?? '').trim()
        // ignora técnicos combinados ("Fulano // Beltrano") — só nomes individuais
        if (!original || original.includes('/')) continue
        const nome = limparNomeVendedorOmie(original) // guarda o nome, sem o cargo
        if (!nome) continue // sobrou vazio (ex.: "Técnico Externo:")
        const k = normVendedorNome(nome)
        if (!nomesOmie.has(k)) nomesOmie.set(k, nome)
      }
    } catch (e) {
      // best-effort por conta: se uma falhar (sem credencial/rate limit), segue com a outra
      console.warn(`[gestao-vendas] listarCandidatosVendedoresOmie ${acc.name}:`, (e as Error).message)
    }
  }

  const todos = await buscarTodosVendedores()
  const existentes = new Set(todos.map((v) => normVendedorNome(v.nome)))

  return [...nomesOmie.values()]
    .filter((nome) => !existentes.has(normVendedorNome(nome)))
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

// Adiciona vários vendedores de uma vez (usado ao confirmar a seleção do Omie).
// Dedup por nome; gera email-placeholder único p/ cada um. Não mexe nos que já existem.
export async function adicionarVendedoresEmLote(nomesRaw: string[]): Promise<{
  criados: number
  nomes: string[]
  vendedores: Vendedor[]
}> {
  const todos = await buscarTodosVendedores()
  const existentes = new Set(todos.map((v) => normVendedorNome(v.nome)))
  const usados = new Set(todos.map((v) => (v.email ?? '').toLowerCase()))

  const vistos = new Set<string>()
  const novos: { nome: string; email: string; ativo: boolean; codigo: null }[] = []
  for (const raw of nomesRaw) {
    const nome = (raw ?? '').trim()
    if (!nome) continue
    const k = normVendedorNome(nome)
    if (existentes.has(k) || vistos.has(k)) continue
    vistos.add(k)
    novos.push({ nome, email: emailPlaceholderUnico(nome, usados), ativo: true, codigo: null })
  }

  if (novos.length) {
    const { error } = await supabaseAdmin.from('vendedores').insert(novos)
    if (error) throw new Error(error.message)
  }

  const vendedores = await buscarVendedoresAtivos()
  return { criados: novos.length, nomes: novos.map((n) => n.nome), vendedores }
}

export async function buscarCustos(mes: number, ano: number, conta: string): Promise<CustoMensalVendedor[]> {
  return fetchAll<CustoMensalVendedor>((from, to) => {
    let q = supabaseAdmin
      .from('comissao_custos_vendedor')
      .select('*')
      .eq('mes', mes)
      .eq('ano', ano)
    if (conta !== 'TODAS') q = q.ilike('conta_omie', conta)
    return q.order('nome', { ascending: true }).range(from, to)
  })
}

export async function buscarPedidosRelatorio(mes: number, ano: number): Promise<PedidoVendaRelatorio[]> {
  const mesStr = String(mes).padStart(2, '0')
  return fetchAll<PedidoVendaRelatorio>((from, to) =>
    supabaseAdmin
      .from('pedidos_venda_relatorio')
      .select('*')
      .eq('etapa', 'FATURADO')
      .like('data_emissao', `*/${mesStr}/${ano}`) // data_emissao é texto "DD/MM/YYYY"
      .order('valor_total', { ascending: false })
      .order('id', { ascending: true })
      .range(from, to),
  )
}

// ---------- cards por família (dashboard) ----------
// Agrega venda/CMC por família no mês, com comparativos de mês anterior e
// mesmo mês do ano anterior (mesma visão do dashboard de estoque).

export type FamiliaCard = {
  nome: string
  venda: number
  cmc: number
  qtd: number
  vendaMesAnt: number
  vendaAnoAnt: number
}

type LinhaMin = {
  familia: string | null
  codigo_produto: string | null
  valor_total: number
  quantidade: number
  cmc_unitario: number | null
  conta_omie: string
}

async function buscarVendasMin(mes: number, ano: number, conta: string): Promise<LinhaMin[]> {
  return fetchAll<LinhaMin>((from, to) => {
    let q = supabaseAdmin
      .from('vendas_itens')
      .select('familia, codigo_produto, valor_total, quantidade, cmc_unitario, conta_omie')
      .eq('mes', mes)
      .eq('ano', ano)
    if (conta !== 'TODAS') q = q.ilike('conta_omie', conta)
    return q.order('id', { ascending: true }).range(from, to)
  })
}

export async function agregadoPorFamilia(
  mes: number,
  ano: number,
  conta: string,
): Promise<{ familias: FamiliaCard[]; total: FamiliaCard }> {
  const ant = mes === 1 ? { mes: 12, ano: ano - 1 } : { mes: mes - 1, ano }
  const [atual, mesAnt, anoAnt] = await Promise.all([
    buscarVendasMin(mes, ano, conta),
    buscarVendasMin(ant.mes, ant.ano, conta),
    buscarVendasMin(mes, ano - 1, conta),
  ])

  // família real via master de produtos (o campo familia da venda pode vir vazio)
  const codProds = [
    ...new Set(
      [...atual, ...mesAnt, ...anoAnt]
        .map((v) => v.codigo_produto)
        .filter((c): c is string => !!c && /^\d+$/.test(c)),
    ),
  ].map(Number)
  const familiaProduto = new Map<string, string | null>()
  for (let i = 0; i < codProds.length; i += CHUNK) {
    const slice = codProds.slice(i, i + CHUNK)
    const { data, error } = await supabaseAdmin
      .from('produtos')
      .select('codigo_produto, familia_nome')
      .in('codigo_produto', slice)
    if (error) throw new Error(`produtos: ${error.message}`)
    for (const p of data ?? []) familiaProduto.set(String(p.codigo_produto), p.familia_nome)
  }

  const familiaDe = (v: LinhaMin): string | null =>
    (v.codigo_produto ? familiaProduto.get(v.codigo_produto) : null) ?? v.familia ?? null

  const cards = new Map<string, FamiliaCard>()
  const pega = (nome: string): FamiliaCard => {
    let c = cards.get(nome)
    if (!c) {
      c = { nome, venda: 0, cmc: 0, qtd: 0, vendaMesAnt: 0, vendaAnoAnt: 0 }
      cards.set(nome, c)
    }
    return c
  }

  const total: FamiliaCard = { nome: 'Total Geral', venda: 0, cmc: 0, qtd: 0, vendaMesAnt: 0, vendaAnoAnt: 0 }

  for (const v of atual) {
    total.venda += v.valor_total
    total.cmc += (v.cmc_unitario ?? 0) * v.quantidade
    total.qtd += 1
    const f = familiaDe(v)
    if (!f) continue // itens sem família só entram no total
    const c = pega(f)
    c.venda += v.valor_total
    c.cmc += (v.cmc_unitario ?? 0) * v.quantidade
    c.qtd += 1
  }
  for (const v of mesAnt) {
    total.vendaMesAnt += v.valor_total
    const f = familiaDe(v)
    if (f) pega(f).vendaMesAnt += v.valor_total
  }
  for (const v of anoAnt) {
    total.vendaAnoAnt += v.valor_total
    const f = familiaDe(v)
    if (f) pega(f).vendaAnoAnt += v.valor_total
  }

  // só famílias com movimento em algum dos períodos, maiores primeiro
  const familias = [...cards.values()]
    .filter((c) => c.venda !== 0 || c.vendaMesAnt !== 0 || c.vendaAnoAnt !== 0)
    .sort((a, b) => b.venda - a.venda)

  return { familias, total }
}

export function parseCompetencia(url: URL): { mes: number; ano: number; conta: string } | null {
  const mes = Number(url.searchParams.get('mes'))
  const ano = Number(url.searchParams.get('ano'))
  const conta = (url.searchParams.get('conta') || 'NOVA').toUpperCase()
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) return null
  if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) return null
  if (conta !== 'NOVA' && conta !== 'CASTRO' && conta !== 'TODAS') return null
  return { mes, ano, conta }
}
