// Gestão Pós Vendas no CELULAR (José, 06/11/2026: lista de 37 defeitos testada a 299 px).
// Tudo aqui vale só até 760 px: o computador não muda. Cada componente tem o seu <style>, e eles entram no
// documento em ordens diferentes (a ficha e as janelas abrem por cima); por isso as regras começam com `body`,
// que ganha de qualquer regra de uma classe só sem depender da ordem.
// Causa principal: grade de uma coluna "1fr" (= minmax(auto, 1fr)) cresce até o conteúdo mais largo e o lado
// direito some sem rolagem — aqui as colunas viram minmax(0, 1fr) e os filhos ganham min-width: 0.
export const ESTILO_CELULAR_GESTAO = `
@media (max-width: 760px) {
  /* 1. a grade de fora das duas abas (Resultados e Equipe) não cresce além da tela */
  body .pt-amb { grid-template-columns: minmax(0, 1fr) }
  body .pt-amb > *, body .aa-conteudo, body .pt-corpo { min-width: 0 }
  /* 30 e 31. topo mais baixo (o conteúdo começava em ~460 px) e espaço no fim para o botão fixo do canto */
  body .cpv-topo { gap: 8px; margin-bottom: 10px }
  body .cpv-modo, body .cpv-topo > .ac { flex: 1 1 100% }
  body .cpv-topo > .pnt { flex: 1 1 auto; min-width: 0; justify-content: space-between }
  body .cpv-espaco { display: none }
  body .cpv-robo { width: 40px; padding: 0; justify-content: center; font-size: 0 } body .cpv-robo i { font-size: 15px }
  body .cpv-tela { display: none }
  body .cpv-aovivo { max-width: 100% }
  body .aa-abas { margin-bottom: 12px; padding: 4px; gap: 4px }
  body .cpv-conteudo { padding-bottom: 56px }
  /* 29. faixa de abas que rola de lado: sombra na borda mostra que tem mais abas */
  body .aa-abas {
    background:
      linear-gradient(90deg, var(--portal-bg-card, #fefefe) 30%, transparent) left / 28px 100% no-repeat local,
      linear-gradient(270deg, var(--portal-bg-card, #fefefe) 30%, transparent) right / 28px 100% no-repeat local,
      radial-gradient(farthest-side at 0 50%, rgba(15,23,42,.22), transparent) left / 12px 100% no-repeat scroll,
      radial-gradient(farthest-side at 100% 50%, rgba(15,23,42,.22), transparent) right / 12px 100% no-repeat scroll,
      var(--portal-bg-card, #fefefe);
  }

  /* EQUIPE › METAS — 2. cartões das metas; 4. explicação abre embaixo do cartão tocado, na largura dele */
  body .eqc { padding: 14px 12px }
  body .eqc-metas { grid-template-columns: repeat(auto-fit, minmax(min(150px, 100%), 1fr)) }
  body .eqc-m { cursor: pointer; align-items: start }
  body .eqc-m-dica { position: static; grid-column: 1 / -1; width: auto; display: none; opacity: 1; transform: none; pointer-events: auto; box-shadow: none; margin-top: 2px }
  body .eqc-m.on .eqc-m-dica { display: grid }
  body .eqc-m.on { grid-column: 1 / -1 }
  /* 5. cor e palavra da legenda juntas (cada par num <u>, que não quebra) */
  body .eqc-sem-cab span { gap: 6px 10px } body .eqc-sem-cab span u { white-space: nowrap }
  /* 3. cartão do mecânico: nome inteiro numa linha só; o "↑ 66% vs mês passado" desce para baixo dele */
  body .h2-grade { grid-template-columns: minmax(0, 1fr) }
  body .h2-cab { flex-wrap: wrap } body .h2-cab > div { flex: 1 1 150px } body .h2-cab b { overflow-wrap: anywhere }
  body .h2-cab > .ho-var { margin-left: 50px }
  body .c6-m { grid-template-columns: 82px minmax(0, 1fr) 40px } body .c6-s { grid-template-columns: 92px minmax(0, 1fr) 48px !important }

  /* EQUIPE › FANTASMAS — 6. números em uma coluna; 7. o valor fica embaixo do título, não por cima */
  body .fan-kpis { grid-template-columns: minmax(0, 1fr) }
  body .fan-lista { grid-template-columns: minmax(0, 1fr) }
  body .fan-bar { grid-template-columns: 84px minmax(0, 1fr) 64px }
  body .cz-cab { grid-auto-flow: row; grid-template-columns: 34px minmax(0, 1fr) auto auto; column-gap: 10px; row-gap: 2px; padding: 10px 12px }
  body .cz-ic { grid-column: 1; grid-row: 1 / span 2 }
  body .cz-tit { grid-column: 2; grid-row: 1 }
  body .cz-val { grid-column: 2; grid-row: 2; display: flex; flex-wrap: wrap; gap: 0 8px; align-items: baseline; justify-items: start }
  body .cz-val b { font-size: 17px }
  body .cz-mapa { grid-column: 3; grid-row: 1 / span 2 }
  body .cz-seta { grid-column: 4; grid-row: 1 / span 2 }

  /* EQUIPE › COMISSÕES — 8. cartões na largura da tela */
  body .ca-seg { display: flex; flex-wrap: wrap; max-width: 100% } body .ca-seg button { flex: 1 1 auto; justify-content: center; min-height: 40px }
  body .s1-grade { grid-template-columns: minmax(0, 1fr); gap: 12px }
  body .s1-capa { padding: 14px; gap: 12px }
  body .s1c-topo { min-width: 0 } body .s1-enviada { white-space: normal }
  body .s1c-nome b { font-size: 19px; overflow-wrap: anywhere }
  body .s1c-com b, body .s1c-com b .odo, body .s1c-com b .odo span { font-size: 22px }
  body .s1c-nums { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; gap: 10px }
  body .s1c-nums b { font-size: 14.5px }
  body .s1c-ver { justify-self: stretch; justify-content: center; min-height: 40px; border-radius: 99px; background: #eff6ff }
  body .ca-pessoas { grid-template-columns: minmax(0, 1fr) }
  body .ca-conta > div { min-width: 0; flex: 1 1 140px }

  /* 9. ficha do mecânico em tela cheia de verdade */
  body .fp-fundo .fp { padding: 12px 12px 40px; grid-template-columns: minmax(0, 1fr) }
  body .fp-fundo .fp > * { min-width: 0 }
  body .fp-fundo .fp-cab { grid-template-columns: minmax(0, 1fr); padding-right: 0; gap: 12px }
  body .fp-fundo .fp-quem { flex-wrap: wrap; gap: 12px }
  body .fp-fundo .fp-foto { width: 56px; height: 56px }
  body .fp-fundo .fp-nome { flex: 1 1 160px } body .fp-fundo .fp-nome h1 { font-size: 21px; overflow-wrap: anywhere } body .fp-fundo .fp-nome p { white-space: pre-wrap }
  body .fp-fundo .fp-quem .fp-lp { margin-left: 0; flex: 1 1 100% } body .fp-fundo .fp-liga > div { min-width: 0 }
  body .fp-fundo .fp-mes { justify-self: start; max-width: 100% }
  body .fp-fundo .fp-rhg { grid-template-columns: minmax(0, 1fr) }
  body .fp-fundo .fp-fatos { grid-template-columns: repeat(2, minmax(0, 1fr)) }
  body .fp-fundo .fp-fato b, body .fp-fundo .fp-fato em { white-space: normal; overflow-wrap: anywhere }
  body .fp-fundo .mp { grid-template-columns: minmax(0, 1fr) }
  body .fp-fundo .fr-stats, body .fp-fundo .fr-gastos { grid-template-columns: repeat(2, minmax(0, 1fr)) }
  body .fp-fundo .oc2-resumo, body .fp-fundo .rh2-resumo { grid-template-columns: repeat(2, minmax(0, 1fr)) }
  body .fp-fundo .fp-row { grid-template-columns: 62px minmax(0, 1fr) auto }
  body .fp-fundo .fp-cli { grid-template-columns: minmax(0, 1fr) } body .fp-fundo .fp-row > * { min-width: 0 }
  body .fp-fundo .fr-tab { display: block; overflow-x: auto; white-space: nowrap }
  body .fp-fundo .rh2, body .fp-fundo .rh2-cols { grid-template-columns: minmax(0, 1fr) } body .fp-fundo .rh2 > *, body .fp-fundo .rh2-cols > *, body .fp-fundo .rh2-fer > * { min-width: 0; overflow-wrap: anywhere }
  body .fp-fundo .rh2-box { min-width: 0 } body .fp-fundo .rh2-barras { overflow-x: auto; gap: 8px } body .fp-fundo .rh2-barras > div { flex: 0 0 60px }
  body .fp-fundo .fld { margin: 0 0 12px; padding: 12px; min-width: 0 }
  body .fp-fundo .fld-lin, body .fp-fundo .fld:has(.fld-onde) .fld-lin { grid-template-columns: minmax(0, 1fr) auto; gap: 4px 10px }
  body .fp-fundo .fld-lin.cab { display: none } body .fp-fundo .fld-lin > * { min-width: 0; overflow-wrap: anywhere }
  /* X e faixa de troca de mecânico: o X fica na faixa, sem tapar o último nome */
  body .fp-fundo .fp-x { top: 8px; right: 10px; width: 40px; height: 40px }
  body .fp-fundo .fpt { padding: 8px 58px 8px 10px; min-height: 56px }

  /* EQUIPE › PÓDIO — 10. nome fixo ao rolar a tabela de lado; 11. cartão do vencedor */
  body .pd-hist { padding: 14px 12px }
  body .pd-hist th:first-child, body .pd-hist td:first-child { position: sticky; left: -12px; z-index: 1; background: var(--portal-bg-card, #fefefe); box-shadow: 6px 0 8px -6px rgba(15,23,42,.18) }
  body .pd-h-n { gap: 8px } body .pd-h-n b { white-space: nowrap }
  body .pd-venc { padding: 14px; gap: 12px } body .pd-venc > div:not(.pd-confete) { min-width: 0 } body .pd-venc b { font-size: 22px; overflow-wrap: anywhere }

  /* EQUIPE › TRIBUNAL — 12. cartões de pontos; 13. botões das defesas quebram de linha; 14. tabela */
  body .jm-corpo { grid-template-columns: minmax(0, 1fr) } body .jm-corpo > * { min-width: 0 }
  body .oc-sec { padding: 12px }
  body .oc-busca { flex: 1 1 100% } body .oc-filtros select { flex: 1 1 100%; min-height: 40px }
  body .oc-pilulas { display: flex; flex-wrap: wrap; border-radius: 14px } body .oc-pilulas button { flex: 1 1 auto; min-height: 36px }
  body .oc-conta { margin-left: 0; width: 100% }
  body .tp-grade { grid-template-columns: minmax(0, 1fr) }
  body .tp-c { padding: 14px 16px }
  body .rdr-caso .rdr-btn { flex: 1 1 auto; justify-content: center; min-height: 40px; white-space: normal }
  body .rdr-caso > div:first-of-type > div { overflow-wrap: anywhere }
  body .tp-def-b button { flex: 1 1 auto; min-height: 40px }
  body .tp-def-t { flex-wrap: wrap }
  body .tp-fontes { padding: 14px 12px }
  body .tp-scroll { margin: 0 -12px; padding: 0 12px }
  body .tp-tab { min-width: 520px }
  body .rdr-duas { grid-template-columns: minmax(0, 1fr) }
  body .oc-l { grid-template-columns: 46px minmax(0, 1fr) 54px }

  /* EQUIPE › LIGA — 16 */
  body .ji-escada { grid-template-columns: repeat(2, minmax(0, 1fr)) }
  body .ji-escada > * { min-width: 0 }
  body .ji-regras, body .ji-dois, body .ji-metas { grid-template-columns: minmax(0, 1fr) }
  body .ji-intro { overflow-wrap: anywhere }

  /* EQUIPE › AUTORIZAÇÕES — 17 e 18. cada OS vira um cartão com o nome de cada valor */
  body .au-lin { overflow-x: visible; border: 0; gap: 8px }
  body .au-tr, body .au-lin.dev .au-tr { grid-template-columns: repeat(3, minmax(0, 1fr)); min-width: 0; gap: 8px 10px; padding: 10px 12px; border: 1px solid var(--portal-border, #eef2f7); border-radius: 12px }
  body .au-tr + .au-tr { border-top: 1px solid var(--portal-border, #eef2f7) }
  body .au-tr > span:nth-child(1) { font-weight: 700 }
  body .au-tr > span:nth-child(2) { grid-column: 2 / -1; overflow-wrap: anywhere }
  body .au-tr > span[data-r]::before { content: attr(data-r); display: block; font-size: 11px; font-weight: 400; color: var(--portal-text-muted, #64748b) }
  body .au-tr .n { text-align: left } body .au-tr .au-tot, body .au-tr .au-com { justify-items: start }
  body .au-tr .au-dec-pv, body .au-tr .au-marca { grid-column: 1 / -1 }
  body .au-tr .au-dec-pv:empty { display: none }
  body .au-tr.au-soma > span:last-child:empty { display: none }
  body .au-sub button { min-height: 40px }
  body .au-so-cel { display: inline-block !important }
  body .au-p-cab { flex-wrap: wrap }
  body .au-conta .liq { margin-left: 0; text-align: left }
  body .au-dec > button { flex: 1 1 auto; justify-content: center; min-height: 44px }

  /* EQUIPE › TEMPÁRIO — 20. sem rolagem dentro da rolagem; 21. selo do tempo inteiro */
  body .tp-lista { max-height: none; overflow: visible }
  body .tp-lista:not(.tudo) > .tp-l:nth-child(n+41) { display: none }
  body .tp-mais { display: block !important }
  body .tp-l { grid-template-columns: minmax(0, 1fr) auto } body .tp-l > div { min-width: 0; overflow-wrap: anywhere } body .tp-l > em { white-space: nowrap }

  /* RESULTADOS › FATURAMENTO — 23. Dia/Semana/Mês/Ano um embaixo do outro; 24. cartões na largura */
  body .pt-amb .fp-escada { grid-template-columns: minmax(0, 1fr) !important }
  body .pt-amb .fp-escada > *, body .pt-amb .fp-cards > *, body .pt-amb .fp > * { min-width: 0 }
  body .pt-amb .fp-cards { grid-template-columns: minmax(0, 1fr) }
  body .pt-amb .fp-chips { grid-template-columns: minmax(0, 1fr) }
  body .pt-amb .fp-grade { grid-template-columns: repeat(2, minmax(0, 1fr)) }

  /* RESULTADOS › PARA ONDE FOI O DINHEIRO — 25. Entrou/Gastos/Pessoal em 2 colunas; 26. réguas na largura */
  body .dx-caixa { padding: 14px 12px; grid-template-columns: minmax(0, 1fr) } body .dx-caixa > * { min-width: 0 }
  body .dx-sim-ctrl { grid-template-columns: minmax(0, 1fr) } body .dx-sim-ctrl > * { min-width: 0 }
  body .dx-sim-conta { gap: 8px } body .dx-fluxo { box-sizing: border-box; min-width: 0 }
  body .dx-sim-conta-i { flex: 1 1 calc(50% - 8px) }
  body .dx-caixa.claro .dx-sim-conta-i > button, body .dx-caixa.claro .dx-sim-conta-r { padding: 10px 12px; min-width: 0 }
  body .dx-caixa.claro .dx-sim-conta-i > button b, body .dx-caixa.claro .dx-sim-conta-r b { font-size: 17px !important; overflow-wrap: anywhere }
  body .dx-esq-blocos { grid-template-columns: minmax(0, 1fr) }
  body .dx-sim, body .dx-bal, body .dx-cofre { grid-template-columns: minmax(0, 1fr) }
  body .dx-sim > *, body .dx-sim-ctrl, body .dx-sim-grupo, body .dx-sim-r { min-width: 0 }
  body .dx-sim-abas { grid-template-columns: repeat(2, minmax(0, 1fr)) }
  body .dx-sim-abas button { min-width: 0; overflow-wrap: anywhere }
  body .dx-sim-r input[type="range"] { width: 100%; min-width: 0 }
  body .dx-sim-cf { display: flex; flex-wrap: wrap; gap: 2px 10px }
  body .dx-sim-desc-l { grid-template-columns: 74px minmax(0, 1fr) auto }

  /* RESULTADOS › DINHEIRO PARADO — 27. nome do cliente com espaço; número da OS numa linha só */
  body .pc-fl { grid-template-columns: 22px minmax(0, 1fr) auto; gap: 8px; padding: 10px 12px }
  body .pc-fl-t b { white-space: nowrap } body .pc-fl-t small { overflow-wrap: anywhere }
  body .pc-fl strong { white-space: nowrap; font-size: 14px }
  body .pa-fl { grid-template-columns: 22px 40px minmax(0, 1fr) auto; gap: 8px }
  body .pa-fl > .pa-fl-b { display: none }
  body .pa-tecs, body .pa-placar, body .pc-placar { grid-template-columns: minmax(0, 1fr) }
}
`
