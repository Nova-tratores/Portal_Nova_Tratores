// Montagem PURA do texto único que a Extranet da KUHN pede na caixa
// "PROVÁVEL CAUSA E DESCRIÇÃO DO PROBLEMA" pro ressarcimento de mão de obra
// (formato numerado 1–6 do manual Pós-Vendas KUHN, seção 4.2).
// A Ordem_Servico_Tecnicos guarda até 3 DIAS de atendimento no MESMO registro
// (campos DataInicio/2/3, InicioHora/2/3, FinalHora2/FinaHora3 — typo do
// schema — e InicioKm/2/3): cada dia vira uma linha própria de horas e de km.
// Campos sem dado saem como ____ pro garantista completar antes de colar.

export interface DiaAtendimento {
  data: string;      // YYYY-MM-DD (ou o que vier)
  inicio: string;    // HH:MM
  fim: string;       // HH:MM
  kmIni: string;
  kmFim: string;
}

const s = (v: unknown): string => String(v ?? '').trim();

// Os 3 dias possíveis do registro do técnico (dia 1 sempre; 2 e 3 quando têm data).
export function extrairDias(tec: Record<string, unknown> | undefined): DiaAtendimento[] {
  if (!tec) return [];
  const dias: DiaAtendimento[] = [];
  if (s(tec.DataInicio)) {
    dias.push({ data: s(tec.DataInicio), inicio: s(tec.InicioHora), fim: s(tec.FinalHora), kmIni: s(tec.InicioKm), kmFim: s(tec.FinalKm) });
  }
  if (s(tec.DataInicio2)) {
    dias.push({ data: s(tec.DataInicio2), inicio: s(tec.InicioHora2), fim: s(tec.FinalHora2), kmIni: s(tec.InicioKm2), kmFim: s(tec.FinalKm2) });
  }
  if (s(tec.DataInicio3)) {
    // FinaHora3 (sem o "l") é o nome real da coluna; aceita a grafia certa se um dia for corrigida
    dias.push({ data: s(tec.DataInicio3), inicio: s(tec.InicioHora3), fim: s(tec.FinaHora3 ?? tec.FinalHora3), kmIni: s(tec.InicioKm3), kmFim: s(tec.FinalKm3) });
  }
  return dias;
}

// dd-mm-aaaa (itens 1 e 6, formato do exemplo aprovado pela KUHN)
export function brData(v: string | null | undefined): string {
  const t = s(v);
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}-${iso[2]}-${iso[1]}`;
  const br = t.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[1]}-${br[2]}-${br[3]}`;
  return t || '____';
}

// dd/mm/aaaa (linhas "Dia ..." dos itens 4 e 5)
function brDataBarra(v: string): string {
  const d = brData(v);
  return d === '____' ? d : d.replace(/-/g, '/');
}

function minutos(hhmm: string): number | null {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function fmtDuracao(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
}

function numero(v: string): number | null {
  const t = s(v);
  if (!t) return null;
  const n = Number(t.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

const fmtNum = (n: number): string => n.toLocaleString('pt-BR');

// Item 4 — uma linha por dia + total ("sem pausas" é o padrão do exemplo
// aprovado; o garantista ajusta se houve intervalo).
export function linhasHoras(dias: DiaAtendimento[], totalHoraCampo: string): string[] {
  if (dias.length === 0) {
    return ['4. Horas de Mão de Obra na Máquina: Inicio: ____, Término ____, ____ horas de serviço sem pausas;'];
  }
  const linhas: string[] = ['4. Horas de Mão de Obra na Máquina: '];
  let somaMin = 0;
  let somaOk = true;
  for (const d of dias) {
    const ini = minutos(d.inicio);
    const fim = minutos(d.fim);
    const dur = ini != null && fim != null && fim > ini ? fim - ini : null;
    if (dur == null) somaOk = false;
    else somaMin += dur;
    linhas.push(
      `Dia ${brDataBarra(d.data)}: Inicio: ${d.inicio || '____'}, Término ${d.fim || '____'}, ${dur != null ? fmtDuracao(dur) : '____'} horas de serviço sem pausas;`
    );
  }
  const total = somaOk && somaMin > 0 ? fmtDuracao(somaMin) : s(totalHoraCampo) || '____';
  linhas.push(`Totalizando: ${total} de serviço realizado`);
  return linhas;
}

// Item 5 — uma linha por dia que TEM km. Se início e fim existem, trata como
// leituras do odômetro (rodado = fim - início); com um valor só, ele é o km
// RODADO do dia e o odômetro fica ____ pro garantista completar.
export function linhasKm(dias: DiaAtendimento[]): string[] {
  const comKm = dias.filter((d) => numero(d.kmIni) != null || numero(d.kmFim) != null);
  if (comKm.length === 0) {
    return ['5. KM rodado inicial e final: KM Inicial: ____, KM Final: ____, ____ KM rodado;'];
  }
  const linhas: string[] = ['5. KM rodado inicial e final: '];
  for (const d of comKm) {
    const ini = numero(d.kmIni);
    const fim = numero(d.kmFim);
    if (ini != null && fim != null && fim > ini) {
      linhas.push(`Dia ${brDataBarra(d.data)}: KM Inicial: ${fmtNum(ini)}, KM Final: ${fmtNum(fim)}, ${fmtNum(fim - ini)} KM rodado;`);
    } else {
      const rodado = ini ?? fim;
      linhas.push(`Dia ${brDataBarra(d.data)}: KM Inicial: ____, KM Final: ____, ${rodado != null ? fmtNum(rodado) : '____'} KM rodado;`);
    }
  }
  return linhas;
}

export interface TextoKuhnParams {
  numeroOS: string;          // já sem o prefixo OS-0
  tecnico: string;           // primeiro nome, maiúsculo
  dataAtendimento: string;   // YYYY-MM-DD (DataFinal ?? DataInicio)
  dataReclamacao: string;    // YYYY-MM-DD (Data da OS)
  dias: DiaAtendimento[];
  totalHoraCampo: string;    // Ordem_Servico_Tecnicos.TotalHora (fallback do total)
  reclamacao: string;        // texto do Tratorilson (ou cru)
  servico: string;           // texto do Tratorilson (ou cru)
  sgPecas: string;           // nº da SG das peças na KUHN (numero_externo)
}

export function montarTextoKuhn(p: TextoKuhnParams): string {
  return [
    `1. Data do atendimento: ${brData(p.dataAtendimento)};`,
    `2. Número da Ordem de Serviço: ${p.numeroOS || '____'};`,
    `3. Nome do Técnico da Revenda: ${p.tecnico || '____'};`,
    ...linhasHoras(p.dias, p.totalHoraCampo),
    ...linhasKm(p.dias),
    `6. Descrição completa do atendimento: ${brData(p.dataReclamacao)}: Reclamação do cliente: ${p.reclamacao || '____'}`,
    `${brData(p.dataAtendimento)}: Serviço: ${p.servico || '____'}`,
    `SG PEÇAS: ${p.sgPecas || '____'}`,
  ].join('\n');
}
