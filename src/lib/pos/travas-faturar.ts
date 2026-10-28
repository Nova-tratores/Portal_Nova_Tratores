// Travas ANTES de faturar a OS (José, 22/10/2026) — regras puras, testadas em __tests__/travas-faturar.test.ts.
//  1. a previsão de faturamento tem que ser HOJE;
//  2. o projeto (máquina) tem que estar preenchido;
//  3. o cliente (CPF/CNPJ) tem que ter ao menos uma localização (fazenda) confirmada — tendo, não pede mais.
// Não desabilitam o botão: aparecem numa janela depois do clique em Faturar e o servidor recusa sem elas.

export type ChaveTrava = 'previsao' | 'projeto' | 'localizacao'

export interface Trava {
  chave: ChaveTrava
  ok: boolean
  titulo: string
  detalhe: string
}

export interface DadosTravas {
  hoje: string                       // YYYY-MM-DD (São Paulo)
  previsaoFaturamento: string | null // Ordem_Servico.Previsao_Faturamento
  projeto: string | null             // Ordem_Servico.Projeto
  documentoCliente: string | null    // Cnpj_Cliente
  localizacaoConfirmada: boolean
  /** nomes das localizações (fazendas) do cliente */
  localizacoes?: string[]
}

const dataBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`

export function avaliarTravas(d: DadosTravas): Trava[] {
  const prev = String(d.previsaoFaturamento || '').slice(0, 10)
  const doc = String(d.documentoCliente || '').replace(/\D/g, '')
  return [
    {
      chave: 'previsao',
      ok: prev === d.hoje,
      titulo: 'Previsão de faturamento para hoje',
      detalhe: prev === d.hoje ? `hoje, ${dataBR(d.hoje)}`
        : prev ? `está ${dataBR(prev)} — para faturar tem que ser hoje (${dataBR(d.hoje)})`
          : `está vazia — para faturar tem que ser hoje (${dataBR(d.hoje)})`,
    },
    {
      chave: 'projeto',
      ok: !!String(d.projeto || '').trim(),
      titulo: 'Projeto (máquina) preenchido',
      detalhe: String(d.projeto || '').trim() || 'a OS está sem projeto — escolha a máquina do cliente na OS e salve',
    },
    {
      chave: 'localizacao',
      ok: !doc || d.localizacaoConfirmada,
      titulo: 'Localização do cliente confirmada',
      detalhe: !doc ? 'cliente sem CPF/CNPJ na OS' : d.localizacaoConfirmada ? (d.localizacoes?.length ? d.localizacoes.join(', ') : 'já confirmada') : 'cadastre a fazenda do cliente (pelo GPS do carro do técnico no dia do serviço)',
    },
  ]
}

/** mensagem para o servidor recusar o faturamento; null = pode faturar */
export function bloqueioTravas(travas: Trava[]): string | null {
  const falta = travas.filter((t) => !t.ok)
  if (!falta.length) return null
  return `Antes de faturar: ${falta.map((t) => t.titulo.toLowerCase()).join('; ')}.`
}
