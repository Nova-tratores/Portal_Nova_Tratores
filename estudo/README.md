# Estudo do Portal — Mini-Portal em JavaScript

Objetivo: entender o portal o suficiente para fazer manutenções na mão.

Como funciona cada lição:
1. Você lê o `LICAO.md` (curto).
2. Roda o `exemplo.js` e vê funcionando.
3. Faz o `exercicio.js` (ele mesmo diz se você acertou).
4. Abre o arquivo **real** do portal indicado — é a mesma coisa.

Para rodar qualquer arquivo (no terminal do VS Code):

```
node estudo/licao-01-desresumindo/exemplo.js
```

> Esta pasta não faz parte do portal. Nada aqui muda o sistema.

---

## Roteiro

| # | Lição | O que você aprende | Arquivo real do portal |
|---|-------|--------------------|------------------------|
| 1 | Desresumindo | TypeScript → JavaScript; `=>`, `map`, `filter`, `reduce`, `?.`, `\|\|` | `src/lib/requisicoes/itens-compra.ts` |
| 2 | Datas e textos | `Date`, formatar hora, `padStart`, template string | `src/lib/feedbacks/atendimento/tempo.ts` |
| 3 | Buscar no banco | `async/await`, Supabase (`select`, `insert`, `update`) | `src/lib/supabase.ts` |
| 4 | Primeira tela | React: componente, JSX, `useState` | uma tela pequena do portal |
| 5 | Tela que carrega dados | `useEffect` + Supabase na tela | `src/app/(portal)/...` |
| 6 | Pastas viram páginas | Como o Next.js monta as rotas | `src/app/(portal)/` |
| 7 | API (o "back-end") | `route.ts`: código que roda no servidor | `src/app/api/` |
| 8 | Manutenção de verdade | Achar um texto na tela, mudar, testar, `git commit` | o portal inteiro |

## Mapa rápido do portal

```
src/app/(portal)/   → as TELAS (cada pasta = um endereço, ex.: /avisos)
src/components/     → PEDAÇOS das telas (botões, tabelas, modais)
src/lib/            → REGRAS e acesso ao banco (contas, buscas no Supabase)
src/app/api/        → código que roda no SERVIDOR (e-mail, Omie, etc.)
```

Caminho que quase todo bug segue: **tela → componente → lib → banco**.
