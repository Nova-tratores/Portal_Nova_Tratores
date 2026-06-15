// =============================================================================
// API: detalhe (drill-down) dos movimentos do DRE consolidado para um mes/ano e
// classificacao. Port FIEL de GET /api/dre/detalhe do server.js
// (linhas 3175-3234). Usado pelo modal quando o usuario clica numa celula de
// mes na tabela DRE. Le do cache (dre_cache) ja populado, filtra intercompany
// (default: exclui) e por classificacao (tipo/grupo/conta).
// =============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/dre-financeiro/supabase'
import { EMPRESAS_GRUPO_CNPJ } from '@/lib/dre-financeiro/omie-api'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  if (!supabase) return NextResponse.json({ erro: 'Supabase nao configurado' }, { status: 500 })
  try {
    const sp = request.nextUrl.searchParams
    const ano = parseInt(sp.get('ano') || '', 10)
    const mes = parseInt(sp.get('mes') || '', 10)
    if (!ano || !mes || mes < 1 || mes > 12) return NextResponse.json({ erro: 'ano/mes invalidos' }, { status: 400 })
    const cTipoData = sp.get('tipo_data') === '2' ? '2' : '1'
    const contaQuery = (sp.get('conta_omie') || 'consolidado').toLowerCase()
    // Filtros opcionais por classificacao
    const filtroTipo = sp.get('dre_tipo') || null
    const filtroGrupo = sp.get('dre_grupo') || null
    const filtroConta = sp.get('dre_conta') || null
    // Exclui ou inclui intercompany (default: exclui, como na DRE consolidada)
    const incluiIntercompany = sp.get('intercompany') === '1'

    // Quais contas precisamos buscar
    const contasParaBuscar = contaQuery === 'consolidado' ? ['nova', 'castro'] : [contaQuery]

    // Le do cache (ja deve estar populado)
    const { data: cacheRows, error } = await supabase.from('dre_cache')
      .select('conta_omie,movimentos')
      .eq('ano', ano).eq('mes', mes).eq('c_tipo_data', cTipoData)
      .in('conta_omie', contasParaBuscar)
    if (error) throw error

    let movimentos: any[] = []
    ;(cacheRows || []).forEach((r: any) => {
      ;(r.movimentos || []).forEach((m: any) => movimentos.push({ ...m, _conta_omie: r.conta_omie }))
    })

    // Filtra intercompany
    if (!incluiIntercompany) {
      const norm = (s: any) => String(s || '').replace(/\D/g, '')
      const cnpjCastro = EMPRESAS_GRUPO_CNPJ.castro
      const cnpjNova = EMPRESAS_GRUPO_CNPJ.nova
      movimentos = movimentos.filter((m) => {
        if (m._conta_omie === 'nova') return norm(m.cnpj_cpf) !== cnpjCastro
        if (m._conta_omie === 'castro') return norm(m.cnpj_cpf) !== cnpjNova
        return true
      })
    }

    // Filtra por classificacao
    if (filtroTipo) movimentos = movimentos.filter((m) => m.dreTipo === filtroTipo)
    if (filtroGrupo) movimentos = movimentos.filter((m) => m.dreGrupo === filtroGrupo)
    if (filtroConta) movimentos = movimentos.filter((m) => m.dreConta === filtroConta)

    // Ordena por valor absoluto desc (interessante explorar os maiores)
    movimentos.sort((a, b) => Math.abs(Number(b.valor) || 0) - Math.abs(Number(a.valor) || 0))

    const total = movimentos.reduce((s, m) => s + (Number(m.valor) || 0), 0)
    return NextResponse.json({
      ano, mes, cTipoData, conta_omie: contaQuery,
      filtros: { dre_tipo: filtroTipo, dre_grupo: filtroGrupo, dre_conta: filtroConta, intercompany: incluiIntercompany },
      total, count: movimentos.length, movimentos,
    })
  } catch (e: any) {
    console.error('dre/detalhe:', e)
    return NextResponse.json({ erro: e.message }, { status: 500 })
  }
}
