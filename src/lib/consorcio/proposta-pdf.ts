// PDF da proposta de consórcio que vai para o WhatsApp do cliente (26/11/2026, José: "gera um pdf de tudo ali
// bonitinho e manda para o número que foi cadastrado"). Gerado no SERVIDOR (jsPDF), logo depois de salvar a ficha.
// Só o que é do cliente: dados dele, a carta, a proposta e as condições. Nada interno (temperatura, como chegou,
// observação do vendedor). Sem emoji (a fonte do PDF não tem, e o José não quer).
import fs from 'fs';
import path from 'path';
import { jsPDF } from 'jspdf';
import { type ConfigConsorcio, reais, parcelaComDesconto } from './conta';

export interface DadosProposta {
  evento: { nome: string; cidade?: string | null; inicio?: string | null; fim?: string | null };
  cfg: ConfigConsorcio;
  cliente: { nome: string; telefone: string; cidade?: string; endereco?: string };
  trator?: string;
  credito?: number | null;
  parcela?: number | null;
  prazo?: number | null;
  embutidoPct?: number | null;
  lanceProprio?: number | null;
  contemplacao?: string;
  observacao?: string;
  assembleia?: { grupo: string; vencimento?: string | null; proxima_assembleia?: string | null } | null;
  superAssembleia?: boolean;
  vendedor: string;
}

const VM: [number, number, number] = [227, 24, 55];
const ESC: [number, number, number] = [46, 42, 43];
const CINZA: [number, number, number] = [110, 104, 106];
const CLARO: [number, number, number] = [246, 246, 247];
const AM: [number, number, number] = [229, 185, 78];

/** a fonte padrão do PDF só tem Latin-1: troca o que dá e tira o resto (emoji etc.) */
const limpa = (s: unknown) => String(s ?? '')
  .replace(/[  ]/g, ' ').replace(/[–—]/g, '-').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/…/g, '...')
  .replace(/[^\x20-\xFF\n]/g, '').replace(/ {2,}/g, ' ').trim();
const dataBR = (iso?: string | null) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
const telBR = (t: string) => { const d = t.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, ''); return d.length >= 10 ? `(${d.slice(0, 2)}) ${d.slice(2, -4)}-${d.slice(-4)}` : t; };

let logoCache: string | null | undefined;
function logoBranco(): string | null {
  if (logoCache !== undefined) return logoCache;
  try { logoCache = 'data:image/png;base64,' + fs.readFileSync(path.join(process.cwd(), 'public', 'Logo_Nova_Branca.png')).toString('base64'); }
  catch { logoCache = null; }
  return logoCache;
}

