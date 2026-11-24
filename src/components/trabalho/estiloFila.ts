// Visual da Minha fila e das opções da página de teste (NewPortal: docs/estilo-pos-newportal.md).
// Classes .mf-* ; montar com <style>{ESTILO_FILA}</style>.
/**
 * REGRA DE CORES (24/11/2026): poucas cores, cada uma com UM significado, para entender de primeira.
 *   info    cinza    — títulos, ícones, seções, situação do ticket
 *   acao    azul     — o que você pode fazer (Começar, Aceitar, Pedir, Salvar)
 *   ok      verde    — feito / fazendo agora (Concluir, cronômetro rodando)
 *   ruim    vermelho — só ATRASADO
 *   atencao amarelo  — parado há dias, sem tempo estimado, esperando aceitar
 * A cor do QUADRO aparece só na bolinha ao lado do nome dele.
 */
export const COR = { info: '#475569', acao: '#2563eb', ok: '#059669', ruim: '#dc2626', atencao: '#b45309' } as const

export const ESTILO_FILA = `
.mf{padding:clamp(12px,2vw,28px);color:var(--portal-text,#0f172a)}
.mf *{font-weight:inherit;box-sizing:border-box}
.mf i,.mf [class*="fa-"]{font-weight:900}
@keyframes mf-entra{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.mf-anim{animation:mf-entra .35s ease both}
@media (prefers-reduced-motion:reduce){.mf-anim{animation:none}.mf-card,.mf-it{transition:none!important}}
.mf-topo{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:16px}
.mf-titulo{display:flex;flex-direction:column;gap:2px;margin-right:8px}
.mf-titulo h1{margin:0;font-size:22px;font-weight:500;letter-spacing:-.01em}
.mf-titulo span{font-size:13px;color:var(--portal-text-muted,#64748b)}
.mf-aba{display:inline-flex;align-items:center;gap:8px;height:40px;padding:0 14px 0 8px;border-radius:11px;border:1px solid var(--portal-border,#e2e8f0);background:var(--portal-surface,#fefefe);color:var(--portal-text-secondary,#475569);font-size:14px;font-weight:500;cursor:pointer}
.mf-aba .ic{width:26px;height:26px;border-radius:8px;display:grid;place-items:center;color:var(--c);background:color-mix(in srgb,var(--c) 11%,transparent)}
.mf-aba.on{background:color-mix(in srgb,var(--c) 9%,var(--portal-surface,#fefefe));border-color:color-mix(in srgb,var(--c) 45%,var(--portal-border,#e2e8f0));color:var(--portal-text,#0f172a)}
.mf-aba.on .ic{background:var(--c);color:#fefefe}
.mf-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:40px;padding:0 14px;border-radius:11px;border:1px solid var(--portal-border,#e2e8f0);background:var(--portal-surface,#fefefe);color:var(--portal-text-secondary,#475569);font-size:13.5px;font-weight:500;cursor:pointer;white-space:nowrap;font-family:inherit;text-decoration:none}
.mf-btn:hover{background:var(--portal-bg-secondary,#f8fafc)}
.mf-btn.cheio{border:none;color:#fefefe;background:var(--c,#dc2626);box-shadow:0 6px 14px -8px var(--c,#dc2626)}
.mf-btn.peq{min-height:34px;padding:0 11px;font-size:13px;border-radius:10px}
.mf-btn:disabled{opacity:.5;cursor:default}
.mf-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(200px,100%),1fr));gap:12px;margin-bottom:16px}
.mf-kpi{display:flex;align-items:center;gap:12px;padding:14px 16px;border-radius:16px;border:1px solid var(--portal-border,#e2e8f0);background:var(--portal-surface,#fefefe);text-align:left;font:inherit;color:inherit;cursor:pointer;transition:box-shadow .25s,transform .25s,border-color .25s}
.mf-kpi:hover,.mf-kpi.on{transform:translateY(-2px);box-shadow:0 14px 28px -20px rgba(15,23,42,.55);border-color:color-mix(in srgb,var(--c) 35%,var(--portal-border,#e2e8f0))}
.mf-kpi.on{background:color-mix(in srgb,var(--c) 6%,var(--portal-surface,#fefefe))}
.mf-kpi b{display:block;font-size:22px;font-weight:500;letter-spacing:-.01em;font-variant-numeric:tabular-nums;line-height:1.15}
.mf-kpi small{font-size:13px;color:var(--portal-text-muted,#64748b)}
.mf-ic{flex:none;width:40px;height:40px;border-radius:11px;display:grid;place-items:center;color:var(--c);background:color-mix(in srgb,var(--c) 9%,var(--portal-surface,#fefefe));border:1px solid color-mix(in srgb,var(--c) 18%,transparent)}
.mf-ic.p{width:32px;height:32px;border-radius:9px}
.mf-grade{display:grid;grid-template-columns:minmax(0,1fr);gap:16px;align-items:start}
@media (min-width:1100px){.mf-grade{grid-template-columns:minmax(0,1.9fr) minmax(320px,1fr)}}
.mf-grade3{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(320px,100%),1fr));gap:16px;align-items:start}
.mf-col{display:flex;flex-direction:column;gap:16px;min-width:0}
.mf-card{border-radius:16px;border:1px solid var(--portal-border,#e2e8f0);background:var(--portal-surface,#fefefe);padding:14px 16px 10px}
.mf-cab{display:flex;align-items:center;gap:10px;margin-bottom:8px}
.mf-cab h2{margin:0;font-size:16px;font-weight:500}
.mf-cab span{font-size:13px;color:var(--portal-text-muted,#64748b)}
.mf-it{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:4px 12px;align-items:center;padding:10px 6px;border-top:1px solid var(--portal-border,#eef2f7);transition:background .2s}
.mf-it:first-of-type{border-top:none}
.mf-it:hover{background:color-mix(in srgb,#0369a1 4%,transparent);border-radius:10px}
.mf-pos{display:flex;align-items:center;gap:2px;color:var(--portal-text-muted,#94a3b8);font-variant-numeric:tabular-nums;font-size:13px;min-width:44px}
.mf-setas{display:flex;flex-direction:column}
.mf-setas button{border:none;background:transparent;padding:1px;cursor:pointer;color:var(--portal-text-muted,#94a3b8);display:flex;border-radius:6px}
.mf-setas button:hover:not(:disabled){color:var(--portal-text,#0f172a);background:var(--portal-bg-secondary,#f1f5f9)}
.mf-setas button:disabled{opacity:.25;cursor:default}
.mf-tit{border:none;background:transparent;padding:0;text-align:left;cursor:pointer;color:var(--portal-text,#0f172a);font:inherit;font-size:14.5px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}
.mf-tit:hover{color:#2563eb}
.mf-info{grid-column:2/4;display:flex;align-items:center;gap:6px 12px;flex-wrap:wrap;font-size:12.5px;color:var(--portal-text-secondary,#475569)}
.mf-info > span{display:inline-flex;align-items:center;gap:5px}
.mf-dot{width:8px;height:8px;border-radius:50%;background:var(--c)}
.mf-pill{padding:1px 9px;border-radius:999px;font-size:12px;color:var(--c);background:color-mix(in srgb,var(--c) 12%,transparent)}
.mf-est{padding:1px 8px;border-radius:999px;font-size:11.5px;background:rgba(234,179,8,.16);color:#a16207;border:1px solid rgba(234,179,8,.4)}
.mf-quando{font-size:12.5px;color:var(--portal-text-muted,#64748b);white-space:nowrap;text-align:right;font-variant-numeric:tabular-nums}
.mf-av{width:20px;height:20px;border-radius:50%;display:inline-grid;place-items:center;font-size:9.5px;color:#fefefe;background:#64748b;flex:none}
.mf-vazio{padding:12px 6px;font-size:13.5px;color:var(--portal-text-muted,#64748b)}
.mf-ajuda{margin-bottom:16px;padding:14px 16px;border-radius:16px;border:1px solid var(--portal-border,#e2e8f0);background:var(--portal-surface,#fefefe);font-size:13.5px;line-height:1.55;color:var(--portal-text-secondary,#475569)}
.mf-chips{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
.mf-pessoas{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(320px,100%),1fr));gap:12px}
.mf-pes{display:flex;flex-direction:column;gap:10px;padding:14px 16px;border-radius:16px;border:1px solid var(--portal-border,#e2e8f0);background:var(--portal-surface,#fefefe);transition:box-shadow .25s,transform .25s}
.mf-pes:hover{transform:translateY(-2px);box-shadow:0 14px 28px -20px rgba(15,23,42,.55)}
.mf-barra{height:8px;border-radius:999px;background:var(--portal-bg-secondary,#f1f5f9);overflow:hidden}
.mf-barra i{display:block;height:100%;border-radius:999px;background:var(--c,#2563eb);transition:width .6s ease}
@media (max-width:640px){.mf-it{grid-template-columns:auto minmax(0,1fr)}.mf-quando{grid-column:2;text-align:left}.mf-info{grid-column:1/3}}
`
