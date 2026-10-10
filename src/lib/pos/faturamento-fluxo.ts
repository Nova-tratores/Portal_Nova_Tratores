// Sequência das chamadas ao Omie para faturar a OS — com as dependências
// INJETADAS, para os testes cobrirem cada modo de falha sem Omie de verdade.
//
//   ConsultarOS → [AlterarOS impostos → ConsultarOS de conferência]
//               → [AlterarOS parcelas (sobre o LÍQUIDO) → ConsultarOS de conferência]
//               → ValidarOS → FaturarOS
//
// Garantias que esta função dá (cobertas em __tests__/faturamento-fluxo.test.ts):
//  - FaturarOS é chamado NO MÁXIMO uma vez e nunca é repetido;
//  - qualquer divergência (valor, parcelas, OS já faturada/cancelada, ValidarOS
//    recusando) para ANTES de emitir;
//  - erro de rede/timeout no FaturarOS vira "desconhecido" (pode ter emitido) —
//    a trava continua e a reconciliação confere no Omie; nunca "tente de novo".
import { estadoNoOmie, valorMudou, valorLiquido, type CabecalhoOmie, type InfoCadastroOmie } from './faturamento-regras';
import { conferirImpostos, type CamposFiscais, type ItemServicoOmie } from './modelo-fiscal';
import { parcelasDoPagamento, conferirParcelas, type PlanoParcelas } from '@/lib/pagamento/parcelas';

/** Recusa EXPLÍCITA do Omie (faultstring / HTTP de erro com corpo): nada foi feito. */
export class ErroOmie extends Error {
  constructor(msg: string) { super(msg); this.name = 'ErroOmie'; }
}

export interface OSNoOmie {
  Cabecalho?: CabecalhoOmie;
  InfoCadastro?: InfoCadastroOmie;
  Parcelas?: Array<{ nValor?: number | string; dDtVenc?: string }>;
  ServicosPrestados?: ItemServicoOmie[];
}

export interface DepsFaturamento {
  consultar(): Promise<OSNoOmie>;
  alterarImpostos(itens: ItemServicoOmie[], campos: CamposFiscais): Promise<void>;
  alterarParcelas(plano: PlanoParcelas): Promise<void>;
  validar(): Promise<void>;
  faturar(): Promise<{ cCodStatus?: string; cDescStatus?: string } | null | undefined>;
}

