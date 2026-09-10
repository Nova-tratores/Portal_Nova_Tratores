// =============================================================================
// MARKETING & EVENTOS — estrutura do relatório de contrapartida. Lib PURA.
//
// A mesma estrutura alimenta o PDF, a pré-visualização na tela e o corpo do
// e-mail. Uma lógica, três consumidores (desenho de lib/ppv/relacao.ts).
//
// REGRA CENTRAL: campo vazio aparece como "Não registrado" — NUNCA some em
// silêncio. Um relatório que omite o que falta engana a fábrica e a própria
// empresa. E, junto, `pendencias` devolve tudo que caiu em "Não registrado",
// pra tela avisar antes de deixar enviar.
//
// A distinção que precisa de teste: 0 é valor legítimo, null não é.
//   dinheiro(0)    -> 'R$ 0,00'
//   dinheiro(null) -> 'Não registrado'
// Trocar isso é mentir no relatório.
// =============================================================================
import { brl, parseValorMisto, rankingCategorias, totaisCusto } from './custos';
import { calcularROI, type ResultadoROI } from './roi';
import {
  DESTINOS_ITEM, PAPEIS_EQUIPE, STATUS_APOIO, STATUS_RELATORIO, TIPOS_ACAO,
  TIPOS_ITEM, rotulo,
  type Acao, type Apoio, type Custo, type Lead, type PropostaVinculada,
} from './tipos';

export const NAO_REGISTRADO = 'Não registrado';

/** Texto, ou "Não registrado". Cobre '', espaços, null, undefined e 'null'. */
export function txt(v: unknown): string {
  if (v === null || v === undefined) return NAO_REGISTRADO;
  const s = String(v).trim();
  if (s === '' || s === 'null' || s === 'undefined') return NAO_REGISTRADO;
  return s;
}

/** Dinheiro. ZERO é um valor de verdade e sai 'R$ 0,00'; ausência é que não é. */
export function dinheiro(v: unknown): string {
  if (v === null || v === undefined || v === '') return NAO_REGISTRADO;
  const n = typeof v === 'number' ? v : parseValorMisto(v);
  if (!Number.isFinite(n)) return NAO_REGISTRADO;
  return brl(n);
}

/** Data no formato brasileiro. Sem Date, pra não escorregar de fuso. */
export function data(v: unknown): string {
  if (!v) return NAO_REGISTRADO;
  const s = String(v).slice(0, 10);
  const [a, m, d] = s.split('-');
  return a && m && d ? `${d}/${m}/${a}` : NAO_REGISTRADO;
}

/** Inteiro. Zero conta; ausência vira "Não registrado". */
export function inteiro(v: unknown): string {
  if (v === null || v === undefined || v === '') return NAO_REGISTRADO;
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString('pt-BR') : NAO_REGISTRADO;
}

export interface LinhaRelatorio { rotulo: string; valor: string }
export interface SecaoRelatorio {
  titulo: string;
  linhas: LinhaRelatorio[];
  /** Tabela opcional da seção (cabeçalho + linhas já formatadas). */
  tabela?: { cabecalho: string[]; linhas: string[][] };
  /** Texto corrido no fim da seção (ex.: aprendizados). */
  texto?: string;
}

// Só o que o relatório realmente lê de cada tabela filha. Tipar assim (em vez
// de `any[]`) faz o compilador brigar quando um campo é renomeado na migration.
export interface EquipeRel { id?: string; nome?: string | null; papel?: string | null }
export interface ItemRel {
  id?: string;
  quantidade?: number | null; modelo?: string | null; descricao?: string | null;
  tipo?: string | null; destino?: string | null;
}
export interface RealizadaRel {
  id?: string;
  apoio_id?: string | null; titulo?: string | null; realizado?: boolean | null;
  data?: string | null; evidencia_url?: string | null;
}
export interface ConcorrenteRel { id?: string; marca?: string | null }
export interface MidiaRel {
  id?: string;
  url?: string | null; legenda?: string | null; tipo?: string | null;
  contrapartida?: boolean | null; ordem?: number | null;
}
export interface AvaliacaoRel {
  id?: string;
  funcionou?: string | null; nao_funcionou?: string | null;
  aprendizados?: string | null; repetir?: string | null;
}

