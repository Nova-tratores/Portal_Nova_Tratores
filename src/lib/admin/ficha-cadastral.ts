// Ficha de atualização cadastral do colaborador (José, 09/11/2026: "dentro de
// administração, vamos fazer essa ficha cadastral… uma aba lá em cada usuário").
// Os campos ficam aqui num lugar só: a aba do /admin desenha a partir desta lista
// e a impressão (com a logo) também. Os dados vão em usuario_ficha_cadastral.dados (jsonb).

export type TipoCampo = 'texto' | 'data' | 'opcoes' | 'multi' | 'lista' | 'longo' | 'cep'

export interface Campo {
  k: string
  l: string
  t?: TipoCampo
  /** opções de 'opcoes' (uma) ou 'multi' (várias) */
  o?: string[]
  /** largura na grade: 1 (padrão), 2 ou 3 (linha inteira) */
  w?: 1 | 2 | 3
  ph?: string
  /** só aparece quando outro campo tem um destes valores */
  se?: { k: string; v: string[] }
  /** máscara simples */
  m?: 'cpf' | 'tel' | 'cep'
  /** campo de saúde (nas listas fica num bloco à parte e na impressão numa linha de baixo) */
  saude?: boolean
  /** dado sensível: só Dev (ou a própria pessoa) vê — José, 09/11/2026 */
  sens?: boolean
}

export interface Secao {
  id: string
  titulo: string
  nota?: string
  campos?: Campo[]
  /** seção inteira sensível (saúde, banco) */
  sens?: boolean
  /** seção de lista (filhos, dependentes): colunas de cada linha */
  lista?: { k: string; colunas: Campo[]; novo: string }
}

const CASADO = { k: 'estado_civil', v: ['Casado(a)', 'União estável'] }

const SANGUE = ['A+', 'A−', 'B+', 'B−', 'AB+', 'AB−', 'O+', 'O−', 'Não sabe']

/** saúde de cada familiar (José, 09/11/2026: "coisas da saúde, coloca nos familiares também") */
const saudeFamiliar = (p = '', se?: Campo['se']): Campo[] => [
  { k: p + 'tipo_sanguineo', l: 'Tipo sanguíneo', t: 'opcoes', o: SANGUE, w: 3, saude: true, se },
  { k: p + 'alergias', l: 'Alergias', saude: true, se },
  { k: p + 'condicoes', l: 'Condição de saúde', ph: 'pressão alta, diabetes, asma…', saude: true, se },
  { k: p + 'medicamentos', l: 'Remédio de uso contínuo', saude: true, se },
  { k: p + 'pcd', l: 'Deficiência (PcD)', ph: 'não / qual', saude: true, se },
  { k: p + 'plano', l: 'Está no plano de saúde?', t: 'opcoes', o: ['Sim', 'Não'], saude: true, se },
]

