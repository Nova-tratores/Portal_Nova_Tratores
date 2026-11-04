// Rascunho da ficha de função pela IA, SÓ a partir das tarefas da função (planilhas importadas) e do
// catálogo de indicadores que o portal já mede (Planta Viva). Nada é gravado aqui: a tela mostra o
// rascunho, o admin corrige e salva; aprovar é outro passo.
import { chamarIA } from '@/lib/assistente/ia';
import { CATALOGO } from '@/lib/planta/regras';
import { rascunhoBasico, validarRascunho, type FichaFuncao } from './fichas';
import { ORIGENS, type TarefaOrg } from './tarefas';

const SISTEMA = `Você escreve a FICHA DE FUNÇÃO (descrição do papel na operação) de uma concessionária de tratores Mahindra (Nova Tratores).
Use SOMENTE as tarefas fornecidas — não invente atividades. Escreva em português do Brasil, simples e direto.
Responda só com JSON neste formato:
{
  "titulo": "nome claro da função (ex.: Auxiliar Administrativo de Pós-vendas — Garantias)",
  "missao": "1 ou 2 frases: para que essa função existe, o resultado que entrega",
  "responde_a": "uma das funções da lista ou null",
  "responsabilidades": [{"titulo": "resultado que entrega", "descricao": "1 frase", "tarefas": [ids das tarefas]}],
  "autoridade": ["o que decide sozinho / o que precisa de aprovação"],
  "requisitos": ["conhecimento ou habilidade necessária"],
  "indicadores": [{"texto": "como medir se vai bem", "kpi": "id do catálogo ou null"}]
}
Regras: 3 a 7 responsabilidades, agrupando tarefas do mesmo resultado; TODA tarefa em exatamente uma responsabilidade.
Autoridade e requisitos não estão nas tarefas: deduza com cuidado e comece cada item com "[VALIDAR]".
Indicadores: prefira os do catálogo (use o id em "kpi"); prazos citados nas tarefas viram indicador de texto.`;

export async function rascunharFicha(funcao: string, tarefas: TarefaOrg[], funcoes: string[]): Promise<{ ficha: Partial<FichaFuncao>; avisos: string[]; ia: boolean }> {
  const kpis = Object.entries(CATALOGO).filter(([id]) => id !== 'robos').map(([id, d]) => `${id}: ${d.rotulo}`);
  const linhas = tarefas.map((t) => [
    `#${t.id} [${ORIGENS[t.origem] || t.origem}${t.assunto ? ' › ' + t.assunto : ''}] ${t.acao}`,
    t.quando && `quando: ${t.quando}`, t.frequencia && `frequência: ${t.frequencia}`, t.onde && `onde: ${t.onde}`,
    t.destinatario && `para: ${t.destinatario}`, t.justificativa && `por quê: ${t.justificativa}`,
    t.quem.length > 1 && `divide com: ${t.quem.filter((q) => q !== funcao).join(', ')}`,
  ].filter(Boolean).join(' · '));
  const usuario = [
    `FUNÇÃO: ${funcao}`,
    `OUTRAS FUNÇÕES (para "responde_a"): ${funcoes.filter((f) => f !== funcao).join(', ')}`,
    `CATÁLOGO DE INDICADORES DO PORTAL:\n${kpis.join('\n')}`,
    `TAREFAS (${tarefas.length}):\n${linhas.join('\n')}`,
  ].join('\n\n');
  try {
    const r = await chamarIA({
      messages: [{ role: 'system', content: SISTEMA }, { role: 'user', content: usuario.slice(0, 20000) }],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    }) as { choices?: Array<{ message?: { content?: string } }> };
    const json = JSON.parse(r?.choices?.[0]?.message?.content || '{}');
    const { ficha, avisos } = validarRascunho(json, tarefas.map((t) => t.id), Object.keys(CATALOGO), funcoes);
    return { ficha, avisos, ia: true };
  } catch (e) {
    return { ficha: rascunhoBasico(funcao, tarefas), avisos: [`A IA não respondeu (${(e as Error).message.slice(0, 120)}) — rascunho simples por assunto.`], ia: false };
  }
}
