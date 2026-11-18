# Lição 1 — Desresumindo o código

## A ideia

O portal é escrito em **TypeScript**. TypeScript = JavaScript + **etiquetas de tipo**.
Tirou as etiquetas, sobra JavaScript normal.

```ts
// TypeScript (portal)
const brl = (v: number) => v.toLocaleString('pt-BR', ...)

// JavaScript (igualzinho, sem a etiqueta ": number")
const brl = (v) => v.toLocaleString('pt-BR', ...)
```

`: number`, `: string`, `type X = {...}`, `<T>` → são só etiquetas. **Pode ignorar na leitura.**

## As 6 "abreviações" que deixam o código resumido

| Resumido | Por extenso |
|---|---|
| `const f = (x) => x * 2` | `function f(x) { return x * 2 }` |
| `lista.map(i => i.nome)` | um `for` que monta uma lista nova só com os nomes |
| `lista.filter(i => i.ativo)` | um `for` com `if` que guarda só os que passam |
| `lista.reduce((s, i) => s + i.valor, 0)` | um `for` que vai somando numa variável |
| `a \|\| 'padrão'` | "se `a` for vazio/zero/nulo, usa `'padrão'`" |
| `obj?.nome` | "se `obj` existir, pega `.nome`; senão dá `undefined` (sem erro)" |
| `cond ? x : y` | `if (cond) x else y`, numa linha |

(Sim, são 7. O `? :` vem de brinde.)

## Passo a passo

1. Abra o arquivo real: `src/lib/requisicoes/itens-compra.ts`. Só olhe. Não precisa entender ainda.
2. Abra `exemplo.js` (aqui nesta pasta). É o **mesmo código**, em JS, por extenso, comentado.
3. Rode:
   ```
   node estudo/licao-01-desresumindo/exemplo.js
   ```
4. Abra `exercicio.js`, complete as funções marcadas com `TODO` e rode:
   ```
   node estudo/licao-01-desresumindo/exercicio.js
   ```
   Ele mostra ✅ ou ❌ em cada uma.
5. Volte no arquivo real. Agora tente ler a função `totalItens` — você vai reconhecer.

## Onde isso aparece no portal

Esse arquivo é a regra da tela **Requisições → nova requisição → "O que vai comprar?"**:
soma o total dos itens e monta o texto das observações.
Se um dia o total sair errado nessa tela, **é aqui que você mexe**.
