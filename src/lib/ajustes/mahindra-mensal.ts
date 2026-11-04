/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// Envio MENSAL do arquivo Mahindra (estoque e venda de peças) por e-mail.
// Pedido do José (04/11/2026): todo dia 2, o arquivo do mês anterior vai para o Zezo.
//
// Roda no agendador interno (tarefa 'mahindra-mensal', worker) e no "Enviar agora /
// teste" da tela Dev → Envios de e-mail (chave 'mahindra_mensal'). Destinatários e
// liga/desliga ficam NO BANCO (email_envios_config), como os outros envios.
//
// Retomada: se um arquivo do mês já foi gerado depois do mês fechar (pela tela ou
// por uma rodada anterior interrompida), ele é reaproveitado — não consulta a Omie de
// novo. No cron, o mês que já saiu com sucesso não sai de novo.
// ============================================================================
import type { Conta } from './conta';
import { supabase } from './supabase';
import { gerarComTemplatePadrao, salvarArquivoMahindra, obterArquivo, type ResumoMahindra } from './mahindra';
import { arquivoReaproveitavel, mesAnteriorSP, mesPorExtenso, contasDoParametro } from './mahindra-mensal-regras';
import { enviarEmail } from '@/lib/dre-financeiro/email';
import { getConfigEnvio, registrarEnvioLog } from '@/lib/email/envios-config';

export const CHAVE_ENVIO_MAHINDRA = 'mahindra_mensal';

export interface EnvioMahindraOpts {
  origem?: 'cron' | 'manual' | 'teste';
  to?: string[];
  cc?: string[];
  bcc?: string[];
  usuario?: string;
  /** Ignora o liga/desliga (Enviar agora / teste) e o "já enviado". */
  forcar?: boolean;
  /** AAAA-MM; padrão = mês anterior (Brasília). */
  mes?: string;
}

function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
const fmtNum = (n: unknown) => Number(n || 0).toLocaleString('pt-BR');

async function jaEnviado(mes: string): Promise<boolean> {
  try {
    const { data } = await supabase.from('email_envios_log')
      .select('id').eq('chave', CHAVE_ENVIO_MAHINDRA).eq('origem', 'cron').eq('ok', true)
      .eq('detalhes->>mes', mes).limit(1);
    return !!(data && data.length);
  } catch {
    return false;
  }
}

/** Arquivo do mês para a conta: reaproveita o que já existe ou gera agora (e guarda no histórico). */
async function arquivoDoMes(conta: Conta, mes: string, onProgress?: (m: string) => void) {
  const { data } = await supabase.from('mahindra_arquivos')
    .select('id, conta_omie, mes, filename, criado_em, resumo')
    .eq('conta_omie', conta).eq('mes', mes)
    .order('criado_em', { ascending: false }).limit(10);
  const existente = arquivoReaproveitavel((data || []) as any[], mes, conta);
  if (existente) {
    const arq = await obterArquivo(existente.id);
    if (arq) return { id: existente.id as number, filename: arq.filename, buffer: arq.buffer, resumo: existente.resumo as ResumoMahindra, reaproveitado: true };
  }
  const gerado = await gerarComTemplatePadrao(conta, mes, onProgress);
  const id = await salvarArquivoMahindra(conta, mes, gerado, 'agendador (envio mensal)');
  return { id, filename: gerado.filename, buffer: gerado.buffer, resumo: gerado.resumo, reaproveitado: false };
}

export async function enviarMahindraMensal(opts: EnvioMahindraOpts = {}): Promise<any> {
  const origem = opts.origem || 'cron';
  const cfg = await getConfigEnvio(CHAVE_ENVIO_MAHINDRA);
  const mes = opts.mes || mesAnteriorSP();
  const assunto = `Arquivo Mahindra — estoque e venda de peças — ${mesPorExtenso(mes)}`;

  if (!cfg.ativo && !opts.forcar && !opts.to?.length) {
    await registrarEnvioLog({ chave: CHAVE_ENVIO_MAHINDRA, origem, ok: false, motivo: 'desativado', assunto, usuario: opts.usuario });
    return { pulado: 'envio desligado na tela Dev → Envios de e-mail' };
  }
  const to = opts.to?.length ? opts.to : cfg.to;
  const cc = opts.to?.length ? (opts.cc || []) : cfg.cc;
  const bcc = opts.to?.length ? (opts.bcc || []) : cfg.bcc;
  if (!to.length) throw new Error('sem destinatário — configure na tela Dev → Envios de e-mail');
  if (origem === 'cron' && !opts.forcar && await jaEnviado(mes)) {
    return { pulado: `${mes} já foi enviado` };
  }

  const contas = contasDoParametro(cfg.parametros?.contas);
  const arquivos = [];
  for (const conta of contas) {
    arquivos.push({ conta, ...(await arquivoDoMes(conta, mes, (m) => console.log(`[mahindra-mensal ${conta}] ${m}`))) });
  }

  const linhas = arquivos.map((a) => {
    const r = a.resumo || ({} as ResumoMahindra);
    return `<li><b>${esc(a.conta)}</b>: ${fmtNum(r.encontradas)} de ${fmtNum(r.totalPecas)} peças preenchidas · ` +
      `estoque em ${esc(r.dataFimBR)}: ${fmtNum(r.somaEstoque)} un. · vendidas no mês: ${fmtNum(r.somaVendida)} un.</li>`;
  }).join('');
  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1e293b">` +
    `<p>Segue o <b>arquivo padrão Mahindra — estoque e venda de peças</b> de <b>${esc(mesPorExtenso(mes))}</b>${origem === 'cron' ? ' (envio automático)' : ''}.</p>` +
    `<ul>${linhas}</ul>` +
    `<p style="color:#64748b;font-size:12px">Estoque = posição no último dia do mês. Venda = pedidos faturados no mês (etapa 60/70). ` +
    `O arquivo também fica no histórico em portal.novatratores.com/ajustes/mahindra.</p>` +
    (opts.usuario ? `<p style="color:#94a3b8;font-size:12px">Enviado por ${esc(opts.usuario)} pelo Portal Nova Tratores.</p>` : '') +
    `</div>`;

  const email = await enviarEmail({
    to, cc, bcc, subject: assunto, html,
    attachments: arquivos.map((a) => ({
      filename: a.filename,
      content: a.buffer,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })),
  });
  await registrarEnvioLog({
    chave: CHAVE_ENVIO_MAHINDRA, origem, ok: email.ok,
    motivo: email.ok ? undefined : (email.erro || email.motivo),
    assunto, destinatarios: to, total: arquivos.length, usuario: opts.usuario,
    detalhes: { mes, arquivos: arquivos.map((a) => ({ conta: a.conta, id: a.id, filename: a.filename, reaproveitado: a.reaproveitado })), messageId: email.messageId },
  });
  if (!email.ok) throw new Error(`e-mail não saiu: ${email.erro || email.motivo}`);
  return {
    mes, destinatarios: to,
    arquivos: arquivos.map((a) => `${a.conta}: ${a.filename}${a.reaproveitado ? ' (já gerado)' : ''}`),
  };
}