export interface DadosRelatorio {
  acao: Acao;
  apoio: Apoio;
  custos: Custo[];
  leads: Lead[];
  propostas: PropostaVinculada[];
  apoios: Apoio[];
  equipe: EquipeRel[];
  itens: ItemRel[];
  realizadas: RealizadaRel[];
  concorrentes: ConcorrenteRel[];
  midias: MidiaRel[];
  avaliacoes: AvaliacaoRel[];
  hoje?: string;
}

export interface Relatorio {
  titulo: string;
  subtitulo: string;
  secoes: SecaoRelatorio[];
  /** Fotos marcadas como contrapartida (até 6 entram no PDF). */
  fotos: { url: string; legenda: string }[];
  /** Vídeos marcados como contrapartida. Não cabem num PDF, entram como link. */
  videos: { url: string; legenda: string }[];
  /** Tudo que ficou "Não registrado" — a tela mostra antes de deixar enviar. */
  pendencias: string[];
  roi: ResultadoROI;
}

/** Registra a pendência quando o valor formatado caiu em "Não registrado". */
function linha(pend: string[], secao: string, rotuloTxt: string, valor: string): LinhaRelatorio {
  if (valor === NAO_REGISTRADO) pend.push(`${secao}: ${rotuloTxt}`);
  return { rotulo: rotuloTxt, valor };
}

