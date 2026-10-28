// Regras PURAS do Radar de tratores (Feedbacks → Tratores, 27/10/2026).
// Cada trator vendido deve ser ligado nos 30, 60 e 90 dias da venda. Vale o ÚLTIMO marco que já
// passou: falou no de 60 → o de 30 que ficou para trás não cobra mais. Tabela radar_tratores_contatos.
// O trator SÓ SAI do radar quando tem orçamento/OS da revisão de 50 h (José, 27/10); quando a 50 h é
// feita, o ritmo de uso (dias até a 50 h) prevê a de 300 h.

// 28/10 (José): passou de 90 dias sem orçamento da 50 h = VERMELHO. Para sair do vermelho sem a OS,
// registra o MOTIVO de não fazer; "ainda não deu as horas" pede o horímetro e o ritmo (horas ÷ dias
// desde a entrega técnica) prevê quando chega a 50 h — perto da data o trator volta para a fila.

export type Resultado = 'tudo_certo' | 'problema' | 'agendou_50h' | 'quer_peca' | 'nao_atendeu' | 'dispensado' | 'sem_revisao';
export type Marco = 30 | 60 | 90;

/** Por que o trator ainda não fez (nem orçou) a revisão de 50 h. */
export type MotivoSem50 = 'sem_horas' | 'outro_lugar' | 'nao_quer' | 'parado' | 'outro';
export const MOTIVOS_SEM_50: { id: MotivoSem50; rotulo: string; ico: string }[] = [
  { id: 'sem_horas', rotulo: 'Ainda não deu as horas', ico: 'fa-gauge' },
  { id: 'outro_lugar', rotulo: 'Fez em outro lugar', ico: 'fa-store' },
  { id: 'nao_quer', rotulo: 'Não quer fazer', ico: 'fa-ban' },
  { id: 'parado', rotulo: 'Trator parado / vendido', ico: 'fa-pause' },
  { id: 'outro', rotulo: 'Outro motivo', ico: 'fa-pen' },
];
export const ROTULO_MOTIVO: Record<MotivoSem50, string> = Object.fromEntries(MOTIVOS_SEM_50.map((m) => [m.id, m.rotulo])) as Record<MotivoSem50, string>;

/** Atendimento EM ANDAMENTO (radar_tratores_atendimentos): aberto no "Iniciar atendimento" da ficha,
 *  fechado quando o contato é registrado ou cancelado. */
export interface AtendimentoRadar {
  id: string;
  chave: string;
  marco: Marco | null;
  user_id: string | null;
  user_nome: string | null;
  iniciado_em: string;
}

export interface Contato {
  id: string;
  chave: string;
  marco: Marco;
  resultado: Resultado;
  nota: string | null;
  user_nome: string | null;
  criado_em: string;
  /** só em 'sem_revisao' */
  motivo?: MotivoSem50 | null;
  /** horímetro informado pelo cliente (motivo 'sem_horas') */
  horimetro?: number | null;
  /** quando falar de novo (YYYY-MM-DD): até lá o trator fica de molho; no dia, volta para "Para ligar" */
  retornar_em?: string | null;
}

/** Sugestão de quando falar de novo, pela resposta (José, 28/10/2026: "se não conseguiu agendar a
 *  revisão, reagendar o contato"). Tudo certo = 15 dias ou o próximo marco, o que vier antes. */
export function retornoSugerido(resultado: Resultado, motivo: MotivoSem50 | null, hojeISO: string, proximoMarcoISO: string | null = null): string | null {
  const em = (d: number) => new Date(Date.parse(hojeISO.slice(0, 10)) + d * DIA).toISOString().slice(0, 10);
  if (resultado === 'problema') return em(3);
  if (resultado === 'agendou_50h' || resultado === 'quer_peca') return em(7);
  if (resultado === 'tudo_certo') { const q = em(15); return proximoMarcoISO && proximoMarcoISO > hojeISO && proximoMarcoISO < q ? proximoMarcoISO : q; }
  if (resultado === 'sem_revisao') return motivo === 'sem_horas' ? null : em(30);
  return null;
}

/** Dias antes da data prevista da 50 h em que o trator volta para a fila de ligação. */
export const DIAS_ANTES_50 = 7;

/** Ritmo pelo horímetro: X horas em N dias desde a entrega → quando chega a 50 h e a 300 h. */
export function previsaoPorHorimetro(entregaISO: string, leituraISO: string, horimetro: number): { horasDia: number; data50: string; data300: string; dias: number } | null {
  const dias = Math.max(1, diasEntre(entregaISO, leituraISO));
  if (!Number.isFinite(horimetro) || horimetro < 0 || !Number.isFinite(dias)) return null;
  const hd = Math.max(0.05, horimetro / dias);
  const em = (h: number) => (horimetro >= h ? leituraISO.slice(0, 10) : new Date(Date.parse(leituraISO.slice(0, 10)) + Math.ceil((h - horimetro) / hd) * DIA).toISOString().slice(0, 10));
  return { horasDia: Math.round(hd * 100) / 100, data50: em(50), data300: em(300), dias };
}

