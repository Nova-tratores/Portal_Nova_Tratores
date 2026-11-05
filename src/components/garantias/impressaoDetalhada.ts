// Folha de impressão DETALHADA das garantias finalizadas (aba Histórico).
// Recebe os dados de /api/garantias/relatorio-detalhado e devolve o HTML.
import { fmtData, fmtMoeda } from '@/lib/garantias/format';
import {
  ROTULO_SITUACAO, totaisDetalhados, valorUnitario, type GarantiaDetalhada,
} from '@/lib/garantias/relatorio-detalhado';

function esc(v: unknown): string {
  // descrições do cadastro às vezes já vêm com &quot; — desfaz antes de escapar
  return String(v ?? '').replace(/&(quot|amp|#39|lt|gt);/g, (_, e) => ({ quot: '"', amp: '&', '#39': "'", lt: '<', gt: '>' }[e as string]!))
    .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
const num = (n: number, casas = 2) => n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
const texto = (s: string | null) => (s ? esc(s).replace(/\n+/g, '<br>') : '<span class="vazio">Não registrado</span>');

function linhaServico(rotulo: string, qtd: number, unidade: string, valor: number): string {
  if (valor <= 0.004 && qtd <= 0.004) return `<div class="item"><span>${rotulo}</span><b>—</b></div>`;
  const unit = valorUnitario(valor, qtd);
  const conta = unit != null ? `${num(qtd)} ${unidade} × ${fmtMoeda(unit)} = ` : qtd > 0 ? `${num(qtd)} ${unidade} · ` : '';
  return `<div class="item"><span>${rotulo}</span><b>${esc(conta)}${esc(fmtMoeda(valor))}</b></div>`;
}

function blocoNfse(g: GarantiaDetalhada): string {
  if (!g.aprovada) return '';
  const n = g.nfse;
  const v = n.situacao === 'emitida'
    ? `<b class="ok">NF ${esc(n.numero || '?')}${n.data ? ' · ' + esc(fmtData(n.data)) : ''}</b>${n.confirmada ? '' : ' <small>(achada pela SG)</small>'}`
    : n.situacao === 'pendente'
      ? `<b class="atencao">Falta emitir · ${esc(fmtMoeda(g.valorHoras + g.valorKm))}</b>`
      : '<b>Não precisa</b>';
  return `<div class="item"><span>NFS-e de reembolso</span>${v}</div>`;
}

function blocoGarantia(g: GarantiaDetalhada): string {
  const ident = [
    g.sg ? `SG ${esc(g.sg)}` : '',
    esc(g.os),
    esc(g.montadora || ''),
    g.modelo ? esc(g.modelo) : '',
    g.chassi ? `Chassi ${esc(g.chassi)}` : '',
    g.tecnico ? `Técnico ${esc(g.tecnico)}` : '',
    g.finalizada_em ? `Finalizada ${esc(fmtData(g.finalizada_em))}` : '',
  ].filter(Boolean).join(' · ');

  const pecas = g.pecas.length
    ? `<table class="pecas"><thead><tr><th>Código</th><th>Peça</th><th class="num">Qtd</th><th class="num">Valor (ref.)</th><th>Situação</th></tr></thead><tbody>${
      g.pecas.map((p) => `<tr>
        <td>${esc(p.cod || '—')}</td>
        <td>${esc(p.descricao)}</td>
        <td class="num">${esc(num(p.quantidade, p.quantidade % 1 ? 2 : 0))}</td>
        <td class="num">${p.valor > 0 ? esc(fmtMoeda(p.valor)) : '—'}</td>
        <td class="sit-${p.situacao}">${esc(ROTULO_SITUACAO[p.situacao])}${
          p.nota ? ` · NF ${esc(p.nota.numero)}${p.nota.data ? ' (' + esc(fmtData(p.nota.data)) + ')' : ''}` : ''}${
          p.quantidade <= 0 || p.valor < 0 ? ' <b class="nao">· qtd/valor negativo — conferir</b>' : ''}${
          !p.marcada && (p.situacao === 'paga' || p.situacao === 'chegou' || p.situacao === 'a_chegar') ? ' <small>(sugestão)</small>' : ''}</td>
      </tr>`).join('')}</tbody></table>`
    : '<div class="vazio">Sem peças nesta garantia.</div>';

  const recusa = !g.aprovada
    ? `<div class="recusa"><b>Recusada${g.recusadoPor ? ' pela ' + (g.recusadoPor === 'fabrica' ? 'fábrica' : 'garantista') : ''}:</b> ${texto(g.motivoRecusa)}${
      g.cobranca.status && g.cobranca.status !== 'nao_aplicavel'
        ? ` · Cobrança ao cliente: <b>${esc(g.cobranca.status.replace(/_/g, ' '))}</b>${g.cobranca.valor ? ' ' + esc(fmtMoeda(g.cobranca.valor)) : ''}` : ''}</div>`
    : '';

  return `<section class="gar">
  <div class="gar-topo">
    <div><span class="gar-num">${esc(g.numero)}</span> <span class="${g.aprovada ? 'ok' : 'nao'}">${g.aprovada ? 'Aprovada' : 'Recusada'}</span>
      <div class="gar-cli">${esc(g.cliente || '—')}</div>
      <div class="gar-id">${ident}</div></div>
    <div class="gar-total">${esc(fmtMoeda(g.total))}<small>total pago</small></div>
  </div>
  ${recusa}
  <div class="valores">
    ${linhaServico('Mão de obra', g.horas, 'h', g.valorHoras)}
    ${linhaServico('Deslocamento', g.km, 'km', g.valorKm)}
    <div class="item"><span>Peças pagas em dinheiro</span><b>${g.valorPecas ? esc(fmtMoeda(g.valorPecas)) : '—'}</b></div>
    ${blocoNfse(g)}
  </div>
  ${pecas}
  <div class="servico">
    <div><h4>Reclamação do cliente</h4><p>${texto(g.servico.reclamacao)}</p></div>
    <div><h4>Diagnóstico</h4><p>${texto(g.servico.diagnostico)}</p></div>
    <div class="largo"><h4>Serviço executado na OS</h4><p>${texto(g.servico.executado)}</p></div>
  </div>
</section>`;
}

export function htmlImpressaoDetalhada(gs: GarantiaDetalhada[], filtros: string): string {
  const t = totaisDetalhados(gs);
  const aChegar = gs.flatMap((g) => g.pecas.filter((p) => p.situacao === 'a_chegar' && p.quantidade > 0 && p.valor >= 0).map((p) => ({ g, p })));

  const resumo = gs.map((g) => `<tr>
    <td class="nw"><b>${esc(g.numero)}</b></td><td class="nw">${esc(g.sg || '—')}</td><td class="nw">${esc(g.os)}</td><td>${esc(g.cliente || '—')}</td>
    <td class="${g.aprovada ? 'ok' : 'nao'}">${g.aprovada ? 'Aprovada' : 'Recusada'}</td>
    <td class="num">${g.horas ? esc(num(g.horas)) : '—'}</td>
    <td class="num">${esc(fmtMoeda(g.valorHoras))}</td>
    <td class="num">${g.km ? esc(num(g.km, 0)) : '—'}</td>
    <td class="num">${esc(fmtMoeda(g.valorKm))}</td>
    <td class="num">${esc(fmtMoeda(g.valorPecas))}</td>
    <td class="num"><b>${esc(fmtMoeda(g.total))}</b></td>
    <td class="nw">${!g.aprovada ? '—' : g.nfse.situacao === 'emitida' ? 'NF ' + esc(g.nfse.numero || '?') : g.nfse.situacao === 'pendente' ? '<span class="atencao">falta</span>' : 'não precisa'}</td>
  </tr>`).join('');

  const tabelaAChegar = aChegar.length
    ? `<h2>Peças repostas pela fábrica que ainda não chegaram</h2>
<table><thead><tr><th>Garantia</th><th>SG</th><th>Código</th><th>Peça</th><th class="num">Qtd</th><th class="num">Valor (ref.)</th><th class="num">Dias desde a aprovação</th></tr></thead><tbody>${
      aChegar.map(({ g, p }) => {
        const dias = g.finalizada_em ? Math.floor((Date.now() - new Date(g.finalizada_em).getTime()) / 86400000) : null;
        return `<tr><td class="nw"><b>${esc(g.numero)}</b></td><td class="nw">${esc(g.sg || '—')}</td><td>${esc(p.cod || '—')}</td><td>${esc(p.descricao)}</td>
          <td class="num">${esc(num(p.quantidade, p.quantidade % 1 ? 2 : 0))}</td><td class="num">${p.valor > 0 ? esc(fmtMoeda(p.valor)) : '—'}</td>
          <td class="num">${dias ?? '—'}</td></tr>`;
      }).join('')}</tbody></table>`
    : '';

  const card = (titulo: string, valor: string, sub = '') =>
    `<div class="card"><div class="card-t">${titulo}</div><div class="card-v">${valor}</div>${sub ? `<div class="card-s">${sub}</div>` : ''}</div>`;

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Garantias finalizadas — detalhado</title>
<style>
  @page { size: A4 portrait; margin: 11mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 0; font-size: 10.5px; }
  .topo { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #be123c; padding-bottom: 6px; margin-bottom: 10px; }
  h1 { font-size: 17px; margin: 0; }
  h2 { font-size: 13px; margin: 16px 0 6px; border-left: 4px solid #be123c; padding-left: 6px; }
  .sub, .emitido { color: #555; margin-top: 3px; }
  .emitido { text-align: right; }
  .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
  .card { border: 1px solid #ccc; border-radius: 4px; padding: 6px 8px; }
  .card-t { font-size: 9px; text-transform: uppercase; color: #555; font-weight: bold; }
  .card-v { font-size: 14px; font-weight: bold; margin-top: 2px; }
  .card-s { font-size: 9.5px; color: #444; margin-top: 2px; }
  .card.destaque { border: 2px solid #111; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  th { background: #f3f4f6; text-align: left; font-size: 9px; text-transform: uppercase; padding: 4px 5px; border-bottom: 1px solid #999; }
  td { padding: 4px 5px; border-bottom: 1px solid #ddd; vertical-align: top; }
  tr { page-break-inside: avoid; }
  .num { text-align: right; white-space: nowrap; }
  .nw { white-space: nowrap; }
  .ok { color: #15803d; font-weight: bold; }
  .nao { color: #b91c1c; font-weight: bold; }
  .atencao { color: #b45309; font-weight: bold; }
  .vazio { color: #888; font-style: italic; }
  small { color: #666; font-weight: normal; }
  .gar { border: 1px solid #bbb; border-radius: 4px; padding: 8px 10px; margin-top: 10px; page-break-inside: avoid; }
  .gar-topo { display: flex; justify-content: space-between; gap: 10px; border-bottom: 1px solid #ddd; padding-bottom: 5px; }
  .gar-num { font-size: 13px; font-weight: bold; }
  .gar-cli { font-weight: bold; margin-top: 2px; }
  .gar-id { color: #444; margin-top: 2px; }
  .gar-total { font-size: 15px; font-weight: bold; text-align: right; white-space: nowrap; }
  .gar-total small { display: block; font-size: 9px; text-transform: uppercase; }
  .valores { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 16px; margin: 6px 0; }
  .item { display: flex; justify-content: space-between; gap: 8px; border-bottom: 1px dotted #ccc; padding: 2px 0; }
  .item span { color: #444; }
  .pecas { margin: 4px 0 6px; }
  .sit-paga { color: #1d4ed8; font-weight: bold; }
  .sit-chegou { color: #15803d; font-weight: bold; }
  .sit-a_chegar { color: #b45309; font-weight: bold; }
  .sit-recusada { color: #b91c1c; }
  .sit-terceiros { color: #555; }
  .servico { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 12px; }
  .servico .largo { grid-column: 1 / -1; }
  .servico h4 { margin: 4px 0 1px; font-size: 9px; text-transform: uppercase; color: #555; }
  .servico p { margin: 0; line-height: 1.35; }
  .recusa { background: #fef2f2; border: 1px solid #fecaca; padding: 4px 6px; margin-top: 5px; }
</style></head><body>
<div class="topo">
  <div><h1>Garantias finalizadas — detalhado · Nova Tratores</h1><div class="sub">${esc(filtros)}</div></div>
  <div class="emitido">Emitido em ${esc(new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }))}</div>
</div>

<div class="cards">
  ${card('Total pago pela fábrica', esc(fmtMoeda(t.total)), `${t.qtd} garantia(s) · ${t.aprovadas} aprovada(s) · ${t.recusadas} recusada(s)`).replace('class="card"', 'class="card destaque"')}
  ${card('Mão de obra (horas)', esc(fmtMoeda(t.valorHoras)), `${esc(num(t.horas))} h pagas`)}
  ${card('Deslocamento (km)', esc(fmtMoeda(t.valorKm)), `${esc(num(t.km, 0))} km pagos`)}
  ${card('Peças pagas em dinheiro', esc(fmtMoeda(t.valorPecas)), `${t.pecasPagas.itens} peça(s) pagas em dinheiro`)}
  ${card('Peças repostas — já chegaram', `${t.pecasChegaram.itens} item(ns)`, `valor de referência ${esc(fmtMoeda(t.pecasChegaram.valor))}`)}
  ${card('Peças repostas — a chegar', `<span class="${t.pecasAChegar.itens ? 'atencao' : ''}">${t.pecasAChegar.itens} item(ns)</span>`, `valor de referência ${esc(fmtMoeda(t.pecasAChegar.valor))}`)}
  ${card('NFS-e de reembolso emitidas', `${t.nfseEmitidas}`)}
  ${card('NFS-e de reembolso a emitir', `<span class="${t.nfsePendentes.qtd ? 'atencao' : ''}">${t.nfsePendentes.qtd}</span>`, `mão de obra + km ${esc(fmtMoeda(t.nfsePendentes.valor))}`)}
</div>

<h2>Resumo por garantia</h2>
<table>
  <thead><tr><th>Garantia</th><th>SG</th><th>OS</th><th>Cliente</th><th>Resultado</th><th class="num">Horas</th><th class="num">R$ horas</th><th class="num">KM</th><th class="num">R$ km</th><th class="num">R$ peças</th><th class="num">Total</th><th>NFS-e</th></tr></thead>
  <tbody>${resumo || '<tr><td colspan="12">Nenhuma garantia.</td></tr>'}</tbody>
</table>

${tabelaAChegar}

<h2>Detalhe de cada garantia</h2>
<div class="sub">Valor (ref.) da peça = preço pleiteado; peça com quantidade ou valor negativo fica fora dos totais; o que a fábrica pagou em dinheiro está em "Peças pagas em dinheiro". "(sugestão)" = o portal deduziu, ninguém marcou no checklist.</div>
${gs.map(blocoGarantia).join('')}
<script>window.onload = function () { window.print(); };</script>
</body></html>`;
}
