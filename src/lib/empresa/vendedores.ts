// Vendedores na tela do diretor (/empresa → Comercial → Vendedores), José 11–12/11: "um cartão para cada vendedor e,
// ao clicar, informação do RH, faturamento, despesas, rotas com o carro, visitas no app e propostas"; "o carro fica
// dentro de cada vendedor: checklist, km, pendências — as informações do módulo Frota".
//
// QUEM APARECE (José, 12/11: "Pedro e Joaquim saíram; fique de olho na Administração do portal e no RH"):
//   a tabela `vendedores` marca todo mundo como ativo. Vale o cadastro de pessoas: entra quem está ATIVO no portal
//   (financeiro_usu.ativo) ou no RH (rh_funcionarios.status = 'ativo') e não está demitido/desativado em nenhum dos dois.
//   No RH, cargo que não é de venda (ex.: Pecista) fica de fora.
// Fontes: carro = último check-in no app (checkin_vendedor) ou vínculo (comercial_veiculos); km e rotas = frota_dias
// (rastreador); checklist = veiculo_checklist; pendências = frota_pendencias; documentos = frota_documentos;
// visitas = vw_visitas_detalhadas; negócios = negocios; despesas = Requisicao (solicitante = vendedor).
// Vendas e propostas vêm de /api/empresa/comercial (somadas na tela).
import { createClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { nomeVendedor } from './comercial'

export interface VisitaVend { data: string; cliente: string; propriedade: string; tipo: string; resumo: string; primeira: boolean
  lat: number | null; lng: number | null; precisao: number | null; proximos: string; proximoContato: string | null; foto: string | null; posVendas: boolean; retroativa: boolean }
export interface DiaRodado { data: string; km: number; inicio: string | null; fim: string | null; paradasCliente: number; litros: number; gasto: number }
export interface DespesaVend { id: number; data: string; tipo: string; titulo: string; valor: number; status: string; fotos: string[] }
export interface CarroVend {
  placa: string; modelo: string; foto: string | null; desde: string | null; origem: string
  km: number | null
  checklist: { data: string; quem: string; status: string; nota: number | null; alertas: string[]; km: number | null; token: string | null } | null
  pendencias: Array<{ titulo: string; data: string; gravidade: string | null }>
  documentos: Array<{ tipo: string; vence: string | null; vencido: boolean; arquivo: string | null }>
}
export interface VendedorApp {
  id: number; nome: string
  rh: { nome: string; cargo: string | null; departamento: string | null; admissao: string | null; status: string } | null
  portal: boolean
  carro: CarroVend | null
  km: number; diasRodou: number; dias: DiaRodado[]; litros: number; gastoCombustivel: number
  visitas: number; visitasSemana: number; clientes: number; primeiras: number; ultimaVisita: string | null; ultimas: VisitaVend[]
  negocios: { abertos: number; valor: number }
  despesas: { total: number; porTipo: Array<{ tipo: string; valor: number; qtd: number }>; itens: DespesaVend[] }
}
export interface DadosVendedores { dias: number; desde: string; vendedores: VendedorApp[]; geradoEm: string }

// "VOYAGE-SEB9J47", "SEB-9J47", "seb9j47" → "SEB9J47"
const placaLimpa = (p: string | null | undefined) => {
  const s = String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  const m = s.match(/[A-Z]{3}\d[A-Z0-9]\d{2}$/)
  return m ? m[0] : s
}
const iso = (d: Date) => d.toISOString().slice(0, 10)
const norm = (s: string | null | undefined) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
/** "Dougras Mogrs de Jesus Bonfim" → "dougras bonfim" (primeiro + último), para casar nomes escritos diferente */
const pu = (s: string | null | undefined) => { const p = norm(s).split(' ').filter((x) => x && !['de', 'da', 'do', 'dos', 'das', 'e'].includes(x)); return p.length > 1 ? `${p[0]} ${p[p.length - 1]}` : p[0] || '' }
const mesmaPessoa = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && (pu(a) === pu(b) || norm(a) === norm(b))
const CARGO_VENDA = /vend|comercial|gerente|diretor|s[oó]cio|consultor|represent/i

function rhCliente() {
  if (!process.env.RH_SUPABASE_URL || !process.env.RH_SUPABASE_SERVICE_KEY) return null
  return createClient(process.env.RH_SUPABASE_URL, process.env.RH_SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
}

export async function montarVendedores(dias = 30): Promise<DadosVendedores> {
  const hoje = new Date(), ini = new Date(hoje.getTime() - dias * 864e5), desde = iso(ini)
  const ini90 = iso(new Date(hoje.getTime() - 90 * 864e5))
  const semana = new Date(hoje.getTime() - 7 * 864e5).toISOString()
  const rh = rhCliente()
  const [vendR, usuR, rhR, checkR, vincR, placasR, visR, negR, reqR] = await Promise.all([
    supabaseAdmin.from('vendedores').select('id,nome,codigo,ativo,auth_uid,email'),
    supabaseAdmin.from('financeiro_usu').select('id,nome,email,ativo'),
    rh ? rh.from('rh_funcionarios').select('nome,email,status,portal_user_id,cargo,departamento,data_admissao') : Promise.resolve({ data: null }),
    supabaseAdmin.from('checkin_vendedor').select('vendedor_id,placa,data').order('data', { ascending: false }).limit(500),
    supabaseAdmin.from('comercial_veiculos').select('placa,descricao,vinculo_tipo,pessoa_id,ativo').eq('vinculo_tipo', 'vendedor').eq('ativo', true),
    supabaseAdmin.from('Placas').select('NumPlaca,modelo,imagem_url'),
    supabaseAdmin.from('vw_visitas_detalhadas').select('vendedor_id,data_visita,cliente_nome,propriedade_nome,propriedade_id,tipo,resumo,primeira_visita,deleted_at,duplicada_de,latitude,longitude,gps_accuracy,proximos_passos,data_proximo_contato,foto_path,acionar_pos_vendas,retroativa')
      .gte('data_visita', ini.toISOString()).is('deleted_at', null).order('data_visita', { ascending: false }).limit(5000),
    supabaseAdmin.from('negocios').select('vendedor_id,status,valor'),
    supabaseAdmin.from('Requisicao').select('id,solicitante,tipo,titulo,valor_despeza,data,status,foto_nf,foto_nf2,foto_nf3,foto_nf4,foto_nf5,recibo_fornecedor').gte('data', ini90).limit(5000),
  ])
  const usuarios = usuR.data || [], funcionarios = (rhR.data || []) as Array<{ nome: string; email: string | null; status: string; portal_user_id: string | null; cargo: string | null; departamento: string | null; data_admissao: string | null }>

  // quem ainda trabalha: portal + RH
  const candidatos = (vendR.data || []).filter((v) => !/teste|^vendedor \d/i.test(String(v.nome))).map((v) => {
    const u = usuarios.find((x) => v.auth_uid && x.id === v.auth_uid) || usuarios.find((x) => v.email && norm(x.email) === norm(v.email)) || usuarios.find((x) => mesmaPessoa(x.nome, v.nome))
    const f = funcionarios.find((x) => v.auth_uid && x.portal_user_id === v.auth_uid) || funcionarios.find((x) => u && x.portal_user_id === u.id) || funcionarios.find((x) => mesmaPessoa(x.nome, v.nome))
      || funcionarios.find((x) => { const a = norm(x.nome).split(' '), b = norm(v.nome).split(' '); return b.length > 1 && a[0] === b[0] && a.includes(b[b.length - 1]) })
    const desligado = (u && u.ativo === false) || (f && f.status !== 'ativo')
    const conhecido = !!u || !!f
    const foraDaVenda = f && f.status === 'ativo' && f.cargo && !CARGO_VENDA.test(f.cargo)
    return { v, u, f, entra: conhecido && !desligado && !foraDaVenda }
  }).filter((x) => x.entra)

  const fotoDe = new Map<string, { modelo: string; foto: string | null }>()
  for (const p of placasR.data || []) fotoDe.set(placaLimpa(p.NumPlaca as string), { modelo: String(p.modelo || ''), foto: (p.imagem_url as string) || null })
  // Carro do vendedor (José, 12/11: "o Dougras não está com o Fox" — vale o módulo Frota). Ordem:
  //   1) check-in de HOJE no app  2) responsável atual no Frota (frota_responsaveis sem fim)
  //   3) vínculo em comercial_veiculos  4) último check-in antigo
  const hojeIso = iso(hoje)
  const [respR, veicFrotaR] = await Promise.all([
    supabaseAdmin.from('frota_responsaveis').select('veiculo_id,motorista_nome,inicio').is('fim', null),
    supabaseAdmin.from('frota_veiculos').select('id,placa,modelo,descricao'),
  ])
  const veicPorId = new Map((veicFrotaR.data || []).map((v) => [String(v.id), v]))
  const carro = new Map<number, { placa: string; desde: string | null; desc: string; origem: string }>()
  for (const c of checkR.data || []) if (String(c.data) === hojeIso && !carro.has(Number(c.vendedor_id))) carro.set(Number(c.vendedor_id), { placa: placaLimpa(c.placa as string), desde: String(c.data), desc: String(c.placa || '').split('-')[0], origem: 'check-in de hoje no app' })
  for (const { v } of candidatos.map((x) => ({ v: x.v }))) {
    const id = Number(v.id)
    if (carro.has(id)) continue
    const resp = (respR.data || []).find((rr) => mesmaPessoa(rr.motorista_nome as string, v.nome))
    const ve = resp ? veicPorId.get(String(resp.veiculo_id)) : undefined
    if (ve) carro.set(id, { placa: placaLimpa(ve.placa as string), desde: (resp!.inicio as string) || null, desc: String(ve.descricao || ve.modelo || ''), origem: 'responsável no Frota' })
  }
  for (const v of vincR.data || []) { const id = Number(v.pessoa_id); if (id && !carro.has(id)) carro.set(id, { placa: placaLimpa(v.placa as string), desde: null, desc: String(v.descricao || ''), origem: 'vínculo do cadastro comercial' }) }
  for (const c of checkR.data || []) if (!carro.has(Number(c.vendedor_id))) carro.set(Number(c.vendedor_id), { placa: placaLimpa(c.placa as string), desde: String(c.data), desc: String(c.placa || '').split('-')[0], origem: 'último check-in no app' })

  // módulo Frota: dias rodados, checklist, pendências, documentos — só dos carros dos vendedores
  const placas = [...new Set(candidatos.map((x) => carro.get(Number(x.v.id))?.placa).filter((p): p is string => !!p))]
  const [diasR, chkR, pendR, veicR] = placas.length ? await Promise.all([
    supabaseAdmin.from('frota_dias').select('placa,data,km_total,km_odometro,hora_inicio,hora_fim,paradas_cliente,litros,gasto_combustivel').gte('data', desde).limit(5000),
    supabaseAdmin.from('veiculo_checklist').select('placa,tecnico_nome,status,score_confianca,alertas,km,fim_em,created_at,share_token').order('created_at', { ascending: false }).limit(300),
    supabaseAdmin.from('frota_pendencias').select('placa,titulo,data_ocorrencia,status,gravidade').eq('status', 'aberta').limit(1000),
    supabaseAdmin.from('frota_veiculos').select('id,placa'),
  ]) : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }]
  const idVeiculo = new Map<string, string>()
  for (const v of veicR.data || []) idVeiculo.set(placaLimpa(v.placa as string), String(v.id))
  const docsR = idVeiculo.size ? await supabaseAdmin.from('frota_documentos').select('veiculo_id,tipo,vigencia_fim,arquivo_url').in('veiculo_id', placas.map((p) => idVeiculo.get(p)).filter((x): x is string => !!x)) : { data: [] }

  const vis = (visR.data || []).filter((v) => !v.duplicada_de)
  const out: VendedorApp[] = candidatos.map(({ v, u, f }) => {
    const id = Number(v.id)
    const c = carro.get(id)
    const ft = c ? fotoDe.get(c.placa) : undefined
    const ds: DiaRodado[] = c ? (diasR.data || []).filter((x) => placaLimpa(x.placa as string) === c.placa).map((x) => ({
      data: String(x.data), km: Number(x.km_total) || 0, inicio: (x.hora_inicio as string) || null, fim: (x.hora_fim as string) || null,
      paradasCliente: Number(x.paradas_cliente) || 0, litros: Number(x.litros) || 0, gasto: Number(x.gasto_combustivel) || 0,
    })).sort((a, b) => a.data.localeCompare(b.data)) : []
    const kmOdo = c ? (diasR.data || []).filter((x) => placaLimpa(x.placa as string) === c.placa && x.km_odometro).sort((a, b) => String(b.data).localeCompare(String(a.data)))[0] : undefined
    const chk = c ? (chkR.data || []).find((x) => placaLimpa(x.placa as string) === c.placa) : undefined
    let alertas: string[] = []
    try { alertas = chk?.alertas ? (Array.isArray(chk.alertas) ? chk.alertas : JSON.parse(String(chk.alertas))) : [] } catch { alertas = [] }
    const vid = c ? idVeiculo.get(c.placa) : undefined
    const mv = vis.filter((x) => Number(x.vendedor_id) === id)
    const neg = (negR.data || []).filter((n) => Number(n.vendedor_id) === id && !/ganh|perd|fech|cancel/i.test(String(n.status || '')))
    const reqs = (reqR.data || []).filter((r) => mesmaPessoa(r.solicitante as string, v.nome) || (u && mesmaPessoa(r.solicitante as string, u.nome)))
    const itens: DespesaVend[] = reqs.map((r) => ({ id: Number(r.id), data: String(r.data || ''), tipo: String(r.tipo || 'Outros'), titulo: String(r.titulo || ''), valor: Number(r.valor_despeza) || 0, status: String(r.status || ''),
      fotos: [r.foto_nf, r.foto_nf2, r.foto_nf3, r.foto_nf4, r.foto_nf5, r.recibo_fornecedor].filter((x): x is string => typeof x === 'string' && /^https?:\/\//.test(x)) }))
      .sort((a, b) => b.data.localeCompare(a.data))
    const porTipo = new Map<string, { valor: number; qtd: number }>()
    for (const i of itens) { const t = porTipo.get(i.tipo) || { valor: 0, qtd: 0 }; t.valor += i.valor; t.qtd++; porTipo.set(i.tipo, t) }
    const hojeIso = iso(hoje)
    return {
      id, nome: nomeVendedor(v.nome as string) || String(v.nome),
      rh: f ? { nome: f.nome, cargo: f.cargo, departamento: f.departamento, admissao: f.data_admissao, status: f.status } : null,
      portal: !!u,
      carro: c ? {
        placa: c.placa, modelo: ft?.modelo || c.desc || '', foto: ft?.foto || null, desde: c.desde, origem: c.origem,
        km: Number(kmOdo?.km_odometro) || (chk?.km ? Number(chk.km) : null),
        checklist: chk ? { data: String(chk.fim_em || chk.created_at), quem: String(chk.tecnico_nome || ''), status: String(chk.status || ''), nota: chk.score_confianca != null ? Number(chk.score_confianca) : null, alertas, km: chk.km != null ? Number(chk.km) : null, token: (chk.share_token as string) || null } : null,
        pendencias: (pendR.data || []).filter((x) => placaLimpa(x.placa as string) === c.placa).map((x) => ({ titulo: String(x.titulo || ''), data: String(x.data_ocorrencia || ''), gravidade: (x.gravidade as string) || null })),
        documentos: (docsR.data || []).filter((x) => x.veiculo_id === vid).map((x) => ({ tipo: String(x.tipo || '').toUpperCase(), vence: (x.vigencia_fim as string) || null, vencido: !!x.vigencia_fim && String(x.vigencia_fim) < hojeIso, arquivo: (x.arquivo_url as string) || null })),
      } : null,
      km: Math.round(ds.reduce((a, d) => a + d.km, 0)), diasRodou: ds.filter((d) => d.km > 2).length, dias: ds,
      litros: Math.round(ds.reduce((a, d) => a + d.litros, 0)), gastoCombustivel: ds.reduce((a, d) => a + d.gasto, 0),
      visitas: mv.length, visitasSemana: mv.filter((x) => String(x.data_visita) >= semana).length,
      clientes: new Set(mv.map((x) => x.propriedade_id || x.cliente_nome)).size, primeiras: mv.filter((x) => x.primeira_visita).length,
      ultimaVisita: (mv[0]?.data_visita as string) || null,
      ultimas: mv.slice(0, 200).map((x) => ({ data: String(x.data_visita), cliente: String(x.cliente_nome || '').trim(), propriedade: String(x.propriedade_nome || '').trim(), tipo: String(x.tipo || ''), resumo: String(x.resumo || '').trim(), primeira: !!x.primeira_visita,
        lat: x.latitude != null ? Number(x.latitude) : null, lng: x.longitude != null ? Number(x.longitude) : null, precisao: x.gps_accuracy != null ? Math.round(Number(x.gps_accuracy)) : null,
        proximos: String(x.proximos_passos || '').trim(), proximoContato: (x.data_proximo_contato as string) || null,
        foto: x.foto_path ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/fotos-visitas/${x.foto_path}` : null,
        posVendas: !!x.acionar_pos_vendas, retroativa: !!x.retroativa })),
      negocios: { abertos: neg.length, valor: neg.reduce((a, n) => a + (Number(n.valor) || 0), 0) },
      despesas: { total: itens.reduce((a, i) => a + i.valor, 0), porTipo: [...porTipo.entries()].map(([tipo, t]) => ({ tipo, ...t })).sort((a, b) => b.valor - a.valor), itens: itens.slice(0, 40) },
    }
  })
  return { dias, desde, vendedores: out.sort((a, b) => b.visitas - a.visitas || a.nome.localeCompare(b.nome)), geradoEm: new Date().toISOString() }
}
