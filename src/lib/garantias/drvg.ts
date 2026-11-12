// DRVG = "Demonstrativo de Reembolso de Valores de Garantia" (planilha que a
// Mahindra manda): por SG, horas, km e peças PAGAS + observação ("Negativo …" =
// recusada). Regras puras: lê as linhas da planilha (xlsx → matriz de células)
// e monta a OS de reembolso no padrão do faturista. Sem banco, sem Omie.

import { normSG, textoSGs } from './notas';
import { lerHoras } from './pago-fabrica';

export interface SgDrvg {
  sg: string;
  modelo: string;
  cliente: string;
  chassi: string;
  /** horas pagas, decimais (04:00 → 4; 01:30 → 1,5) */
  horas: number;
  horasTexto: string;
  km: number;
  /** peças pagas em DINHEIRO (R$); peça reposta vem 0 */
  pecas: number;
  obs: string;
  /** "Negativo …" ou nada pago = a fábrica recusou */
  negativa: boolean;
}

export interface Drvg {
  numero: string;
  pedidoCompra: string;
  taxaHora: number | null;
  taxaKm: number | null;
  /** totais do cabeçalho (o que a fábrica mandou faturar) */
  totais: { maoObra: number; pecas: number; km: number; frete: number; total: number };
  sgs: SgDrvg[];
  avisos: string[];
}

type Celula = string | number | null | undefined;

const txt = (c: Celula) => String(c ?? '').replace(/\s+/g, ' ').trim();
const r2 = (n: number) => Math.round(n * 100) / 100;

