// Localização do cliente (CPF/CNPJ) — banco e GPS da frota. Regras puras em ./localizacao-cliente.ts.
// Tabela clientes_localizacoes (sql/clientes-localizacoes.sql): várias por CPF/CNPJ, cada uma com o nome da fazenda. Sem ela: ler devolve { semTabela } e a trava não segura.
import { supabase } from './supabase';
import { computarESalvarRota } from './rastreamento';
import { diasDoRelatorio, type RelatorioTecnico } from './horas-tecnico';
import { chaveNome } from '@/lib/frota/mapa-vivo';
import { normalizarPlaca } from '@/lib/frota/placa';
import { coordenadaValida, diasDaOS, distanciaM, paradasCandidatas, soDigitos, type ParadaGPS } from './localizacao-cliente';

type Rec = Record<string, unknown>;

/** uma localização (fazenda, sítio, sede…) do cliente — um CPF/CNPJ pode ter várias */
export interface LocalizacaoCliente {
  id: string; documento: string; nome: string; lat: number; lng: number; origem: string; placa: string | null; tecnico: string | null;
  parada_inicio: string | null; parada_min: number | null; os_id: string | null; confirmado_por: string; confirmado_em: string;
}

const TBL = 'clientes_localizacoes';
const SQL_FALTANDO = 'Falta rodar o SQL sql/clientes-localizacoes.sql no Supabase do portal.';
/** outra localização a menos disso é a mesma fazenda */
const RAIO_MESMA_M = 150;

const tabelaFaltando = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === 'PGRST205' || e.code === '42P01' || (/clientes_localizacoes/.test(e.message || '') && /not find|does not exist/i.test(e.message || '')));

export async function localizacoesDoDocumento(documento: string): Promise<{ semTabela: boolean; lista: LocalizacaoCliente[] }> {
  const doc = soDigitos(documento);
  if (!doc) return { semTabela: false, lista: [] };
  const { data, error } = await supabase.from(TBL).select('*').eq('documento', doc).order('confirmado_em', { ascending: true });
  if (tabelaFaltando(error)) return { semTabela: true, lista: [] };
  if (error) throw new Error(error.message);
  return { semTabela: false, lista: (data || []) as LocalizacaoCliente[] };
}

/** Coordenada já cadastrada no cliente (mapa/feedbacks), sem confirmação — aparece como opção. */
async function cadastroDoCliente(documento: string): Promise<{ lat: number; lng: number; nome: string } | null> {
  const doc = soDigitos(documento);
  if (!doc) return null;
  const { data } = await supabase.from('portal_nt_clientes_PRINCIPAL')
    .select('cnpj_cpf, nome_fantasia, razao_social, lat, lng, latitude, longitude').ilike('cnpj_cpf', `%${doc.slice(-6)}%`).limit(30);
  for (const c of (data || []) as Rec[]) {
    if (soDigitos(c.cnpj_cpf) !== doc) continue;
    const lat = Number(c.lat ?? c.latitude), lng = Number(c.lng ?? c.longitude);
    if (coordenadaValida(lat, lng)) return { lat, lng, nome: String(c.nome_fantasia || c.razao_social || '') };
  }
  return null;
}

