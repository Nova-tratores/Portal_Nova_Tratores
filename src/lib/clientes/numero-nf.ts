// O sync do Omie grava o link da nota mas, na maioria das vezes, deixa o número
// vazio (OS e PV faturados). Dá pra recuperar o número sem ir à Omie:
//  - PV: o link é o DANFE copiado pro storage ("danfe_00008399.pdf") ou o PDF
//    do CDN da Omie, cujo nome é a chave de acesso da NF-e (44 dígitos);
//  - OS: a NFS-e está no cache `os_nfse` do dashboard de vendas.

/** Número da NF-e a partir do link do PDF (DANFE do storage ou chave de acesso). */
export function numeroNfDoLink(link: string | null | undefined): string | null {
  if (!link) return null
  const danfe = link.match(/danfe_(\d+)\.pdf/i)
  if (danfe) return danfe[1]
  // Chave: cUF(2) AAMM(4) CNPJ(14) mod(2) série(3) nNF(9) tpEmis(1) cNF(8) cDV(1)
  const chave = link.match(/(?:^|\/)(\d{44})\.pdf/i)
  if (chave) {
    const n = parseInt(chave[1].slice(25, 34), 10)
    return n > 0 ? String(n).padStart(8, '0') : null
  }
  return null
}

/** Número da NFS-e do cache (vem com zeros à esquerda: "0000000000064" → "64"). */
export function numeroNfse(n: string | null | undefined): string | null {
  const d = String(n || '').replace(/\D/g, '').replace(/^0+/, '')
  return d || null
}

/** Conta Omie do cache `os_nfse` a partir da empresa da pasta. */
export function contaOmieDaEmpresa(empresa: string | null | undefined): string {
  return /castro/i.test(String(empresa || '')) ? 'CASTRO' : 'NOVA'
}

/** Número da OS sem zeros à esquerda (chave de casamento com o cache). */
export function chaveOS(num: string | number | null | undefined): string {
  return String(num ?? '').trim().replace(/^0+/, '')
}
