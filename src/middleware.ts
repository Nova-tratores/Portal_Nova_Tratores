import { NextResponse, type NextRequest } from 'next/server'

// Resgate das etiquetas de peça impressas entre 25 e 26/08/2026.
//
// Naquela janela o QR foi gravado com o endereço TODO em maiúsculas (tentativa
// de encolher o código pelo modo alfanumérico). Domínio e esquema ignoram
// caixa, mas rota do Next não: essas etiquetas apontam pra /P/<uuid>, que não
// existe, e davam 404 ao escanear. Elas já estão coladas em peça no estoque —
// não dá pra reimprimir todas.
//
// POR QUE AQUI E NÃO EM next.config.redirects: lá o `source` casa ignorando a
// caixa, então "/P/:id" pega também "/p/:id" e o redirect vira laço
// (ERR_TOO_MANY_REDIRECTS). Aqui a comparação é `startsWith` de string, que
// respeita a caixa: só o caminho realmente maiúsculo é desviado, e o normal
// passa sem tocar em nada.
//
// Pode sair quando não houver mais etiqueta daquela janela em circulação.
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (pathname.startsWith('/P/')) {
    const url = req.nextUrl.clone()
    // só o prefixo: o UUID segue como está (a rota valida com regex /i e a
    // coluna é `uuid`, que ignora a caixa)
    url.pathname = `/p/${pathname.slice(3)}`
    return NextResponse.redirect(url)
  }
  // QR da garantia por trator (adesivo de 30 mm): o QR vai em MAIÚSCULAS para
  // caber em 29 × 29 (modo alfanumérico). /GARANTIA/K7P2QX → /garantia/K7P2QX,
  // onde mora a página (e o service worker que guarda ela sem internet).
  if (pathname === '/GARANTIA' || pathname.startsWith('/GARANTIA/')) {
    const url = req.nextUrl.clone()
    url.pathname = `/garantia${pathname.slice(9)}`
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

// Escopo mínimo: o matcher também casa sem distinguir caixa, então ele deixa
// passar "/p/..." por aqui — e a função acima simplesmente não faz nada nesses.
export const config = { matcher: ['/P/:path*', '/GARANTIA/:path*'] }
