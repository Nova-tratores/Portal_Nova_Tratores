// Cheque de revisão Mahindra — parte PURA (sem banco): dados, defaults a
// partir da OS/trator e o HTML do cheque em tamanho real.
//
// Geometria medida no scan "CHEQUE 2700H EM BRANCO.pdf" (talão em folha A4,
// 200 dpi), em mm a partir do canto superior esquerdo da folha A4. Impresso em
// A4 sem margem, cai exatamente em cima do talão. Aprovado pelo José em
// 28/09/2026 (linhas cheias, borda 50% com topo = linha fina, listra vermelha
// terminando na borda).
import { REVISOES_LISTA } from '@/lib/revisoes/types';

export const HORAS_CHEQUE: number[] = REVISOES_LISTA.map((h) => Number(h.replace('h', '')));
/** Página do talão: 50h = 15 e 2700h = 33 (medidos); as demais de 2 em 2. */
export const PAGINA_TALAO: Record<number, number> = Object.fromEntries(HORAS_CHEQUE.map((h, i) => [h, 15 + i * 2]));

export const CONCESSIONARIA_PADRAO = 'Nova Tratores Máquinas Agrícolas Ltda — Piraju/SP';

export interface DadosCheque {
  concessionaria: string;
  entrega: string;      // DD/MM/YYYY
  dataRevisao: string;  // DD/MM/YYYY
  os: string;           // nº da OS (Omie quando houver)
  cliente: string;
  doc: string;          // CPF / CNPJ
  modelo: string;
  horimetro: string;    // "898 h"
  chassi: string;
  monobloco: string;    // série do monobloco = nº do motor
  tecnico: string;      // nome (sai na linha de assinatura)
  tecnicoCpf: string;
  via: string;          // "2ª via Mahindra Brasil"
}

export const CAMPOS_CHEQUE: { chave: keyof DadosCheque; rotulo: string }[] = [
  { chave: 'concessionaria', rotulo: 'Concessionária' },
  { chave: 'entrega', rotulo: 'Data de entrega do trator' },
  { chave: 'dataRevisao', rotulo: 'Data da revisão' },
  { chave: 'os', rotulo: 'Ordem de serviço Nº' },
  { chave: 'cliente', rotulo: 'Cliente' },
  { chave: 'doc', rotulo: 'CPF / CNPJ' },
  { chave: 'modelo', rotulo: 'Modelo do trator' },
  { chave: 'horimetro', rotulo: 'Nº de horas do trator' },
  { chave: 'chassi', rotulo: 'Número do chassi' },
  { chave: 'monobloco', rotulo: 'Série do monobloco' },
  { chave: 'tecnico', rotulo: 'Técnico (nome)' },
  { chave: 'tecnicoCpf', rotulo: 'CPF do técnico' },
  { chave: 'via', rotulo: 'Via' },
];

const vazio = (): DadosCheque => ({
  concessionaria: CONCESSIONARIA_PADRAO, entrega: '', dataRevisao: '', os: '', cliente: '', doc: '',
  modelo: '', horimetro: '', chassi: '', monobloco: '', tecnico: '', tecnicoCpf: '', via: '2ª via Mahindra Brasil',
});

/** Normaliza qualquer objeto vindo do banco para DadosCheque (campos faltantes → default). */
export function normalizarDados(d: unknown): DadosCheque {
  const base = vazio();
  if (!d || typeof d !== 'object') return base;
  const o = d as Record<string, unknown>;
  for (const k of Object.keys(base) as (keyof DadosCheque)[]) {
    if (o[k] != null && o[k] !== '') base[k] = String(o[k]);
  }
  return base;
}

