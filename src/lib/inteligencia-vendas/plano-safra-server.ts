/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================================================
// INTELIGÊNCIA DE VENDAS — Plano Safra (servidor): vigia das páginas oficiais.
// AUTOMÁTICO (José, 19/10/2026: "o plano safra tem que ser automático"): o robô lê,
// a IA extrai, os números validados passam a valer na hora (os antigos vão para o
// histórico) e quem confere só é AVISADO no sino — pode corrigir ou apagar à mão.
// =============================================================================
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { chamarIA } from '@/lib/assistente/ia';
import { FONTES_PLANO_SAFRA, PROMPT_IA, extrairCondicoes, hashTexto, linhaServeMaquina, safraAtual, validarLinhas } from './plano-safra';
import { hojeBR } from './normalizar';

export const CHAVE_CONFERENTES = 'conferentes_plano_safra';
export interface Conferente { id: string; nome: string }

export async function lerConferentes(): Promise<Conferente[]> {
  const { data, error } = await supabaseAdmin.from('iv_config').select('valor').eq('chave', CHAVE_CONFERENTES).maybeSingle();
  if (error) throw error;
  return ((data?.valor as any)?.usuarios || []) as Conferente[];
}

export async function salvarConferentes(lista: Conferente[], quem: string) {
  const { error } = await supabaseAdmin.from('iv_config').upsert({ chave: CHAVE_CONFERENTES, valor: { usuarios: lista }, atualizado_em: new Date().toISOString(), atualizado_por: quem });
  if (error) throw error;
}

async function avisar(conferentes: Conferente[], titulo: string, descricao: string) {
  if (!conferentes.length) return;
  await supabaseAdmin.from('portal_notificacoes').insert(conferentes.map((c) => ({
    user_id: c.id, tipo: 'tickets', titulo, descricao, link: '/inteligencia-vendas/noticias',
  })));
}

async function baixar(url: string): Promise<string> {
  const r = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36', Accept: 'text/html' },
    signal: AbortSignal.timeout(30_000), redirect: 'follow',
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

async function proporComIA(nomeFonte: string, trecho: string) {
  const j = await chamarIA({
    temperature: 0, response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: PROMPT_IA }, { role: 'user', content: `Página: ${nomeFonte}\n\n${trecho}` }],
  });
  const conteudo = j?.choices?.[0]?.message?.content || '{}';
  return validarLinhas(JSON.parse(conteudo));
}

/**
 * Lê as páginas oficiais. Para cada uma: se o trecho das condições mudou (ou se o
 * programa ainda não tem nada valendo), a IA extrai as linhas e elas passam a VALER
 * na hora; as anteriores do programa viram "antiga" (histórico). Quem confere é
 * avisado. Devolve o resumo para a tela / log do robô.
 */