export const SECOES: Secao[] = [
  {
    id: 'pessoais', titulo: 'Dados pessoais',
    campos: [
      { k: 'nome_completo', l: 'Nome completo', w: 2 },
      { k: 'nascimento', l: 'Data de nascimento', t: 'data' },
      { k: 'apelido', l: 'Como gosta de ser chamado(a)' },
      { k: 'naturalidade', l: 'Naturalidade (cidade / UF)' },
      { k: 'nacionalidade', l: 'Nacionalidade', ph: 'Brasileira' },
      { k: 'mae', l: 'Nome da mãe' },
      { k: 'pai', l: 'Nome do pai' },
      { k: 'cargo', l: 'Cargo / setor' },
      { k: 'sexo', l: 'Sexo', t: 'opcoes', o: ['Masculino', 'Feminino', 'Prefiro não informar'], w: 3 },
      { k: 'raca', l: 'Raça / cor (eSocial)', t: 'opcoes', o: ['Branca', 'Preta', 'Parda', 'Amarela', 'Indígena'], w: 3 },
      { k: 'escolaridade', l: 'Escolaridade', t: 'opcoes', w: 3, o: ['Fundamental incompleto', 'Fundamental', 'Médio incompleto', 'Médio', 'Técnico', 'Superior incompleto', 'Superior', 'Pós-graduação'] },
      { k: 'formacao', l: 'Curso / formação', w: 3 },
    ],
  },
  {
    id: 'documentos', titulo: 'Documentos',
    campos: [
      { k: 'cpf', l: 'CPF', m: 'cpf', sens: true },
      { k: 'rg', l: 'RG / órgão / UF', sens: true },
      { k: 'pis', l: 'PIS / NIS', sens: true },
      { k: 'cnh', l: 'CNH nº', sens: true },
      { k: 'cnh_categoria', l: 'Categoria da CNH', t: 'opcoes', o: ['A', 'B', 'AB', 'C', 'D', 'E', 'Não tem'] },
      { k: 'cnh_validade', l: 'Validade da CNH', t: 'data' },
      { k: 'titulo_eleitor', l: 'Título de eleitor', sens: true },
    ],
  },
  {
    id: 'endereco', titulo: 'Endereço e contato',
    campos: [
      { k: 'cep', l: 'CEP', t: 'cep', m: 'cep', ph: 'busca o endereço' },
      { k: 'rua', l: 'Rua / avenida', w: 2 },
      { k: 'numero', l: 'Número' },
      { k: 'complemento', l: 'Complemento' },
      { k: 'bairro', l: 'Bairro' },
      { k: 'cidade', l: 'Cidade' },
      { k: 'uf', l: 'UF' },
      { k: 'referencia', l: 'Ponto de referência', w: 2 },
      { k: 'moradia', l: 'Moradia', t: 'opcoes', o: ['Própria', 'Alugada', 'Cedida', 'Com familiares'], w: 3 },
      { k: 'transporte', l: 'Como vem trabalhar', t: 'opcoes', o: ['Carro', 'Moto', 'Ônibus', 'Bicicleta / a pé', 'Carona'], w: 3 },
      { k: 'celular', l: 'Celular / WhatsApp', m: 'tel' },
      { k: 'telefone_recado', l: 'Telefone para recado', m: 'tel' },
      { k: 'recado_com', l: 'Recado com (nome)' },
      { k: 'email_pessoal', l: 'E-mail pessoal', w: 2 },
    ],
  },
  {
    id: 'familia', titulo: 'Estado civil e cônjuge',
    campos: [
      { k: 'estado_civil', l: 'Estado civil', t: 'opcoes', w: 3, o: ['Solteiro(a)', 'Casado(a)', 'União estável', 'Divorciado(a)', 'Separado(a)', 'Viúvo(a)'] },
      { k: 'conjuge_nome', l: 'Nome do(a) esposo(a) / companheiro(a)', w: 2, se: CASADO },
      { k: 'conjuge_nascimento', l: 'Data de nascimento', t: 'data', se: CASADO },
      { k: 'conjuge_cpf', l: 'CPF', m: 'cpf', se: CASADO, sens: true },
      { k: 'conjuge_telefone', l: 'Telefone', m: 'tel', se: CASADO },
      { k: 'conjuge_profissao', l: 'Profissão', se: CASADO },
      { k: 'casamento_data', l: 'Data do casamento / união', t: 'data', se: CASADO },
      { k: 'conjuge_trabalha_aqui', l: 'Trabalha na Nova Tratores?', t: 'opcoes', o: ['Não', 'Sim'], w: 2, se: CASADO },
      ...saudeFamiliar('conjuge_', CASADO),
    ],
  },
  {
    id: 'filhos', titulo: 'Filhos',
    nota: 'Filhos até 14 anos podem dar direito a salário-família (certidão de nascimento e cartão de vacina).',
    lista: {
      k: 'filhos', novo: 'Adicionar filho(a)',
      colunas: [
        { k: 'nome', l: 'Nome completo', w: 2 },
        { k: 'nascimento', l: 'Data de nascimento', t: 'data' },
        { k: 'cpf', l: 'CPF', m: 'cpf', sens: true },
        { k: 'dependente_ir', l: 'Dependente no IR?', t: 'opcoes', o: ['Sim', 'Não'] },
        ...saudeFamiliar(),
      ],
    },
  },
  {
    id: 'dependentes', titulo: 'Outros dependentes',
    nota: 'Pais, enteados ou outros que dependem do colaborador.',
    lista: {
      k: 'dependentes', novo: 'Adicionar dependente',
      colunas: [
        { k: 'nome', l: 'Nome completo', w: 2 },
        { k: 'parentesco', l: 'Parentesco' },
        { k: 'nascimento', l: 'Data de nascimento', t: 'data' },
        { k: 'cpf', l: 'CPF', m: 'cpf', sens: true },
        ...saudeFamiliar(),
      ],
    },
  },
  {
    id: 'emergencia', titulo: 'Contato de emergência',
    campos: [
      { k: 'emerg1_nome', l: 'Nome' },
      { k: 'emerg1_parentesco', l: 'Parentesco' },
      { k: 'emerg1_tel', l: 'Telefone', m: 'tel' },
      { k: 'emerg2_nome', l: 'Nome (2º contato)' },
      { k: 'emerg2_parentesco', l: 'Parentesco' },
      { k: 'emerg2_tel', l: 'Telefone', m: 'tel' },
    ],
  },
  {
    id: 'saude', titulo: 'Saúde do colaborador', sens: true,
    nota: 'Opcional. Dado sensível (LGPD): usado só em emergência. A saúde do cônjuge, filhos e dependentes fica em cada um deles.',
    campos: [
      { k: 'tipo_sanguineo', l: 'Tipo sanguíneo', t: 'opcoes', o: SANGUE, w: 3 },
      { k: 'condicoes', l: 'Condições de saúde', t: 'multi', w: 3, o: ['Nenhuma', 'Pressão alta', 'Diabetes', 'Asma / bronquite', 'Epilepsia / convulsão', 'Problema cardíaco', 'Problema de coluna'] },
      { k: 'condicoes_outra', l: 'Outra condição' },
      { k: 'alergias', l: 'Alergias (remédio, alimento, picada…)', w: 2 },
      { k: 'medicamentos', l: 'Medicamento de uso contínuo', w: 2 },
      { k: 'pcd', l: 'Pessoa com deficiência (PcD)', ph: 'não / qual' },
      { k: 'plano_saude', l: 'Plano de saúde / convênio' },
      { k: 'restricoes', l: 'Restrição para alguma atividade', w: 2 },
    ],
  },
  {
    id: 'uniforme', titulo: 'Uniforme e EPI',
    campos: [
      { k: 'camisa', l: 'Camisa', t: 'opcoes', o: ['P', 'M', 'G', 'GG', 'XG'] },
      { k: 'calca', l: 'Calça (nº)' },
      { k: 'calcado', l: 'Calçado / botina (nº)' },
      { k: 'oculos', l: 'Usa óculos de grau?', t: 'opcoes', o: ['Sim', 'Não'] },
    ],
  },
  {
    id: 'banco', titulo: 'Dados bancários', sens: true,
    campos: [
      { k: 'banco', l: 'Banco' },
      { k: 'agencia', l: 'Agência' },
      { k: 'conta', l: 'Conta' },
      { k: 'conta_tipo', l: 'Tipo de conta', t: 'opcoes', o: ['Corrente', 'Poupança', 'Salário'] },
      { k: 'pix', l: 'Chave PIX', w: 2 },
    ],
  },
  {
    id: 'voce', titulo: 'Conhecendo você',
    nota: 'Opcional.',
    campos: [
      { k: 'hobbies', l: 'Hobbies / tempo livre', w: 2 },
      { k: 'time', l: 'Time do coração' },
      { k: 'habilidades', l: 'Cursos e habilidades que a empresa ainda não conhece', t: 'longo', w: 3 },
    ],
  },
  {
    id: 'lgpd', titulo: 'Autorização (LGPD)',
    nota: 'O colaborador autoriza a Nova Tratores a usar estes dados (dele e dos dependentes) para cadastro, folha, eSocial/IR/FGTS, benefícios e emergências — Lei 13.709/2018. Saúde é opcional.',
    campos: [
      { k: 'lgpd', l: 'Assinou a autorização?', t: 'opcoes', o: ['Sim, assinou', 'Ainda não'] },
      { k: 'lgpd_data', l: 'Data da assinatura', t: 'data' },
    ],
  },
]