/** "2026-06-24" ou "24/06/2026" → "24/06/2026"; vazio → "". */
export function dataBR(d: string | null | undefined): string {
  if (!d) return '';
  const s = String(d).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[1]}/${m[2]}/${m[3]}` : s;
}

/** "Horimetro: 898.3" no texto da OS → "898.3". */
export function extrairHorimetro(texto: string | null | undefined): string {
  const m = String(texto || '').match(/hor[ií]metro\s*:\s*([\d.,]+)/i);
  return m ? m[1] : '';
}

/** Título do modelo pro cheque: "6075E CAB MDI07513LS0006165" → "6075E CAB". */
export function modeloDoProjeto(projeto: string | null | undefined, chassi: string): string {
  const p = String(projeto || '').replace(chassi, '').replace(/\s+/g, ' ').trim();
  return p;
}

export interface FonteOS {
  Id_Ordem: string;
  Os_Cliente?: string | null;
  Cnpj_Cliente?: string | null;
  Os_Tecnico?: string | null;
  Projeto?: string | null;
  Serv_Solicitado?: string | null;
  Data?: string | null;
  Data_Fim_Servico?: string | null;
  Ordem_Omie?: string | null;
  id_omie?: number | string | null;
}
export interface FonteTrator {
  Modelo?: string | null;
  Numero_Motor?: string | null;
  Entrega?: string | null;
  Cliente?: string | null;
}

/** Preenche o cheque a partir da OS + cadastro do trator (o usuário pode editar depois). */
export function dadosIniciais(os: FonteOS, chassi: string, trator: FonteTrator | null, horimetroTecnico?: string | null): DadosCheque {
  const d = vazio();
  const nOmie = String(os.Ordem_Omie || os.id_omie || '').replace(/^0+/, '');
  d.os = nOmie || String(os.Id_Ordem || '').replace(/^OS-?/i, '');
  d.cliente = String(os.Os_Cliente || trator?.Cliente || '').trim();
  d.doc = String(os.Cnpj_Cliente || '').trim();
  d.chassi = chassi;
  d.modelo = String(trator?.Modelo || '').trim() || modeloDoProjeto(os.Projeto, chassi);
  d.monobloco = String(trator?.Numero_Motor || '').trim();
  d.entrega = dataBR(trator?.Entrega);
  d.dataRevisao = dataBR(os.Data_Fim_Servico || os.Data);
  const h = extrairHorimetro(os.Serv_Solicitado) || String(horimetroTecnico || '').trim();
  d.horimetro = h ? `${h.replace('.', ',')} h` : '';
  d.tecnico = String(os.Os_Tecnico || '').trim();
  return d;
}

const esc = (s: string) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---- geometria (mm) — compartilhada com o PDF (cheque-pdf.ts) ----
export const GEOMETRIA_CHEQUE = {
  linhaTopo: { y: 60.4, x0: 40.5, x1: 121.4 },
  faixa: { x: 38.5, y: 66.9, h: 13.2, wTopo: 121.3 - 38.5, wBase: 115.2 - 38.5 },
  titulo: { x: 45.9, y1: 72.7, y2: 77.1 },
  listrasTopo: { yIni: 60.5, yFim: 80.5, xBase: 119.3, w: 2.1, ang: 24, finaCinza: { off: 4.3, yFim: 77 }, finaVermelha: { off: 6.1, yFim: 71 } },
  bloco: { x0: 40.5, x1: 121.5, yTopo: 87.2, yBase: 127.2, esp: 0.7 },
  campos: [
    { y: 95.1, campos: [['concessionaria', 41, 121.5, 'Concessionária:']] },
    { y: 100.2, campos: [['entrega', 41, 121.5, 'Data de entrega do trator:']] },
    { y: 105.2, campos: [['dataRevisao', 41, 87.5, 'Data da revisão:'], ['os', 88.7, 121.5, 'Ordem de serviço Nº :']] },
    { y: 110.3, campos: [['cliente', 41, 87.5, 'Cliente:'], ['doc', 88.7, 121.5, 'CPF / CNPJ:']] },
    { y: 115.4, campos: [['modelo', 41, 87.5, 'Modelo do trator:'], ['horimetro', 88.7, 121.5, 'Nº de horas do trator:']] },
    { y: 120.6, campos: [['chassi', 41, 121.5, 'Número do chassi:']] },
    { y: 125.6, campos: [['monobloco', 41, 121.5, 'Série do monobloco:']] },
  ] as { y: number; campos: [keyof DadosCheque, number, number, string][] }[],
  assin: [
    { y: 149.4, x0: 40.5, x1: 121.4, rot: 'Carimbo da Concessionária', id: 'carimbo' },
    { y: 162.6, x0: 48, x1: 113.8, rot: 'Assinatura do cliente', id: 'cliente' },
    { y: 175.7, x0: 48, x1: 113.8, rot: 'Assinatura e CPF do técnico que efetuou a revisão', id: 'tecnico' },
  ],
  via: { y0: 185.7, y1: 189.2, x0: 40.5, x1: 121.4 },
  listrasBase: { yIni: 154.5, yFim: 203, xBase: 116.2, w: 2.2, ang: 25, finaCinza: { off: 4.3, yIni: 150, yFim: 192 }, finaVermelha: { off: 6.1, yIni: 150, yFim: 180 } },
  numero: { y: 194, h: 9, xTopo: 127.9, xBase: 123.7, x1: 148.7 },
  borda: { x0: 38.5, y0: 60.4, x1: 148.7, y1: 203 },
};

const G = GEOMETRIA_CHEQUE;

function listra(x: number, yIni: number, yFim: number, w: number, ang: number, cor: string): string {
  const h = yFim - yIni; const dx = Math.tan(ang * Math.PI / 180) * h;
  return `<div style="position:absolute;left:${x.toFixed(2)}mm;top:${yIni}mm;width:${(w + dx).toFixed(2)}mm;height:${h}mm;background:${cor};clip-path:polygon(${dx.toFixed(2)}mm 0,${(dx + w).toFixed(2)}mm 0,${w}mm 100%,0 100%);"></div>`;
}

export interface OpcoesHtml {
  horas: number;
  assinaturaClienteUrl?: string | null;
  assinaturaTecnicoUrl?: string | null;
  /** true = cheque em branco (sem dados) */
  emBranco?: boolean;
  /** mostra o carimbo impresso da concessionária */
  carimbo?: boolean;
  /** conteúdo extra (script/estilos) — usado pela prévia */
  extraHead?: string;
}

/** HTML completo (documento) do cheque em A4, pronto pra abrir/imprimir. */
export function htmlCheque(dados: DadosCheque, o: OpcoesHtml): string {
  const d = dados;
  const pagina = PAGINA_TALAO[o.horas] ?? '';
  const out: string[] = [];
  const bd = G.borda;
  out.push(`<div class="borda" style="left:${bd.x0}mm;top:${bd.y0}mm;width:${bd.x1 - bd.x0}mm;height:${bd.y1 - bd.y0}mm"></div>`);
  out.push(`<div class="hl fina" style="left:${G.linhaTopo.x0}mm;top:${G.linhaTopo.y}mm;width:${G.linhaTopo.x1 - G.linhaTopo.x0}mm"></div>`);
  out.push(`<div class="faixa" style="left:${G.faixa.x}mm;top:${G.faixa.y}mm;width:${G.faixa.wTopo}mm;height:${G.faixa.h}mm;clip-path:polygon(0 0,100% 0,${G.faixa.wBase}mm 100%,0 100%)"></div>`);
  out.push(`<div class="titulo" style="left:${G.titulo.x}mm;top:${G.titulo.y1 - 2.6}mm">CHEQUE DE REVISÃO</div>`);
  out.push(`<div class="titulo" style="left:${G.titulo.x}mm;top:${G.titulo.y2 - 2.6}mm">DAS ${o.horas} HORAS</div>`);
  const lt = G.listrasTopo;
  out.push(listra(lt.xBase, lt.yIni, lt.yFim, lt.w, lt.ang, '#E8462B'));
  out.push(listra(lt.xBase + lt.finaCinza.off, lt.yIni, lt.finaCinza.yFim, 0.3, lt.ang, '#4a4a4a'));
  out.push(listra(lt.xBase + lt.finaVermelha.off, lt.yIni, lt.finaVermelha.yFim, 0.3, lt.ang, '#E8462B'));
  const b = G.bloco;
  out.push(`<div class="hl grossa" style="left:${b.x0}mm;top:${b.yTopo}mm;width:${b.x1 - b.x0}mm;height:${b.esp}mm"></div>`);
  out.push(`<div class="hl grossa" style="left:${b.x0}mm;top:${b.yBase}mm;width:${b.x1 - b.x0}mm;height:${b.esp}mm"></div>`);
  for (const l of G.campos) {
    for (const [chave, x0, x1, rot] of l.campos) {
      out.push(`<div class="rot" style="left:${x0}mm;top:${l.y - 2.1}mm">${esc(rot)}</div>`);
      const val = o.emBranco ? '' : d[chave];
      // valor comprido numa coluna curta → fonte menor até caber (nome de cliente/razão social).
      // Largura estimada em "em": maiúscula/dígito ≈ 0,68 em, minúscula ≈ 0,52 em, espaço ≈ 0,28 em.
      const largura = x1 - x0 - rot.length * 0.52 * 1.98 - 1.2; // mm livres (rótulo em 5,6pt ≈ 1,98mm/em)
      const emVal = [...val].reduce((s, ch) => s + (/[A-ZÀ-Ý0-9]/.test(ch) ? 0.68 : ch === ' ' ? 0.28 : 0.52), 0);
      const ptMax = 6.2, mmPorPt = 0.3528;
      const ptCabe = emVal > 0 ? largura / (emVal * mmPorPt) : ptMax;
      const pt = Math.max(4.2, Math.min(ptMax, ptCabe));
      const estilo = pt < ptMax ? ` style="font-size:${pt.toFixed(1)}pt"` : '';
      out.push(`<div class="campo" style="left:${x0}mm;top:${l.y - 2.4}mm;width:${x1 - x0}mm"><span class="rotfantasma">${esc(rot)}&nbsp;</span><span class="val"${estilo}>${esc(val)}</span></div>`);
    }
  }
  for (const a of G.assin) {
    out.push(`<div class="hl fina" style="left:${a.x0}mm;top:${a.y}mm;width:${a.x1 - a.x0}mm"></div>`);
    out.push(`<div class="leg" style="left:${a.x0}mm;top:${a.y + 1}mm;width:${a.x1 - a.x0}mm">${esc(a.rot)}</div>`);
    let conteudo = '';
    if (!o.emBranco) {
      if (a.id === 'carimbo' && o.carimbo) conteudo = `<span class="carimbo">NOVA TRATORES MÁQUINAS AGRÍCOLAS LTDA<br>CNPJ 31.463.139/0001-03 · Piraju/SP</span>`;
      // imagem que não carrega some (em vez do ícone quebrado + texto alternativo)
      const img = (src: string, alt: string) => `<img class="assimg" src="${esc(src)}" alt="${alt}" onerror="this.style.display='none'">`;
      if (a.id === 'cliente' && o.assinaturaClienteUrl) conteudo = img(o.assinaturaClienteUrl, 'Assinatura do cliente');
      if (a.id === 'tecnico') {
        // com a rubrica do técnico, sai SÓ a rubrica (e o CPF, se informado); sem rubrica, sai o nome
        const txt = o.assinaturaTecnicoUrl
          ? (d.tecnicoCpf ? `CPF ${d.tecnicoCpf}` : '')
          : [d.tecnico, d.tecnicoCpf ? `CPF ${d.tecnicoCpf}` : ''].filter(Boolean).join(' — ');
        conteudo = (o.assinaturaTecnicoUrl ? img(o.assinaturaTecnicoUrl, 'Assinatura do técnico') : '') + (txt ? `<span class="asstxt">${esc(txt)}</span>` : '');
      }
    }
    // caixa de 10mm acima de cada linha (não invade a legenda da linha de cima)
    out.push(`<div class="assval" style="left:${a.x0}mm;top:${a.y - 10.2}mm;width:${a.x1 - a.x0}mm">${conteudo}</div>`);
  }
  const v = G.via;
  out.push(`<div class="hl fina" style="left:${v.x0}mm;top:${v.y0}mm;width:${v.x1 - v.x0}mm"></div>`);
  out.push(`<div class="hl fina" style="left:${v.x0}mm;top:${v.y1}mm;width:${v.x1 - v.x0}mm"></div>`);
  out.push(`<div class="leg" style="left:${v.x0}mm;top:${v.y0 + 1}mm;width:${v.x1 - v.x0}mm">${esc(d.via || '2ª via Mahindra Brasil')}</div>`);
  const lb = G.listrasBase; const t = Math.tan(lb.ang * Math.PI / 180);
  out.push(listra(lb.xBase, lb.yIni, lb.yFim, lb.w, lb.ang, '#E8462B'));
  out.push(listra(lb.xBase + lb.finaCinza.off + t * (lb.yFim - lb.finaCinza.yFim), lb.finaCinza.yIni, lb.finaCinza.yFim, 0.3, lb.ang, '#4a4a4a'));
  out.push(listra(lb.xBase + lb.finaVermelha.off + t * (lb.yFim - lb.finaVermelha.yFim), lb.finaVermelha.yIni, lb.finaVermelha.yFim, 0.3, lb.ang, '#E8462B'));
  const n = G.numero;
  out.push(`<div class="numero" style="left:${n.xBase}mm;top:${n.y}mm;width:${n.x1 - n.xBase}mm;height:${n.h}mm;clip-path:polygon(${n.xTopo - n.xBase}mm 0,100% 0,100% 100%,0 100%)"><span>${pagina}</span></div>`);

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Cheque de revisão ${o.horas}h — ${esc(d.chassi)}</title>
<style>${CSS_CHEQUE}</style>${o.extraHead || ''}</head><body>
<div class="folha">${out.join('\n')}</div>
</body></html>`;
}

