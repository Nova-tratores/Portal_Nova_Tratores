// =============================================================================
// FIPE — valor de mercado automático (API pública do parallelum, sem chave).
//
// Dois caminhos:
//  1. POR CÓDIGO (determinístico): veículo que já teve o modelo FIPE
//     confirmado por um humano guarda fipe_codigo + fipe_ano_codigo — a
//     consulta vai direto no v2 (/cars/{code}/years/{year}). É o que o cron
//     mensal usa: NUNCA atualiza patrimônio por chute de matching.
//  2. POR DESCRIÇÃO (fuzzy): marca/modelo/ano da ficha → melhor candidato na
//     tabela FIPE, com nota de confiança e a lista de candidatos — o humano
//     confere na Ficha antes de salvar (e aí o código fica gravado).
// =============================================================================

const V1 = 'https://parallelum.com.br/fipe/api/v1/carros';
const V2 = 'https://fipe.parallelum.com.br/api/v2/cars';

export interface ResultadoFipe {
  valor: number;
  valor_texto: string;
  nome: string;             // nome do modelo na tabela FIPE
  ano_modelo: number;
  codigo_fipe: string;      // ex.: "005501-8"
  ano_codigo: string;       // ex.: "2022-5"
  mes_referencia: string;   // ex.: "julho de 2026"
  confianca: 'alta' | 'baixa';
  candidatos: string[];     // outros modelos que quase casaram (transparência)
}

function parsePreco(s: string): number {
  const n = Number(String(s || '').replace(/[^\d,]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

const norm = (s: string) =>
  String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const tokens = (s: string) => norm(s).match(/[A-Z0-9.]+/g) || [];

async function getJson(url: string): Promise<any> {
  const r = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`FIPE ${r.status} em ${url.replace(/^https?:\/\/[^/]+/, '')}`);
  return r.json();
}

/** Consulta determinística por código (o caminho do cron). */
export async function buscarFipePorCodigo(codigoFipe: string, anoCodigo: string): Promise<ResultadoFipe> {
  const d = await getJson(`${V2}/${encodeURIComponent(codigoFipe)}/years/${encodeURIComponent(anoCodigo)}`);
  return {
    valor: parsePreco(d.price),
    valor_texto: d.price,
    nome: d.model,
    ano_modelo: Number(d.modelYear) || 0,
    codigo_fipe: d.codeFipe,
    ano_codigo: anoCodigo,
    mes_referencia: d.referenceMonth || '',
    confianca: 'alta',
    candidatos: [],
  };
}

/** Fuzzy: acha o veículo na tabela FIPE pela descrição da ficha. */
export async function buscarFipePorDescricao(v: {
  marca: string | null;
  modelo: string | null;
  ano: number | null;
  ano_modelo: number | null;
}): Promise<ResultadoFipe> {
  const marcaBusca = norm(v.marca || '');
  const modeloBusca = tokens(v.modelo || '');
  if (!marcaBusca || modeloBusca.length === 0) {
    throw new Error('Preencha marca e modelo na ficha antes de buscar na FIPE.');
  }

  // 1) marca — "VW" casa "VW - VolksWagen"; "GM"/"CHEVROLET" casa "GM - Chevrolet"
  const marcas: { codigo: string; nome: string }[] = await getJson(`${V1}/marcas`);
  const marca = marcas.find((m) => {
    const nm = norm(m.nome);
    return nm.includes(marcaBusca) || marcaBusca.includes(nm) || tokens(m.nome).some((t) => t === marcaBusca);
  });
  if (!marca) throw new Error(`Marca "${v.marca}" não encontrada na tabela FIPE.`);

  // 2) modelo — pontua pela fração de tokens do NOSSO modelo presentes no nome FIPE
  const { modelos }: { modelos: { codigo: number; nome: string }[] } = await getJson(
    `${V1}/marcas/${marca.codigo}/modelos`,
  );
  const pontuados = modelos
    .map((m) => {
      const nf = norm(m.nome);
      const acertos = modeloBusca.filter((t) => nf.includes(t)).length;
      return { ...m, score: acertos / modeloBusca.length };
    })
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score);
  if (pontuados.length === 0) throw new Error(`Modelo "${v.modelo}" não encontrado na FIPE (marca ${marca.nome}).`);

  // 3) ano — tenta os melhores candidatos até um ter o ano do carro
  const anoAlvo = v.ano_modelo || v.ano;
  for (const cand of pontuados.slice(0, 4)) {
    const anos: { codigo: string; nome: string }[] = await getJson(
      `${V1}/marcas/${marca.codigo}/modelos/${cand.codigo}/anos`,
    );
    const ano =
      (anoAlvo && anos.find((a) => a.codigo.startsWith(String(anoAlvo)))) ||
      (!anoAlvo ? anos[anos.length - 1] : null); // sem ano na ficha: o mais novo
    if (!ano) continue;

    const d = await getJson(`${V1}/marcas/${marca.codigo}/modelos/${cand.codigo}/anos/${ano.codigo}`);
    return {
      valor: parsePreco(d.Valor),
      valor_texto: d.Valor,
      nome: d.Modelo,
      ano_modelo: Number(d.AnoModelo) || 0,
      codigo_fipe: d.CodigoFipe,
      ano_codigo: ano.codigo,
      mes_referencia: d.MesReferencia || '',
      // confiança alta = casou bem o nome E o ano exato do carro
      confianca: cand.score >= 0.5 && !!anoAlvo ? 'alta' : 'baixa',
      candidatos: pontuados.slice(0, 5).filter((p) => p.codigo !== cand.codigo).map((p) => p.nome),
    };
  }

  throw new Error(
    `Achei o modelo na FIPE mas nenhuma versão tem o ano ${anoAlvo} — candidatos: ${pontuados.slice(0, 4).map((p) => p.nome).join(' · ')}`,
  );
}
