// Conta corrente do pedido na empresa de DESTINO — PURO.
// A lista "Conta Corrente" do PPV vem do espelho da NOVA (tabela conta_corrente);
// a Castro tem as próprias contas, com outros códigos (13/10/2026: pedido para a
// Castro com o Banco do Brasil da Nova → "Conta Corrente não cadastrada").
// Regra: código que existe na empresa de destino vale; senão troca pela conta de
// MESMO NOME lá (Banco do Brasil → Banco do Brasil da Castro); sem equivalente
// (INTERNO, Caixa Loja, Sicredi…) → conta padrão da empresa.

export interface ContaDestino { nCodCC: number; descricao: string; inativo?: boolean }

export function nomeConta(s: string | null | undefined): string {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, ' ').trim().toLowerCase()
}

export function resolverContaCorrente(a: {
  escolhido: number | null;              // código salvo no PPV (pode ser da Nova)
  descricaoEscolhido: string | null;     // nome dele no espelho do portal
  contasDestino: ContaDestino[];         // ListarContasCorrentes da empresa de destino
  padrao: number | null;                 // conta padrão da empresa de destino
}): { codigo: number | undefined; trocada: boolean; motivo: string | null } {
  const ativas = a.contasDestino.filter((c) => !c.inativo)
  if (!a.escolhido) return { codigo: a.padrao || undefined, trocada: false, motivo: null }
  if (ativas.some((c) => Number(c.nCodCC) === Number(a.escolhido))) return { codigo: a.escolhido, trocada: false, motivo: null }
  const nome = nomeConta(a.descricaoEscolhido)
  const igual = nome ? ativas.find((c) => nomeConta(c.descricao) === nome) : undefined
  if (igual) return { codigo: Number(igual.nCodCC), trocada: true, motivo: `conta "${a.descricaoEscolhido}" trocada pela de mesmo nome na empresa de destino` }
  return {
    codigo: a.padrao || undefined, trocada: true,
    motivo: `a conta "${a.descricaoEscolhido || a.escolhido}" não existe na empresa de destino — usada a conta padrão dela`,
  }
}

// ── Departamentos (mesma história: a lista do PPV é a da NOVA) ──────────────
export interface DeptoDestino { codigo: string; descricao: string; inativo?: boolean }

/**
 * Distribuição por departamento na empresa de destino: código que existe lá fica;
 * senão troca pelo de MESMO NOME. Sem equivalente: o % vai para o primeiro que
 * casou (continua somando 100%); se nenhum casar, o pedido vai sem distribuição.
 */
export function resolverDepartamentos(
  deps: Array<{ codigo: string; perc: number }>,
  nomesPortal: Record<string, string>,
  destino: DeptoDestino[],
): { deps: Array<{ codigo: string; perc: number }>; aviso: string | null } {
  const ativos = destino.filter((d) => !d.inativo)
  const out: Array<{ codigo: string; perc: number }> = []
  const semPar: string[] = []
  let sobra = 0
  for (const d of deps) {
    let cod: string | null = ativos.some((x) => String(x.codigo) === String(d.codigo)) ? String(d.codigo) : null
    if (!cod) {
      const nome = nomeConta(nomesPortal[String(d.codigo)])
      // 1º nome igual; 2º sem o número da frente e sem "Marketing" ("11. Marketing_Eventos" = "Eventos")
      const base = (t: string) => nomeConta(t).replace(/^\d+\s+/, '').replace(/^marketing\s+/, '')
      const igual = nome ? (ativos.find((x) => nomeConta(x.descricao) === nome)
        || ativos.find((x) => base(x.descricao) === base(nomesPortal[String(d.codigo)]))) : undefined
      cod = igual ? String(igual.codigo) : null
    }
    if (!cod) { semPar.push(nomesPortal[String(d.codigo)] || String(d.codigo)); sobra += Number(d.perc) || 0; continue }
    const ja = out.find((x) => x.codigo === cod)
    if (ja) ja.perc += Number(d.perc) || 0; else out.push({ codigo: cod, perc: Number(d.perc) || 0 })
  }
  if (!out.length) return { deps: [], aviso: semPar.length ? `departamento(s) sem equivalente na empresa de destino (${semPar.join(', ')}) — pedido vai sem distribuição` : null }
  if (sobra) out[0].perc += sobra
  return { deps: out, aviso: semPar.length ? `departamento(s) sem equivalente (${semPar.join(', ')}) somados em ${out[0].codigo}` : null }
}
