// Troca de responsável na Frota → vínculo do TÉCNICO com o carro
// (tecnico_veiculos: checklist do mês, GPS do técnico, gastos, mapa).
//
// Até 22/10/2026 a Frota só gravava frota_responsaveis e o vínculo do técnico
// ficava no carro antigo (caso real: Danilo passou para o TKY6E68 em 22/09 e o
// checklist continuou pedindo o FXM4G90). Agora a troca na Frota também move o
// técnico: quem SAIU do carro perde o vínculo com ele; o técnico que ENTROU
// passa a ter este carro (uma linha por técnico, como na Janela Mecânicos).
// Quem divide o carro e não entrou na troca continua como está.
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
  anterior: string | null;
  novo: string | null;
}): PlanoVinculo {
  const { linhas, tecnicos, anterior, novo } = args;
  const placa = resolverPlaca(args.placa);
  const doCarro = (l: LinhaVinculo) => resolverPlaca(l.placa || '') === placa;
  const ehNovo = (n: string) => !!novo && mesmaPessoa(n, novo);

  const apagar = linhas
    .filter((l) => doCarro(l) && !!anterior && mesmaPessoa(l.tecnico_nome, anterior) && !ehNovo(l.tecnico_nome))
    .map((l) => l.id);

  let gravar: PlanoVinculo['gravar'] = null;
  const existente = linhas.find((l) => ehNovo(l.tecnico_nome));
  if (existente) gravar = { id: existente.id, tecnico_nome: existente.tecnico_nome };
  else {
    const tec = tecnicos.find((t) => ehNovo(t));
    if (tec) gravar = { tecnico_nome: tec };
  }
  return { apagar, gravar };
}
