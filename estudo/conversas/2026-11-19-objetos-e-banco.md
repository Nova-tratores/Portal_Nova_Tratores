# Objetos e o banco de dados

Resumo da conversa com o tutor da Escola do Portal (19/11/2026), tópico "O ponto ( . )".
No fim tem a resposta que faltou: **como é no portal de verdade**.

---

## 1. O que é `trator.modelo`?

```js
const trator = { modelo: 'Trator 6075', horas: 1200 };
```

Essa linha faz duas coisas:

- `const trator` cria uma **variável** chamada `trator` (um nome que guarda algo).
- `{ modelo: ..., horas: ... }` é um **objeto**: vários valores juntos, cada um com um nome.

O ponto quer dizer "de dentro de":
`trator.horas` = "vá dentro de `trator` e pegue o valor chamado `horas`" → `1200`.

## 2. Dá para criar variável sem valor?

Sim, com `let`:

```js
let horas;          // criada, mas vazia (undefined)
horas = 1200;       // agora tem valor
```

Com `const` não dá: o valor precisa vir na mesma linha.

## 3. Para que serve um objeto?

Para **juntar dados da mesma coisa**. Em vez de três variáveis soltas (`modelo`, `horas`, `dono`), fica tudo dentro de `trator`.

## 4. Erro comum: `requisicao.peca.quantidade`

```js
const requisicao = { peca: 'Vela', quantidade: 4 };

requisicao.peca.quantidade   // undefined: procura "quantidade" dentro do texto 'Vela'
requisicao.quantidade        // 4: certo
```

Pergunte sempre: **"de dentro de quê eu estou pegando?"**

## 5. Num caso real, os dados vêm do banco?

**Sim.** Nos exemplos das lições os valores são escritos direto no código só para treinar.
No portal, quase sempre eles vêm do banco (o Supabase).

## 6. O nome da variável é o mesmo do banco?

Existem dois nomes diferentes:

| O quê | Exemplo | Quem escolhe |
|---|---|---|
| Nome da **variável** | `pedido`, `item`, `data` | quem programa, livre |
| Nome dos **campos** do objeto | `peca`, `quantidade` | iguais às **colunas** da tabela |

O nome da variável não importa para o banco. **Os nomes dos campos sim**: são eles que batem com as colunas.

---

## A resposta que faltou: é igual ao que você aprendeu nas aulas

Você lembrava: *"criar as variáveis no programa, criar as colunas com o mesmo nome no banco, conectar, mandar guardar e depois puxar"*.

**É exatamente isso.** No portal, quem faz a conexão é o `supabase`. Exemplos **reais** do arquivo
`src/lib/ajustes/boletos-fornecedor-db.ts` (tirei os tipos do TypeScript pra ficar mais fácil de ler):

### Guardar (do programa para o banco)

```js
// 1. monta um objeto com os NOMES DAS COLUNAS da tabela
const linha = {
  nome: r.nome.trim(),
  ativo: r.ativo !== false,
  dias_tolerancia: 10,
};

// 2. manda gravar na tabela fornecedores_regra_boleto, na linha com esse id
await supabase.from('fornecedores_regra_boleto').update(linha).eq('id', r.id);
```

### Puxar (do banco para o programa)

```js
const { data } = await supabase
  .from('boletos_fornecedor')   // na tabela boletos_fornecedor
  .select('*')                  // pegue todas as colunas
  .eq('id', id)                 // da linha cujo id é igual a id
  .maybeSingle();               // uma linha só

// a linha chega em "data" como um OBJETO, um campo por coluna:
data.numero
data.status
data.valor_total
```

Lendo com o que você aprendeu na Lição 0:

- **Cada ponto** entra no resultado anterior: `supabase` → `.from(...)` → `.select(...)` → `.eq(...)`.
- **Cada parênteses** entrega uma informação: o nome da tabela, quais colunas, qual linha.
- **`await`** quer dizer "espere o banco responder antes de seguir".
- **`{ data }`** é desestruturação: tira o `data` de dentro da resposta.

Então: **uma linha da tabela = um objeto no código**. Depois que o objeto chega, você usa o ponto igualzinho aos exemplos: `data.status`, `data.valor_total`.
