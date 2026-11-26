/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================================================
// CONSÓRCIO NO EVENTO — a conta da parcela e os tipos (usado na página aberta e no portal).
//
// A fórmula foi tirada da tabela do grupo 6008 (dez/2026) e fecha até o centavo com ela:
//   total   = crédito × (1 + taxa de administração + fundo de reserva)       → 181.286 × 1,16 = 210.291,76
//   parcela = total ÷ prazo  +  total × seguro de vida (0,084%)             → 1.752,43 + 176,65 = 1.929,08
//   crédito com lance embutido de 20% = crédito − total × 20%                → 181.286 − 42.058,35 = 139.228
// =============================================================================

/** Um trator da tabela. `grupo` liga ao grupo dele (datas); `foto` é um endereço (/consorcio/5050.webp). */
export interface ModeloConsorcio { nome: string; codigo?: string; credito: number; grupo?: string; foto?: string }

/** Cada grupo da Ápice tem o seu vencimento e a sua assembleia (6005, 6008, 6009…). */
export interface GrupoConsorcio {
  grupo: string; vencimento?: string | null; proxima_assembleia?: string | null;
  /** Os meses seguintes, se a Ápice mandar o calendário (revisão v2, A1): a página usa sempre o próximo que não venceu. */
  calendario?: { vencimento?: string | null; assembleia?: string | null }[];
}

export interface ConfigConsorcio {
  administradora?: string;
  /** WhatsApp da loja, só dígitos com 55 (o mesmo do site: 551433516049). */
  whatsapp?: string;
  grupo?: string;                      // formato antigo (um grupo só); lerConfig converte para `grupos`
  grupos?: GrupoConsorcio[];
  prazo_meses: number;
  taxa_adm_pct: number;
  fundo_reserva_pct: number;
  seguro_pct: number;
  lance_embutido_pct: number;
  vencimento?: string | null;          // 'AAAA-MM-DD'
  proxima_assembleia?: string | null;  // 'AAAA-MM-DD'
  destaques?: string[];
  modelos?: ModeloConsorcio[];
  // Condições do evento (24/11/2026, Supersafra): aparecem num bloco próprio, logo depois da faixa vermelha.
  /** Ex.: grupo 6008, maio/2027, 41 cartas, contra 3 por mês nas assembleias normais. */
  super_assembleia?: { grupo?: string; quando: string; cartas: number; por_mes?: number; total_ate?: number } | null;
  /** Ex.: a 3ª parcela com 50% de desconto. */
  desconto_parcela?: { numero: number; pct: number } | null;
  /** Frases curtas: "Sem entrada", "1ª parcela no Pix aqui no estande"… */
  condicoes?: string[];
  /** Lance fixo das assembleias (30% no grupo 6008). Com o embutido, o cliente completa só a diferença do bolso. */
  lance_fixo_pct?: number;
  /** Número/posição do estande ("Estande 12, ao lado da entrada"). Aparece no topo durante a feira. */
  estande_local?: string;
  /** "lat,lng" do local (revisão v2, A2): o pino fica no centro do mapa. Sem isso, o mapa busca pelo endereço. */
  coordenadas?: string;
  /** Endereço do evento, uma linha por parte ("ROD PR 218 KM 17\nSítio São Luiz…"). Vira o link do mapa. */
  endereco?: string;
  /** Hora que a feira abre ("08:00"): o fim da contagem regressiva. Padrão 08:00. */
  abertura?: string;
  /** Horário para mostrar ("das 8h às 18h"). */
  horario?: string;
  /** WhatsApp de quem está no estande nos dias da feira (no lugar do da loja). */
  whatsapp_evento?: string;
  /** Vendedores do evento: o QR do cartão (?v=Nome) leva o cliente direto ao WhatsApp de quem atendeu. */
  vendedores?: { nome: string; whatsapp: string }[];
  /** Código da CARTA DO EVENTO (24/11/2026, José: "a de 146 mil é a principal; as maiores aparecem, mas sem foco"). */
  destaque?: string;
}

/**
 * Antes, durante ou depois da feira (José: "contagem regressiva para o dia do evento; no dia a página muda").
 * A contagem vai até a ABERTURA do primeiro dia (padrão 08:00). Depois do último dia (23:59) é "depois".
 */
