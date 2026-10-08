// CSS responsivo compartilhado pelos módulos Estoque, Ajustes e Visual Estoque.
// Renderizado UMA vez em cada layout (estoque/ajustes/visual-estoque). As telas
// usam estilos INLINE; estas classes (prefixo .est-) só agem em telas estreitas
// (media queries) e usam !important para vencer o inline. Em telas >= 1280px
// nada aqui muda o visual (exceto .est-scroll, que é neutro).
const CSS = `
.est-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;max-width:100%}
.est-min0{min-width:0}
@media (max-width:1024px){
  .vest-tabs{overflow-x:auto;overflow-y:hidden;flex-wrap:nowrap!important;padding:10px 12px 0!important;-webkit-overflow-scrolling:touch}
  .vest-tabs>a{flex:0 0 auto;padding:10px 12px!important;white-space:nowrap}
  .cc-grid{grid-template-columns:repeat(5,minmax(0,1fr))!important}
}
@media (max-width:768px){
  .cc-grid{grid-template-columns:repeat(4,minmax(0,1fr))!important}
}
@media (max-width:480px){
  .cc-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important}
}
@media (max-width:1024px){
  .est-stack-md{grid-template-columns:minmax(0,1fr)!important}
  .est-cols2-md{grid-template-columns:repeat(2,minmax(0,1fr))!important}
  .est-wrap-md{flex-wrap:wrap!important}
}
@media (max-width:768px){
  .est-page{padding-left:12px!important;padding-right:12px!important;padding-top:14px!important}
  .est-stack{grid-template-columns:minmax(0,1fr)!important}
  .est-cols2{grid-template-columns:repeat(2,minmax(0,1fr))!important}
  .est-span-all{grid-column:1/-1!important}
  .est-wrap{flex-wrap:wrap!important}
  .est-col{flex-direction:column!important;align-items:stretch!important}
  .est-fill{width:100%!important;max-width:100%!important;min-width:0!important;flex:1 1 100%!important;margin-left:0!important}
  .est-grow{flex:1 1 140px!important;min-width:0!important;max-width:100%!important}
  .est-grow input,.est-grow select{width:100%!important;max-width:100%!important;min-width:0!important}
  .est-ml0{margin-left:0!important}
  .est-hide-sm{display:none!important}
  .est-h1{font-size:1.2rem!important}
  .est-touch button,.est-touch select,.est-touch input:not([type=checkbox]):not([type=radio]),button.est-touch,a.est-touch{min-height:36px}
  .est-touch input:not([type=checkbox]):not([type=radio]),.est-touch select,.est-touch textarea{font-size:16px!important}
  .est-pa-row{flex-direction:column!important;align-items:stretch!important}
  .est-pa-acoes{flex-direction:row!important}
  .est-pa-acoes>button{flex:1 1 0;justify-content:center}
  .pat-wrap{flex-direction:column!important;height:auto!important;overflow:visible!important}
  .pat-main{overflow:visible!important}
  .pat-hud{position:static!important}
  .pat-side{width:100%!important;border-left:none!important;border-top:1px solid var(--portal-border,#e5e5e5);max-height:75vh}
  .rank-row{grid-template-columns:minmax(0,1fr) auto!important;row-gap:4px!important}
  .rank-row>.rank-bar{grid-column:1/-1;order:3}
  .loc-ind{padding-left:8px!important}
  .loc-item{flex-wrap:wrap}
  .loc-item>div{flex:1 1 140px}
  .est-overlay{padding:8px!important}
  .est-modal{width:100%!important;max-width:calc(100vw - 16px)!important;max-height:90vh!important;overflow-y:auto!important;padding:14px!important;box-sizing:border-box}
  .est-nav{position:static!important;padding:4px 10px!important}
  .est-nav-row{flex-wrap:nowrap!important;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:thin}
  .est-nav-row>*{flex:0 0 auto}
  .est-nav-row a{padding:9px 12px!important;font-size:13px!important}
  .est-nav-tag{min-width:0!important;font-size:12px!important}
  /* Recebimentos: cards em 2 colunas com rótulo; cabeçalho de ordenar/filtrar rola sozinho */
  .rec-head{position:static!important;min-width:0!important;overflow-x:auto!important}
  .rec-card{min-width:0!important}
  .rec-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:8px 0!important}
  .rec-grid>.rec-wide{grid-column:1/-1}
  .rec-grid>[data-l]{text-align:left!important}
  .rec-grid>[data-l]::before{content:attr(data-l);display:block;font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:.3px;margin-bottom:1px}
  .rec-grid select{min-height:36px}
}
@media (max-width:480px){
  .est-stack-xs{grid-template-columns:minmax(0,1fr)!important}
  .est-cols2-xs{grid-template-columns:repeat(2,minmax(0,1fr))!important}
}
`;

export default function EstResponsiveStyles() {
  return <style dangerouslySetInnerHTML={{ __html: CSS }} />;
}
