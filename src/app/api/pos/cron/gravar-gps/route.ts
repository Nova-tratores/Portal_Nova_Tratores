import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/pos/supabase'
import { fetchRotaExata, getDestinos, detectarViagens, type Posicao, type Viagem, type Evento } from '@/lib/pos/rastreamento'

const CRON_SECRET = process.env.CRON_SECRET || ''

export const maxDuration = 300 // 5 min (Vercel Pro)

// ── Helpers para calcular métricas e gerar resumo ──
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

function fHora(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function fm(min: number): string {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return h > 0 ? `${h}h${m > 0 ? String(m).padStart(2, '0') : ''}` : `${m}min`
}

function gerarResumoAuto(viagem: Viagem, tecnicoNome: string): string {
  const eventos = viagem.eventos || []
  const partes: string[] = []

  if (viagem.saida_loja) {
    partes.push(`Técnico saiu da oficina às ${fHora(viagem.saida_loja)}`)
  }

  // Agrupa visitas (chegada + saída)
  for (let i = 0; i < eventos.length; i++) {
    const ev = eventos[i]
    if (ev.tipo === 'chegada_cliente') {
      const nome = ev.destino_nome || 'cliente'
      const proxSaida = eventos.slice(i + 1).find(e => e.tipo === 'saida_cliente' || e.tipo === 'retorno_loja')
      if (proxSaida) {
        const diff = (new Date(proxSaida.horario).getTime() - new Date(ev.horario).getTime()) / 60000
        partes.push(`Chegou em ${nome} às ${fHora(ev.horario)}, permaneceu ${fm(diff)}`)
      } else {
        partes.push(`Chegou em ${nome} às ${fHora(ev.horario)}`)
      }
    }
  }

  if (viagem.retorno_loja) {
    partes.push(`Retornou à oficina às ${fHora(viagem.retorno_loja)}`)
  }

  const metricas = calcularMetricas(viagem)
  if (metricas.km_percorrido > 0) {
    partes.push(`Total: ${metricas.km_percorrido} km, ${metricas.horas_dirigindo}h dirigindo, ${metricas.horas_no_cliente}h no cliente`)
  }

  return partes.join('. ') + '.'
}

export async function GET(req: NextRequest) {
  // Protege o endpoint — só roda via Vercel Cron ou com secret
  const authHeader = req.headers.get('authorization')
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const hoje = new Date().toISOString().split('T')[0]

    // 1. Busca todos os vinculos tecnico <-> veiculo
    const { data: vinculos } = await supabase
      .from('tecnico_veiculos')
      .select('tecnico_nome, adesao_id, placa, descricao')
    if (!vinculos || vinculos.length === 0) {
      return NextResponse.json({ msg: 'Nenhum vinculo tecnico-veiculo encontrado', data: hoje })
    }

    // 2. Busca destinos da Rota Exata
    const destinos = await getDestinos()

    // 3. Para cada tecnico, busca posicoes do dia e processa viagens
    const resultados: { tecnico: string; salvo: boolean; resumo_salvo?: boolean; erro?: string }[] = []

    for (const v of vinculos) {
      try {
        const where = JSON.stringify({
          adesao_id: v.adesao_id,
          dt_posicao: { $gte: `${hoje}T00:00:00.000-03:00`, $lte: `${hoje}T23:59:59.999-03:00` }
        })
        const posData = await fetchRotaExata('/posicoes', { where, limit: '5000', page: '0' })
        const posicoes: Posicao[] = Array.isArray(posData.data) ? posData.data : []

        if (posicoes.length < 2) {
          resultados.push({ tecnico: v.tecnico_nome, salvo: false, erro: 'Sem posicoes suficientes' })
          continue
        }

        const viagens = detectarViagens(posicoes, destinos)
        const viagemHoje = viagens.find((vi: Viagem) => vi.data === hoje)

        if (!viagemHoje) {
          resultados.push({ tecnico: v.tecnico_nome, salvo: false, erro: 'Sem viagem detectada' })
          continue
        }

        // 4. Upsert na tabela GPS_Viagens (tecnico_nome + data = unique)
        const { error } = await supabase
          .from('GPS_Viagens')
          .upsert({
            tecnico_nome: v.tecnico_nome,
            data: hoje,
            adesao_id: v.adesao_id,
            placa: v.placa || viagemHoje.placa,
            descricao: v.descricao || viagemHoje.descricao,
            saida_loja: viagemHoje.saida_loja,
            chegada_cliente: viagemHoje.chegada_cliente,
            saida_cliente: viagemHoje.saida_cliente,
            retorno_loja: viagemHoje.retorno_loja,
            eventos: viagemHoje.eventos,
            posicoes_total: viagemHoje.posicoes_total,
            km_total: viagemHoje.km_total,
            ultima_posicao: viagemHoje.ultima_posicao,
          }, { onConflict: 'tecnico_nome,data' })

        if (error) {
          resultados.push({ tecnico: v.tecnico_nome, salvo: false, erro: error.message })
          continue
        }

        // 5. Auto-salvar métricas + resumo no resumo_diario_tecnico
        const metricas = calcularMetricas(viagemHoje)

        // Verifica se já tem resumo manual (não sobrescrever se alguém editou)
        const { data: existente } = await supabase
          .from('resumo_diario_tecnico')
          .select('resumo, updated_at')
          .eq('data', hoje)
          .eq('tecnico_nome', v.tecnico_nome)
          .maybeSingle()

        const resumoManual = existente?.resumo && existente.resumo.trim()
        const resumoTexto = resumoManual ? existente.resumo : gerarResumoAuto(viagemHoje, v.tecnico_nome)

        const { error: resumoErr } = await supabase
          .from('resumo_diario_tecnico')
          .upsert({
            data: hoje,
            tecnico_nome: v.tecnico_nome,
            horas_dirigindo: metricas.horas_dirigindo,
            km_percorrido: metricas.km_percorrido,
            horas_no_cliente: metricas.horas_no_cliente,
            resumo: resumoTexto,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'data,tecnico_nome' })

        resultados.push({ tecnico: v.tecnico_nome, salvo: true, resumo_salvo: !resumoErr })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        resultados.push({ tecnico: v.tecnico_nome, salvo: false, erro: msg })
      }
    }

    const salvos = resultados.filter(r => r.salvo).length
    console.log(`[Cron GPS] ${hoje}: ${salvos}/${vinculos.length} tecnicos salvos`)

    return NextResponse.json({ data: hoje, total: vinculos.length, salvos, resultados })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Cron GPS] Erro:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