export function faseDoEvento(inicio?: string | null, fim?: string | null, abertura?: string, agora = new Date()):
  { fase: 'antes' | 'durante' | 'depois'; abre?: Date; falta?: { dias: number; horas: number; minutos: number; segundos: number } } {
  if (!inicio) return { fase: 'antes', falta: { dias: 0, horas: 0, minutos: 0, segundos: 0 } };
  const [h, m] = /^\d{1,2}:\d{2}$/.test(String(abertura || '')) ? String(abertura).split(':').map(Number) : [8, 0];
  const [y, mo, d] = inicio.slice(0, 10).split('-').map(Number);
  const abre = new Date(y, mo - 1, d, h, m);
  const [yf, mf, df] = (fim || inicio).slice(0, 10).split('-').map(Number);
  const fecha = new Date(yf, mf - 1, df, 23, 59, 59);
  if (agora >= fecha) return { fase: 'depois' };
  if (agora >= abre) return { fase: 'durante' };
  const seg = Math.floor((abre.getTime() - agora.getTime()) / 1000);
  return { fase: 'antes', abre, falta: { dias: Math.floor(seg / 86400), horas: Math.floor((seg % 86400) / 3600), minutos: Math.floor((seg % 3600) / 60), segundos: seg % 60 } };
}

/** Link do Google Maps a partir do endereço (uma busca: abre o app de mapa no celular). */
export const linkDoMapa = (endereco?: string, coordenadas?: string) => {
  const co = coordenadasValidas(coordenadas);
  if (co) return `https://www.google.com/maps/search/?api=1&query=${co}`;
  return endereco && endereco.trim() ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco.replace(/\s*\n\s*/g, ', '))}` : null;
};

/** O mapa embutido: pelas coordenadas (pino no centro, zoom 15) ou, sem elas, pelo endereço. */
export function mapaEmbutido(c: ConfigConsorcio): string | null {
  const co = coordenadasValidas(c.coordenadas);
  if (co) return `https://maps.google.com/maps?q=${co}&z=15&output=embed`;
  return c.endereco?.trim() ? `https://maps.google.com/maps?q=${encodeURIComponent(c.endereco.replace(/\s*\n\s*/g, ', '))}&z=14&output=embed` : null;
}

/** "-23.42, -49.72" → "-23.42,-49.72"; texto que não é coordenada → null. */
export function coordenadasValidas(v?: string): string | null {
  const m = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(String(v || ''));
  if (!m || Math.abs(Number(m[1])) > 90 || Math.abs(Number(m[2])) > 180) return null;
  return `${m[1]},${m[2]}`;
}

/** WhatsApp para o botão "Falar com um vendedor":o do vendedor do link (?v=), senão o da loja. Só dígitos. */
export function whatsappDoAtendimento(c: ConfigConsorcio, vendedor?: string): { numero: string; nome: string | null } | null {
  const alvo = String(vendedor || '').trim().toLowerCase();
  const v = alvo ? (c.vendedores || []).find((x) => String(x.nome).trim().toLowerCase() === alvo && x.whatsapp) : undefined;
  const numero = String(v?.whatsapp || c.whatsapp || '').replace(/\D/g, '');
  if (!numero) return null;
  return { numero: numero.startsWith('55') ? numero : `55${numero}`, nome: v?.nome ?? null };
}

/** A carta em destaque:a do código configurado; sem configuração, a de menor crédito. */
export function modeloDestaque<T extends ModeloConsorcio>(lista: T[], c: ConfigConsorcio): T | null {
  if (!lista.length) return null;
  const alvo = String(c.destaque || '').trim().toUpperCase();
  return lista.find((m) => alvo && String(m.codigo || '').toUpperCase() === alvo)
    || [...lista].sort((a, b) => a.credito - b.credito)[0];
}

/** Valor da parcela com desconto (ex.: 3ª parcela com 50%). null se a config não tem desconto. */
export const parcelaComDesconto = (credito: number, c: ConfigConsorcio) =>
  c.desconto_parcela?.pct ? parcela(credito, c) * (1 - c.desconto_parcela.pct / 100) : null;

export const CONFIG_PADRAO: ConfigConsorcio = {
  prazo_meses: 120, taxa_adm_pct: 15, fundo_reserva_pct: 1, seguro_pct: 0.084, lance_embutido_pct: 20,
  destaques: [], modelos: [],
};