/** Paradas ≥ 30 min do carro do(s) técnico(s) nos dias de execução da OS. */
export async function paradasDaOS(osId: string): Promise<{
  documento: string; cliente: string; dias: string[]; tecnicos: string[]; semCarro: string[];
  paradas: ParadaGPS[]; cadastro: { lat: number; lng: number } | null; avisos: string[];
}> {
  const avisos: string[] = [];
  const { data: osRows, error } = await supabase.from('Ordem_Servico')
    .select('Id_Ordem, Os_Cliente, Cnpj_Cliente, Os_Tecnico, Os_Tecnico2, Dias_Execucao, Previsao_Execucao').eq('Id_Ordem', osId).limit(1);
  if (error) throw new Error(error.message);
  const os = (osRows || [])[0] as Rec | undefined;
  if (!os) throw new Error('OS não encontrada.');
  const rel = await supabase.from('Ordem_Servico_Tecnicos').select('*').eq('Ordem_Servico', osId);
  const relatorios = ((rel.data || []) as RelatorioTecnico[]);
  const dias = diasDaOS(String(os.Dias_Execucao || ''), relatorios.flatMap((r) => diasDoRelatorio(r).map((d) => d.data)), String(os.Previsao_Execucao || ''));
  const tecnicos = [...new Set([os.Os_Tecnico, os.Os_Tecnico2, ...relatorios.map((r) => r.TecResp1)].map((t) => String(t || '').trim()).filter(Boolean))];
  const chavesTec = new Set(tecnicos.map(chaveNome));

  // carros: vínculo da Janela Mecânico (um por técnico); quem não tem (ex.: Fernando Leonel) vai no carro de outro
  const [tv, fv] = await Promise.all([
    supabase.from('tecnico_veiculos').select('tecnico_nome, placa'),
    supabase.from('frota_veiculos').select('id, placa').eq('ativo', true),
  ]);
  const vinculos = ((tv.data || []) as Rec[]).filter((v) => v.placa).map((v) => ({ tecnico: String(v.tecnico_nome || ''), placa: String(v.placa) }));
  const frota = new Map(((fv.data || []) as Rec[]).map((v) => [normalizarPlaca(String(v.placa)), { id: v.id as string, placa: String(v.placa) }]));
  const meus = vinculos.filter((v) => chavesTec.has(chaveNome(v.tecnico)));
  const comCarro = new Set(meus.map((v) => chaveNome(v.tecnico)));
  const semCarro = tecnicos.filter((t) => !comCarro.has(chaveNome(t)));
  // técnico sem carro e nenhum outro técnico da OS com carro: olha os carros de todos os técnicos naquele dia
  const acompanhando = meus.length === 0 && semCarro.length > 0;
  const carros = (acompanhando ? vinculos : meus).map((v) => ({ ...v, acompanhado: acompanhando }));
  if (!dias.length) avisos.push('A OS não tem dia de execução (nem no relatório do técnico, nem na previsão).');
  if (!tecnicos.length) avisos.push('A OS não tem técnico.');
  else if (!carros.length) avisos.push('Nenhum carro vinculado aos técnicos (Frota → vínculo do técnico).');
  if (acompanhando) avisos.push(`${semCarro.join(', ')} não tem carro próprio — mostrando as paradas dos carros dos outros técnicos nesses dias.`);

  const paradas: ParadaGPS[] = [];
  for (const c of carros) {
    const fvc = frota.get(normalizarPlaca(c.placa));
    for (const dia of dias) {
      // dia fechado pela Frota (classificado) → banco; senão (hoje, falha do cron) → rota (cache rotas_vendedor ou Rota Exata)
      if (fvc) {
        const { data: fp } = await supabase.from('frota_paradas')
          .select('placa, data, inicio, fim, duracao_min, latitude, longitude, classe, destino_nome')
          .eq('veiculo_id', fvc.id).eq('data', dia).gte('duracao_min', 30);
        const linhas = (fp || []) as Rec[];
        for (const p of linhas) paradas.push({
          placa: fvc.placa, tecnico: c.tecnico, data: dia, inicio: String(p.inicio), fim: (p.fim as string) || null,
          duracaoMin: Number(p.duracao_min) || 0, lat: Number(p.latitude), lng: Number(p.longitude),
          classe: (p.classe as string) || null, local: (p.destino_nome as string) || null, acompanhado: c.acompanhado,
        });
        if (linhas.length) continue;
      }
      try {
        const rota = await computarESalvarRota(supabase, c.placa, dia);
        for (const p of rota.paradas || []) paradas.push({
          placa: c.placa, tecnico: c.tecnico, data: dia, inicio: p.inicio, fim: p.fim, duracaoMin: Number(p.duracao_min) || 0,
          lat: p.lat, lng: p.lng, classe: null, local: null, acompanhado: c.acompanhado,
        });
      } catch (e) {
        avisos.push(`Sem GPS do ${c.placa} em ${dia.split('-').reverse().join('/')}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  const documento = soDigitos(os.Cnpj_Cliente);
  const cad = await cadastroDoCliente(documento).catch(() => null);
  return {
    documento, cliente: String(os.Os_Cliente || ''), dias, tecnicos, semCarro,
    paradas: paradasCandidatas(paradas), cadastro: cad ? { lat: cad.lat, lng: cad.lng } : null, avisos,
  };
}

const limparNome = (n: unknown) => String(n ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);

export async function adicionarLocalizacao(entrada: {
  documento: string; cliente: string; nome: string; lat: number; lng: number; origem: 'parada' | 'cadastro' | 'manual';
  placa?: string | null; tecnico?: string | null; paradaInicio?: string | null; paradaMin?: number | null; osId: string; autor: string;
}): Promise<LocalizacaoCliente> {
  const documento = soDigitos(entrada.documento);
  if (documento.length !== 11 && documento.length !== 14) throw new Error('O cliente da OS está sem CPF/CNPJ válido.');
  if (!coordenadaValida(entrada.lat, entrada.lng)) throw new Error('Coordenada inválida.');
  const nome = limparNome(entrada.nome);
  if (nome.length < 2) throw new Error('Escreva o nome da fazenda (ou do lugar).');
  const { lista, semTabela } = await localizacoesDoDocumento(documento);
  if (semTabela) throw new Error(SQL_FALTANDO);
  const perto = lista.find((l) => distanciaM(l, entrada) < RAIO_MESMA_M);
  if (perto) throw new Error(`Esse ponto é a "${perto.nome}", que já está cadastrada (a ${Math.round(distanciaM(perto, entrada))} m).`);
  if (lista.some((l) => l.nome.toLowerCase() === nome.toLowerCase())) throw new Error(`Já existe uma localização chamada "${nome}" para este cliente.`);
  const { data, error } = await supabase.from(TBL).insert({
    documento, nome, cliente_nome: entrada.cliente || null, lat: entrada.lat, lng: entrada.lng, origem: entrada.origem,
    placa: entrada.placa || null, tecnico: entrada.tecnico || null, parada_inicio: entrada.paradaInicio || null,
    parada_min: entrada.paradaMin != null ? Math.round(entrada.paradaMin) : null, os_id: entrada.osId,
    confirmado_por: entrada.autor, confirmado_em: new Date().toISOString(),
  }).select('*');
  if (error) throw new Error(error.message);
  // a 1ª vira o ponto do cadastro do cliente (os dois pares: o classificador de paradas da Frota lê latitude/longitude)
  if (!lista.length) void (async () => {
    const { data: cs } = await supabase.from('portal_nt_clientes_PRINCIPAL').select('id, cnpj_cpf').ilike('cnpj_cpf', `%${documento.slice(-6)}%`).limit(30);
    const ids = ((cs || []) as Rec[]).filter((c) => soDigitos(c.cnpj_cpf) === documento).map((c) => c.id);
    if (ids.length) await supabase.from('portal_nt_clientes_PRINCIPAL').update({ lat: entrada.lat, lng: entrada.lng, latitude: entrada.lat, longitude: entrada.lng }).in('id', ids);
  })().catch(() => {});
  return (data || [])[0] as LocalizacaoCliente;
}

/** renomear ou apagar uma localização — só do mesmo cliente da OS */
export async function alterarLocalizacao(documento: string, id: string, acao: { nome: string } | { remover: true }, autor: string): Promise<void> {
  const doc = soDigitos(documento);
  const { data, error } = await supabase.from(TBL).select('id, documento, nome').eq('id', id).limit(1);
  if (tabelaFaltando(error)) throw new Error(SQL_FALTANDO);
  if (error) throw new Error(error.message);
  const l = (data || [])[0] as Rec | undefined;
  if (!l || l.documento !== doc) throw new Error('Localização não é deste cliente.');
  if ('remover' in acao) {
    const r = await supabase.from(TBL).delete().eq('id', id);
    if (r.error) throw new Error(r.error.message);
    console.log(`[localizacao] ${autor} apagou "${l.nome}" (${doc})`);
    return;
  }
  const nome = limparNome(acao.nome);
  if (nome.length < 2) throw new Error('Escreva o nome da fazenda (ou do lugar).');
  const r = await supabase.from(TBL).update({ nome, atualizado_por: autor, atualizado_em: new Date().toISOString() }).eq('id', id);
  if (r.error) throw new Error(r.error.message);
}