export async function verificarFontes(origem: string): Promise<{ verificadas: number; mudaram: string[]; erros: string[] }> {
  const [{ data: fontes }, { data: linhas }] = await Promise.all([
    supabaseAdmin.from('iv_fontes_monitor').select('*'),
    supabaseAdmin.from('iv_linhas_credito').select('id,programa,status').in('status', ['vigente', 'proposta']),
  ]);
  const mudaram: string[] = [], erros: string[] = [];
  // automático: o que ficou "proposta" do tempo da aprovação manual passa a valer
  for (const prog of new Set((linhas || []).filter((l: any) => l.status === 'proposta').map((l: any) => l.programa as string))) {
    if (await aprovarPrograma(prog, 'robô (automático)')) mudaram.push(FONTES_PLANO_SAFRA.find((x) => x.programa === prog)?.nome || prog);
  }
  for (const f of FONTES_PLANO_SAFRA) {
    const antes = (fontes || []).find((x: any) => x.url === f.url);
    const agora = new Date().toISOString();
    try {
      const trecho = extrairCondicoes(await baixar(f.url));
      if (!trecho) throw new Error('página sem o trecho das condições');
      const hash = hashTexto(trecho);
      const temAlgo = (linhas || []).some((l: any) => l.programa === f.programa) || mudaram.includes(f.nome);
      const mudou = !antes?.hash || antes.hash !== hash;
      await supabaseAdmin.from('iv_fontes_monitor').upsert({
        programa: f.programa, nome: f.nome, url: f.url, hash, trecho, verificado_em: agora, erro: null,
        mudou_em: mudou && antes?.hash ? agora : antes?.mudou_em ?? null,
      }, { onConflict: 'url' });
      if ((mudou && antes?.hash) || !temAlgo) {
        const novas = (await proporComIA(f.nome, trecho)).filter(linhaServeMaquina);
        if (novas.length) {
          // grava primeiro as novas; só depois aposenta as anteriores (se o insert falhar, nada some)
          const { data: inseridas, error } = await supabaseAdmin.from('iv_linhas_credito').insert(novas.map((p) => ({
            ...p, programa: f.programa, safra: safraAtual(hojeBR()), fonte_url: f.url, status: 'vigente', origem: 'robo',
            criado_por: origem, conferido_em: agora, conferido_por: 'robô (automático)',
          }))).select('id');
          if (error) throw error;
          const ids = (inseridas || []).map((x: any) => x.id);
          await supabaseAdmin.from('iv_linhas_credito').update({ status: 'antiga' }).eq('programa', f.programa).eq('status', 'vigente').not('id', 'in', `(${ids.join(',') || 0})`);
          await supabaseAdmin.from('iv_linhas_credito').update({ status: 'rejeitada' }).eq('programa', f.programa).eq('status', 'proposta');
          mudaram.push(f.nome);
        }
      }
    } catch (e: any) {
      erros.push(`${f.nome}: ${e?.message || e}`);
      await supabaseAdmin.from('iv_fontes_monitor').upsert({ programa: f.programa, nome: f.nome, url: f.url, verificado_em: agora, erro: String(e?.message || e).slice(0, 300) }, { onConflict: 'url' });
    }
  }
  if (mudaram.length) {
    await avisar(await lerConferentes(), 'Plano Safra atualizado automaticamente',
      `O robô leu condições novas em ${mudaram.join(', ')} e já atualizou as taxas. Dê uma olhada; se algo estiver errado, corrija na tela.`);
  }
  return { verificadas: FONTES_PLANO_SAFRA.length, mudaram, erros };
}

/** Aprova todas as propostas de um programa: viram vigentes, as vigentes antigas viram "antiga". */
export async function aprovarPrograma(programa: string, quem: string) {
  const agora = new Date().toISOString();
  const { data: props } = await supabaseAdmin.from('iv_linhas_credito').select('id').eq('programa', programa).eq('status', 'proposta');
  if (!props?.length) return 0;
  await supabaseAdmin.from('iv_linhas_credito').update({ status: 'antiga' }).eq('programa', programa).eq('status', 'vigente');
  await supabaseAdmin.from('iv_linhas_credito').update({ status: 'vigente', conferido_em: agora, conferido_por: quem }).in('id', props.map((p: any) => p.id));
  return props.length;
}

export async function rejeitarPrograma(programa: string, quem: string) {
  await supabaseAdmin.from('iv_linhas_credito').update({ status: 'rejeitada', conferido_em: new Date().toISOString(), conferido_por: quem }).eq('programa', programa).eq('status', 'proposta');
}

// primeira leitura sozinha: quando alguém abre a tela e ainda não há nada valendo
const g = globalThis as any;
export function garantirPrimeiraLeitura(semNada: boolean) {
  if (!semNada || g.__ivPsPrimeira) return;
  if (g.__ivPsPrimeiraEm && Date.now() - g.__ivPsPrimeiraEm < 6 * 3_600_000) return;
  g.__ivPsPrimeiraEm = Date.now();
  g.__ivPsPrimeira = verificarFontes('robô (primeira leitura)').catch(() => null).finally(() => { g.__ivPsPrimeira = null; });
}
export function primeiraLeituraRodando(): boolean { return !!g.__ivPsPrimeira; }
