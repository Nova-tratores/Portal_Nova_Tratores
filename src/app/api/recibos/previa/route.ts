// Prévia do PDF sem gravar nada (POST com os dados da tela + modelo). Sai marcada "PRÉVIA" e sem QR
// (mostrar_qr: true põe um QR de exemplo — página de teste dos modelos).
import { guardarRecibos } from '@/lib/recibos/guarda'
import { gerarPdfRecibo } from '@/lib/recibos/pdf'
import { assinaturaDe, dadosEmpresa, nomeUsuario } from '@/lib/recibos/server'
import { validarRecibo, type ModeloRecibo } from '@/lib/recibos/tipos'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: Request) {
  const g = await guardarRecibos(req)
  if (g.resposta) return g.resposta
  const corpo = await req.json().catch(() => ({}))
  let dados
  try { dados = validarRecibo(corpo) } catch (e) {
    return Response.json({ erro: (e as Error).message }, { status: 400 })
  }
  const modelo = ([1, 2, 3].includes(Number(corpo?.modelo)) ? Number(corpo.modelo) : 1) as ModeloRecibo
  try {
    const [emp, ass, nome] = await Promise.all([dadosEmpresa(dados.empresa), assinaturaDe(g.auth.userId), nomeUsuario(g.auth.userId)])
    const pdf = await gerarPdfRecibo({ ...dados, numero: null, token: corpo?.mostrar_qr ? 'exemplo-do-qr' : null, assina_nome: nome }, emp, modelo, ass)
    return new Response(new Uint8Array(pdf), { headers: { 'Content-Type': 'application/pdf' } })
  } catch (e) {
    return Response.json({ erro: (e as Error).message }, { status: 500 })
  }
}
