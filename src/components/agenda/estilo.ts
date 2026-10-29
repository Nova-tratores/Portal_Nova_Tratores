// AGENDA — CSS no visual do Google Agenda. Cores do tema vêm das variáveis do portal
// (claro/escuro); o azul #1a73e8 é o "hoje"/ação principal, como no Google.
export const CSS_AGENDA = `
.gc{--gc-linha:var(--portal-border,#dadce0);--gc-txt:var(--portal-text,#3c4043);--gc-muted:var(--portal-text-muted,#70757a);--gc-bg:var(--portal-surface,#fff);--gc-hover:rgba(128,134,139,.14);--gc-azul:#1a73e8;--gc-azul-claro:rgba(26,115,232,.12);
  display:flex;flex-direction:column;height:calc(100dvh - var(--gc-topo,64px));min-height:520px;background:var(--gc-bg);color:var(--gc-txt);font-size:14px;overflow:hidden}
.gc *{box-sizing:border-box}
.gc button{font:inherit;color:inherit}
.gc-muted{color:var(--gc-muted)}
.gc-barra-topo{display:flex;align-items:center;gap:4px;padding:8px 12px;border-bottom:1px solid var(--gc-linha);min-height:64px;flex:none}
.gc-icone{display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:50%;border:none;background:transparent;cursor:pointer;color:var(--gc-muted);flex:none}
.gc-icone:hover{background:var(--gc-hover)}
.gc-icone-p{width:28px;height:28px}
.gc-logo{display:flex;align-items:center;gap:8px;margin:0 18px 0 2px;font-size:22px;color:var(--gc-txt);white-space:nowrap}
.gc-logo-ic{width:36px;height:36px;border-radius:8px;background:#fff;border:1px solid var(--gc-linha);display:flex;flex-direction:column;overflow:hidden;font-weight:700}
.gc-logo-ic span:first-child{background:var(--gc-azul);height:9px}
.gc-logo-ic span:last-child{flex:1;display:flex;align-items:center;justify-content:center;font-size:15px;color:var(--gc-azul)}
.gc-btn-hoje{height:36px;padding:0 16px;border-radius:18px;border:1px solid var(--gc-linha);background:transparent;cursor:pointer;font-weight:500;margin-right:8px}
.gc-btn-hoje:hover{background:var(--gc-hover)}
.gc-titulo-per{font-size:22px;margin-left:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.gc-direita{margin-left:auto;display:flex;align-items:center;gap:6px}
.gc-busca{display:flex;align-items:center;gap:6px;height:40px;padding:0 10px;border-radius:8px;background:var(--gc-hover);width:260px}
.gc-busca input{border:none;outline:none;background:transparent;color:var(--gc-txt);width:100%;font-size:14px}
.gc-select-vista{height:36px;padding:0 12px;border-radius:6px;border:1px solid var(--gc-linha);background:var(--gc-bg);color:var(--gc-txt);font-size:14px;cursor:pointer}
.gc-progresso{height:3px;background:linear-gradient(90deg,transparent,var(--gc-azul),transparent);background-size:200% 100%;animation:gcprog 1s linear infinite;flex:none}
@keyframes gcprog{from{background-position:200% 0}to{background-position:-200% 0}}
.gc-meio{display:flex;flex:1;min-height:0}
.gc-lateral{width:256px;flex:none;overflow-y:auto;padding:8px 8px 24px 8px}
.gc-criar{display:inline-flex;align-items:center;gap:12px;height:56px;padding:0 24px 0 16px;margin:8px 0 16px 0;border-radius:16px;border:none;background:var(--gc-bg);box-shadow:0 1px 3px rgba(60,64,67,.3),0 4px 8px 3px rgba(60,64,67,.15);cursor:pointer;font-weight:500;font-size:14px}
.gc-criar:hover{box-shadow:0 1px 3px rgba(60,64,67,.3),0 6px 12px 4px rgba(60,64,67,.15);background:var(--gc-hover)}
.gc-mais-cor{width:36px;height:36px;position:relative}
.gc-mais-cor:before,.gc-mais-cor:after{content:'';position:absolute;left:50%;top:50%;border-radius:2px}
.gc-mais-cor:before{width:24px;height:5px;transform:translate(-50%,-50%);background:linear-gradient(90deg,#ea4335 0 50%,#4285f4 50%)}
.gc-mais-cor:after{width:5px;height:24px;transform:translate(-50%,-50%);background:linear-gradient(180deg,#fbbc04 0 50%,#34a853 50%)}
.gc-mini{padding:0 4px 8px 8px}
.gc-mini-cab{display:flex;align-items:center;gap:2px;font-weight:500;padding:4px 0 6px 6px}
.gc-mini-cab span{flex:1}
.gc-mini-cab span::first-letter{text-transform:uppercase}
.gc-mini-grade{display:grid;grid-template-columns:repeat(7,1fr);text-align:center;row-gap:2px}
.gc-mini-sem{font-size:10px;font-weight:500;color:var(--gc-muted);height:24px;line-height:24px}
.gc-mini-dia{width:28px;height:28px;margin:0 auto;border-radius:50%;border:none;background:transparent;font-size:11px;cursor:pointer}
.gc-mini-dia:hover{background:var(--gc-hover)}
.gc-mini-dia.gc-fora{color:var(--gc-muted)}
.gc-mini-hoje{background:var(--gc-azul)!important;color:#fff!important;font-weight:600}
.gc-mini-sel{background:var(--gc-azul-claro);color:var(--gc-azul);font-weight:600}
.gc-mini-faixa{background:var(--gc-hover)}
.gc-busca-pessoas{display:flex;align-items:center;gap:8px;margin:8px 4px 4px 8px;padding:0 10px;height:40px;border-radius:6px;background:var(--gc-hover)}
.gc-busca-pessoas input{border:none;outline:none;background:transparent;color:var(--gc-txt);width:100%;font-size:14px}
.gc-grupo{margin-top:6px}
.gc-grupo-cab{display:flex;align-items:center;gap:4px;padding:2px 0 2px 4px;border-radius:0 16px 16px 0;cursor:pointer;user-select:none}
.gc-grupo-cab:hover{background:var(--gc-hover)}
.gc-grupo-cab b{flex:1;font-weight:500;font-size:14px;padding:6px 0}
.gc-grupo-cab small{color:var(--gc-muted);font-size:12px;margin-right:4px}
.gc-agenda-linha{display:flex;align-items:center;gap:10px;padding:0 4px 0 12px;height:32px;border-radius:0 16px 16px 0;cursor:pointer;user-select:none;position:relative}
.gc-agenda-linha:hover{background:var(--gc-hover)}
.gc-agenda-linha .gc-so{display:none;margin-left:auto;font-size:11px;padding:2px 8px;border-radius:10px;border:1px solid var(--gc-linha);background:var(--gc-bg);cursor:pointer;color:var(--gc-muted)}
.gc-agenda-linha:hover .gc-so{display:inline-block}
@media (hover:none){.gc-agenda-linha .gc-so{display:inline-block}}
.gc-agenda-linha:focus-visible{outline:2px solid var(--gc-azul);outline-offset:-2px}
.gc-caixa-traco{width:10px;height:2px;border-radius:1px}
.gc-sel-rapida{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:6px;margin:6px 4px 2px 12px;font-size:12px}
.gc-sel-botoes{display:flex;gap:4px}
.gc-chip-p{padding:3px 10px;font-size:12px}
.gc-tipo-rotulo{font-size:12px;color:var(--gc-muted);margin:12px 0 6px}
.gc-tipo-drop{position:relative;max-width:360px}
.gc-tipo-botao{display:flex;align-items:center;gap:8px;width:100%;height:40px;padding:0 12px;border:1px solid var(--gc-linha);border-radius:8px;background:var(--gc-bg);color:var(--gc-txt);font-size:14px;cursor:pointer;text-align:left}
.gc-tipo-botao:hover{background:var(--gc-hover)}
.gc-tipo-menu{position:absolute;left:0;right:0;top:44px;z-index:20;background:var(--gc-bg);border-radius:10px;box-shadow:0 6px 20px rgba(0,0,0,.2);max-height:320px;overflow-y:auto;padding:6px 0;min-width:300px}
.gc-tipo-op{display:flex;align-items:center;gap:10px;width:100%;border:none;background:transparent;padding:7px 12px;cursor:pointer;color:var(--gc-txt);text-align:left}
.gc-tipo-op:hover,.gc-tipo-op-on{background:var(--gc-hover)}
.gc-tipo-ic{width:28px;height:28px;border-radius:8px;display:grid;place-items:center;flex:none}
.gc-tipo-txt{flex:1;min-width:0;display:flex;flex-direction:column}
.gc-tipo-txt span{font-size:14px}.gc-tipo-txt small{font-size:11.5px;color:var(--gc-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gc-tipo-limpar{justify-content:center;font-size:13px;color:var(--gc-muted);border-top:1px solid var(--gc-linha);margin-top:4px}
.gc-tipo-nota{margin-top:8px;font-size:12.5px;line-height:1.45;padding:8px 10px;border-radius:8px;background:color-mix(in srgb,#7c3aed 9%,transparent);color:var(--gc-txt)}
.gc-tipo-nota b{font-weight:500}
.gc-convidado .gc-avatar{flex:none;flex-direction:row}
.gc-tipos{display:flex;flex-wrap:wrap;gap:6px}
.gc-tipo{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--gc-linha);background:transparent;border-radius:16px;padding:5px 11px;font-size:13px;cursor:pointer;color:var(--gc-txt)}
.gc-tipo:hover{background:var(--gc-hover)}
.gc-tipo-on{font-weight:500}
.gc-tipos-compacto{gap:4px;max-height:96px;overflow-y:auto}
.gc-tipos-compacto .gc-tipo{padding:3px 9px;font-size:12px;gap:4px}
.gc-tipo-selo{display:inline-flex;align-items:center;gap:5px;margin-top:6px;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:500}
.gc-ev-tit svg,.gc-ev-linha svg{vertical-align:-1px}
.gc-agenda-nome{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:14px}
.gc-caixa{width:18px;height:18px;border-radius:3px;border:2px solid;display:inline-flex;align-items:center;justify-content:center;flex:none}
.gc-sep{height:1px;background:var(--gc-linha);margin:12px 8px}
.gc-rodape-lat{padding:6px 12px;font-size:13px}
.gc-principal{flex:1;min-width:0;display:flex;flex-direction:column;border-left:1px solid var(--gc-linha)}
.gc-avisos{padding:8px 16px;background:rgba(251,188,4,.15);color:var(--gc-txt);font-size:13px;border-bottom:1px solid var(--gc-linha)}
/* grade de horas */
.gc-grade{flex:1;min-height:0;overflow-x:auto;overflow-y:hidden;display:flex}
.gc-grade-in{display:flex;flex-direction:column;flex:1;min-height:0;min-width:0}
.gc-cab,.gc-topo,.gc-corpo{display:grid}
.gc-cab{flex:none;padding-right:var(--gc-barra,0px)}
.gc-fuso{font-size:10px;color:var(--gc-muted);display:flex;align-items:flex-end;justify-content:flex-end;padding:0 8px 4px 0}
.gc-cab-col{display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 0 6px;border:none;background:transparent;cursor:pointer;min-width:0}
.gc-cab-sem{font-size:11px;font-weight:500;color:var(--gc-muted);letter-spacing:.8px}
.gc-cab-num{font-size:26px;width:46px;height:46px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:var(--gc-txt)}
.gc-cab-col:hover .gc-cab-num{background:var(--gc-hover)}
.gc-hoje .gc-cab-sem{color:var(--gc-azul)}
.gc-hoje .gc-cab-num{background:var(--gc-azul)!important;color:#fff}
.gc-cab-pessoa{cursor:default;padding:8px 4px}
.gc-cab-nome{font-size:13px;font-weight:500;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gc-cab-setor{font-size:11px;color:var(--gc-muted)}
.gc-avatar{width:32px;height:32px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-weight:600;font-size:12px;overflow:hidden;flex:none}
.gc-avatar img{width:100%;height:100%;object-fit:cover}
.gc-topo{flex:none;border-bottom:1px solid var(--gc-linha);padding-right:var(--gc-barra,0px)}
.gc-topo-gutter{display:flex;align-items:flex-start;justify-content:center;padding-top:2px}
.gc-topo-mais{border:none;background:transparent;cursor:pointer;color:var(--gc-muted);font-size:14px;width:28px;height:28px;border-radius:50%}
.gc-topo-mais:hover{background:var(--gc-hover)}
.gc-topo-area{position:relative;min-height:28px}
.gc-topo-cel{position:absolute;top:0;bottom:0;border-left:1px solid var(--gc-linha);cursor:pointer}
.gc-topo-esc{position:absolute;left:4px;border:none;background:transparent;cursor:pointer;font-size:12px;font-weight:500;color:var(--gc-muted);padding:1px 6px;border-radius:4px}
.gc-topo-esc:hover{background:var(--gc-hover)}
.gc-barra{position:absolute;height:20px;border:none;border-radius:4px;padding:0 8px;font-size:12px;font-weight:500;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;z-index:2}
.gc-barra-hora{font-weight:400;margin-right:6px}
.gc-cont-antes{border-top-left-radius:0;border-bottom-left-radius:0}
.gc-rolagem{flex:1;overflow-y:auto;overflow-x:hidden;min-height:0}
.gc-horas{position:relative}
.gc-hora{position:relative;font-size:10px;color:var(--gc-muted);text-align:right;padding-right:8px}

.gc-cols{display:grid;position:relative}
.gc-col{position:relative;border-left:1px solid var(--gc-linha);touch-action:none}
.gc-linha{position:absolute;left:0;right:0;border-top:1px solid var(--gc-linha);pointer-events:none}
.gc-linha:first-child{border-top:none}
.gc-agora{position:absolute;left:-1px;right:0;border-top:2px solid #ea4335;z-index:20;pointer-events:none}
.gc-agora span{position:absolute;left:-6px;top:-7px;width:12px;height:12px;border-radius:50%;background:#ea4335}
.gc-ev{position:absolute;border-radius:4px;padding:2px 6px;font-size:12px;line-height:1.3;overflow:hidden;display:flex;flex-direction:column;border:1px solid var(--gc-bg);user-select:none;touch-action:none}
.gc-ev:hover{box-shadow:0 1px 3px rgba(0,0,0,.25)}
.gc-ev-tit{font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gc-ev-hora{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:.92}
.gc-ev-linha{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gc-ev-linha b{font-weight:500}
.gc-ev-movendo{box-shadow:0 6px 18px rgba(0,0,0,.3);opacity:.92;cursor:grabbing!important}
.gc-ev-alca{position:absolute;left:0;right:0;bottom:0;height:7px;cursor:ns-resize}
.gc-ghost{position:absolute;left:1px;right:8px;border-radius:4px;background:var(--gc-azul);color:#fff;padding:2px 6px;font-size:12px;display:flex;flex-direction:column;box-shadow:0 6px 18px rgba(0,0,0,.25);z-index:25;pointer-events:none}
.gc-esmaecido{opacity:.55}
.gc-col-hoje{background:rgba(26,115,232,.03)}
/* mês */
.gc-mes{flex:1;display:grid;grid-auto-rows:minmax(96px,1fr);overflow-y:auto;border-top:1px solid var(--gc-linha)}
.gc-mes-cel{border-right:1px solid var(--gc-linha);border-bottom:1px solid var(--gc-linha);padding:4px 4px 2px;display:flex;flex-direction:column;gap:1px;min-width:0;cursor:pointer;overflow:hidden}
.gc-mes-cel.gc-fora .gc-mes-num{color:var(--gc-muted)}
.gc-mes-sem{font-size:11px;font-weight:500;color:var(--gc-muted);text-align:center}
.gc-mes-num{align-self:center;border:none;background:transparent;cursor:pointer;font-size:12px;font-weight:500;min-width:24px;height:24px;border-radius:12px;padding:0 6px}
.gc-mes-num:hover{background:var(--gc-hover)}
.gc-hoje-num{background:var(--gc-azul)!important;color:#fff!important}
.gc-mes-ev{display:flex;align-items:center;gap:4px;border:none;background:transparent;border-radius:4px;padding:1px 4px;font-size:12px;text-align:left;cursor:pointer;white-space:nowrap;overflow:hidden;min-height:20px}
.gc-mes-ev:hover{background:var(--gc-hover)}
.gc-mes-barra{font-weight:500}
.gc-mes-hora{color:var(--gc-muted);flex:none}
.gc-mes-tit{overflow:hidden;text-overflow:ellipsis}
.gc-mes-mais{border:none;background:transparent;font-size:12px;font-weight:500;text-align:left;padding:1px 4px;cursor:pointer;border-radius:4px}
.gc-mes-mais:hover{background:var(--gc-hover)}
.gc-ponto{width:8px;height:8px;border-radius:50%;flex:none;display:inline-block}
.gc-ponto-g{width:12px;height:12px}
/* programação */
.gc-lista{flex:1;overflow-y:auto;padding:8px 16px 40px}
.gc-lista-dia{display:flex;gap:12px;border-bottom:1px solid var(--gc-linha);padding:10px 0}
.gc-lista-data{width:110px;flex:none;display:flex;align-items:flex-start;gap:8px;padding-top:2px}
.gc-lista-num{font-size:22px;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center}
.gc-lista-sem{font-size:11px;font-weight:500;color:var(--gc-muted);padding-top:12px}
.gc-hoje .gc-lista-num{background:var(--gc-azul);color:#fff}
.gc-hoje .gc-lista-sem{color:var(--gc-azul)}
.gc-lista-itens{flex:1;min-width:0}
.gc-lista-item{display:flex;align-items:center;gap:14px;width:100%;border:none;background:transparent;text-align:left;padding:8px 10px;border-radius:20px;cursor:pointer}
.gc-lista-item:hover{background:var(--gc-hover)}
.gc-lista-hora{width:120px;flex:none;font-size:13px}
.gc-lista-tit{display:flex;flex-direction:column;min-width:0}
.gc-lista-tit b{font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gc-lista-tit small{color:var(--gc-muted);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gc-lista-vazia{flex:1;display:flex;align-items:center;justify-content:center;color:var(--gc-muted);padding:40px}
/* popovers e modais */
.gc-fundo-leve{position:fixed;inset:0;z-index:9000}
.gc-fundo{position:fixed;inset:0;z-index:9000;background:rgba(32,33,36,.4);display:flex;align-items:flex-start;justify-content:center;padding:5vh 12px;overflow-y:auto}
.gc-pop{position:fixed;background:var(--gc-bg);color:var(--gc-txt);border-radius:8px;box-shadow:0 24px 38px 3px rgba(0,0,0,.14),0 9px 46px 8px rgba(0,0,0,.12),0 11px 15px -7px rgba(0,0,0,.2);padding:6px 0 16px;max-height:90vh;overflow-y:auto}
.gc-pop-acoes{display:flex;justify-content:flex-end;gap:2px;padding:0 6px}
.gc-pop-linha{display:flex;gap:16px;padding:6px 20px 6px 18px;align-items:flex-start}
.gc-pop-ic{width:22px;flex:none;display:flex;justify-content:center;color:var(--gc-muted);padding-top:2px}
.gc-quadrado{width:14px;height:14px;border-radius:4px;margin-top:6px}
.gc-pop-tit{font-size:22px;line-height:28px;word-break:break-word}
.gc-riscado{text-decoration:line-through}
.gc-pop-sub{font-size:14px;color:var(--gc-txt);margin-top:2px}
.gc-pop-txt{font-size:14px;line-height:20px;word-break:break-word}
.gc-pre{white-space:pre-wrap}
.gc-pop-pessoas{display:flex;flex-direction:column;gap:6px;margin-top:8px;max-height:220px;overflow-y:auto}
.gc-pop-pessoa{display:flex;align-items:center;gap:10px}
.gc-pop-nome{font-size:14px}
.gc-pop-nome small{color:var(--gc-muted)}
.gc-resp{position:absolute;right:-3px;bottom:-3px;width:14px;height:14px;border-radius:50%;font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center;color:#fff;border:2px solid var(--gc-bg)}
.gc-resp-sim{background:#0b8043}.gc-resp-nao{background:#d50000}.gc-resp-talvez{background:#70757a}
.gc-pop-rodape{display:flex;align-items:center;gap:8px;padding:10px 20px 0 56px;flex-wrap:wrap}
.gc-chip-fonte{font-size:12px;padding:2px 10px;border-radius:12px;background:var(--gc-hover);color:var(--gc-muted)}
.gc-btn-txt{display:inline-flex;align-items:center;gap:4px;border:none;background:transparent;color:var(--gc-azul)!important;font-weight:500;padding:8px 12px;border-radius:4px;cursor:pointer;text-decoration:none;font-size:14px}
.gc-btn-txt:hover{background:var(--gc-azul-claro)}
.gc-btn-txt.gc-muted{color:var(--gc-muted)!important}
.gc-btn-azul{height:36px;padding:0 24px;border-radius:4px;border:none;background:var(--gc-azul);color:#fff!important;font-weight:500;cursor:pointer;flex:none}
.gc-btn-azul:disabled{opacity:.45;cursor:default}
.gc-btn-azul:not(:disabled):hover{box-shadow:0 1px 3px rgba(26,115,232,.5)}
.gc-pop-rsvp{display:flex;align-items:center;gap:8px;border-top:1px solid var(--gc-linha);margin-top:12px;padding:12px 20px 0 56px;font-size:14px;flex-wrap:wrap}
.gc-pop-rsvp span{margin-right:auto}
.gc-rsvp{border:1px solid var(--gc-linha);background:transparent;border-radius:16px;padding:4px 14px;cursor:pointer;font-size:13px}
.gc-rsvp-on{background:var(--gc-azul-claro);border-color:var(--gc-azul);color:var(--gc-azul)!important;font-weight:500}
.gc-pop-confirma{margin:4px 16px 8px;padding:10px 12px;border-radius:8px;background:var(--gc-hover);display:flex;flex-direction:column;align-items:flex-start;gap:2px}
.gc-pop-botoes{display:flex;justify-content:flex-end;gap:8px;padding:12px 20px 0}
.gc-titulo-input{width:100%;border:none;border-bottom:1px solid var(--gc-linha);outline:none;background:transparent;color:var(--gc-txt);font-size:22px;padding:6px 0}
.gc-titulo-input:focus{border-bottom:2px solid var(--gc-azul)}
.gc-aba-tipo{display:flex;gap:8px;margin:10px 0 4px}
.gc-aba-on{background:var(--gc-azul-claro);color:var(--gc-azul);padding:6px 12px;border-radius:4px;font-weight:500;font-size:13px}
.gc-modal{width:100%;max-width:760px;background:var(--gc-bg);color:var(--gc-txt);border-radius:8px;box-shadow:0 24px 38px 3px rgba(0,0,0,.14),0 9px 46px 8px rgba(0,0,0,.12);overflow:visible}
.gc-modal-p{max-width:600px}
.gc-modal-topo{display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--gc-linha)}
.gc-titulo-grande{flex:1;min-width:0;border:none;border-bottom:1px solid var(--gc-linha);outline:none;background:var(--gc-hover);color:var(--gc-txt);font-size:22px;padding:8px 12px;border-radius:4px 4px 0 0}
.gc-titulo-grande:focus{border-bottom:2px solid var(--gc-azul)}
.gc-modal-corpo{padding:16px 24px 24px 24px;display:flex;flex-direction:column;gap:12px}
.gc-modal input[type=date],.gc-modal input[type=time],.gc-modal select{height:36px;padding:0 10px;border-radius:4px;border:none;background:var(--gc-hover);color:var(--gc-txt);font-size:14px}
.gc-datas{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.gc-linha-opcoes{display:flex;align-items:center;gap:16px;flex-wrap:wrap}
.gc-check{display:inline-flex;align-items:center;gap:8px;cursor:pointer;font-size:14px}
.gc-secao{display:flex;align-items:center;gap:10px;margin-top:8px;color:var(--gc-muted)}
.gc-secao b{color:var(--gc-txt);font-weight:500}
.gc-busca-convidado{position:relative;display:flex;align-items:center;gap:8px;background:var(--gc-hover);border-radius:4px;padding:0 10px;height:40px;color:var(--gc-muted)}
.gc-busca-convidado input{flex:1;border:none;outline:none;background:transparent;color:var(--gc-txt);font-size:14px;height:100%}
.gc-sugestoes{position:absolute;left:0;right:0;top:44px;background:var(--gc-bg);color:var(--gc-txt);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.2);z-index:10;max-height:300px;overflow-y:auto;padding:6px 0}
.gc-sug{display:flex;align-items:center;gap:10px;width:100%;border:none;background:transparent;padding:6px 14px;text-align:left;cursor:pointer;color:var(--gc-txt)}
.gc-sug:hover,.gc-sug-on{background:var(--gc-hover)}
.gc-sug-vazio{padding:10px 14px;font-size:13px;color:var(--gc-muted)}
.gc-sug small{margin-left:auto;color:var(--gc-muted);font-size:12px}
.gc-sug-setores{display:flex;flex-wrap:wrap;gap:6px;padding:6px 12px 8px;border-bottom:1px solid var(--gc-linha);margin-bottom:4px}
.gc-chip{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--gc-linha);background:transparent;border-radius:16px;padding:5px 12px;font-size:13px;cursor:pointer;color:var(--gc-txt)}
.gc-chip:hover{background:var(--gc-hover)}
.gc-chip-on{background:var(--gc-azul-claro);border-color:var(--gc-azul);color:var(--gc-azul)!important;font-weight:500}
.gc-chips{display:flex;flex-wrap:wrap;gap:8px}
.gc-convidados{display:flex;flex-direction:column;gap:2px;margin-top:6px}
.gc-convidado{display:flex;align-items:center;gap:10px;padding:4px 6px;border-radius:4px}
.gc-convidado:hover{background:var(--gc-hover)}
.gc-convidado span{flex:1;display:flex;flex-direction:column;font-size:14px}
.gc-convidado small{color:var(--gc-muted);font-size:12px}
.gc-campo-ic{display:flex;align-items:center;gap:12px;color:var(--gc-muted)}
.gc-campo-ic.gc-topo-al{align-items:flex-start}
.gc-campo-ic.gc-topo-al svg{margin-top:10px}
.gc-campo-ic input,.gc-campo-ic textarea{flex:1;border:none;outline:none;background:var(--gc-hover);color:var(--gc-txt);font-size:14px;padding:10px 12px;border-radius:4px;font-family:inherit;resize:vertical}
.gc-cores{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.gc-cor{width:24px;height:24px;border-radius:50%;border:none;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;color:#fff}
.gc-cor-on{outline:2px solid var(--gc-txt);outline-offset:2px}
.gc-erro{color:#d93025;font-size:13px;font-weight:500}
.gc-aviso{background:rgba(251,188,4,.15);border-radius:6px;padding:8px 12px;font-size:13px}
.gc-grade-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr));gap:12px;margin-top:12px}
.gc-grade-form label{display:flex;flex-direction:column;gap:6px;font-size:12px;font-weight:500;color:var(--gc-muted)}
.gc-segmentado{display:flex;border:1px solid var(--gc-linha);border-radius:4px;overflow:hidden}
.gc-segmentado button{flex:1;height:34px;border:none;background:transparent;cursor:pointer;font-size:13px;color:var(--gc-txt)}
.gc-segmentado button+button{border-left:1px solid var(--gc-linha)}
.gc-seg-on{background:var(--gc-azul-claro)!important;color:var(--gc-azul)!important;font-weight:500}
.gc-toast{position:fixed;left:24px;bottom:24px;z-index:9100;background:#323232;color:#fff;padding:14px 20px;border-radius:4px;font-size:14px;box-shadow:0 3px 5px -1px rgba(0,0,0,.2),0 6px 10px rgba(0,0,0,.14);display:flex;align-items:center;gap:16px}
.gc-toast button{border:none;background:transparent;color:#8ab4f8!important;font-weight:500;cursor:pointer}
.gc-atalhos{display:grid;grid-template-columns:auto 1fr;gap:8px 16px;font-size:14px}
.gc-atalhos kbd{display:inline-block;min-width:24px;text-align:center;padding:2px 8px;border-radius:4px;border:1px solid var(--gc-linha);background:var(--gc-hover);font-family:inherit;font-size:13px}
@media (max-width:900px){
  .gc-busca{display:none}.gc-logo b{display:none}.gc-titulo-per{font-size:18px}
  .gc-lateral{position:fixed;left:0;top:0;bottom:0;z-index:1400;background:var(--gc-bg);box-shadow:0 0 24px rgba(0,0,0,.25);padding-top:16px}
  .gc-lista-hora{width:80px}.gc-lista-data{width:70px}
}
@media (max-width:600px){
  .gc-barra-topo{gap:0;padding:6px 4px;min-height:52px}
  .gc-logo,.gc-so-largo{display:none}
  .gc-btn-hoje{padding:0 10px;margin-right:2px}
  .gc-titulo-per{font-size:15px;margin-left:2px}
  .gc-select-vista{padding:0 4px;max-width:96px}
  .gc-topo-esc{white-space:nowrap;font-size:11px;left:0}
}
`