export const RESULTADOS: { id: Exclude<Resultado, 'nao_atendeu' | 'dispensado'>; rotulo: string; ico: string; cor: string }[] = [
  { id: 'tudo_certo', rotulo: 'Tudo certo', ico: 'fa-face-smile', cor: '#16a34a' },
  { id: 'problema', rotulo: 'Tem problema', ico: 'fa-triangle-exclamation', cor: '#dc2626' },
  { id: 'agendou_50h', rotulo: 'Agendou a 50 h', ico: 'fa-calendar-check', cor: '#2563eb' },
  { id: 'quer_peca', rotulo: 'Quer peça ou implemento', ico: 'fa-cart-shopping', cor: '#d97706' },
];
export const ROTULO_RESULTADO: Record<Resultado, string> = {
  tudo_certo: 'Tudo certo', problema: 'Tem problema', agendou_50h: 'Agendou a 50 h', quer_peca: 'Quer peça ou implemento',
  nao_atendeu: 'Não atendeu', dispensado: 'Dispensado', sem_revisao: 'Sem a 50 h',
};

/** Situação do trator na fila de ligações. `aguarda` = ainda não deu as horas (com previsão);
 *  `justificado` = registrou outro motivo de não fazer a 50 h. */
export type Estado = 'antes' | 'ligar' | 'tentar' | 'retorno' | 'orcar' | 'espera' | 'aguarda' | 'justificado' | 'orcado' | 'feita';
export const ROTULO_ESTADO: Record<Estado, string> = {
  antes: 'Ainda não fez 30 dias', ligar: 'Para ligar', tentar: 'Não atendeu', retorno: 'Precisa retorno',
  orcar: 'Falta orçamento da 50 h', espera: 'Ligar de novo depois', aguarda: 'Ainda não deu as horas', justificado: 'Sem a 50 h, com motivo',
  orcado: 'Orçamento da 50 h aberto', feita: '50 h feita',
};
/** Estados que ainda pedem ação (ligar ou orçar) — passando de 90 dias ficam vermelhos. */
export const ESTADOS_PENDENTES: Estado[] = ['ligar', 'tentar', 'retorno', 'orcar'];
export const vermelho = (diasComCliente: number, s: Pick<Situacao, 'estado'>) => diasComCliente > 90 && ESTADOS_PENDENTES.includes(s.estado);

/** OS de revisão do POS (Ordem_Servico) já resumida pelo servidor. */
export interface OSRevisao { id: string; status: string; horas: number | null; chassiFinal: string; data: string | null; dataFim: string | null; faturada: boolean }
/** A revisão de 50 h do trator: orçamento/OS aberta ou já feita. */
export interface Revisao50 { os: string | null; status: string | null; feita: boolean; dataFeita: string | null; origem: 'os' | 'controle' }

const OS_FEITA = /conclu|enviar omie|fatur/i;
const OS_CANCELADA = /cancel/i;

/** Junta as OS de 50 h do chassi e o "50h Data" do controle de revisões (data já em ISO). */
export function escolherRevisao50(os: OSRevisao[], controle50ISO: string | null): Revisao50 | null {
  const validas = os.filter((o) => o.horas === 50 && !OS_CANCELADA.test(o.status));
  const feitaOS = (o: OSRevisao) => o.faturada || !!o.dataFim || OS_FEITA.test(o.status);
  const ordenadas = [...validas].sort((a, b) => Number(feitaOS(b)) - Number(feitaOS(a)) || ((a.data || '') < (b.data || '') ? 1 : -1));
  const o = ordenadas[0];
  if (controle50ISO) return { os: o?.id ?? null, status: o?.status ?? null, feita: true, dataFeita: controle50ISO, origem: 'controle' };
  if (!o) return null;
  const feita = feitaOS(o);
  return { os: o.id, status: o.status, feita, dataFeita: feita ? (o.dataFim || o.data) : null, origem: 'os' };
}

/** Ritmo de uso: se levou N dias da entrega até a 50 h, a de 300 h vem em 6 × N dias da entrega. */
export function previsao300(entregaISO: string, data50ISO: string, hojeISO: string): { diasAte50: number; horasDia: number; data300: string; diasFaltam: number } | null {
  const dias = diasEntre(entregaISO, data50ISO);
  if (!Number.isFinite(dias) || dias < 0) return null;
  const diasAte50 = Math.max(1, dias);
  const data300 = new Date(Date.parse(entregaISO.slice(0, 10)) + diasAte50 * 6 * DIA).toISOString().slice(0, 10);
  return { diasAte50, horasDia: Math.round((50 / diasAte50) * 10) / 10, data300, diasFaltam: diasEntre(hojeISO, data300) };
}