export type Dados = Record<string, any>

/** campo sensível? (saúde sempre é) */
export const campoSensivel = (s: Secao, c: Campo) => !!(s.sens || c.sens || c.saude)

/**
 * Tira os dados sensíveis (quem tem acesso parcial não recebe nem vê).
 * Linhas de lista ficam, só sem as colunas sensíveis.
 */
export function semSensiveis(d: Dados): Dados {
  const o: Dados = { ...d }
  for (const s of SECOES) {
    for (const c of s.campos || []) if (campoSensivel(s, c)) delete o[c.k]
    if (s.lista && Array.isArray(o[s.lista.k])) {
      const sensK = s.lista.colunas.filter((c) => campoSensivel(s, c)).map((c) => c.k)
      o[s.lista.k] = o[s.lista.k].map((l: Dados) => { const n = { ...l }; for (const k of sensK) delete n[k]; return n })
    }
  }
  return o
}

/**
 * Junta o que veio de quem tem acesso parcial com o que já estava salvo:
 * os campos sensíveis salvos continuam (ele não os vê, então não pode apagá-los).
 * Linhas de lista casam pelo _id.
 */
export function manterSensiveis(novo: Dados, antigo: Dados): Dados {
  const o: Dados = { ...novo }
  for (const s of SECOES) {
    for (const c of s.campos || []) if (campoSensivel(s, c)) { if (c.k in antigo) o[c.k] = antigo[c.k]; else delete o[c.k] }
    if (s.lista && Array.isArray(o[s.lista.k])) {
      const sensK = s.lista.colunas.filter((c) => campoSensivel(s, c)).map((c) => c.k)
      const velhas: Dados[] = Array.isArray(antigo[s.lista.k]) ? antigo[s.lista.k] : []
      o[s.lista.k] = o[s.lista.k].map((l: Dados) => {
        const v = l._id ? velhas.find((x) => x._id === l._id) : null
        const n = { ...l }
        for (const k of sensK) { if (v && k in v) n[k] = v[k]; else delete n[k] }
        return n
      })
    }
  }
  return o
}