export const CSS_CHEQUE = `
  * { box-sizing: border-box; }
  html, body { margin: 0; background: #e9e6e6; font-family: Arial, Helvetica, sans-serif; color: #333; }
  .folha { width: 210mm; height: 297mm; background: #fff; margin: 0 auto; position: relative; overflow: hidden; box-shadow: 0 2px 14px rgba(0,0,0,.18); }
  .folha > div { position: absolute; }
  .borda { border: 0.3mm solid #8a8a8a; border-top: 0; opacity: .5; }
  .faixa { background: #E8462B; }
  .titulo { color: #fff; font-family: 'Arial Black', 'Arial Bold', Arial, sans-serif; font-weight: 900; font-size: 10pt; line-height: 1; letter-spacing: 0.15mm; white-space: nowrap; }
  .hl.fina { background: #7f7f7f; height: 0.3mm; }
  .hl.grossa { background: #8a8a8a; }
  .rot { font-size: 5.6pt; color: #333; white-space: nowrap; line-height: 1; }
  .campo { display: flex; align-items: flex-end; height: 2.6mm; }
  .campo .rotfantasma { font-size: 5.6pt; visibility: hidden; white-space: nowrap; line-height: 1; }
  .campo .val { flex: 1; min-width: 0; font-size: 6.2pt; line-height: 1; padding: 0 0.6mm 0.5mm; color: #111; white-space: nowrap; overflow: hidden; border-bottom: 0.2mm solid #b3b3b3; }
  .leg { font-size: 5.6pt; text-align: center; color: #333; line-height: 1; }
  .assval { font-size: 6.6pt; text-align: center; color: #111; height: 10mm; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; padding-bottom: 0.6mm; gap: 0.3mm; overflow: hidden; }
  .assval .assimg { max-height: 8.6mm; max-width: 50mm; object-fit: contain; }
  .assval .asstxt { font-size: 6pt; }
  .assval .carimbo { display: inline-block; border: 0.35mm solid #1f4e79; color: #1f4e79; border-radius: 0.8mm; padding: 1.2mm 2.4mm; font-size: 5.4pt; font-weight: 700; line-height: 1.35; transform: rotate(-2deg); opacity: .85; }
  .numero { background: #E8462B; color: #fff; font-family: 'Arial Black', Arial, sans-serif; font-weight: 900; font-size: 17pt; display: flex; align-items: center; justify-content: flex-end; padding-right: 3.6mm; line-height: 1; }
  @media print {
    @page { size: A4 portrait; margin: 0; }
    html, body { background: #fff; }
    .folha { box-shadow: none; margin: 0; }
    .no-print { display: none !important; }
  }
`;

/** Assinaturas dos técnicos que existem em public/assinaturas/tecnicos/<slug>.png. */
export const TECNICOS_COM_ASSINATURA = new Set(['gabriel-moraes', 'danilo-de-souza']);
export function slugTecnico(nome: string | null | undefined): string {
  return String(nome || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
/** URL (relativa) da assinatura do técnico pelo nome, ou null se não temos a dele. */
export function assinaturaTecnicoPadrao(nome: string | null | undefined): string | null {
  const s = slugTecnico(nome);
  return TECNICOS_COM_ASSINATURA.has(s) ? `/assinaturas/tecnicos/${s}.png` : null;
}

/** Mensagem pro WhatsApp com o link de assinatura. */
export function mensagemWhatsApp(d: DadosCheque, horas: number, link: string): string {
  const nome = (d.cliente || '').split(' ')[0];
  return `Olá${nome ? `, ${nome}` : ''}! Aqui é da Nova Tratores. A revisão de ${horas} horas do seu trator ${d.modelo} (chassi final ${d.chassi.slice(-4)}) foi concluída. Para registrar na Mahindra, precisamos da sua assinatura no cheque de revisão. É só abrir o link e assinar na tela do celular: ${link}`;
}
