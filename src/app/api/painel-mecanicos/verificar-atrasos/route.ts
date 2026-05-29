import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { nomesBatem } from '@/lib/tecnico-utils'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export async function POST() {
  const supabase = getSupabase()
  const hoje = new Date().toISOString().split('T')[0]
  const mesAtual = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`

  // 1) Buscar técnicos
  const { data: tecs } = await supabase
    .from('portal_permissoes')
    .select('user_id, mecanico_tecnico_nome')
    .not('mecanico_tecnico_nome', 'is', null)
    .eq('mecanico_role', 'tecnico')
  if (!tecs || tecs.length === 0) return NextResponse.json({ ok: true, alertas: 0 })

  // 2) Buscar ordens ativas
  const { data: ordens } = await supabase
    .from('Ordem_Servico')
    .select('Id_Ordem, Status, Os_Cliente, Os_Tecnico, Os_Tecnico2, Previsao_Execucao, Cidade_Cliente')
    .not('Status', 'in', '("Concluída","Cancelada")')
    .not('Previsao_Execucao', 'is', null)
  if (!ordens) return NextResponse.json({ ok: true, alertas: 0 })

  // 3) Buscar alertas já existentes (para não duplicar)
  const { data: alertasExistentes } = await supabase
    .from('painel_alertas')
    .select('referencia_id, tecnico_nome, tipo')
    .eq('tipo', 'ordem_pendente')
    .in('status', ['aberto', 'contestado'])

  const alertaSet = new Set(
    (alertasExistentes || []).map((a: any) => `${a.tecnico_nome}::${a.referencia_id}`)
  )

  // 4) Buscar execuções já enviadas (técnico já preencheu)
  const { data: execucoes } = await supabase
    .from('os_tecnico_execucao')
    .select('id_ordem, tecnico_nome')
    .in('status', ['enviado', 'rascunho'])
  const execSet = new Set(
    (execucoes || []).map((e: any) => `${e.tecnico_nome}::${e.id_ordem}`)
  )

  // 5) Detectar atrasos e criar alertas
  const novosAlertas: any[] = []

  for (const tec of tecs) {
    const nome = tec.mecanico_tecnico_nome
    const ordensDoTecnico = ordens.filter(o =>
      nomesBatem(nome, o.Os_Tecnico) || nomesBatem(nome, o.Os_Tecnico2)
    )

    for (const os of ordensDoTecnico) {
      const prev = os.Previsao_Execucao?.trim()
      if (!prev || prev >= hoje) continue

      // Calcular dias de atraso
      const diffMs = new Date(hoje + 'T00:00:00').getTime() - new Date(prev + 'T00:00:00').getTime()
      const diasAtraso = Math.floor(diffMs / (1000 * 60 * 60 * 24))
      if (diasAtraso < 1 || diasAtraso > 5) continue

      // Já tem alerta aberto?
      const chave = `${nome}::${os.Id_Ordem}`
      if (alertaSet.has(chave)) continue

      // Já preencheu execução?
      if (execSet.has(chave)) continue

      const descricao = `OS #${os.Id_Ordem} - ${os.Os_Cliente}${os.Cidade_Cliente ? ` (${os.Cidade_Cliente})` : ''} — ${diasAtraso} dia(s) de atraso`

      novosAlertas.push({
        tecnico_nome: nome,
        tipo: 'ordem_pendente',
        descricao,
        referencia_id: String(os.Id_Ordem),
        data_inicio: prev,
        data_fim: null,
        mes_referencia: mesAtual,
        status: 'aberto',
        foto_url: null,
        alvo: 'individual',
      })

      alertaSet.add(chave)
    }
  }

  // 6) Inserir alertas (só aparecem na aba Alertas do Painel Mecânicos)
  if (novosAlertas.length > 0) {
    await supabase.from('painel_alertas').insert(novosAlertas)
  }

  return NextResponse.json({ ok: true, alertas: novosAlertas.length })
}