/** Junta o que veio do banco com o padrão (campo faltando não quebra a conta). */
export function lerConfig(c: any): ConfigConsorcio {
  const n = (v: any, p: number) => (Number.isFinite(Number(v)) && v !== '' && v !== null ? Number(v) : p);
  return {
    ...CONFIG_PADRAO,
    ...(c || {}),
    prazo_meses: n(c?.prazo_meses, CONFIG_PADRAO.prazo_meses) || CONFIG_PADRAO.prazo_meses,
    taxa_adm_pct: n(c?.taxa_adm_pct, CONFIG_PADRAO.taxa_adm_pct),
    fundo_reserva_pct: n(c?.fundo_reserva_pct, CONFIG_PADRAO.fundo_reserva_pct),
    seguro_pct: n(c?.seguro_pct, CONFIG_PADRAO.seguro_pct),
    lance_embutido_pct: n(c?.lance_embutido_pct, CONFIG_PADRAO.lance_embutido_pct),
    destaques: Array.isArray(c?.destaques) ? c.destaques.filter(Boolean) : [],
    condicoes: Array.isArray(c?.condicoes) ? c.condicoes.filter(Boolean) : [],
    super_assembleia: c?.super_assembleia && Number(c.super_assembleia.cartas) > 0
      ? { ...c.super_assembleia, cartas: Number(c.super_assembleia.cartas), por_mes: Number(c.super_assembleia.por_mes) || undefined, total_ate: Number(c.super_assembleia.total_ate) || undefined }
      : null,
    desconto_parcela: c?.desconto_parcela && Number(c.desconto_parcela.pct) > 0
      ? { numero: Number(c.desconto_parcela.numero) || 3, pct: Number(c.desconto_parcela.pct) }
      : null,
    modelos: Array.isArray(c?.modelos)
      ? c.modelos.filter((m: any) => m?.nome && Number(m?.credito) > 0)
          .map((m: any) => ({ ...m, credito: Number(m.credito), grupo: m.grupo || c?.grupo || undefined }))
      : [],
    // formato antigo: um grupo só no topo da config
    grupos: Array.isArray(c?.grupos) && c.grupos.length
      ? c.grupos.filter((g: any) => g?.grupo)
      : c?.grupo ? [{ grupo: String(c.grupo), vencimento: c.vencimento ?? null, proxima_assembleia: c.proxima_assembleia ?? null }] : [],
  };
}

/** Os modelos sem repetir: o mesmo trator (mesmo código) em 2 grupos vira um cartão com os 2 grupos. */
export function modelosUnicos(c: ConfigConsorcio): (ModeloConsorcio & { grupos: string[] })[] {
  const mapa = new Map<string, ModeloConsorcio & { grupos: string[] }>();
  for (const m of c.modelos || []) {
    const chave = (m.codigo || m.nome).trim().toUpperCase() + '|' + m.credito;
    const ja = mapa.get(chave);
    if (ja) { if (m.grupo && !ja.grupos.includes(m.grupo)) ja.grupos.push(m.grupo); if (!ja.foto && m.foto) ja.foto = m.foto; }
    else mapa.set(chave, { ...m, grupos: m.grupo ? [m.grupo] : [] });
  }
  return [...mapa.values()].sort((a, b) => a.credito - b.credito);
}

/** "75CV" dentro do nome → 75 (para a faixa "de 25 a 110 cv"). */
export const cvDoNome = (nome: string) => Number(/(\d{2,3})\s*cv/i.exec(nome)?.[1]) || null;

/** Crédito + taxas: é sobre este valor que a parcela e o lance são calculados. */
export const totalComTaxas = (credito: number, c: ConfigConsorcio) =>
  credito * (1 + (c.taxa_adm_pct + c.fundo_reserva_pct) / 100);

export const parcela = (credito: number, c: ConfigConsorcio) => {
  const t = totalComTaxas(credito, c);
  return t / c.prazo_meses + t * (c.seguro_pct / 100);
};

/**
 * O que o cliente paga no prazo todo, COM o seguro (parcela × prazo). Plano Supersafra, bloco 0:
 * o "total com taxas" (crédito + 16%) ficava ~R$ 17 mil abaixo do que sai do bolso no 25cv.
 */
export const totalPago = (credito: number, c: ConfigConsorcio) =>
  (Math.round(parcela(credito, c) * 100) / 100) * c.prazo_meses;   // o boleto vem em centavos redondos

