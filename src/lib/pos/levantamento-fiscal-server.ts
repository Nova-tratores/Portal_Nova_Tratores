// Levantamento dos impostos das OS faturadas com NFS-e — SERVIDOR (Omie + banco).
// Roda em segundo plano (pode levar minutos) e guarda o resultado em memória do
// processo: some num redeploy, é só rodar de novo. SÓ LEITURA no Omie
// (ListarOS / ConsultarOS) — nada é gravado lá nem no banco.
//
// 1) ListarOS: faturadas (F), mais recentes primeiro, só as que têm NFS-e (cache
//    os_nfse) — a listagem traz a OS completa com os impostos dos itens.
// 2) Se a listagem NÃO trouxer os impostos dos itens, consulta OS por OS
//    (ConsultarOS, ~3 por segundo).
import { supabase } from './supabase';
import { contaOmie } from '@/lib/omie/contas';
import { omie as omiePorta } from '@/lib/omie/porta';
import {
  agruparCombinacoes, dataOmieParaISO, maisRecentes,
  type OSLevantada, type ClienteInfo, type ResultadoLevantamento,
} from './levantamento-fiscal';
import type { ItemServicoOmie } from './modelo-fiscal';

const OMIE = 'https://app.omie.com.br/api/v1/servicos/os/';
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface EstadoLevantamento {
  rodando: boolean;
  por: string | null;
  iniciadoEm: string | null;
  terminadoEm: string | null;
  progresso: string;
  erro: string | null;
  origem: 'listagem' | 'consulta' | null;
  resultado: ResultadoLevantamento | null;
}

const g = globalThis as unknown as { __levFiscal?: EstadoLevantamento };
function estado(): EstadoLevantamento {
  if (!g.__levFiscal) g.__levFiscal = { rodando: false, por: null, iniciadoEm: null, terminadoEm: null, progresso: '', erro: null, origem: null, resultado: null };
  return g.__levFiscal;
}
export function estadoLevantamento(): EstadoLevantamento { return estado(); }

// Porta única: fila/freio e repetição em REDUNDANT/too many requests (antes era um laço
// próprio de até 3 esperas aqui). Faultstring continua virando Error com o texto cru.
async function omie<T>(call: string, param: Record<string, unknown>): Promise<T> {
  const acc = contaOmie('Nova Tratores');
  const j = await omiePorta<Record<string, unknown>>(
    { appKey: acc.key, appSecret: acc.secret, rotulo: 'Nova Tratores' }, OMIE, call, param, { lancarFault: false },
  );
  const fault = typeof j?.faultstring === 'string' ? j.faultstring : '';
  if (fault) throw new Error(fault);
  return j as T;
}

type OSOmie = {
  Cabecalho?: { nCodOS?: number; cNumOS?: string; nCodCli?: number; nValorTotal?: number };
  InfoCadastro?: { dDtFat?: string; cCancelada?: string; cFaturada?: string };
  ServicosPrestados?: ItemServicoOmie[];
};

function paraLevantada(o: OSOmie): OSLevantada | null {
  if (!o?.Cabecalho?.nCodOS || o.InfoCadastro?.cCancelada === 'S') return null;
  return {
    nCodOS: Number(o.Cabecalho.nCodOS), cNumOS: String(o.Cabecalho.cNumOS || '').replace(/^0+/, ''),
    dataFat: dataOmieParaISO(o.InfoCadastro?.dDtFat), codCli: Number(o.Cabecalho.nCodCli || 0),
    valor: Number(o.Cabecalho.nValorTotal || 0), itens: o.ServicosPrestados || [],
  };
}

