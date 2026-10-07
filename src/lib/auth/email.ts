// Regras PURAS do e-mail de login (cadastro e troca de e-mail no Admin).
// Casos reais que motivaram: "caiqueoliveira.@novatratores.com" (ponto antes
// do @ e sem o .br) e "antonio.novatratoes@…" — o login nasce com um endereço
// que não existe e a pessoa nunca consegue recuperar a senha.

/** Erro que IMPEDE (o endereço não pode existir). null = formato ok. */
export function erroEmail(email: string): string | null {
  const e = String(email || '').trim()
  if (!e) return 'Informe o e-mail.'
  if (/\s/.test(e)) return 'O e-mail não pode ter espaços.'
  const partes = e.split('@')
  if (partes.length !== 2) return 'O e-mail precisa ter um @.'
  const [local, dominio] = partes
  if (!local) return 'Falta o nome antes do @.'
  if (local.startsWith('.') || local.endsWith('.')) return 'O e-mail não pode ter ponto logo antes ou logo depois do início (ex.: "nome.@…").'
  if (local.includes('..') || dominio.includes('..')) return 'O e-mail não pode ter dois pontos seguidos.'
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(local)) return 'O nome antes do @ tem caracteres inválidos.'
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(dominio)) return 'O domínio depois do @ está inválido.'
  return null
}

// Domínios digitados errado → o certo. Os da empresa são @novatratores.com.br.
const CORRECOES: Record<string, string> = {
  'novatratores.com': 'novatratores.com.br',
  'novatratoes.com.br': 'novatratores.com.br',
  'novatrators.com.br': 'novatratores.com.br',
  'novatratores.com.b': 'novatratores.com.br',
  'novatratores.br': 'novatratores.com.br',
  'gmail.con': 'gmail.com',
  'gmail.co': 'gmail.com',
  'gmail.com.br': 'gmail.com',
  'gmial.com': 'gmail.com',
  'gmal.com': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gamil.com': 'gmail.com',
  'hotmail.con': 'hotmail.com',
  'hotmal.com': 'hotmail.com',
  'hotmial.com': 'hotmail.com',
  'outlook.con': 'outlook.com',
}

/** Sugestão quando o domínio parece digitado errado ("Você quis dizer …?"); null se não há. */
export function sugestaoEmail(email: string): string | null {
  const e = String(email || '').trim().toLowerCase()
  const i = e.lastIndexOf('@')
  if (i < 1) return null
  const local = e.slice(0, i)
  const certo = CORRECOES[e.slice(i + 1)]
  if (certo) return `${local}@${certo}`
  // nome da empresa escrito errado em qualquer lugar do e-mail (ex.: antonio.novatratoes@gmail.com)
  const nome = local.match(/nova?trat[a-z]*/)
  if (nome && nome[0] !== 'novatratores') return `${local.replace(nome[0], 'novatratores')}@${e.slice(i + 1)}`
  return null
}

export function normalizarEmail(email: string): string {
  return String(email || '').trim().toLowerCase()
}
