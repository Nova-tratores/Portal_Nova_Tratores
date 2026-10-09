// Regras PURAS para criar cliente no Omie (IncluirCliente) sem erro — usadas
// pela rota /api/clientes/criar e pelo formulário (pasta e POS).
//
// Conferido no Omie em 09/10/2026 (docs de /geral/clientes/ + cadastros feitos
// à mão na conta): limites razao_social 60 · nome_fantasia 100 · endereco 60 ·
// endereco_numero 60 · bairro 60 · complemento 60 · cidade 40 · estado 2 ·
// cep 10 · inscricao_estadual 20 · email 500. O cadastro manual sempre leva CEP,
// cidade "NOME (UF)" + cidade_ibge, país 1058 e tag Cliente; sem IE/endereço o
// Omie cria, mas a NOTA falha depois. O Omie copia o cliente sozinho para a
// outra empresa (Nova ↔ Castro), então criar em uma basta.

export const EMPRESAS_CLIENTE = ["Nova Tratores", "Castro Pecas"] as const;

export const LIMITES = {
  razao_social: 60, nome_fantasia: 100, endereco: 60, numero: 60, bairro: 60,
  complemento: 60, cidade: 40, inscricao_estadual: 20, email: 500,
} as const;

export const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];

export type FormNovoCliente = {
  empresa: string; cnpj_cpf: string; razao_social: string; nome_fantasia?: string
  email?: string; telefone?: string; cep?: string; endereco?: string; numero?: string
  complemento?: string; bairro?: string; cidade?: string; estado?: string; cidade_ibge?: string
  inscricao_estadual?: string; isento_ie?: boolean
}

export const soDigitos = (s: unknown) => String(s ?? "").replace(/\D/g, "");

