import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/pos/supabase'
import { fetchRotaExata, getDestinos, detectarViagens, type Posicao, type Viagem } from '@/lib/pos/rastreamento'

export const maxDuration = 300

// Reutiliza calcularMetricas do cron principal
function calcularMetricas(viagem: Viagem) {
  const eventos = viagem.eventos || []
  let dirigindoMin = 0, clienteMin = 0

  for (let i = 0; i < eventos.length; i++) {
    const ev = eventos[i]
    if (ev.tipo === 'saida_loja' || ev.tipo === 'saida_cliente') {
      const prox = eventos.slice(i + 1).find(e => e.tipo === 'chegada_cliente' || e.tipo === 'retorno_loja')
      if (prox) {
        const diff = (new Date(prox.horario).getTime() - new Date(ev.horario).getTime()) / 60000
        if (diff > 0 && diff < 600) dirigindoMin += diff
      }
    }
    if (ev.tipo === 'chegada_cliente') {
      const proxSaida = eventos.slice(i + 1).find(e => e.tipo === 'saida_cliente' || e.tipo === 'retorno_loja')
      if (proxSaida) {
        const diff = (new Date(proxSaida.horario).getTime() - new Date(ev.horario).getTime()) / 60000
        if (diff > 0 && diff < 600) clienteMin += diff
      }
    }
  }

  return {
    horas_dirigindo: Math.round((dirigindoMin / 60) * 100) / 100,
    km_percorrido: Math.round((viagem.km_total || 0) * 10) / 10,
    horas_no_cliente: Math.round((clienteMin / 60) * 100) / 100,
  }
}

/**
 * POST /api/pos/cron/gravar-gps/backfill?de=2026-01-01&ate=2026-05-21
 *
 * Busca dados historicos do Rota Exata e preenche GPS_Viagens + resumo_diario_tecnico
 * para todos os tecnicos vinculados, para cada dia do periodo.
 */
