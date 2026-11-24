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
@media (prefers-reduced-motion:reduce){.mf-anim{animation:none}.mf-card,.mf-it{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:4px 12px;align-items:center;padding:10px 12px 10px 8px;margin-top:8px;border:1px solid var(--portal-border,#e2e8f0);border-radius:12px;background:var(--portal-surface,#fefefe);transition:box-shadow .2s,border-color .2s,opacity .2s}
.mf-it:hover{border-color:color-mix(in srgb,#2563eb 35%,var(--portal-border,#e2e8f0));box-shadow:0 8px 18px -14px rgba(15,23,42,.45)}
.mf-it[draggable="true"]{cursor:grab}
.mf-it.arrastando{opacity:.45}
.mf-it.sobre{box-shadow:0 -3px 0 0 #2563eb}
.mf-alca{display:grid;place-items:center;color:var(--portal-text-muted,#94a3b8);cursor:grab}
.mf-it:hover .mf-alca{color:var(--portal-text,#0f172a)}
@media (hover:none){.mf-alca{display:none}}
.mf-pos{display:flex;align-items:center;gap:2px;color:var(--portal-text-muted,#94a3b8);font-variant-numeric:tabular-nums;font-size:13px;min-width:44px}
.mf-setas{display:flex;flex-direction:column}
.mf-setas button{border:1px solid var(--portal-border,#e2e8f0);background:var(--portal-surface,#fefefe);padding:1px 3px;cursor:pointer;color:var(--portal-text-secondary,#475569);display:flex;border-radius:6px;margin:1px 0}
.mf-setas button:hover:not(:disabled){color:var(--portal-text,#0f172a);background:var(--portal-bg-secondary,#f1f5f9)}
.mf-setas button:disabled{opacity:.25;cursor:default}
.mf-tit{border:none;background:transparent;padding:0;text-align:left;cursor:pointer;color:var(--portal-text,#0f172a);font:inherit;font-size:14.5px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}
.mf-tit:hover{color:#2563eb}
.mf-info{grid-column:2/4;display:flex;align-items:center;gap:6px 12px;flex-wrap:wrap;font-size:12.5px;color:var(--portal-text-secondary,#475569)}
.mf-info > span,.mf-info > button{display:inline-flex;align-items:center;gap:5px}
.mf-info > * + *::before{content:'·';margin-right:7px;color:var(--portal-text-muted,#cbd5e1)}
.mf-link{border:none;background:transparent;padding:0;cursor:pointer;font:inherit;color:inherit;text-decoration:underline dotted;text-underline-offset:3px}
.mf-link:hover{color:#2563eb}
.mf-aviso{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 14px;border-radius:14px;font-size:13.5px;color:var(--portal-text-secondary,#475569);background:color-mix(in srgb,#b45309 6%,var(--portal-surface,#fefefe));border:1px solid color-mix(in srgb,#b45309 25%,var(--portal-border,#e2e8f0))}
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
.mf-eq-lin{display:grid;grid-template-columns:minmax(200px,1.1fr) minmax(0,2fr) 230px;gap:16px;align-items:center;padding:10px 8px;border-radius:12px;cursor:pointer}
.mf-eq-lin:hover{background:color-mix(in srgb,#0369a1 4%,transparent)}
@media (max-width:760px){.mf-eq-lin{grid-template-columns:1fr}}
.mf-barra{height:8px;border-radius:999px;background:var(--portal-bg-secondary,#f1f5f9);overflow:hidden}
.mf-barra i{display:block;height:100%;border-radius:999px;background:var(--c,#2563eb);transition:width .6s ease}
@media (max-width:640px){.mf-it{grid-template-columns:auto minmax(0,1fr)}.mf-quando{grid-column:2;text-align:left}.mf-info{grid-column:1/3}}
`
