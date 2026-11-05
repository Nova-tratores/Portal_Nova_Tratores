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
      ? '<b class="atencao">Falta emitir</b>'
      : dinheiroDe(g) > 0.004 ? '<b class="atencao">Não localizada</b>' : '<b>Não precisa</b>';
  return `<div class="item"><span>NFS-e de reembolso</span>${v}</div>`;
}

const dinheiroDe = (g: GarantiaDetalhada) => g.valorHoras + g.valorKm + g.pecasDinheiro;

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
    ? `<table class="pecas"><thead><tr><th>Código</th><th>Peça</th><th class="num">Qtd</th><th class="num">Pleiteado</th><th class="num">Pago</th><th>Situação</th></tr></thead><tbody>${
      g.pecas.map((p) => `<tr>
        <td>${esc(p.cod || '—')}</td>
        <td>${esc(p.descricao)}</td>
        <td class="num">${esc(num(p.quantidade, p.quantidade % 1 ? 2 : 0))}</td>
        <td class="num">${p.valor ? esc(fmtMoeda(p.valor)) : '—'}</td>
        <td class="num">${p.pago > 0 ? esc(fmtMoeda(p.pago)) : '—'}</td>
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
    <div class="item"><span>Peças pagas em dinheiro</span><b>${g.pecasDinheiro ? esc(fmtMoeda(g.pecasDinheiro)) : '—'}</b></div>
    <div class="item"><span>Peças repostas pela fábrica</span><b>${
      g.pecasReposicaoChegou + g.pecasReposicaoAChegar > 0.004
        ? esc(fmtMoeda(g.pecasReposicaoChegou + g.pecasReposicaoAChegar))
          + (g.pecasReposicaoAChegar > 0.004 ? ` <small>(a chegar ${esc(fmtMoeda(g.pecasReposicaoAChegar))})</small>` : ' <small>(já chegaram)</small>')
        : '—'}</b></div>
    <div class="item forte"><span>Total em dinheiro</span><b>${esc(fmtMoeda(dinheiroDe(g)))}</b></div>
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
    <td class="nw"><b>${esc(g.numero)}</b>${g.aprovada ? '' : ' <span class="nao">recusada</span>'}<div class="mini">${esc(g.sg ? 'SG ' + g.sg : '')}</div></td>
    <td class="nw">${esc(g.os)}</td>
    <td>${esc(g.cliente || '—')}</td>
    <td class="num">${esc(fmtMoeda(g.valorHoras))}${g.horas ? `<div class="mini">${esc(num(g.horas))} h</div>` : ''}</td>
    <td class="num">${esc(fmtMoeda(g.valorKm))}${g.km ? `<div class="mini">${esc(num(g.km, 0))} km</div>` : ''}</td>
    <td class="num">${esc(fmtMoeda(g.pecasDinheiro))}</td>
    <td class="num"><b>${esc(fmtMoeda(dinheiroDe(g)))}</b><div class="mini">${!g.aprovada ? '' : g.nfse.situacao === 'emitida' ? 'NFS-e ' + esc(g.nfse.numero || '?') : g.nfse.situacao === 'pendente' || dinheiroDe(g) > 0.004 ? '<span class="atencao">sem NFS-e</span>' : ''}</div></td>
    <td class="num">${esc(fmtMoeda(g.pecasReposicaoChegou + g.pecasReposicaoAChegar))}${g.pecasReposicaoAChegar > 0.004 ? `<div class="mini atencao">a chegar ${esc(fmtMoeda(g.pecasReposicaoAChegar))}</div>` : ''}</td>
    <td class="num"><b>${esc(fmtMoeda(g.total))}</b></td>
  </tr>`).join('');

  const tabelaAChegar = aChegar.length
    ? `<h2>Peças repostas pela fábrica que ainda não chegaram</h2>