/** "12/03/2015" ← "2015-03-12" */
export function dataBR(iso?: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso || ''
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

/** idade em anos completos (null se não tiver data) */
export function idade(iso?: string, hoje = new Date()): number | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number)
  let i = hoje.getFullYear() - a
  if (hoje.getMonth() + 1 < m || (hoje.getMonth() + 1 === m && hoje.getDate() < d)) i--
  return i >= 0 && i < 130 ? i : null
}

export function mascarar(v: string, m?: Campo['m']): string {
  const n = v.replace(/\D/g, '')
  if (m === 'cpf') return n.slice(0, 11).replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  if (m === 'cep') return n.slice(0, 8).replace(/(\d{5})(\d)/, '$1-$2')
  if (m === 'tel') {
    const t = n.slice(0, 11)
    if (t.length <= 2) return t
    if (t.length <= 6) return `(${t.slice(0, 2)}) ${t.slice(2)}`
    if (t.length <= 10) return `(${t.slice(0, 2)}) ${t.slice(2, 6)}-${t.slice(6)}`
    return `(${t.slice(0, 2)}) ${t.slice(2, 7)}-${t.slice(7)}`
  }
  return v
}

export function campoVisivel(c: Campo, d: Dados): boolean {
  return !c.se || c.se.v.includes(d[c.se.k])
}