export interface MarcoVenda { dias: number; data: string; passou: boolean }

export interface Situacao {
  estado: Estado;
  /** Último marco que já passou (o que está valendo). */
  marco: Marco | null;
  /** Dias desde o marco que vale (atraso da ligação). */
  atraso: number;
  /** Tentativas sem atender no marco que vale. */
  tentativas: number;
  /** Último registro que não foi "não atendeu" (a conversa que fechou o marco). */
  conversa: Contato | null;
  /** Tudo o que foi registrado para o trator, do mais novo ao mais velho. */
  historico: Contato[];
  /** Último motivo de não fazer a 50 h (vale até a OS ou outra conversa). */
  semRevisao?: Contato | null;
  /** Data combinada para falar de novo (a da última conversa). */
  retorno?: string | null;
  /** Previsão pelo horímetro informado (motivo "ainda não deu as horas"). */
  previsao?: { horasDia: number; data50: string; data300: string; horimetro: number; leitura: string } | null;
}

const DIA = 86_400_000;
const diasEntre = (deISO: string, ateISO: string) => Math.round((Date.parse(ateISO.slice(0, 10)) - Date.parse(deISO.slice(0, 10))) / DIA);

export function situacaoContato(marcos: MarcoVenda[], contatos: Contato[], hojeISO: string, rev: Revisao50 | null = null, entregaISO: string | null = null): Situacao {
  const historico = [...contatos].sort((a, b) => (a.criado_em < b.criado_em ? 1 : -1));
  const passados = marcos.filter((m) => m.passou);
  const vale = passados[passados.length - 1];
  // Com orçamento/OS da 50 h o trator sai da fila de ligação.
  if (rev) {
    const conversa = historico.find((c) => c.resultado !== 'nao_atendeu') || null;
    return { estado: rev.feita ? 'feita' : 'orcado', marco: (vale?.dias as Marco) ?? null, atraso: 0, tentativas: 0, conversa, historico };
  }
  if (!vale) return { estado: 'antes', marco: null, atraso: 0, tentativas: 0, conversa: null, historico };
  const marco = vale.dias as Marco;
  const atraso = Math.max(0, diasEntre(vale.data, hojeISO));
  // O último registro de conversa é um motivo de não fazer a 50 h? Ele vale em qualquer marco.
  const ultimaConversa = historico.find((c) => c.resultado !== 'nao_atendeu') || null;
  if (ultimaConversa?.resultado === 'sem_revisao') {
    const sr = ultimaConversa;
    if (sr.motivo === 'sem_horas' && sr.horimetro != null && entregaISO) {
      const p = previsaoPorHorimetro(entregaISO, sr.criado_em, sr.horimetro);
      const previsao = p ? { horasDia: p.horasDia, data50: p.data50, data300: p.data300, horimetro: sr.horimetro, leitura: sr.criado_em.slice(0, 10) } : null;
      // perto da data prevista o trator volta para a fila (ligar para orçar a 50 h)
      const chegou = !previsao || diasEntre(hojeISO, previsao.data50) <= DIAS_ANTES_50;
      return { estado: chegou ? 'orcar' : 'aguarda', marco, atraso: chegou && previsao ? Math.max(0, diasEntre(previsao.data50, hojeISO)) : 0, tentativas: 0, conversa: sr, historico, semRevisao: sr, previsao };
    }
    if (sr.retornar_em && hojeISO >= sr.retornar_em) {
      const tent = historico.filter((c) => c.resultado === 'nao_atendeu' && c.criado_em > sr.criado_em).length;
      return { estado: tent ? 'tentar' : 'ligar', marco, atraso: Math.max(0, diasEntre(sr.retornar_em, hojeISO)), tentativas: tent, conversa: sr, historico, semRevisao: sr, retorno: sr.retornar_em };
    }
    return { estado: 'justificado', marco, atraso: 0, tentativas: 0, conversa: sr, historico, semRevisao: sr, retorno: sr.retornar_em ?? null };
  }
  // Conta o que foi registrado neste marco ou num depois dele.
  const doMarco = historico.filter((c) => c.marco >= marco);
  const conversa = doMarco.find((c) => c.resultado !== 'nao_atendeu') || null;
  const tentativas = doMarco.filter((c) => c.resultado === 'nao_atendeu' && (!conversa || c.criado_em > conversa.criado_em)).length;
  if (conversa) {
    // Com data para falar de novo: de molho até lá; no dia, volta para a fila (problema volta como retorno).
    if (conversa.retornar_em) {
      if (hojeISO < conversa.retornar_em) return { estado: 'espera', marco, atraso: 0, tentativas: 0, conversa, historico, retorno: conversa.retornar_em };
      const tent = historico.filter((c) => c.resultado === 'nao_atendeu' && c.criado_em > conversa.criado_em).length;
      const estado: Estado = conversa.resultado === 'problema' ? 'retorno' : tent ? 'tentar' : 'ligar';
      return { estado, marco, atraso: Math.max(0, diasEntre(conversa.retornar_em, hojeISO)), tentativas: tent, conversa, historico, retorno: conversa.retornar_em };
    }
    // Problema só sai do "retorno" quando alguém registra outra conversa depois; sem orçamento, não sai do radar.
    return { estado: conversa.resultado === 'problema' ? 'retorno' : 'orcar', marco, atraso, tentativas: 0, conversa, historico };
  }
  return { estado: tentativas ? 'tentar' : 'ligar', marco, atraso, tentativas, conversa: null, historico };
}

