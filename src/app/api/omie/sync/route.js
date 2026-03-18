'use server'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export async function POST() {
  const OMIE_APP_KEY = process.env.OMIE_APP_KEY
  const OMIE_APP_SECRET = process.env.OMIE_APP_SECRET

  if (!OMIE_APP_KEY || !OMIE_APP_SECRET) {
    return NextResponse.json({ success: false, error: 'Chaves Omie não configuradas' }, { status: 500 })
  }

  let pagina = 1
  let totalPaginas = 1
  let sincronizados = 0

  try {
    while (pagina <= totalPaginas) {
      const response = await fetch("https://app.omie.com.br/api/v1/geral/clientes/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          call: "ListarClientes",
          app_key: OMIE_APP_KEY,
          app_secret: OMIE_APP_SECRET,
          param: [{ pagina, registros_por_pagina: 100, apenas_importado_api: "N" }]
        })
      })

      const json = await response.json()
      if (!json.clientes_cadastro) break

      totalPaginas = json.total_de_paginas || 1

      const clientesFormatados = json.clientes_cadastro.map(c => ({
        nome: c.nome_fantasia || c.razao_social,
        cppf_cnpj: c.cnpj_cpf,
        inscricao: c.inscricao_estadual || "",
        cidade: c.cidade,
        endereco: c.endereco,
        bairro: c.bairro,
        cep: c.cep,
        num_telefone: c.telefone1_numero ? `(${c.telefone1_ddd || ''}) ${c.telefone1_numero}` : "",
        email: c.email,
        id_omie: c.codigo_cliente_omie
      }))

      const { error } = await supabase
        .from('Clientes')
        .upsert(clientesFormatados, { onConflict: 'id_omie' })

      if (error) throw error

      sincronizados += clientesFormatados.length
      if (pagina >= totalPaginas) break
      pagina++
    }
    return NextResponse.json({ success: true, count: sincronizados })
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