export async function POST(req: NextRequest) {
  const de = req.nextUrl.searchParams.get('de')
  const ate = req.nextUrl.searchParams.get('ate')

  if (!de || !ate) {
    return NextResponse.json({ error: 'Parametros obrigatorios: de=YYYY-MM-DD&ate=YYYY-MM-DD' }, { status: 400 })
  }

  try {
    // 1. Busca vinculos fixos tecnico <-> veiculo
    const { data: vinculosFixos } = await supabase
      .from('tecnico_veiculos')
      .select('tecnico_nome, adesao_id, placa, descricao')

    // Busca todos os caminhos do periodo (escolha diaria no app dos mecanicos)
    const { data: caminhosPeriodo } = await supabase
      .from('tecnico_caminhos')
      .select('tecnico_nome, adesao_id, placa, data_saida')
      .not('adesao_id', 'is', null)
      .gte('data_saida', `${de}T00:00:00`)
      .lte('data_saida', `${ate}T23:59:59`)

    if ((!vinculosFixos || vinculosFixos.length === 0) && (!caminhosPeriodo || caminhosPeriodo.length === 0)) {
      return NextResponse.json({ error: 'Nenhum vinculo tecnico-veiculo encontrado' }, { status: 404 })
    }

    // Indexar caminhos por tecnico+dia para lookup rapido
    const caminhosMap: Record<string, { adesao_id: number; placa: string }> = {}
    if (caminhosPeriodo) {
      for (const c of caminhosPeriodo) {
        if (!c.adesao_id) continue
        const dia = c.data_saida?.split('T')[0] || ''
        if (dia) caminhosMap[`${c.tecnico_nome}|${dia}`] = { adesao_id: c.adesao_id, placa: c.placa || '' }
      }
    }

    // Lista de tecnicos unicos (dos vinculos fixos + caminhos)
    const tecnicosSet = new Set<string>()
    if (vinculosFixos) vinculosFixos.forEach(v => tecnicosSet.add(v.tecnico_nome))
    if (caminhosPeriodo) caminhosPeriodo.forEach(c => tecnicosSet.add(c.tecnico_nome))
    const tecnicos = [...tecnicosSet]

    // 2. Busca destinos
    const destinos = await getDestinos()

    // 3. Gera lista de datas
    const datas: string[] = []
    const dtInicio = new Date(de + 'T12:00:00')
    const dtFim = new Date(ate + 'T12:00:00')
    for (let d = new Date(dtInicio); d <= dtFim; d.setDate(d.getDate() + 1)) {
      const dia = d.toISOString().split('T')[0]
      // Pula domingos (0)
      if (d.getDay() !== 0) datas.push(dia)
    }

    console.log(`[Backfill GPS] ${datas.length} dias x ${tecnicos.length} tecnicos = ${datas.length * tecnicos.length} consultas`)

    let totalSalvos = 0
    let totalErros = 0
    const erros: string[] = []

    for (const tecNome of tecnicos) {
      const vinculoFixo = vinculosFixos?.find(v => v.tecnico_nome === tecNome)

      for (const dia of datas) {
        try {
          // Prioridade: caminho do dia (app mecanico) > vinculo fixo
          const caminhoDia = caminhosMap[`${tecNome}|${dia}`]
          const adesaoId = caminhoDia?.adesao_id || vinculoFixo?.adesao_id
          const placa = caminhoDia?.placa || vinculoFixo?.placa || ''
          const descricao = vinculoFixo?.descricao || ''

          if (!adesaoId) continue // sem veiculo pra esse tecnico nesse dia

          // Verifica se ja tem dado pra esse dia (nao sobrescreve)
          const { data: existe } = await supabase
            .from('GPS_Viagens')
            .select('tecnico_nome')
            .eq('tecnico_nome', tecNome)
            .eq('data', dia)
            .maybeSingle()

          if (existe) continue // ja tem, pula

          const where = JSON.stringify({
            adesao_id: adesaoId,
            dt_posicao: { $gte: `${dia}T00:00:00.000-03:00`, $lte: `${dia}T23:59:59.999-03:00` }
          })
          const posData = await fetchRotaExata('/posicoes', { where, limit: '5000', page: '0' })
          const posicoes: Posicao[] = Array.isArray(posData.data) ? posData.data : []

          if (posicoes.length < 2) continue

          const viagens = detectarViagens(posicoes, destinos)
          const viagemDia = viagens.find((vi: Viagem) => vi.data === dia)
          if (!viagemDia) continue

          // Upsert GPS_Viagens
          await supabase.from('GPS_Viagens').upsert({
            tecnico_nome: tecNome,
            data: dia,
            adesao_id: adesaoId,
            placa: placa || viagemDia.placa,
            descricao: descricao || viagemDia.descricao,
            saida_loja: viagemDia.saida_loja,
            chegada_cliente: viagemDia.chegada_cliente,
            saida_cliente: viagemDia.saida_cliente,
            retorno_loja: viagemDia.retorno_loja,
            eventos: viagemDia.eventos,
            posicoes_total: viagemDia.posicoes_total,
            km_total: viagemDia.km_total,
            ultima_posicao: viagemDia.ultima_posicao,
          }, { onConflict: 'tecnico_nome,data' })

          // Upsert resumo_diario_tecnico
          const metricas = calcularMetricas(viagemDia)
          await supabase.from('resumo_diario_tecnico').upsert({
            data: dia,
            tecnico_nome: tecNome,
            horas_dirigindo: metricas.horas_dirigindo,
            km_percorrido: metricas.km_percorrido,
            horas_no_cliente: metricas.horas_no_cliente,
            resumo: '',
            updated_at: new Date().toISOString(),
          }, { onConflict: 'data,tecnico_nome' })

          totalSalvos++
        } catch (e) {
          totalErros++
          const msg = `${tecNome} ${dia}: ${e instanceof Error ? e.message : String(e)}`
          if (erros.length < 20) erros.push(msg)
        }

        // Rate limit: 300ms entre chamadas ao Rota Exata
        await new Promise(r => setTimeout(r, 300))
      }
    }

    console.log(`[Backfill GPS] Concluido: ${totalSalvos} salvos, ${totalErros} erros`)

    return NextResponse.json({
      sucesso: true,
      periodo: { de, ate },
      dias: datas.length,
      tecnicos: vinculos.length,
      totalSalvos,
      totalErros,
      erros: erros.length > 0 ? erros : undefined,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Backfill GPS] Erro:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