export function gerarPropostaPdf(d: DadosProposta): ArrayBuffer {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const W = 210, M = 16;
  let y = 0;

  // faixa vermelha com o logo
  doc.setFillColor(...VM); doc.rect(0, 0, W, 32, 'F');
  const logo = logoBranco();
  if (logo) { try { doc.addImage(logo, 'PNG', M, 10, 66, 66 * 280 / 1536, 'logo', 'FAST'); } catch { /* sem logo */ } }
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
  doc.text('Concessionária autorizada', W - M, 14, { align: 'right' });
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text('MAHINDRA', W - M, 20.5, { align: 'right' });

  // título
  y = 46;
  doc.setTextColor(...ESC); doc.setFont('helvetica', 'bold'); doc.setFontSize(20);
  doc.text('Proposta de Consórcio Mahindra', M, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...CINZA);
  const quando = [dataBR(d.evento.inicio), d.evento.fim && d.evento.fim !== d.evento.inicio ? dataBR(d.evento.fim) : ''].filter(Boolean).join(' e ');
  doc.text(limpa([d.evento.nome, quando, d.evento.cidade].filter(Boolean).join(' · ')), M, y + 7);
  doc.text(`Emitida em ${new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`, W - M, y + 7, { align: 'right' });
  y += 16;

  const titulo = (t: string) => {
    doc.setFillColor(...VM); doc.rect(M, y - 3.6, 2.2, 4.6, 'F');
    doc.setTextColor(...ESC); doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5); doc.text(t.toUpperCase(), M + 5, y);
    y += 6;
  };
  const linhas = (pares: [string, string][]) => {
    const vis = pares.filter(([, v]) => limpa(v));
    const h = vis.reduce((acc, [, v]) => acc + 7 * Math.max(1, doc.splitTextToSize(limpa(v), W - 2 * M - 62).length), 0) + 4;
    doc.setFillColor(...CLARO); doc.roundedRect(M, y, W - 2 * M, h, 2.5, 2.5, 'F');
    let yy = y + 7;
    for (const [k, v] of vis) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...CINZA); doc.text(k, M + 5, yy);
      doc.setFont('helvetica', 'bold'); doc.setTextColor(...ESC);
      const partes = doc.splitTextToSize(limpa(v), W - 2 * M - 62);
      doc.text(partes, M + 57, yy);
      yy += 7 * Math.max(1, partes.length);
    }
    y += h + 8;
  };

  // cliente
  titulo('Cliente');
  linhas([['Nome', d.cliente.nome], ['WhatsApp', telBR(d.cliente.telefone)], ['Cidade', d.cliente.cidade || ''], ['Endereço', d.cliente.endereco || '']]);

  // destaque da carta
  if (d.credito) {
    doc.setFillColor(...ESC); doc.roundedRect(M, y, W - 2 * M, 30, 3, 3, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    doc.text(limpa(d.trator || 'Carta de crédito'), M + 6, y + 8);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...AM);
    doc.text('CRÉDITO', M + 6, y + 16); doc.text('PARCELA', W / 2 + 4, y + 16);
    doc.setTextColor(255, 255, 255); doc.setFontSize(17);
    doc.text(limpa(reais(d.credito, 0)), M + 6, y + 25);
    doc.text(limpa(d.parcela ? `${reais(d.parcela)} /mês` : '-'), W / 2 + 4, y + 25);
    y += 38;
  }

  // proposta
  titulo('Proposta');
  linhas([
    // crédito e parcela já aparecem grandes no cartão escuro acima
    ['Prazo', d.prazo ? `${d.prazo} meses` : ''],
    ['Lance embutido', d.embutidoPct ? `${String(d.embutidoPct).replace('.', ',')}% (sai da própria carta)` : ''],
    ['Lance próprio', d.lanceProprio ? `${reais(d.lanceProprio, 0)} (do seu bolso)` : ''],
    ['Prazo de contemplação', d.contemplacao || ''],
    ['Taxa de administração', d.cfg.taxa_adm_pct ? `${String(d.cfg.taxa_adm_pct).replace('.', ',')}% dividida no prazo, sem juros` : ''],
  ]);

  // condições
  const cond: string[] = [...(d.cfg.condicoes || []).map(limpa).filter(Boolean)];
  if (!cond.some((c) => /juros/i.test(c))) cond.push('Sem juros');
  if (d.cfg.desconto_parcela && d.credito) {
    const v = parcelaComDesconto(d.credito, d.cfg);
    cond.push(`${d.cfg.desconto_parcela.numero}ª parcela com ${d.cfg.desconto_parcela.pct}% de desconto${v ? `: ${reais(v)}` : ''} (fechando na feira)`);
  }
  if (d.assembleia?.proxima_assembleia) cond.push(`Grupo ${d.assembleia.grupo}: vencimento ${dataBR(d.assembleia.vencimento)}, assembleia ${dataBR(d.assembleia.proxima_assembleia)}`);
  if (d.superAssembleia && d.cfg.super_assembleia) cond.push(`Super Assembleia de ${d.cfg.super_assembleia.quando}: ${d.cfg.super_assembleia.cartas} contemplações`);
  if (cond.length) {
    titulo('Condições');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(...ESC);
    for (const c of cond) {
      const partes = doc.splitTextToSize(limpa(c), W - 2 * M - 8);
      doc.setFillColor(...VM); doc.rect(M + 1, y - 2.6, 2, 2, 'F');
      doc.text(partes, M + 6, y);
      y += 6 * partes.length;
    }
    y += 5;
  }

  // observações
  if (limpa(d.observacao)) {
    titulo('Observações');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(...ESC);
    const partes = doc.splitTextToSize(limpa(d.observacao), W - 2 * M);
    doc.text(partes, M, y); y += 6 * partes.length + 5;
  }

  // rodapé: no fim da página; se o conteúdo chegou perto dele, vai para uma página nova
  if (y > 270) doc.addPage();   // (y já inclui o respiro de 5 mm depois do último bloco)
  const zap = d.cfg.whatsapp ? telBR(d.cfg.whatsapp) : '';
  doc.setDrawColor(220, 220, 222); doc.line(M, 270, W - M, 270);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(...ESC);
  doc.text(limpa(`Seu vendedor: ${d.vendedor}`), M, 277);
  doc.setFont('helvetica', 'normal'); doc.setTextColor(...CINZA);
  doc.text(limpa(`Nova Tratores${zap ? ` · WhatsApp ${zap}` : ''}`), W - M, 277, { align: 'right' });
  doc.setFontSize(8);
  doc.text(limpa(`Valores de referência, sujeitos às regras do grupo e da administradora${d.cfg.administradora ? ` ${d.cfg.administradora}` : ''}.`), M, 284);

  return doc.output('arraybuffer');
}
