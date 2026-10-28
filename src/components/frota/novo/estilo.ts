// Visual "Estilo POS NewPortal" (docs/estilo-pos-newportal.md) aplicado na Frota —
// José, 22/10/2026. Tudo sob a classe .fn: cartões de cantos 16, sem negrito, sem
// caixa alta, sem faixa colorida do lado, ícone em quadradinho, cores por var do tema.
export const ESTILO_FROTA_NOVO = `
.fn { --fn-surface: var(--portal-bg-card, #fefefe); --fn-border: var(--portal-border, #e2e8f0); --fn-soft: var(--portal-bg-secondary, #f8fafc);
  --fn-text: var(--portal-text, #0f172a); --fn-text2: var(--portal-text-secondary, #475569); --fn-text3: var(--portal-text-muted, #94a3b8);
  color: var(--fn-text); font-weight: 400 }
.fn *:not(i):not([class*="fa-"]) { font-weight: inherit }
.fn b, .fn strong, .fn .fn-500 { font-weight: 500 }
.fn .fn-card { background: var(--fn-surface); border: 1px solid var(--fn-border); border-radius: 16px; padding: 16px 18px 14px; box-shadow: none;
  transition: box-shadow .25s, transform .25s, border-color .25s; min-width: 0 }
.fn .fn-card.fn-click { cursor: pointer; text-align: left; font: inherit; color: inherit; width: 100% }
.fn .fn-card.fn-click:hover { transform: translateY(-2px); box-shadow: 0 14px 28px -20px rgba(15,23,42,.55);
  border-color: color-mix(in srgb, var(--fn-cor, #2563eb) 35%, var(--fn-border)) }
.fn .fn-ico { width: 40px; height: 40px; border-radius: 11px; display: grid; place-items: center; font-size: 16px; flex: none;
  color: var(--fn-cor, #2563eb); background: color-mix(in srgb, var(--fn-cor, #2563eb) 9%, var(--fn-surface));
  border: 1px solid color-mix(in srgb, var(--fn-cor, #2563eb) 18%, transparent) }
.fn .fn-ico.p { width: 32px; height: 32px; border-radius: 9px; font-size: 14px }
.fn .fn-titulo { font-size: 16px; font-weight: 500; color: var(--fn-text); display: flex; align-items: center; gap: 10px; margin: 0 }
.fn .fn-rot { font-size: 12.5px; color: var(--fn-text2) }
.fn .fn-sub { font-size: 13px; color: var(--fn-text2) }
.fn .fn-num { font-size: 22px; font-weight: 500; letter-spacing: -.01em; font-variant-numeric: tabular-nums; color: var(--fn-text) }
.fn .fn-pilula { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; padding: 2px 10px; border-radius: 999px; white-space: nowrap;
  color: color-mix(in srgb, var(--fn-cor, #64748b) 85%, #0f172a); background: color-mix(in srgb, var(--fn-cor, #64748b) 11%, var(--fn-surface));
  border: 1px solid color-mix(in srgb, var(--fn-cor, #64748b) 22%, transparent) }
.fn .fn-placa { display: inline-flex; align-items: baseline; gap: 5px; font-size: 14px; padding: 1px 9px; border-radius: 7px; font-variant-numeric: tabular-nums;
  letter-spacing: .04em; color: var(--fn-text); background: color-mix(in srgb, var(--fn-cor, #2563eb) 8%, var(--fn-surface));
  border: 1px solid color-mix(in srgb, var(--fn-cor, #2563eb) 20%, transparent) }
.fn .fn-btn { display: inline-flex; align-items: center; justify-content: center; gap: 7px; height: 38px; padding: 0 14px; border-radius: 11px; cursor: pointer;
  font: inherit; font-size: 13.5px; border: 1px solid var(--fn-border); background: var(--fn-surface); color: var(--fn-text); white-space: nowrap }
.fn .fn-btn:hover { border-color: color-mix(in srgb, #2563eb 40%, var(--fn-border)) }
.fn .fn-btn.cheio { background: #2563eb; border-color: #2563eb; color: #fefefe }
.fn .fn-btn:disabled { opacity: .5; cursor: default }
.fn .fn-chip { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px; border-radius: 999px; cursor: pointer; font: inherit; font-size: 13px;
  border: 1px solid var(--fn-border); background: var(--fn-surface); color: var(--fn-text2) }
.fn .fn-chip.on { background: color-mix(in srgb, var(--fn-cor, #2563eb) 10%, var(--fn-surface)); border-color: color-mix(in srgb, var(--fn-cor, #2563eb) 45%, transparent); color: var(--fn-text) }
.fn .fn-chip .n { font-size: 11.5px; padding: 0 7px; border-radius: 999px; background: color-mix(in srgb, var(--fn-cor, #64748b) 14%, var(--fn-surface)); color: var(--fn-text) }
.fn .fn-linha { display: flex; justify-content: space-between; gap: 12px; padding: 7px 0; border-top: 1px solid var(--fn-border); font-size: 13.5px }
.fn .fn-linha:first-child { border-top: 0 }
.fn .fn-linha > span:first-child { color: var(--fn-text2) }
.fn .fn-linha > span:last-child { text-align: right; min-width: 0; overflow-wrap: anywhere }
.fn .fn-foto { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: 10px; background: var(--fn-soft); display: block; cursor: zoom-in }
@media (prefers-reduced-motion: no-preference) {
  .fn .fn-entra { animation: fnEntra .35s ease both }
  @keyframes fnEntra { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
}
`;
