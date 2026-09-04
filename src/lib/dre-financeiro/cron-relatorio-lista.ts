/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// Job semanal: relatorio da VISAO LISTA do Calendario DRE (titulos CRIADOS nos
// ultimos N dias, eixo data_inclusao), para TODAS as contas (NOVA + CASTRO).
// Envia DOIS emails — um de Contas a Pagar, outro de Contas a Receber —, cada
// um com PDF + CSV em anexo. Disparado por GitHub Actions (segunda 07h BRT) na
// rota /api/dre-financeiro/cron/relatorio-lista (Bearer CRON_SECRET).
//
// Config: tela Dev → Envios de e-mail (chave 'dre_lista' em email_envios_config:
// ativo, destinatarios, cc, bcc, parametros.dias). Enquanto a linha nao for salva
// na tela, as env legadas RELATORIO_LISTA_EMAIL_TO/_CC/_BCC/_DIAS ainda valem.
// ============================================================================
import { enviarEmail } from '@/lib/dre-financeiro/email'
import { buscarTitulosLista } from '@/lib/dre-financeiro/lista'
import { gerarPDFLista } from '@/lib/dre-financeiro/pdf-lista'
import { gerarCSVLista } from '@/lib/dre-financeiro/csv-lista'
import { hoje, addDias, fmtISO } from '@/lib/dre-financeiro/dates'
import { getConfigEnvio, registrarEnvioLog } from '@/lib/email/envios-config'

export const CHAVE_ENVIO_DRE = 'dre_lista'

/** 'YYYY-MM-DD' -> 'DD/MM/YYYY' (sem passar por Date, evita fuso). */
function isoParaBR(iso: string): string {
  const p = String(iso || '').split('-')
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : iso
}

interface RelatorioTipoResultado {
  tipo: string
  titulos: number
  email?: any
  motivo?: string
}

const TIPO_LABEL: Record<string, string> = { pagar: 'Contas a Pagar', receber: 'Contas a Receber' }

export interface CronListaOpts {
  origem?: 'cron' | 'manual' | 'teste'
  /** Sobrescreve os destinatarios (teste). Sem isto, usa a config da tela Dev. */
  to?: string[]
  cc?: string[]
  bcc?: string[]
  usuario?: string
  /** Ignora a chave "ativo" (Enviar agora / teste). */
  forcar?: boolean
}

/** Gera e envia os relatorios semanais (pagar + receber). `dias` opcional (default config/7). */
export async function cronRelatorioListaSemanal(dias?: number, opts: CronListaOpts = {}): Promise<any> {
  const origem = opts.origem || 'cron'
  const cfg = await getConfigEnvio(CHAVE_ENVIO_DRE)
  const n = dias && dias > 0 ? dias : parseInt(String(cfg.parametros?.dias ?? ''), 10) || 7

  // Janela: ultimos N dias completos (de = hoje-N ate ontem).
  const h = hoje()
  const ate = fmtISO(addDias(h, -1))
  const de = fmtISO(addDias(h, -n))
  const janelaLabel = `${isoParaBR(de)} a ${isoParaBR(ate)}`

  const to = opts.to?.length ? opts.to : cfg.to
  const cc = opts.cc ?? cfg.cc
  const bcc = opts.bcc ?? cfg.bcc

  if (!cfg.ativo && !opts.forcar && !opts.to?.length) {
    await registrarEnvioLog({ chave: CHAVE_ENVIO_DRE, origem, ok: false, motivo: 'desativado', usuario: opts.usuario })
    return { pulado: true, motivo: 'desativado', janela: { de, ate, dias: n }, migrationFaltando: cfg.migrationFaltando }
  }

  const resultados: RelatorioTipoResultado[] = []

  for (const tipo of ['pagar', 'receber'] as const) {
    const titulos = await buscarTitulosLista({ conta: 'todas', tipo, de, ate, eixo: 'inclusao', q: {} })
    const nomeTipo = TIPO_LABEL[tipo]
    const subject = `${nomeTipo} criadas nos ultimos ${n} dias (${titulos.length}) — NOVA + CASTRO`

    if (!to.length) {
      resultados.push({ tipo, titulos: titulos.length, motivo: 'sem destinatario (configurar em Dev → Envios de e-mail)' })
      await registrarEnvioLog({ chave: CHAVE_ENVIO_DRE, origem, ok: false, motivo: 'sem_destinatario', assunto: subject, total: titulos.length, usuario: opts.usuario })
      continue
    }

    const pdf = await gerarPDFLista({
      titulo: `${nomeTipo} — criadas nos ultimos ${n} dias`,
      subtitulo: `NOVA + CASTRO · por data de criacao · ${janelaLabel}`,
      titulos,
      colunaDataLabel: 'Criacao',
      colunaDataCampo: 'data_inclusao',
    })
    const csv = gerarCSVLista(titulos)

    const total = titulos.reduce((s, t) => s + (Number(t.valor_documento) || 0), 0)
    const totalBRL = 'R$ ' + total.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
    const base = `${tipo}-criados-${n}d`

    const email = await enviarEmail({
      to,
      cc,
      bcc,
      subject,
      html:
        `<p>Segue o relatorio de <b>${nomeTipo}</b> criadas nos ultimos ${n} dias ` +
        `(por data de criacao/inclusao no Omie), NOVA + CASTRO.</p>` +
        `<p>Periodo: <b>${janelaLabel}</b><br>Titulos: <b>${titulos.length}</b><br>Total: <b>${totalBRL}</b></p>` +
        `<p>Anexos: PDF (visao lista) e CSV (detalhado).</p>`,
      attachments: [
        { filename: `${base}.pdf`, content: pdf },
        { filename: `${base}.csv`, content: csv, contentType: 'text/csv; charset=utf-8' },
      ],
    })
    resultados.push({ tipo, titulos: titulos.length, email })
    await registrarEnvioLog({
      chave: CHAVE_ENVIO_DRE, origem, ok: email.ok, motivo: email.ok ? undefined : (email.erro || email.motivo),
      assunto: subject, destinatarios: to, total: titulos.length, usuario: opts.usuario,
      detalhes: { tipo, janela: { de, ate, dias: n }, messageId: email.messageId },
    })
  }

  return { janela: { de, ate, dias: n }, destinatarios: to, resultados }
}