async function clientesInfo(cods: number[]): Promise<Map<number, ClienteInfo>> {
  const out = new Map<number, ClienteInfo>();
  const unicos = [...new Set(cods.filter(Boolean))];
  for (let i = 0; i < unicos.length; i += 200) {
    const { data } = await supabase.from('portal_nt_clientes_cadastro_omie')
      .select('cod_cli, razao_social, nome_fantasia, cnpj_cpf')
      .eq('empresa', 'Nova Tratores').in('cod_cli', unicos.slice(i, i + 200));
    for (const c of data || []) {
      out.set(Number(c.cod_cli), { nome: String(c.nome_fantasia || c.razao_social || ''), documento: String(c.cnpj_cpf || '').replace(/\D/g, '') });
    }
  }
  return out;
}


async function executar(limite: number) {
  const e = estado();
  // 1) OS com NFS-e = marcadas no cache os_nfse. O filtro cTipoFat:'NFS' da Omie NÃO serve
  //    (testado 13/10/2026: devolve 233 OS e a mais nova de 2025), nem combinado com data.
  const comNota = new Set<number>();
  for (let de = 0; ; de += 1000) {
    const { data } = await supabase.from('os_nfse').select('ncod_os').eq('conta_omie', 'NOVA').eq('tem_nota', true).order('ncod_os').range(de, de + 999);
    for (const r of data || []) comNota.add(Number(r.ncod_os));
    if (!data || data.length < 1000) break;
  }
  // 2) faturadas, mais recentes primeiro; para ao juntar o limite de OS com NFS-e
  const todas: OSOmie[] = [];
  let pagina = 1; let totalPaginas = 1;
  do {
    e.progresso = `Lendo as OS faturadas na Omie — página ${pagina} (${todas.length} de ${limite} com NFS-e)…`;
    const r = await omie<{ total_de_paginas?: number; osCadastro?: OSOmie[] }>('ListarOS', {
      pagina, registros_por_pagina: 50, apenas_importado_api: 'N',
      filtrar_por_status: 'F', ordenar_por: 'CODIGO', ordem_decrescente: 'S',
    });
    totalPaginas = Math.min(Number(r.total_de_paginas || 1), 60);
    todas.push(...(r.osCadastro || []).filter((o) => comNota.has(Number(o?.Cabecalho?.nCodOS))));
    pagina++;
    if (pagina <= totalPaginas && todas.length < limite) await espera(800);
  } while (pagina <= totalPaginas && todas.length < limite);

  let oss = maisRecentes(todas.map(paraLevantada).filter((x): x is OSLevantada => !!x), limite);
  const listagemTemImpostos = oss.some((o) => o.itens.some((i) => i && typeof i.impostos === 'object'));
  e.origem = listagemTemImpostos ? 'listagem' : 'consulta';

  // 2) sem impostos na listagem: ConsultarOS uma a uma
  if (!listagemTemImpostos) {
    const completas: OSLevantada[] = [];
    for (let i = 0; i < oss.length; i++) {
      e.progresso = `A listagem não traz os impostos — consultando OS ${i + 1} de ${oss.length}…`;
      try {
        const c = paraLevantada(await omie<OSOmie>('ConsultarOS', { nCodOS: oss[i].nCodOS }));
        if (c) completas.push({ ...c, dataFat: c.dataFat || oss[i].dataFat });
      } catch { /* uma OS que falhar não derruba o levantamento */ }
      await espera(330);
    }
    oss = completas;
  }

  e.progresso = 'Agrupando…';
  const clientes = await clientesInfo(oss.map((o) => o.codCli));
  e.resultado = agruparCombinacoes(oss, clientes);
}

/** Dispara em segundo plano; não roda dois ao mesmo tempo. */
export function iniciarLevantamento(limite: number, usuario: string): EstadoLevantamento {
  const e = estado();
  if (e.rodando) return e;
  Object.assign(e, { rodando: true, por: usuario, iniciadoEm: new Date().toISOString(), terminadoEm: null, progresso: 'Começando…', erro: null, origem: null, resultado: null });
  executar(Math.max(50, Math.min(Number(limite) || 1000, 1500)))
    .catch((err) => { e.erro = err instanceof Error ? err.message : String(err); })
    .finally(() => { e.rodando = false; e.terminadoEm = new Date().toISOString(); e.progresso = ''; });
  return e;
}