/** "1,122.90" (planilha em inglês) · "1.122,90" · "R$ 121,00 / hora" · "0.00 " → número */
export function lerValor(c: Celula): number {
  if (typeof c === 'number') return c;
  let s = txt(c).replace(/R\$|\/.*$/gi, '').replace(/[^\d.,-]/g, '');
  if (!s) return 0;
  const ultVirg = s.lastIndexOf(','), ultPonto = s.lastIndexOf('.');
  if (ultVirg > ultPonto) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

const SG_RE = /^\d{4}\s*-\s*\d{1,4}$/;
const rotulo = (c: Celula) => txt(c).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const ROTULOS = ['TEMPO', 'DESLOCAMENTO', 'PECAS', 'OBSERVACAO', 'OBSERVACOES', 'FRETE', 'RESPONSAVEL', 'GARANTIA TRATOR'];
const ehRotulo = (c: Celula) => { const r = rotulo(c); return ROTULOS.some((x) => r.startsWith(x)); };
const sgDaLinha = (row: Celula[]) => row.map(txt).find((t) => SG_RE.test(t)) || '';
const vazia = (row: Celula[]) => row.every((c) => !txt(c));

function clienteEChassi(t: string): { cliente: string; chassi: string } {
  const m = t.match(/^(.*?)\s*-\s*([A-Z0-9]{8,})\s*$/i);
  return m ? { cliente: m[1].trim(), chassi: m[2].toUpperCase() } : { cliente: t, chassi: '' };
}

export function lerDrvg(linhas: Celula[][]): Drvg {
  const rows = linhas.map((r) => (Array.isArray(r) ? r : []));
  const d: Drvg = { numero: '', pedidoCompra: '', taxaHora: null, taxaKm: null, totais: { maoObra: 0, pecas: 0, km: 0, frete: 0, total: 0 }, sgs: [], avisos: [] };

  // cabeçalho
  rows.forEach((row, i) => {
    row.forEach((c, j) => {
      const r = rotulo(c);
      if (r === 'NUMERO' && !d.numero) {
        // o número fica logo abaixo (às vezes com linhas em branco no meio)
        for (let k = i + 1; k <= i + 4 && !d.numero; k++) d.numero = txt(rows[k]?.[j]).replace(/\D/g, '');
      }
      if (r === 'P.C.' && !d.pedidoCompra) d.pedidoCompra = txt(row[j + 1]);
      if (r === 'MAO DE OBRA' && j > 0 && /hora/i.test(txt(row[j + 1]))) d.taxaHora = lerValor(row[j + 1]) || null;
      if (r === 'KM' && j > 0 && /km/i.test(txt(row[j + 1]))) d.taxaKm = lerValor(row[j + 1]) || null;
    });
    const r0 = rotulo(row[0]);
    if (r0 === 'MAO DE OBRA') d.totais.maoObra = lerValor(row[1]);
    else if (r0 === 'PECA') d.totais.pecas = lerValor(row[1]);
    else if (r0 === 'KM RODADO') d.totais.km = lerValor(row[1]);
    else if (r0 === 'TOTAL') d.totais.total = lerValor(row[1]);
    else if (r0 === 'FRETE' && !d.totais.frete) d.totais.frete = lerValor(row[1]);
  });

  // blocos por SG
  let atual: SgDrvg | null = null;
  let lendoObs = false;
  for (const row of rows) {
    const sg = sgDaLinha(row);
    if (sg) {
      const { cliente, chassi } = clienteEChassi(txt(row[1]));
      atual = { sg: normSG(sg), modelo: txt(row[0]), cliente, chassi, horas: 0, horasTexto: '0', km: 0, pecas: 0, obs: '', negativa: false };
      d.sgs.push(atual);
      lendoObs = false;
      continue;
    }
    // linha em branco fecha o bloco; os blocos vazios do modelo da planilha (sem SG) ficam de fora
    if (vazia(row)) { lendoObs = false; if (atual && atual.obs !== '') atual = null; continue; }
    const r0 = rotulo(row[0]);
    if (r0 === 'OBSERVACOES' || r0 === 'RESPONSAVEL') { atual = null; lendoObs = false; continue; }
    if (!atual) continue;
    if (r0.startsWith('TEMPO')) {
      atual.horasTexto = txt(row[1]) || '0';
      atual.horas = lerHoras(atual.horasTexto) ?? 0;
      lendoObs = false;
    } else if (r0.startsWith('DESLOCAMENTO')) {
      atual.km = lerValor(row[1]);
    } else if (r0.startsWith('PECAS')) {
      atual.pecas = lerValor(row[1]);
    } else if (r0 === 'OBSERVACAO') {
      atual.obs = txt(row[1]) || ' ';
      lendoObs = true;
    } else if (lendoObs && !ehRotulo(row[0])) {
      // observação que continua na linha de baixo
      atual.obs = `${atual.obs.trim()} ${row.map(txt).filter(Boolean).join(' ')}`.trim();
    } else if (!atual.modelo && txt(row[1]) && atual.horasTexto === '0') {
      // SG numa linha e "modelo | cliente - chassi" na de baixo (DRVG 7717, SG 2026-068)
      atual.modelo = txt(row[0]);
      Object.assign(atual, clienteEChassi(txt(row[1])));
    }
  }
  for (const s of d.sgs) s.obs = s.obs.trim();

  for (const s of d.sgs) {
    s.negativa = /^negativ/i.test(s.obs) || (s.horas === 0 && s.km === 0 && s.pecas === 0 && !/repost/i.test(s.obs));
  }

  // conferência do cabeçalho × soma das SGs
  if (d.taxaHora && d.taxaKm) {
    const mo = r2(d.sgs.reduce((t, s) => t + s.horas * (d.taxaHora || 0), 0));
    const km = r2(d.sgs.reduce((t, s) => t + s.km * (d.taxaKm || 0), 0));
    const pc = r2(d.sgs.reduce((t, s) => t + s.pecas, 0));
    if (Math.abs(mo - d.totais.maoObra) > 0.05) d.avisos.push(`Mão de obra: as SGs somam ${br(mo)} e o cabeçalho diz ${br(d.totais.maoObra)}.`);
    if (Math.abs(km - d.totais.km) > 0.05) d.avisos.push(`Km: as SGs somam ${br(km)} e o cabeçalho diz ${br(d.totais.km)}.`);
    if (Math.abs(pc - d.totais.pecas) > 0.05) d.avisos.push(`Peças: as SGs somam ${br(pc)} e o cabeçalho diz ${br(d.totais.pecas)}.`);
  } else {
    d.avisos.push('Não achei a taxa de hora/km na planilha; vale a taxa cadastrada na montadora.');
  }
  if (!d.sgs.length) d.avisos.push('Não achei nenhuma SG na planilha.');
  return d;
}

const br = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// ── OS de reembolso ─────────────────────────────────────────────────────────

export interface ItemReembolso {
  sg: string; horas: number; km: number; pecas: number;
  /** false = recusada (fica fora); aprovada sem dinheiro (só peça reposta) entra no texto — NFS-e 69 cita a SG 2026-061 */
  negativa?: boolean;
}

export interface OsReembolso {
  /** linha "Solicitação de Serviço" da OS (vira o texto da NFS-e) */
  texto: string;
  horas: number;
  km: number;
  pecas: number;
  valorHoras: number;
  valorKm: number;
  total: number;
  sgs: string[];
}

/** Junta as SGs pagas numa OS só, no texto que o faturista usa:
 *  "PEDIDO DE COMPRA 3400885894| VALOR: R$4.499,13| REFERENTE A DRVG 7642 DA SOLICITAÇÃO DE GARANTIA SG 2026-046, 48 e 71" */
export function montarOsReembolso(itens: ItemReembolso[], ref: { drvg?: string; pedidoCompra?: string; taxaHora: number; taxaKm: number }): OsReembolso {
  const pagos = itens.filter((i) => i.negativa === false || i.horas > 0 || i.km > 0 || i.pecas > 0);
  const horas = Math.round(pagos.reduce((t, i) => t + i.horas, 0) * 10000) / 10000;
  const km = Math.round(pagos.reduce((t, i) => t + i.km, 0) * 100) / 100;
  const pecas = r2(pagos.reduce((t, i) => t + i.pecas, 0));
  const valorHoras = r2(horas * ref.taxaHora);
  const valorKm = r2(km * ref.taxaKm);
  const total = r2(valorHoras + valorKm + pecas);
  const sgs = pagos.map((i) => i.sg);
  const valor = total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const texto = [
    ref.pedidoCompra ? `PEDIDO DE COMPRA ${ref.pedidoCompra}` : '',
    `VALOR: R$${valor}`,
    `REFERENTE A ${ref.drvg ? `DRVG ${ref.drvg} DA ` : ''}SOLICITAÇÃO DE GARANTIA ${textoSGs(sgs)}`,
  ].filter(Boolean).join('| ');
  return { texto, horas, km, pecas, valorHoras, valorKm, total, sgs };
}