/** Fila: primeiro quem fez o marco agora (atraso < 7), depois os mais atrasados; os que não atenderam
 *  vão para o fim, a tentativa mais antiga primeiro. */
export function ordemDaFila(a: { s: Situacao }, b: { s: Situacao }): number {
  const peso = (s: Situacao) => (s.estado === 'tentar' ? 1 : 0);
  if (peso(a.s) !== peso(b.s)) return peso(a.s) - peso(b.s);
  if (a.s.estado === 'tentar') return (a.s.historico[0]?.criado_em || '') < (b.s.historico[0]?.criado_em || '') ? -1 : 1;
  const nova = (s: Situacao) => (s.atraso < 7 ? 0 : 1);
  if (nova(a.s) !== nova(b.s)) return nova(a.s) - nova(b.s);
  return b.s.atraso - a.s.atraso;
}

/** Valida o que vem da tela antes de gravar. */
export function validarContato(b: { chave?: unknown; marco?: unknown; resultado?: unknown; nota?: unknown; motivo?: unknown; horimetro?: unknown; retornar_em?: unknown }):
  { ok: true; chave: string; marco: Marco; resultado: Resultado; nota: string | null; motivo: MotivoSem50 | null; horimetro: number | null; retornar_em: string | null } | { ok: false; erro: string } {
  const chave = String(b.chave || '').trim();
  const marco = Number(b.marco);
  const resultado = String(b.resultado || '') as Resultado;
  const nota = String(b.nota || '').trim().slice(0, 1000) || null;
  if (!chave) return { ok: false, erro: 'Falta o trator.' };
  if (![30, 60, 90].includes(marco)) return { ok: false, erro: 'Marco inválido (30, 60 ou 90 dias).' };
  if (!(resultado in ROTULO_RESULTADO)) return { ok: false, erro: 'Resultado inválido.' };
  if ((resultado === 'problema' || resultado === 'dispensado') && (!nota || nota.length < 5)) {
    return { ok: false, erro: resultado === 'problema' ? 'Conte qual é o problema (mínimo 5 letras).' : 'Diga por que dispensar (mínimo 5 letras).' };
  }
  let motivo: MotivoSem50 | null = null;
  let horimetro: number | null = null;
  if (resultado === 'sem_revisao') {
    motivo = String(b.motivo || '') as MotivoSem50;
    if (!(motivo in ROTULO_MOTIVO)) return { ok: false, erro: 'Escolha o motivo de não fazer a revisão de 50 h.' };
    if (motivo === 'sem_horas') {
      horimetro = Number(String(b.horimetro ?? '').replace(',', '.'));
      if (String(b.horimetro ?? '').trim() === '' || !Number.isFinite(horimetro) || horimetro < 0 || horimetro > 5000) return { ok: false, erro: 'Informe o horímetro que o cliente falou.' };
      horimetro = Math.round(horimetro * 10) / 10;
    }
    if (motivo === 'outro' && (!nota || nota.length < 5)) return { ok: false, erro: 'Conte o motivo (mínimo 5 letras).' };
  }
  const ret = b.retornar_em == null || b.retornar_em === '' ? null : String(b.retornar_em);
  if (ret != null && !/^\d{4}-\d{2}-\d{2}$/.test(ret)) return { ok: false, erro: 'Data para falar de novo inválida.' };
  return { ok: true, chave, marco: marco as Marco, resultado, nota, motivo, horimetro, retornar_em: resultado === 'nao_atendeu' || resultado === 'dispensado' ? null : ret };
}
