# Valtra — decodificar os desenhos (.PHF) do catálogo offline

O catálogo offline da Valtra (`cat_valt`, da OiC) guarda os desenhos das peças em
`ilust/full/*.PHF` e `ilust/zoom/*.PHF` — um formato proprietário. Sem decodificar,
não há imagem no portal.

## O que é o .PHF

É um **PCX com o primeiro byte trocado**: o magic vem `0xA0` em vez de `0x0A`.
O resto é PCX normal (paleta EGA no offset 16, dimensões nos bytes 4..11), mas os
pixels usam uma compressão própria — por isso não adianta só corrigir o byte.

A saída: em vez de reimplementar a descompressão, usamos o **decodificador
original que acompanha o catálogo** (`oic_generico_image.jar`, classe
`oic.generico.image.PcxImage`), chamado por um programinha Java.

## Como rodar

Precisa de um JDK (o catálogo traz um JRE, mas pra compilar é preciso JDK).

```bash
JDK="/c/Program Files/Eclipse Adoptium/jdk-21.0.11.10-hotspot/bin"
CV="<pasta do catálogo>/cat_valt"

# 1) compilar
"$JDK/javac" -cp "$CV/oic_generico_image.jar" -d /tmp/cls scripts/valtra-phf/PhfLote.java
"$JDK/javac" -d /tmp/cls scripts/valtra-phf/Thumbs.java

# 2) desenhos em alta (ilust/zoom ≈ 1,76x maior que ilust/full)
"$JDK/java" -Djava.awt.headless=true -cp "/tmp/cls;$CV/oic_generico_image.jar" \
  PhfLote "$CV/ilust/zoom" catalogos/valtra-img-hd

# 3) versão pequena (necessária pro fator de escala dos hotspots — ver abaixo)
"$JDK/java" -Djava.awt.headless=true -cp "/tmp/cls;$CV/oic_generico_image.jar" \
  PhfLote "$CV/ilust/full" catalogos/valtra-img

# 4) miniaturas (a grade do catálogo usa thumb_url)
"$JDK/java" -Djava.awt.headless=true -cp /tmp/cls \
  Thumbs catalogos/valtra-img-hd catalogos/valtra-thumb 480

# 5) importar
node scripts/importar-valtra.mjs
node scripts/thumbs-valtra.mjs
node scripts/capa-valtra.mjs
```

## Hotspots (as bolinhas) — a pegadinha

As coordenadas nos arquivos `*.CLI.txt` **não** são x/y/largura/altura em escala
0-10000, como parece. Receita real, extraída do bytecode do próprio navegador do
catálogo (`oic.mmt.Ilustracao.addItem`, em `_oic_mmt.jar`):

- os 4 campos são preenchidos com `0` à esquerda até 4 dígitos;
- os dígitos vêm **embaralhados entre eles**:
  - `centroX = C[0] C[2] A[3] A[1]`
  - `centroY = D[0] D[2] B[3] B[1]`  (A=campo1, B=campo2, C=campo3, D=campo4)
- o resultado já é o **centro em PIXELS** da imagem `ilust/full` (raio fixo 9).

Como servimos a imagem HD (`ilust/zoom`), o importador multiplica pelo fator real
de cada figura (≈1,759–1,766, varia por figura) — por isso o passo 3 acima é
necessário mesmo usando a HD.
