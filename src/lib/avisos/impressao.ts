// Comunicado timbrado para imprimir um aviso (folha A4 no padrão da Nova
// Tratores). Pura: devolve o HTML completo da folha; a tela /avisos abre numa
// janela nova. Setor (topo à direita) e assinatura são editáveis na própria
// folha antes de imprimir (a barra de cima some na impressão).

export interface DadosComunicado {
  titulo: string;
  conteudo: string;
  prioridade?: string | null;
  setor?: string;        // topo à direita, ex. "Administração"
  assinatura?: string;   // ex. "Administração / Gerência"
  data?: Date;
  logoUrl: string;       // URL absoluta do logo
}

export function escaparHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Escapa e põe em negrito as datas (24/11/26, 24/11/2026). */
function linhaHtml(s: string): string {
  return escaparHtml(s).replace(/\b(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/g, '<strong>$1</strong>');
}

export type BlocoComunicado =
  | { tipo: 'saudacao'; texto: string }
  | { tipo: 'paragrafo'; texto: string }
  | { tipo: 'lista'; itens: string[] };

/** Divide o texto: 1ª linha curta terminada em "," = saudação; linhas "1." / "-" / "•" = lista destacada. */
export function blocosDoTexto(conteudo: string): BlocoComunicado[] {
  const linhas = String(conteudo || '').replace(/\r\n?/g, '\n').split('\n');
  const blocos: BlocoComunicado[] = [];
  let paragrafo: string[] = [];
  const fecharParagrafo = () => {
    if (paragrafo.length) blocos.push({ tipo: 'paragrafo', texto: paragrafo.join(' ') });
    paragrafo = [];
  };
  for (const bruta of linhas) {
    const l = bruta.trim();
    if (!l) { fecharParagrafo(); continue; }
    const item = l.match(/^(?:\d{1,2}[.)-]|[-•*])\s+(.*)$/);
    if (item) {
      fecharParagrafo();
      const ult = blocos[blocos.length - 1];
      if (ult && ult.tipo === 'lista') ult.itens.push(item[1]);
      else blocos.push({ tipo: 'lista', itens: [item[1]] });
      continue;
    }
    if (!blocos.length && !paragrafo.length && l.length <= 60 && /,$/.test(l)) {
      blocos.push({ tipo: 'saudacao', texto: l });
      continue;
    }
    // linha comum depois de uma lista começa parágrafo novo
    paragrafo.push(l);
  }
  fecharParagrafo();
  return blocos;
}

export function htmlComunicado(d: DadosComunicado): string {
  const setor = d.setor?.trim() || 'Administração';
  const assinatura = d.assinatura?.trim() || 'Administração / Gerência';
  const kicker = d.prioridade === 'urgente' ? 'AVISO URGENTE' : 'AVISO OFICIAL';
  const data = (d.data || new Date()).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

  const corpo = blocosDoTexto(d.conteudo).map((b) => {
    if (b.tipo === 'saudacao') return `<p class="saud">${linhaHtml(b.texto)}</p>`;
    if (b.tipo === 'paragrafo') return `<p>${linhaHtml(b.texto)}</p>`;
    return `<ol class="lista">${b.itens.map((i) => `<li>${linhaHtml(i)}</li>`).join('')}</ol>`;
  }).join('\n');

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Comunicado - ${escaparHtml(d.titulo)}</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: #e5e7eb; color: #1f2937; font-family: Inter, Arial, Helvetica, sans-serif; }
  .barra { position: sticky; top: 0; z-index: 2; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: center;
    padding: 10px 12px; background: #111827; color: #f9fafb; font-size: 13px; }
  .barra button { min-height: 40px; padding: 0 18px; border: 0; border-radius: 8px; background: #e11d48; color: #fefefe; font-weight: 700; font-size: 14px; cursor: pointer; }
  .barra span { opacity: .8; }
  .folha { width: 210mm; min-height: 297mm; margin: 16px auto; background: #fff; padding: 18mm 18mm 14mm; display: flex; flex-direction: column;
    box-shadow: 0 4px 24px rgba(0,0,0,.12); }
  .topo { display: flex; justify-content: space-between; align-items: center; padding-bottom: 5mm; border-bottom: 1mm solid #e11d48; }
  .topo img { height: 12mm; }
  .topo .dep { text-align: right; }
  .topo .dep b { display: block; color: #9f1239; font-size: 11pt; letter-spacing: .08em; text-transform: uppercase; }
  .topo .dep small { color: #6b7280; font-size: 9.5pt; }
  .kicker { margin-top: 10mm; color: #e11d48; font-size: 9pt; font-weight: 700; letter-spacing: .22em; }
  h1 { margin: 1.5mm 0 0; font-size: 24pt; font-weight: 800; color: #111827; text-transform: uppercase; line-height: 1.1; overflow-wrap: anywhere; }
  .sep { margin: 4mm 0 8mm; border: 0; border-top: .3mm solid #cbd5e1; }
  .corpo { font-size: 11.5pt; line-height: 1.65; flex: 1; }
  .corpo p { margin: 0 0 5mm; overflow-wrap: anywhere; }
  .corpo .saud { font-weight: 700; color: #111827; }
  .lista { margin: 0 0 6mm; padding: 4mm 6mm 4mm 14mm; background: #f8fafc; border: .3mm solid #e2e8f0; border-left: 1mm solid #e11d48; }
  .lista li { margin: 2mm 0; padding-left: 1mm; }
  .lista li::marker { color: #e11d48; font-weight: 700; }
  .data { margin-top: 4mm; color: #4b5563; font-size: 10.5pt; }
  .assina { margin-top: 18mm; width: 75mm; border-top: .4mm solid #334155; padding-top: 2mm; font-size: 10.5pt; }
  .assina b { display: block; color: #111827; }
  .rodape { margin-top: 8mm; padding-top: 3mm; border-top: .3mm solid #e2e8f0; display: flex; justify-content: space-between; color: #6b7280; font-size: 8.5pt; }
  [contenteditable] { outline: 1px dashed transparent; border-radius: 2px; }
  [contenteditable]:hover, [contenteditable]:focus { outline-color: #fda4af; }
  @media screen and (max-width: 820px) {
    .folha { width: auto; min-height: 0; margin: 8px; padding: 18px 16px; }
    .topo img { height: 36px; }
    h1 { font-size: 22px; }
  }
  @media print {
    html, body { background: #fff; }
    .barra { display: none; }
    .folha { margin: 0; box-shadow: none; width: 210mm; height: 297mm; }
    [contenteditable] { outline: none !important; }
  }
</style></head>
<body>
<div class="barra"><button onclick="window.print()">Imprimir</button><span>Clique no setor, no texto ou na assinatura para ajustar antes de imprimir.</span></div>
<div class="folha">
  <div class="topo">
    <img src="${escaparHtml(d.logoUrl)}" alt="Nova Tratores">
    <div class="dep"><b contenteditable="true">${escaparHtml(setor)}</b><small>Documento Interno</small></div>
  </div>
  <div class="kicker">${kicker}</div>
  <h1 contenteditable="true">${escaparHtml(d.titulo)}</h1>
  <hr class="sep">
  <div class="corpo" contenteditable="true">
${corpo}
  </div>
  <div class="data" contenteditable="true">Piraju, ${escaparHtml(data)}.</div>
  <div class="assina" contenteditable="true"><b>${escaparHtml(assinatura)}</b>Nova Tratores</div>
  <div class="rodape"><span>Nova Tratores — Comunicado Interno</span><span>Uso Interno</span></div>
</div>
</body></html>`;
}
