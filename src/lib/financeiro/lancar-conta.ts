// Caixa › Lançar conta (12/11/2026): regras PURAS da tela que cria a conta a pagar e lança no Omie
// na mesma hora. O registro vive em `finan_pagar` (o mesmo das Requisições e do painel antigo) e o
// envio ao Omie é a rota de sempre (POST /api/financeiro/contas-pagar/omie) — aqui só o que dá
// para testar sem banco: validação do formulário, parcelas e o que conta como "falta lançar".

export const METODOS_PAGAMENTO = [
  'Boleto',
  'Boleto Parcelado',
  'Pix',
  'Transferência',
  'Cartão de Crédito',
  'Cartão de Débito',
  'Dinheiro',
  'Carnê ISS',
] as const

export type Parcela = { vencimento: string; valor: string }

export type NovaConta = {
  fornecedor: string
  fornecedorTemDocumento: boolean
  valor: string
  metodo: string
  vencimento: string
  parcelas: Parcela[]
  numeroNF: string
  motivo: string
  autonomoSemNota: boolean
  temAnexoNF: boolean
  temBoleto: boolean
}

/** "1.234,56", "1234,56", "1234.56" e "R$ 1.234" → número; vazio/lixo → NaN. */
export function lerValor(v: string | number | null | undefined): number {
  if (typeof v === 'number') return v
  let s = String(v ?? '').replace(/[R$\s]/g, '')
  if (!s) return NaN
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '')
  else if (/^\d{1,3}\.\d{3}$/.test(s)) s = s.replace('.', '')
  const n = Number(s)
  return Number.isFinite(n) ? n : NaN
}

const centavos = (n: number) => Math.round(n * 100)

/** Soma um mês (fim de mês não pula: 31/01 → 28/02). Data ISO YYYY-MM-DD. */
export function somarMeses(iso: string, meses: number): string {
  const [a, m, d] = iso.split('-').map(Number)
  const alvo = new Date(Date.UTC(a, m - 1 + meses, 1))
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate()
  alvo.setUTCDate(Math.min(d, ultimo))
  return alvo.toISOString().slice(0, 10)
}

/** Divide o total em `qtd` parcelas mensais a partir do 1º vencimento; a diferença dos centavos vai na última. */
export function gerarParcelas(total: number, qtd: number, primeiroVencimento: string): Parcela[] {
  const n = Math.max(1, Math.min(48, Math.floor(qtd) || 1))
  const totalC = Number.isFinite(total) && total > 0 ? centavos(total) : 0
  const base = Math.floor(totalC / n)
  return Array.from({ length: n }, (_, i) => ({
    vencimento: primeiroVencimento ? somarMeses(primeiroVencimento, i) : '',
    valor: totalC ? ((i === n - 1 ? totalC - base * (n - 1) : base) / 100).toFixed(2) : '',
  }))
}

const ehData = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s)

/** Lista do que falta (texto pronto para a tela). Vazia = pode criar. */
export function validarNovaConta(c: NovaConta): string[] {
  const erros: string[] = []
  if (!c.fornecedor.trim()) erros.push('Escolha o fornecedor.')
  else if (!c.fornecedorTemDocumento) erros.push('O fornecedor está sem CPF/CNPJ no cadastro — o Omie exige.')
  const total = lerValor(c.valor)
  if (!(total > 0)) erros.push('Informe o valor.')
  if (!c.metodo) erros.push('Escolha a forma de pagamento.')
  if (c.metodo === 'Boleto Parcelado') {
    if (c.parcelas.length < 2) erros.push('Gere as parcelas (2 ou mais).')
    else {
      if (c.parcelas.some((p) => !ehData(p.vencimento))) erros.push('Toda parcela precisa de vencimento.')
      if (c.parcelas.some((p) => !(lerValor(p.valor) > 0))) erros.push('Toda parcela precisa de valor.')
      const soma = c.parcelas.reduce((s, p) => s + centavos(lerValor(p.valor) || 0), 0)
      if (total > 0 && Math.abs(soma - centavos(total)) > 1)
        erros.push(`A soma das parcelas (R$ ${(soma / 100).toFixed(2).replace('.', ',')}) não bate com o valor.`)
    }
  } else if (!ehData(c.vencimento)) erros.push('Informe o vencimento.')
  const dispensaNota = c.autonomoSemNota || c.metodo === 'Carnê ISS'
  if (!dispensaNota && !c.numeroNF.trim()) erros.push('Informe o número da nota (ou marque "prestador autônomo").')
  if (!dispensaNota && !c.temAnexoNF) erros.push('Anexe a nota (PDF, XML ou foto).')
  if (c.metodo.startsWith('Boleto') && !c.autonomoSemNota && !c.temBoleto) erros.push('Anexe o boleto.')
  if (!c.motivo.trim()) erros.push('Escreva o motivo (vai na observação do Omie).')
  return erros
}

/** Linha de `finan_pagar` ainda sem lançamento no Omie e ainda viva (não concluída/excluída à mão). */
export function faltaLancar(r: { omie_cod_lancamento?: unknown; status?: string | null; status_envio?: string | null }): boolean {
  if (r.omie_cod_lancamento) return false
  if (['concluido', 'excluido', 'pago', 'lixeira'].includes(String(r.status || ''))) return false
  return r.status_envio !== 'enviado'
}

/** Empresa Omie de um registro (sem empresa salva = Nova, como o painel). */
export const empresaDoRegistro = (r: { omie_empresa?: string | null }) => r.omie_empresa || 'Nova Tratores'

/** Texto de `finan_pagar.parcelas_vencimentos` ("2026-01-01|123.45, …"). */
export const parcelasParaTexto = (ps: Parcela[]) => ps.map((p) => `${p.vencimento}|${lerValor(p.valor).toFixed(2)}`).join(', ')