export function montarRelatorio(d: DadosRelatorio): Relatorio {
  const pend: string[] = [];
  const { acao, apoio } = d;

  const roi = calcularROI({
    acao,
    custos: d.custos ?? [],
    apoios: d.apoios ?? [],
    leads: d.leads ?? [],
    propostas: d.propostas ?? [],
    hoje: d.hoje,
  });
  const tot = totaisCusto(d.custos ?? []);

  // ── 1. Identificação ───────────────────────────────────────────────────────
  const s1: SecaoRelatorio = {
    titulo: '1. Identificação do evento',
    linhas: [
      linha(pend, '1', 'Ação', txt(acao.nome)),
      linha(pend, '1', 'Tipo', txt(rotulo(TIPOS_ACAO, acao.tipo))),
      linha(pend, '1', 'Período', acao.data_inicio || acao.data_fim
        ? `${data(acao.data_inicio)} a ${data(acao.data_fim || acao.data_inicio)}`
        : NAO_REGISTRADO),
      linha(pend, '1', 'Local', txt(acao.local_nome)),
      linha(pend, '1', 'Cidade / UF', acao.cidade ? `${acao.cidade}${acao.uf ? ` / ${acao.uf}` : ''}` : NAO_REGISTRADO),
      linha(pend, '1', 'Empresa', txt(acao.empresa)),
      linha(pend, '1', 'Projeto no Omie', txt(acao.projeto_nome)),
      linha(pend, '1', 'Responsável', txt(acao.responsavel_nome)),
      linha(pend, '1', 'Público estimado do evento', inteiro(acao.publico_estimado)),
      linha(pend, '1', 'Objetivo', txt(acao.objetivo)),
    ],
  };

  // ── 2. Apoio recebido ──────────────────────────────────────────────────────
  const s2: SecaoRelatorio = {
    titulo: '2. Apoio recebido',
    linhas: [
      linha(pend, '2', 'Apoiador', txt(apoio.apoiador)),
      linha(pend, '2', 'Etapa do processo', txt(rotulo(STATUS_APOIO, apoio.status))),
      linha(pend, '2', 'Valor aprovado', dinheiro(apoio.valor_aprovado)),
      linha(pend, '2', 'Valor recebido', dinheiro(apoio.valor_recebido)),
      linha(pend, '2', 'Nº do processo', txt(apoio.processo_numero)),
      linha(pend, '2', 'Documento', apoio.documento_tipo
        ? `${apoio.documento_tipo} ${txt(apoio.documento_numero)}`
        : NAO_REGISTRADO),
      linha(pend, '2', 'Emissão do documento', data(apoio.documento_emitido_em)),
      linha(pend, '2', 'Forma do crédito', txt(apoio.forma_credito)),
      linha(pend, '2', 'Data do crédito', data(apoio.credito_em)),
      linha(pend, '2', 'Prazo da contrapartida', data(apoio.contrapartida_prazo)),
      linha(pend, '2', 'Situação do relatório', txt(rotulo(STATUS_RELATORIO, apoio.relatorio_status))),
    ],
    texto: apoio.contrapartida_texto ? `Contrapartida acordada: ${apoio.contrapartida_texto}` : undefined,
  };
  if (!apoio.contrapartida_texto) pend.push('2: Contrapartida acordada (texto)');

  // ── 3. Contrapartidas acordadas x realizadas ──────────────────────────────
  // Só o que está amarrado a ESTE apoio; o resto é atividade interna da ação.
  const contrapartidas = (d.realizadas ?? []).filter((r) => r.apoio_id === apoio.id);
  const s3: SecaoRelatorio = {
    titulo: '3. Contrapartidas acordadas e realizadas',
    linhas: [],
    tabela: {
      cabecalho: ['Contrapartida', 'Feito?', 'Data', 'Evidência'],
      linhas: contrapartidas.length
        ? contrapartidas.map((r) => [
            txt(r.titulo),
            r.realizado ? 'Sim' : 'Não',
            data(r.data),
            r.evidencia_url ? 'Anexada' : NAO_REGISTRADO,
          ])
        : [[NAO_REGISTRADO, '-', '-', '-']],
    },
  };
  if (contrapartidas.length === 0) pend.push('3: Nenhuma contrapartida registrada para este apoio');
  else {
    const naoFeitas = contrapartidas.filter((r) => !r.realizado).length;
    if (naoFeitas > 0) pend.push(`3: ${naoFeitas} contrapartida(s) ainda não marcada(s) como realizada(s)`);
  }

  // ── 4. Participação da Nova Tratores ──────────────────────────────────────
  const s4: SecaoRelatorio = {
    titulo: '4. Participação da Nova Tratores',
    linhas: [
      linha(pend, '4', 'Equipe presente', (d.equipe ?? []).length
        ? (d.equipe ?? []).map((p) => `${p.nome} (${rotulo(PAPEIS_EQUIPE, p.papel)})`).join(', ')
        : NAO_REGISTRADO),
      linha(pend, '4', 'Itens expostos', (d.itens ?? []).length
        ? (d.itens ?? []).map((i) => `${i.quantidade ?? 1}× ${txt(i.modelo || i.descricao)} — ${rotulo(TIPOS_ITEM, i.tipo)}/${rotulo(DESTINOS_ITEM, i.destino)}`).join('; ')
        : NAO_REGISTRADO),
      linha(pend, '4', 'Atividades realizadas', (d.realizadas ?? []).filter((r) => r.realizado).length
        ? (d.realizadas ?? []).filter((r) => r.realizado).map((r) => txt(r.titulo)).join('; ')
        : NAO_REGISTRADO),
      linha(pend, '4', 'Concorrentes observados', (d.concorrentes ?? []).length
        ? (d.concorrentes ?? []).map((c) => txt(c.marca)).join(', ')
        : NAO_REGISTRADO),
    ],
  };

  // ── 5. Resultados ─────────────────────────────────────────────────────────
  const s5: SecaoRelatorio = {
    titulo: '5. Resultados gerados',
    linhas: [
      linha(pend, '5', 'Leads captados', roi.leads > 0 ? inteiro(roi.leads) : NAO_REGISTRADO),
      { rotulo: 'Leads qualificados', valor: inteiro(roi.leadsQualificados) },
      linha(pend, '5', 'Propostas vinculadas', roi.propostasN > 0 ? inteiro(roi.propostasN) : NAO_REGISTRADO),
      { rotulo: 'Propostas em aberto', valor: `${inteiro(roi.pipelineAbertoN)} — ${brl(roi.pipelineAbertoValor)}` },
      { rotulo: 'Vendas fechadas', valor: inteiro(roi.vendasN) },
      { rotulo: 'Receita atribuída', valor: brl(roi.receitaAtribuida) },
    ],
  };

  // ── 6. Investimento e retorno ─────────────────────────────────────────────
  const ranking = rankingCategorias(tot.porCategoria);
  const s6: SecaoRelatorio = {
    titulo: '6. Investimento e retorno',
    linhas: [
      linha(pend, '6', 'Investimento confirmado', tot.confirmado > 0 ? brl(tot.confirmado) : NAO_REGISTRADO),
      { rotulo: 'Custos previstos (ainda não confirmados)', valor: brl(tot.previsto) },
      { rotulo: 'Apoio recebido', valor: brl(roi.apoioRecebido) },
      { rotulo: 'Investimento líquido da revenda', valor: brl(roi.custoLiquido) },
      { rotulo: 'Orçamento previsto', valor: dinheiro(acao.orcamento_previsto) },
      // ROI indefinido mostra travessão — nunca "Infinity".
      { rotulo: 'Retorno sobre o investimento líquido', valor: roi.roi === null ? '—' : `${roi.roi.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}x` },
      { rotulo: 'Custo por lead', valor: roi.custoPorLead === null ? '—' : brl(roi.custoPorLead) },
      { rotulo: 'Custo por venda', valor: roi.cac === null ? '—' : brl(roi.cac) },
    ],
    tabela: {
      cabecalho: ['Categoria', 'Valor', '%'],
      linhas: ranking.length
        ? ranking.map((c) => [c.label, brl(c.valor), `${c.percent.toFixed(1)}%`])
        : [[NAO_REGISTRADO, '-', '-']],
    },
  };

  // ── 7. Aprendizados ───────────────────────────────────────────────────────
  const av = (d.avaliacoes ?? [])[0];
  const s7: SecaoRelatorio = {
    titulo: '7. Aprendizados e próximos passos',
    linhas: [
      linha(pend, '7', 'O que funcionou', txt(av?.funcionou)),
      linha(pend, '7', 'O que fazer diferente', txt(av?.nao_funcionou)),
      linha(pend, '7', 'Aprendizados', txt(av?.aprendizados)),
      linha(pend, '7', 'Repetiria a participação?', txt(av?.repetir)),
    ],
  };

  // ── Evidências da contrapartida ───────────────────────────────────────────
  const marcadas = (d.midias ?? [])
    .filter((m) => m.contrapartida && m.url)
    .sort((a, b) => Number(a.ordem ?? 0) - Number(b.ordem ?? 0));

  const ehVideo = (m: MidiaRel) =>
    m.tipo === 'video' || /\.(mp4|mov|webm|m4v)(\?|$)/i.test(String(m.url ?? ''));

  const fotos = marcadas
    .filter((m) => !ehVideo(m) && (m.tipo === 'foto' || m.tipo === 'post' || m.tipo === 'clipping'))
    .map((m) => ({ url: String(m.url), legenda: txt(m.legenda) }));

  // Vídeo não cabe num PDF. Em vez de sumir em silêncio — que é justamente o
  // que este relatório não faz —, sai como link na seção de registro.
  const videos = marcadas
    .filter(ehVideo)
    .map((m) => ({ url: String(m.url), legenda: txt(m.legenda) }));

  if (fotos.length === 0 && videos.length === 0) {
    pend.push('8: Nenhuma foto ou vídeo marcado como evidência de contrapartida');
  }

  return {
    titulo: 'Relatório de contrapartida',
    subtitulo: `${txt(acao.nome)} — apoio ${txt(apoio.apoiador)}`,
    secoes: [s1, s2, s3, s4, s5, s6, s7],
    fotos,
    videos,
    pendencias: pend,
    roi,
  };
}