/** "Castro Peças" / "castro pecas" → "Castro Pecas" (como o resto do portal grava). */
export function empresaCanonica(e: unknown): string | null {
  const s = String(e ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();
  if (s.startsWith("nova")) return "Nova Tratores";
  if (s.startsWith("castro")) return "Castro Pecas";
  return null;
}

export function cpfValido(cpf: string): boolean {
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  let s = 0;
  for (let i = 0; i < 9; i++) s += parseInt(cpf[i]) * (10 - i);
  let d1 = 11 - (s % 11); if (d1 >= 10) d1 = 0;
  if (d1 !== parseInt(cpf[9])) return false;
  s = 0;
  for (let i = 0; i < 10; i++) s += parseInt(cpf[i]) * (11 - i);
  let d2 = 11 - (s % 11); if (d2 >= 10) d2 = 0;
  return d2 === parseInt(cpf[10]);
}

export function cnpjValido(c: string): boolean {
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
  const calc = (len: number): number => {
    let pos = len - 7, sum = 0;
    for (let i = len; i >= 1; i--) { sum += parseInt(c[len - i]) * pos--; if (pos < 2) pos = 9; }
    const r = sum % 11; return r < 2 ? 0 : 11 - r;
  };
  if (calc(12) !== parseInt(c[12])) return false;
  return calc(13) === parseInt(c[13]);
}

export const documentoValido = (doc: string) => doc.length === 11 ? cpfValido(doc) : doc.length === 14 ? cnpjValido(doc) : false;

export function mascararDocumento(doc: string): string {
  if (doc.length === 14) return doc.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (doc.length === 11) return doc.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return doc;
}

/** Telefone BR → { ddd, numero } (aceita +55 na frente). */
export function separarTelefone(tel?: string): { ddd: string; numero: string } {
  let d = soDigitos(tel);
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  if (d.length < 10) return { ddd: "", numero: "" };
  return { ddd: d.slice(0, 2), numero: d.slice(2) };
}

const limpar = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();

/** Erros que impedem criar (mensagens prontas pra tela). Lista vazia = pode enviar. */
export function validarNovoCliente(f: FormNovoCliente): string[] {
  const erros: string[] = [];
  if (!empresaCanonica(f.empresa)) erros.push("Escolha a empresa (Nova Tratores ou Castro Peças).");
  const doc = soDigitos(f.cnpj_cpf);
  if (!doc) erros.push("CNPJ/CPF é obrigatório.");
  else if (!documentoValido(doc)) erros.push("CNPJ/CPF inválido — confira os dígitos (o Omie recusa documento inválido).");
  const razao = limpar(f.razao_social);
  if (!razao) erros.push("Razão social / nome é obrigatório.");
  else if (razao.length > LIMITES.razao_social) erros.push(`Razão social com ${razao.length} letras — o Omie aceita no máximo ${LIMITES.razao_social}. Abrevie (ex.: LTDA, CIA, AGRIC.).`);
  if (limpar(f.nome_fantasia).length > LIMITES.nome_fantasia) erros.push(`Nome fantasia passa de ${LIMITES.nome_fantasia} letras.`);
  const email = limpar(f.email);
  if (email && !/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(email)) erros.push("E-mail inválido (use um só, no formato nome@dominio.com).");
  const tel = soDigitos(f.telefone);
  if (tel && separarTelefone(f.telefone).numero === "") erros.push("Telefone incompleto — informe DDD + número.");
  const cep = soDigitos(f.cep);
  if (!cep) erros.push("CEP é obrigatório (sem ele a nota fiscal não sai).");
  else if (cep.length !== 8) erros.push("CEP deve ter 8 números.");
  const uf = limpar(f.estado).toUpperCase();
  if (!uf) erros.push("UF é obrigatória.");
  else if (!UFS.includes(uf)) erros.push(`UF "${uf}" não existe.`);
  if (!limpar(f.cidade)) erros.push("Cidade é obrigatória.");
  else if (limpar(f.cidade).replace(/\s*\([A-Z]{2}\)\s*$/, "").length > LIMITES.cidade - 5) erros.push("Nome da cidade muito longo.");
  if (!limpar(f.endereco)) erros.push("Endereço é obrigatório (sítio/fazenda também vale).");
  for (const [campo, rotulo] of [["endereco", "Endereço"], ["numero", "Número"], ["bairro", "Bairro"], ["complemento", "Complemento"]] as const) {
    const v = limpar(f[campo]);
    if (v.length > LIMITES[campo]) erros.push(`${rotulo} com ${v.length} letras — máximo ${LIMITES[campo]}.`);
  }
  const ie = limpar(f.inscricao_estadual);
  if (!f.isento_ie && !ie && doc.length === 14) erros.push("Inscrição estadual: informe o número ou marque \"Isento / não contribuinte\".");
  if (ie && ie.length > LIMITES.inscricao_estadual) erros.push("Inscrição estadual muito longa.");
  return erros;
}

/** Monta o `param` do IncluirCliente (chame depois de validar). */
export function paramIncluirCliente(f: FormNovoCliente): Record<string, unknown> {
  const doc = soDigitos(f.cnpj_cpf);
  const razao = limpar(f.razao_social);
  const uf = limpar(f.estado).toUpperCase();
  const cidadeNome = limpar(f.cidade).replace(/\s*\([A-Z]{2}\)\s*$/, "").toUpperCase();
  const { ddd, numero } = separarTelefone(f.telefone);
  const ie = limpar(f.inscricao_estadual);
  const p: Record<string, unknown> = {
    codigo_cliente_integracao: `CLI-${doc}`,
    razao_social: razao,
    nome_fantasia: (limpar(f.nome_fantasia) || razao).slice(0, LIMITES.nome_fantasia),
    cnpj_cpf: mascararDocumento(doc),
    pessoa_fisica: doc.length === 11 ? "S" : "N",
    cep: soDigitos(f.cep),
    endereco: limpar(f.endereco),
    endereco_numero: limpar(f.numero) || "S/N",
    estado: uf,
    // com o IBGE o Omie acha a cidade sem ambiguidade; senão vai o nome (formato do cadastro manual)
    cidade: `${cidadeNome} (${uf})`,
    codigo_pais: "1058",
    pesquisar_cep: "S", // completa o que faltar pelo CEP (não sobrescreve o preenchido)
    inativo: "N",
    tags: [{ tag: "Cliente" }],
  };
  if (soDigitos(f.cidade_ibge).length === 7) p.cidade_ibge = soDigitos(f.cidade_ibge);
  if (limpar(f.bairro)) p.bairro = limpar(f.bairro);
  if (limpar(f.complemento)) p.complemento = limpar(f.complemento);
  if (ddd) { p.telefone1_ddd = ddd; p.telefone1_numero = numero; }
  if (limpar(f.email)) p.email = limpar(f.email);
  if (ie && !f.isento_ie) { p.inscricao_estadual = ie; p.contribuinte = "S"; }
  else { p.inscricao_estadual = "ISENTO"; p.contribuinte = "N"; }
  if (doc.length === 11 && !ie) { delete p.inscricao_estadual; p.contribuinte = "N"; }
  return p;
}

/** Mensagem do Omie em português claro pra tela. */
export function mensagemErroOmie(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("cidade")) return `O Omie não reconheceu a cidade/UF. Confira o CEP e a cidade. (${msg})`;
  if (m.includes("cep")) return `O Omie recusou o CEP. Confira os 8 números. (${msg})`;
  if (m.includes("inscri")) return `O Omie recusou a inscrição estadual. Confira o número ou marque "Isento". (${msg})`;
  if (m.includes("e-mail") || m.includes("email")) return `O Omie recusou o e-mail. (${msg})`;
  if (m.includes("cnpj") || m.includes("cpf")) return `O Omie recusou o CNPJ/CPF. (${msg})`;
  return msg;
}
