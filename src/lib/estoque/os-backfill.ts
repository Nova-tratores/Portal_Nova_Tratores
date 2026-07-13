// Backfill noturno de os_servicos_itens (itens do popup do card Serviços):
// varre todos os meses da conta (dataInicio → mês atual) e sincroniza os que
// ainda não têm itens no Supabase. Meses já preenchidos são PULADOS — depois da
// primeira passada completa, re-execuções custam só ~1 count por mês (zero Omie).
// O ListarOS completo é baixado UMA vez por conta (cache de buscarTodasOS) e
// compartilhado por todos os meses sincronizados.

import { supabase } from './supabase';
import { sincronizarServicosItens } from './os';
import { gerarMesesEsperados, type Conta } from './conta';

export interface BackfillOsServicosStatus {
  rodando: boolean;
  total: number;
  feitos: number;
  pulados: number;
  erros: number;
  ultimoMes: string;
  inicio: string;
  fim: string | null;
}

const status: Record<string, BackfillOsServicosStatus> = {};

export function getBackfillOsServicosStatus(): Record<string, BackfillOsServicosStatus> {
  return status;
}

async function mesJaTemItens(mes: number, ano: number, conta: Conta): Promise<boolean> {
  const { count, error } = await supabase
    .from('os_servicos_itens')
    .select('id', { count: 'exact', head: true })
    .eq('conta_omie', conta)
    .eq('mes', mes)
    .eq('ano', ano);
  if (error) throw new Error('os_servicos_itens: ' + error.message);
  return (count || 0) > 0;
}

/** Contas em sequência (uma varredura Omie por vez) para não disputar rate-limit. */
export async function backfillOsServicos(contas: Conta[], forcar: boolean): Promise<void> {
  for (const conta of contas) {
    if (status[conta]?.rodando) continue;
    const now = new Date();
    const meses = [...gerarMesesEsperados(conta), { mes: now.getMonth() + 1, ano: now.getFullYear() }];
    const st: BackfillOsServicosStatus = {
      rodando: true, total: meses.length, feitos: 0, pulados: 0, erros: 0,
      ultimoMes: '', inicio: new Date().toISOString(), fim: null,
    };
    status[conta] = st;
    try {
      for (const { mes, ano } of meses) {
        st.ultimoMes = mes + '/' + ano;
        try {
          if (!forcar && (await mesJaTemItens(mes, ano, conta))) {
            st.pulados++;
            continue;
          }
          await sincronizarServicosItens(mes, ano, conta);
          st.feitos++;
        } catch (e) {
          st.erros++;
          console.log('[backfill os-servicos] ' + conta + ' ' + mes + '/' + ano + ' falhou: ' + (e as Error).message);
        }
      }
    } finally {
      st.rodando = false;
      st.fim = new Date().toISOString();
      console.log('[backfill os-servicos] ' + conta + ' concluído: ' + JSON.stringify(st));
    }
  }
}