/** 'AAAA-MM-DD' já passou? (compara só a data, no fuso do aparelho) */
export function jaPassou(iso?: string | null, hoje = new Date()): boolean {
  if (!iso) return false;
  const h = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
  return iso.slice(0, 10) < h;
}

/** Dias inteiros de hoje até a data (0 = hoje). */
export function diasAte(iso: string, hoje = new Date()): number {
  const a = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - a) / 86_400_000);
}

/**
 * As datas do grupo que ainda valem (revisão v2, A1). Vencimento e assembleia andam juntos: quando o
 * vencimento passa, a assembleia daquele mês some também (não dá mais para entrar nela) e vale o próximo
 * mês do `calendario`. Sem próximo mês cadastrado, volta sem datas ("a confirmar"), nunca uma data vencida.
 */
export function datasVivas(g: GrupoConsorcio, hoje = new Date()): GrupoConsorcio {
  const meses = [{ vencimento: g.vencimento, assembleia: g.proxima_assembleia }, ...(g.calendario || [])]
    .filter((x) => x.vencimento || x.assembleia)
    .filter((x) => !jaPassou(x.vencimento || x.assembleia, hoje))
    .sort((a, b) => String(a.vencimento || a.assembleia).localeCompare(String(b.vencimento || b.assembleia)));
  const p = meses[0];
  return { grupo: g.grupo, vencimento: p?.vencimento ?? null, proxima_assembleia: p?.assembleia ?? null };
}

/**
 * O grupo da chamada "feche até X e já concorre na assembleia de Y": o da Super Assembleia, se o
 * vencimento dele ainda não passou; senão o grupo com o vencimento futuro mais próximo. null se nenhum.
 */
export function grupoDaUrgencia(c: ConfigConsorcio, hoje = new Date()): GrupoConsorcio | null {
  const vivos = (c.grupos || []).map((g) => datasVivas(g, hoje)).filter((g) => g.vencimento && g.proxima_assembleia);
  const doSuper = vivos.find((g) => g.grupo === c.super_assembleia?.grupo);
  return doSuper || vivos.sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento)))[0] || null;
}

/** "03/12" e "04/12" → "03 e 04/12"; mesmo mês → "03 a 06/12"; meses diferentes → "28/11 a 02/12". */
export function periodoCurto(ini?: string | null, fim?: string | null): string {
  if (!ini) return '';
  const [, mi, di] = ini.slice(0, 10).split('-');
  if (!fim || fim.slice(0, 10) === ini.slice(0, 10)) return `${di}/${mi}`;
  const [, mf, df] = fim.slice(0, 10).split('-');
  if (mi !== mf) return `${di}/${mi} a ${df}/${mf}`;
  return Number(df) - Number(di) === 1 ? `${di} e ${df}/${mf}` : `${di} a ${df}/${mf}`;
}

/**
 * Pitch da feira (plano 1.0): "com 10% do bolso você entra no lance fixo de 30%". O embutido cobre 20% e o
 * cliente completa a diferença, sobre a mesma base (crédito + taxas) — a proposta oficial de R$ 139.700 faz igual
 * (embutido R$ 32.410,40 + capital próprio R$ 16.205,20). null se não há lance fixo maior que o embutido.
 */
export function lanceDoBolso(credito: number, c: ConfigConsorcio): { fixoPct: number; bolsoPct: number; valor: number } | null {
  const fixo = Number(c.lance_fixo_pct) || 0;
  const bolsoPct = fixo - c.lance_embutido_pct;
  if (bolsoPct <= 0) return null;
  return { fixoPct: fixo, bolsoPct, valor: totalComTaxas(credito, c) * (bolsoPct / 100) };
}

/** Parcela ÷ 30: o "investimento por dia" da tabela. */
export const porDia = (credito: number, c: ConfigConsorcio) => parcela(credito, c) / 30;

/** Quanto sobra para comprar o trator se usar o lance embutido máximo. */
export const creditoComEmbutido = (credito: number, c: ConfigConsorcio) =>
  credito - totalComTaxas(credito, c) * (c.lance_embutido_pct / 100);

export const reais = (v: number, casas = 2) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: casas, maximumFractionDigits: casas });

/** 7 → "007": o número da sorte sempre com 3 dígitos, fácil de falar no microfone. */
export const numeroSorte = (n: number) => String(n).padStart(3, '0');