/** quanto da ficha está preenchido (só os campos visíveis, sem os opcionais de saúde/você) */
export function progresso(d: Dados, comSensiveis = true): { feitos: number; total: number } {
  let feitos = 0, total = 0
  for (const s of SECOES) {
    if (!s.campos || s.id === 'saude' || s.id === 'voce') continue
    for (const c of s.campos) {
      if (!campoVisivel(c, d) || c.saude || (!comSensiveis && campoSensivel(s, c))) continue
      total++
      const v = d[c.k]
      if (Array.isArray(v) ? v.length : String(v ?? '').trim()) feitos++
    }
  }
  return { feitos, total }
}

const esc = (s: any) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

function valorTexto(c: Campo, v: any): string {
  if (Array.isArray(v)) return v.join(', ')
  if (c.t === 'data') return dataBR(v)
  return String(v ?? '')
}

/**
 * Página A4 pronta para imprimir, com a logo. Com `dados` vazio sai a ficha em
 * branco (opções viram quadradinhos para marcar à mão).
 */
export function htmlImpressao(d: Dados, origem: string): string {
  const emBranco = !Object.keys(d).some((k) => !k.startsWith('_') && (Array.isArray(d[k]) ? d[k].length : String(d[k] ?? '').trim()))
  const campoHtml = (c: Campo, v: any) => {
    const span = c.w === 3 ? 6 : c.w === 2 ? 4 : 2
    let corpo: string
    if ((c.t === 'opcoes' || c.t === 'multi') && c.o) {
      const marc = Array.isArray(v) ? v : [v]
      corpo = `<div class="op">${c.o.map((o) => `<span class="${marc.includes(o) ? 'x' : ''}">${esc(o)}</span>`).join('')}</div>`
    } else corpo = `<div class="v">${esc(valorTexto(c, v))}</div>`
    return `<div class="f" style="grid-column:span ${span}"><label>${esc(c.l)}</label>${corpo}</div>`
  }
  const secoes = SECOES.map((s, i) => {
    let corpo = ''
    if (s.campos) {
      const cs = s.campos.filter((c) => emBranco || campoVisivel(c, d))
      corpo = `<div class="g">${cs.map((c) => campoHtml(c, d[c.k])).join('')}</div>`
    } else if (s.lista) {
      const linhas: Dados[] = Array.isArray(d[s.lista.k]) && d[s.lista.k].length ? d[s.lista.k] : []
      const vazias = emBranco ? (s.id === 'filhos' ? 4 : 2) : Math.max(0, 1 - linhas.length)
      const ehFilho = s.id === 'filhos'
      const base = s.lista.colunas.filter((c) => !c.saude)
      const sau = s.lista.colunas.filter((c) => c.saude)
      const nCol = base.length + (ehFilho ? 1 : 0)
      const linhaSaude = (l: Dados | null) => sau.length ? `<tr class="ls"><td colspan="${nCol}"><b>Saúde:</b> ${sau.map((c) => `${esc(c.l)}: <span>${l ? esc(valorTexto(c, l[c.k])) || '—' : '________'}</span>`).join(' · ')}</td></tr>` : ''
      corpo = `<table><tr>${base.map((c) => `<th>${esc(c.l)}</th>`).join('')}${ehFilho ? '<th>Idade</th>' : ''}</tr>${
        linhas.map((l) => `<tr>${base.map((c) => `<td>${esc(valorTexto(c, l[c.k]))}</td>`).join('')}${ehFilho ? `<td>${idade(l.nascimento) ?? ''}</td>` : ''}</tr>${linhaSaude(l)}`).join('')
      }${Array.from({ length: vazias }, () => `<tr>${base.map(() => '<td></td>').join('')}${ehFilho ? '<td></td>' : ''}</tr>${linhaSaude(null)}`).join('')}</table>`
    }
    return `<section><h2>${i + 1}. ${esc(s.titulo)}${s.nota ? ` <small>— ${esc(s.nota)}</small>` : ''}</h2>${corpo}</section>`
  }).join('')

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Ficha cadastral${d.nome_completo ? ' — ' + esc(d.nome_completo) : ''}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Montserrat:wght@600;700&display=swap" rel="stylesheet">
<style>
@page{size:A4;margin:10mm 11mm}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:Inter,'Segoe UI',Arial,sans-serif;color:#1d1d1f;font-size:9pt;margin:0;background:#fff}
header{display:flex;align-items:center;justify-content:space-between;border-bottom:2.5px solid #E8344E;padding-bottom:6px;margin-bottom:6px}
header img{height:32px}header h1{font-family:Montserrat,Inter,sans-serif;font-size:13.5pt;margin:0;text-align:right}header p{margin:1px 0 0;font-size:7.8pt;color:#666;text-align:right}
section{break-inside:avoid;margin-top:7px}
h2{font-family:Montserrat,Inter,sans-serif;font-size:8.6pt;text-transform:uppercase;letter-spacing:.5px;color:#fff;background:#E8344E;padding:3px 8px;margin:0;border-radius:3px 3px 0 0}
h2 small{text-transform:none;letter-spacing:0;font-weight:400;font-family:Inter,sans-serif;font-size:7.4pt}
.g{display:grid;grid-template-columns:repeat(6,1fr);border:1px solid #b9b9bd;border-top:none}
.f{border-right:1px solid #ddd;border-top:1px solid #ddd;padding:2px 6px 3px;min-height:29px}
.f label{display:block;font-size:6.6pt;text-transform:uppercase;color:#6b6b70;letter-spacing:.3px;font-weight:500}
.v{font-size:9.2pt;min-height:12px;overflow-wrap:anywhere}
.op{display:flex;flex-wrap:wrap;gap:2px 11px;font-size:8.3pt;padding-top:1px}
.op span::before{content:"";display:inline-block;width:8.5px;height:8.5px;border:1px solid #555;border-radius:2px;margin-right:4px;vertical-align:-1px}
.op span.x::before{background:#E8344E;border-color:#E8344E}
${emBranco ? '' : '.op span:not(.x){color:#aaa}.op span:not(.x)::before{border-color:#ccc}'}
table{width:100%;border-collapse:collapse;border:1px solid #b9b9bd;border-top:none}
th{font-size:6.6pt;text-transform:uppercase;color:#6b6b70;font-weight:500;text-align:left;padding:3px 6px;background:#f4f4f5;border:1px solid #ddd}
td{border:1px solid #ddd;height:20px;padding:0 6px;font-size:9pt}
tr.ls td{height:auto;padding:2px 6px 3px;font-size:7.6pt;color:#555;background:#fafafa}tr.ls b{font-weight:600;color:#E8344E}tr.ls span{color:#1d1d1f}
.sig{display:grid;grid-template-columns:1fr 1fr;gap:26px;margin-top:30px}.sig div{border-top:1px solid #333;text-align:center;font-size:8pt;padding-top:3px}
footer{font-size:7pt;color:#888;text-align:center;margin-top:8px}
</style></head><body>
<header><img src="${esc(origem)}/Logo_Nova.png" alt="Nova Tratores"><div><h1>Ficha de Atualização Cadastral</h1><p>Recursos Humanos · ${d._atualizado_em ? 'atualizada em ' + esc(new Date(d._atualizado_em).toLocaleDateString('pt-BR')) : 'preencher com letra legível'}</p></div></header>
${secoes}
<div class="sig"><div>Assinatura do colaborador</div><div>Local e data: ____________________, ____/____/______</div></div>
<footer>Nova Tratores · Ficha de Atualização Cadastral</footer>
<script>window.addEventListener('load',()=>document.fonts.ready.then(()=>setTimeout(()=>window.print(),300)))</script>
</body></html>`
}