<table><thead><tr><th>Garantia</th><th>SG</th><th>Código</th><th>Peça</th><th class="num">Qtd</th><th class="num">Valor pago em peça</th><th class="num">Dias desde a aprovação</th></tr></thead><tbody>${
      aChegar.map(({ g, p }) => {
        const dias = g.finalizada_em ? Math.floor((Date.now() - new Date(g.finalizada_em).getTime()) / 86400000) : null;
        return `<tr><td class="nw"><b>${esc(g.numero)}</b></td><td class="nw">${esc(g.sg || '—')}</td><td>${esc(p.cod || '—')}</td><td>${esc(p.descricao)}</td>
          <td class="num">${esc(num(p.quantidade, p.quantidade % 1 ? 2 : 0))}</td><td class="num">${p.pago > 0 ? esc(fmtMoeda(p.pago)) : '—'}</td>
          <td class="num">${dias ?? '—'}</td></tr>`;
      }).join('')}</tbody></table>`
    : '';

  const dinheiro = t.valorHoras + t.valorKm + t.pecasDinheiro;
  const repostas = t.reposicaoChegou.valor + t.reposicaoAChegar.valor;

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
  .composicao { border: 2px solid #111; border-radius: 4px; padding: 8px 10px; page-break-inside: avoid; }
  .comp-total { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; border-bottom: 1px solid #ccc; padding-bottom: 6px; }
  .comp-total span { font-size: 11px; text-transform: uppercase; font-weight: bold; color: #444; }
  .comp-total b { font-size: 18px; }
  .comp-lados { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 6px; }
  .comp-t { display: flex; justify-content: space-between; font-size: 10px; text-transform: uppercase; font-weight: bold; color: #444; border-bottom: 2px solid #be123c; padding-bottom: 3px; margin-bottom: 3px; }
  .comp-t b { font-size: 14px; color: #111; }
  .item.forte { font-weight: bold; }
  .nota { font-size: 9px; color: #666; margin-top: 5px; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  th { background: #f3f4f6; text-align: left; font-size: 9px; text-transform: uppercase; padding: 4px 5px; border-bottom: 1px solid #999; }
  td { padding: 4px 5px; border-bottom: 1px solid #ddd; vertical-align: top; }
  tr { page-break-inside: avoid; }
  .num { text-align: right; white-space: nowrap; }
  .nw { white-space: nowrap; }
  .mini { font-size: 8.5px; color: #555; font-weight: normal; }
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

<div class="composicao">
  <div class="comp-total"><span>Total pago pela fábrica</span><b>${esc(fmtMoeda(t.total))}</b>
    <small>${t.qtd} garantia(s) · ${t.aprovadas} aprovada(s) · ${t.recusadas} recusada(s) · = dinheiro + peças repostas</small></div>
  <div class="comp-lados">
    <div class="comp">
      <div class="comp-t">Pago em dinheiro (NFS-e de reembolso)<b>${esc(fmtMoeda(dinheiro))}</b></div>
      <div class="item"><span>Mão de obra · ${esc(num(t.horas))} h</span><b>${esc(fmtMoeda(t.valorHoras))}</b></div>
      <div class="item"><span>Deslocamento · ${esc(num(t.km, 0))} km</span><b>${esc(fmtMoeda(t.valorKm))}</b></div>
      <div class="item"><span>Peças pagas em dinheiro</span><b>${esc(fmtMoeda(t.pecasDinheiro))}</b></div>
      <div class="item forte"><span class="ok">Com NFS-e já emitida · ${t.dinheiroNfEmitida.qtd} garantia(s)</span><b class="ok">${esc(fmtMoeda(t.dinheiroNfEmitida.valor))}</b></div>
      <div class="item forte"><span class="${t.dinheiroSemNf.qtd ? 'atencao' : ''}">Ainda sem NFS-e · ${t.dinheiroSemNf.qtd} garantia(s)</span><b class="${t.dinheiroSemNf.qtd ? 'atencao' : ''}">${esc(fmtMoeda(t.dinheiroSemNf.valor))}</b></div>
    </div>
    <div class="comp">
      <div class="comp-t">Pago em peças repostas pela fábrica<b>${esc(fmtMoeda(repostas))}</b></div>
      <div class="item forte"><span class="ok">Já chegaram · ${t.reposicaoChegou.itens} item(ns)</span><b class="ok">${esc(fmtMoeda(t.reposicaoChegou.valor))}</b></div>
      <div class="item forte"><span class="${t.reposicaoAChegar.itens ? 'atencao' : ''}">Ainda vão chegar · ${t.reposicaoAChegar.itens} item(ns)</span><b class="${t.reposicaoAChegar.itens ? 'atencao' : ''}">${esc(fmtMoeda(t.reposicaoAChegar.valor))}</b></div>
      <div class="nota">A fábrica informa um valor só de peças por garantia. Quando parte é paga em dinheiro e parte em peça, o valor é dividido na proporção do preço pleiteado de cada peça.</div>
    </div>
  </div>
</div>

<h2>Resumo por garantia</h2>
<table>
  <thead><tr><th>Garantia</th><th>OS</th><th>Cliente</th><th class="num">Mão de obra</th><th class="num">Deslocamento</th><th class="num">Peças em dinheiro</th><th class="num">Total em dinheiro</th><th class="num">Peças repostas</th><th class="num">Total pago</th></tr></thead>
  <tbody>${resumo || '<tr><td colspan="9">Nenhuma garantia.</td></tr>'}</tbody>
</table>

${tabelaAChegar}

<h2>Detalhe de cada garantia</h2>
<div class="sub">Valor (ref.) da peça = preço pleiteado; Pago = parte do valor de peças que a fábrica pagou por aquela peça (em dinheiro ou repondo a peça); peça com quantidade ou valor negativo fica fora da conta. "(sugestão)" = o portal deduziu, ninguém marcou no checklist.</div>
${gs.map(blocoGarantia).join('')}
<script>window.onload = function () { window.print(); };</script>
</body></html>`;
}
