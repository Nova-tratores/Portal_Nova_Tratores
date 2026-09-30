// Rede de segurança do Tratorilson no WhatsApp: ele NÃO pode dizer ao cliente
// o que "não pode/não consegue" fazer nem mandar procurar outro setor. Quando
// a IA mesmo assim responde assim, a rota troca a resposta por "vou confirmar
// com a equipe" e abre uma pergunta pros usuários do portal (a resposta deles
// vira regra na memória — da próxima vez ele sabe).
//
// Só pega RECUSA/REDIRECIONAMENTO. Frases legítimas do roteiro ("não consigo
// ler a foto, pode digitar o número?") ficam de fora.

const PADROES: RegExp[] = [
  /n[ãa]o (posso|consigo|tenho como|podemos|conseguimos) (te )?(passar|fornecer|informar|dar|repassar|ajudar com|ajudar nisso|ajudar nessa|atender|resolver|tratar)/i,
  /n[ãa]o (tenho|temos) (acesso|autoriza[çc][ãa]o|essa informa[çc][ãa]o|esse (contato|n[úu]mero|dado)|como (te )?(passar|ajudar))/i,
  /n[ãa]o (é|e) poss[íi]vel (passar|fornecer|informar|dar|atender|ajudar)/i,
  /(entre|entrar|entrando) em contato (diretamente )?com (o|a|nosso|nossa|nossa central|a central|o setor|o departamento)/i,
  /(procure|procurar|consulte|consultar|verifique|verificar) (o|a|no|na|nosso|nossa) (setor|departamento|central|financeiro|hist[óo]rico)/i,
  /recomendo que (voc[êe] )?(entre em contato|procure|consulte)/i,
  /(s[óo]|somente|apenas) (posso|consigo) ajudar com/i,
  /posso ajudar com (outra|qualquer outra|alguma outra)/i,
  /fora do (meu|nosso) (escopo|alcance|atendimento)/i,
  /n[ãa]o (faz|fazem) parte do (meu|nosso) atendimento/i,
  /infelizmente,? n[ãa]o (posso|consigo|tenho|podemos|conseguimos)/i,
  /n[ãa]o (sei|saberia) (te )?(informar|dizer|responder)/i,
];

/** A resposta diz ao cliente que "não pode/não consegue" ou o manda procurar outro setor? */
export function pareceRecusa(texto: string): boolean {
  const t = String(texto || '');
  if (!t.trim()) return false;
  return PADROES.some((re) => re.test(t));
}

/** Pergunta que vai pros usuários do portal quando a IA tentou recusar. */
export function perguntaDaRecusa(pedidoDoCliente: string): string {
  const p = String(pedidoDoCliente || '').trim().slice(0, 300);
  return `O cliente pediu: "${p}". Eu não sei como atender isso — o que devo responder ou fazer? (Se for contato/telefone de algum setor, me passe o número e o nome de quem atende.)`;
}
