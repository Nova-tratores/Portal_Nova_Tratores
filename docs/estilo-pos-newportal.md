# Estilo POS NewPortal

Visual escolhido pelo José em 21/10/2026, nascido nos cartões do **Faturamento por período** (Janela Mecânicos) e
aplicado no POS inteiro. Use este arquivo como referência quando for redesenhar outra tela "no estilo do POS novo".

Código de referência:
- `src/components/pos/VisualNovoPOS.tsx` — CSS do POS inteiro (sob `body.pos-vn`, liga/desliga no menu circular)
- `src/components/comum/MenuRadial.tsx` — menu em círculo + botão redondo
- `src/components/pos/BuscaPOS.tsx` — busca com histórico e fase
- `src/components/mecanicos/FaturamentoPeriodo.tsx` (`ESTILO_FP`) — onde o cartão nasceu
- `src/components/pos/OSDrawer.tsx` (`ESTILO_PECAS_OS`) — lista de peças em colunas

## Princípios

1. **Sem negrito.** Texto normal 400; destaque no máximo 500. Nunca 700/800/900 em texto.
   - ⚠️ Ícone do Font Awesome sólido PRECISA de `font-weight: 900` — ao tirar o negrito em massa, exclua `i` e
     `[class*="fa-"]`, senão o ícone vira quadradinho.
2. **Sem CAIXA ALTA** em rótulos e títulos (`text-transform: none; letter-spacing: 0`).
3. **Texto escuro**: principal `#0f172a`, secundário `#475569`, apagado `#64748b`/`#94a3b8`.
4. **Sem faixa colorida do lado** do cartão (borda esquerda grossa). A cor aparece no ícone, na etiqueta ou no fundo
   clarinho, nunca numa faixa.
5. **Cores sempre por var do tema** (`var(--surface)`, `var(--border)`, `var(--portal-text)`…), para o modo escuro.
   Quando precisar fugir do remapeamento do escuro, use `#fefefe` / `#111111` (não `#fff` / `#111827`).
6. **Título grande e limpo**, número do valor grande (22–30 px, peso 500, `letter-spacing: -.01em`,
   `font-variant-numeric: tabular-nums`).
7. **Dinheiro no formato BR**: `toLocaleString("pt-BR", { style: "currency", currency: "BRL" })` → `R$ 2.061,00`.

## Cartão

```css
background: var(--surface);            /* branco */
border: 1px solid var(--border);       /* #e2e8f0 */
border-radius: 16px;
padding: 16px 18px 14px;
box-shadow: none;
transition: box-shadow .25s, transform .25s, border-color .25s;
/* hover */
transform: translateY(-2px);
box-shadow: 0 14px 28px -20px rgba(15,23,42,.55);
border-color: color-mix(in srgb, <cor> 35%, var(--border));
```

**Ícone em quadradinho** (no título do cartão e das seções):

```css
width: 40px; height: 40px; border-radius: 11px;      /* seção: 32px / 9px */
display: grid; place-items: center; font-size: 16px;
color: <cor>;
background: color-mix(in srgb, <cor> 9%, var(--surface));
border: 1px solid color-mix(in srgb, <cor> 18%, transparent);
```

Ícones profissionais do Font Awesome 6 (`fa-tractor`, `fa-file-invoice`, `fa-user-gear`…), nada de emoji.

## Cartão da OS (POS)

- Ícone do trator à esquerda, na cor do **tipo** (`--cor-tipo`: cliente `#2563EB`, garantia `#DB2777`,
  interna `#64748B`, pendente `#DC2626`).
- Em cima, etiqueta **OS 0846**: o número em preto com dígitos alinhados e um "OS" pequeno na cor do tipo.
  Fundo da etiqueta = cor do tipo a 8%.
- Embaixo, o cliente em 16,5 px, peso 500.
- Fase em pílula + valor grande (23 px) na mesma linha.
- Sem as bolinhas do caminho (Orçamento → Omie), que foram removidas.
- Caixa da solicitação: cantos 10. A margem interna vai na BORDA da cor do fundo, não no padding, para o corte de
  2 linhas não mostrar meia 3ª linha.

## Abas (Faturamento Cliente · Garantias · Internas · Pendentes)

Cada aba mostra a **sua cor mesmo sem estar escolhida**:
- ícone em quadradinho 26 px na cor (fundo a 11%);
- contador em pílula na cor (fundo a 12%);
- sublinhado fino (2 px) na cor a 35%;
- escolhida: fundo da cor a 9%, sublinhado cheio de 3 px, ícone e contador preenchidos (texto branco).

## Seções da janela (os-card)

- Cartão como acima; título 16 px, peso 500, sem caixa alta, ícone em quadradinho 32 px azul `#2563eb`.
- Rótulos dos campos 13 px `#475569`, sem caixa alta; campos e botões com cantos 10.
- Coluna da direita: cada bloco (Omie, notas fiscais, portal, ações) vira cartão branco igual, cantos 16, sem fundo
  colorido. Só o botão **Salvar** fica em destaque.

## Listas em colunas (ex.: peças da OS)

- Moldura com borda e cantos 14; cabeçalho 12,5 px `#475569` com fundo `var(--portal-bg-secondary)`.
- Colunas: código (link azul `#2563eb` + ⓘ) · descrição · quantidade em pílula ("2 un") · unitário cinza · total
  (peso 500), números alinhados à direita com `tabular-nums`.
- Linha com hover leve (`color-mix(#0369A1 4%)`); o lápis de editar aparece discreto.
- Rodapé em caixa clarinha: "Total de peças · N itens" + valor grande 24 px à esquerda; botões à direita
  (principal cheio, secundário com contorno), altura 40, cantos 11.

## Menu em círculo (atalhos)

- Botões redondos de 44 px no canto: **Atalhos** (degradê `#38bdf8 → #0369a1`) e **+** (nova ordem).
- Ao abrir: fundo escurecido com desfoque (`backdrop-filter: blur(9px)`), itens em círculo (raio 190 px, bolas
  brancas de 74 px com o ícone na cor do item; o hover pinta a bola), um item maior no centro, Esc ou × fecha.
- Filtros que ficam ligados (ex.: técnico) mostram um aviso pequeno na barra, para não serem esquecidos.

## Busca com histórico

- Campo vazio ao clicar → "Pesquisados recentemente": OS abertas pela busca + textos pesquisados (até 8, no
  navegador da pessoa), cada OS com a **fase de agora** em pílula com a cor da fase (`faseOS` de `lib/pos/relacao`).
- Digitando → até 6 OS que batem, com o total encontrado; setas ↑↓ + Enter escolhem; × limpa.

## Painel/ação ao clicar

Clique num cartão de número abre um **modal** com a lista do que compõe aquele valor (OS, pedidos), e cada item
abre a janela com os PDFs, sem sair da tela.
