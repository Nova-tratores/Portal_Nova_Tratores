// Troca de responsável na Frota → vínculo do TÉCNICO com o carro
// (tecnico_veiculos: checklist do mês, GPS do técnico, gastos, mapa).
//
// Até 22/10/2026 a Frota só gravava frota_responsaveis e o vínculo do técnico
// ficava no carro antigo (caso real: Danilo passou para o TKY6E68 em 22/09 e o
// checklist continuou pedindo o FXM4G90). Agora a troca na Frota também move o
// técnico: o técnico que ENTROU passa a ter este carro (uma linha por técnico,
// como na Janela Mecânicos) e TODO mundo que estava no carro sai — um carro,
// uma pessoa (José, 04/11/2026; antes só saía o responsável anterior e o
// TKY6E68 juntou Danilo + Paulo + Nicolas).
import { mesmaPessoa } from './responsavel';
import { resolverPlaca } from './placa';

export interface LinhaVinculo { id: number; tecnico_nome: string; placa: string | null }

export interface PlanoVinculo {
  apagar: number[];
  /** linha do técnico que entrou: atualizar (id) ou criar (sem id) */
  gravar: { id?: number; tecnico_nome: string } | null;
}

export function planejarVinculo(args: {
  linhas: LinhaVinculo[];
  /** nomes de técnico (Janela Mecânicos) */
  tecnicos: string[];
  placa: string;
  /** só para o histórico; quem sai é todo mundo que não é o novo */
  anterior?: string | null;
  novo: string | null;
  /** outros nomes do novo (cadastro do motorista: "ZECCA" = José Oliveira) */
  novoApelidos?: (string | null | undefined)[];
}): PlanoVinculo {
  const { linhas, tecnicos, novo } = args;
  const placa = resolverPlaca(args.placa);
  const doCarro = (l: LinhaVinculo) => resolverPlaca(l.placa || '') === placa;
  const nomesNovo = novo ? [novo, ...(args.novoApelidos || [])].filter(Boolean) as string[] : [];
  const ehNovo = (n: string) => nomesNovo.some((x) => mesmaPessoa(n, x));

  const apagar = linhas.filter((l) => doCarro(l) && !ehNovo(l.tecnico_nome)).map((l) => l.id);

  let gravar: PlanoVinculo['gravar'] = null;
  // a linha que já está NESTE carro tem preferência (senão move a de outro carro)
  const existente = linhas.find((l) => doCarro(l) && ehNovo(l.tecnico_nome)) || linhas.find((l) => ehNovo(l.tecnico_nome));
  if (existente) gravar = { id: existente.id, tecnico_nome: existente.tecnico_nome };
  else {
    const tec = tecnicos.find((t) => ehNovo(t));
    if (tec) gravar = { tecnico_nome: tec };
  }
  // e o novo não fica em dois carros: sobra de linha dele em outro carro sai
  for (const l of linhas) if (ehNovo(l.tecnico_nome) && l.id !== existente?.id && !apagar.includes(l.id)) apagar.push(l.id);
  return { apagar, gravar };
}
