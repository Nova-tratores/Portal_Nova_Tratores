/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// Job semanal: relatorio da VISAO LISTA do Calendario DRE (titulos CRIADOS nos
// ultimos N dias, eixo data_inclusao), para TODAS as contas (NOVA + CASTRO).
// Envia DOIS emails — um de Contas a Pagar, outro de Contas a Receber —, cada
// um com PDF + CSV em anexo. Disparado por GitHub Actions (segunda 07h BRT) na
// rota /api/dre-financeiro/cron/relatorio-lista (Bearer CRON_SECRET).
//
// Config (env): RELATORIO_LISTA_EMAIL_TO (obrigatorio p/ enviar), _CC, _BCC,
// RELATORIO_LISTA_DIAS (default 7). Email via SMTP_* (ver src/lib/ajustes/email).
// ============================================================================
import { enviarEmail, parseDestinatarios } from '@/lib/ajustes/email'
import { buscarTitulosLista } from '@/lib/dre-financeiro/lista'
import { gerarPDFLista } from '@/lib/dre-financeiro/pdf-lista'
import { gerarCSVLista } from '@/lib/dre-financeiro/csv-lista'
import { hoje, addDias, fmtISO } from '@/lib/dre-financeiro/dates'

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

/** Gera e envia os relatorios semanais (pagar + receber). `dias` opcional (default env/7). */
export async function cronRelatorioListaSemanal(dias?: number): Promise<any> {
  const n = dias && dias > 0 ? dias : parseInt(process.env.RELATORIO_LISTA_DIAS || '', 10) || 7

  // Janela: ultimos N dias completos (de = hoje-N ate ontem).
  const h = hoje()
  const ate = fmtISO(addDias(h, -1))
  const de = fmtISO(addDias(h, -n))
  const janelaLabel = `${isoParaBR(de)} a ${isoParaBR(ate)}`

  const to = parseDestinatarios(process.env.RELATORIO_LISTA_EMAIL_TO)
  const cc = parseDestinatarios(process.env.RELATORIO_LISTA_EMAIL_CC)
  const bcc = parseDestinatarios(process.env.RELATORIO_LISTA_EMAIL_BCC)

  const resultados: RelatorioTipoResultado[] = []

  for (const tipo of ['pagar', 'receber'] as const) {
    const titulos = await buscarTitulosLista({ conta: 'todas', tipo, de, ate, eixo: 'inclusao', q: {} })
    const nomeTipo = TIPO_LABEL[tipo]

    if (!to.length) {
      resultados.push({ tipo, titulos: titulos.length, motivo: 'RELATORIO_LISTA_EMAIL_TO nao configurado' })
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
      subject: `${nomeTipo} criadas nos ultimos ${n} dias (${titulos.length}) — NOVA + CASTRO`,
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
  }

  return { janela: { de, ate, dias: n }, destinatarios: to, resultados }
}