export type ResultadoFluxo =
  | { tipo: 'faturada'; plano: PlanoParcelas | null; resposta: string; liquido: number }
  | { tipo: 'ja_faturada' }
  | { tipo: 'pendente_omie'; mensagem: string }
  | { tipo: 'erro'; mensagem: string }
  | { tipo: 'desconhecido'; mensagem: string };

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function executarFaturamento(
  deps: DepsFaturamento,
  entrada: { forma: string | null; aplicarParcelas: boolean; hojeISO: string; totalConfirmado: number; impostos?: CamposFiscais | null },
): Promise<ResultadoFluxo> {
  // 1) estado atual no Omie
  let os1: OSNoOmie;
  try { os1 = await deps.consultar(); } catch (e) { return { tipo: 'erro', mensagem: `Não consegui consultar a OS no Omie: ${msg(e)}` }; }
  const est = estadoNoOmie(os1.Cabecalho, os1.InfoCadastro);
  if (est === 'cancelada') return { tipo: 'erro', mensagem: 'A OS está CANCELADA no Omie.' };
  if (est === 'faturada') return { tipo: 'ja_faturada' };
  if (est === 'faturando') return { tipo: 'pendente_omie', mensagem: 'A OS já está na etapa de faturamento no Omie (etapa 50), mas sem nota concluída. Confira no Omie — o portal não fatura de novo.' };

  const total = Number(os1.Cabecalho?.nValorTotal || 0);
  if (!(total > 0)) return { tipo: 'erro', mensagem: 'A OS está com valor zero no Omie.' };
  if (valorMudou(total, entrada.totalConfirmado)) {
    return { tipo: 'erro', mensagem: `O valor da OS no Omie mudou (agora R$ ${total.toFixed(2)}). Abra a janela de novo e confira antes de faturar.` };
  }

  // 2) impostos dos itens de serviço (modelo fiscal + ajustes), conferidos item a item
  let base: OSNoOmie = os1;
  const campos = entrada.impostos || {};
  if (Object.keys(campos).length) {
    try { await deps.alterarImpostos(os1.ServicosPrestados || [], campos); } catch (e) { return { tipo: 'erro', mensagem: `O Omie recusou gravar os impostos dos serviços: ${msg(e)}` }; }
    try { base = await deps.consultar(); } catch (e) { return { tipo: 'erro', mensagem: `Não consegui conferir os impostos no Omie: ${msg(e)}` }; }
    if (estadoNoOmie(base.Cabecalho, base.InfoCadastro) !== 'aberta') return { tipo: 'erro', mensagem: 'A OS mudou de situação no Omie durante o faturamento. Nada foi emitido; confira no Omie.' };
    if (valorMudou(Number(base.Cabecalho?.nValorTotal || 0), total)) {
      return { tipo: 'erro', mensagem: `O total da OS no Omie mudou ao gravar os impostos (agora R$ ${Number(base.Cabecalho?.nValorTotal || 0).toFixed(2)}). Nada foi emitido; confira no Omie.` };
    }
    const difImp = conferirImpostos(base.ServicosPrestados, campos);
    if (difImp) return { tipo: 'erro', mensagem: `Os impostos não conferem (${difImp}). Nada foi emitido.` };
  }

  // 3) parcelas da forma de pagamento — sobre o LÍQUIDO (total − retidos) do Omie
  const liquido = valorLiquido(base.Cabecalho);
  if (!(liquido > 0)) return { tipo: 'erro', mensagem: 'O valor líquido da OS (total − impostos retidos) ficou zero no Omie.' };
  let plano: PlanoParcelas | null = null;
  if (entrada.aplicarParcelas) {
    plano = parcelasDoPagamento(entrada.forma, liquido, entrada.hojeISO);
    if (!plano) return { tipo: 'erro', mensagem: 'Escolha a forma de pagamento antes de faturar.' };
    try { await deps.alterarParcelas(plano); } catch (e) { return { tipo: 'erro', mensagem: `O Omie recusou gravar as parcelas: ${msg(e)}` }; }

    let os2: OSNoOmie;
    try { os2 = await deps.consultar(); } catch (e) { return { tipo: 'erro', mensagem: `Não consegui conferir as parcelas no Omie: ${msg(e)}` }; }
    const est2 = estadoNoOmie(os2.Cabecalho, os2.InfoCadastro);
    if (est2 !== 'aberta') return { tipo: 'erro', mensagem: 'A OS mudou de situação no Omie durante o faturamento. Nada foi emitido; confira no Omie.' };
    if (valorMudou(Number(os2.Cabecalho?.nValorTotal || 0), total) || valorMudou(valorLiquido(os2.Cabecalho), liquido)) {
      return { tipo: 'erro', mensagem: 'O valor da OS no Omie mudou ao gravar as parcelas. Nada foi emitido; confira no Omie.' };
    }
    const dif = conferirParcelas(plano, os2.Parcelas);
    if (dif) return { tipo: 'erro', mensagem: `As parcelas não conferem (${dif}). Nada foi emitido.` };
  }

  // 4) ValidarOS: o próprio Omie diz se a OS pode ser faturada (sem emitir)
  try { await deps.validar(); } catch (e) { return { tipo: 'erro', mensagem: `O Omie não validou a OS para faturar: ${msg(e)}` }; }

  // 5) FaturarOS — UMA chamada, sem repetir
  try {
    const r = await deps.faturar();
    const cod = String(r?.cCodStatus ?? '');
    const desc = String(r?.cDescStatus ?? '');
    if (cod && cod !== '0') {
      // resposta sem fault mas com status diferente de "ok": o Omie decide pelo estado
      try {
        const os3 = await deps.consultar();
        const est3 = estadoNoOmie(os3.Cabecalho, os3.InfoCadastro);
        if (est3 === 'faturada' || est3 === 'faturando') return { tipo: 'faturada', plano, liquido, resposta: `${cod} ${desc}`.trim() };
      } catch { /* sem como conferir: desconhecido */
        return { tipo: 'desconhecido', mensagem: `O Omie respondeu "${cod} ${desc}" e não deu para conferir a OS.` };
      }
      return { tipo: 'erro', mensagem: `O Omie não faturou: ${desc || cod}` };
    }
    return { tipo: 'faturada', plano, liquido, resposta: `${cod} ${desc}`.trim() || 'ok' };
  } catch (e) {
    if (e instanceof ErroOmie) return { tipo: 'erro', mensagem: `O Omie recusou o faturamento: ${e.message}` };
    return { tipo: 'desconhecido', mensagem: `Sem resposta do Omie ao faturar (${msg(e)}). A nota PODE ter sido emitida — o portal vai conferir antes de qualquer nova tentativa.` };
  }
}
