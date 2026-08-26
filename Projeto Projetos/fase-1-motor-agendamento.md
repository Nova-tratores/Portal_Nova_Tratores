# Fase 1 — Motor de agendamento (TypeScript isolado)

**Objetivo:** o coração do sistema. Um módulo TypeScript **puro**, sem React, sem
Supabase, sem rede — só lógica. Recebe o grafo do projeto, devolve as datas
calculadas, a folga e o caminho crítico. Será importado tanto pelo front (preview)
quanto pela Edge Function (autoritativo). Por isso: zero dependências de ambiente.

**Entrega:** um pacote local (ex.: `packages/motor-cronograma`) com tipos, o
motor e uma suíte de testes.

---

## Contrato (tipos de entrada/saída)

```ts
type TipoDep = 'FS' | 'SS' | 'FF' | 'SF';

interface Calendario {
  id: string;
  diasSemana: number[];          // ISO 1=seg ... 7=dom. "Só quartas" = [3]
  excecoes: { data: string; tipo: 'folga' | 'extra' }[];
}

interface Recurso { id: string; calendarioId: string }

interface TarefaIn {
  id: string;
  duracaoDias: number;
  restricao: 'asap' | 'iniciar_nao_antes' | 'iniciar_nao_depois' | 'data_fixa';
  restricaoData?: string;        // ISO date
  recursoId?: string;
  inicioReal?: string;           // se já começou, ancora aqui
  fimReal?: string;              // se concluída, ancora aqui
  status: 'pendente'|'bloqueada'|'em_andamento'|'concluida'|'cancelada';
}

interface DepIn {
  predecessoraId: string;
  sucessoraId: string;
  tipo: TipoDep;
  lagDias: number;
}

interface EntradaMotor {
  inicioProjeto: string;         // ISO date
  calendarioPadraoId: string;
  tarefas: TarefaIn[];
  dependencias: DepIn[];
  recursos: Recurso[];
  calendarios: Calendario[];
}

interface TarefaOut {
  id: string;
  inicioCalc: string;
  fimCalc: string;
  folgaDias: number;
  eCritica: boolean;
}

interface SaidaMotor {
  tarefas: TarefaOut[];
  fimProjeto: string;
  erros: { tipo: 'ciclo' | 'restricao_violada'; detalhe: string; ids: string[] }[];
}

declare function calcular(entrada: EntradaMotor): SaidaMotor;
```

---

## Algoritmo (implementar nesta ordem)

### 1. Aritmética de calendário (a base de tudo)
Implementar e testar **primeiro**, isolado:

- `ehDiaUtil(cal, data)` → respeita `diasSemana` e `excecoes` (`folga` remove,
  `extra` adiciona).
- `somaDiasUteis(cal, data, n)` → avança `n` dias úteis a partir de `data`,
  pulando não-úteis. Suporta `n` fracionário (duração 0.5 dia) e `n=0` (marco).
- `diasUteisEntre(cal, a, b)`.
- `proximoDiaUtil(cal, data)` / `diaUtilAnterior(cal, data)`.

> É aqui que "o pintor só trabalha quarta" funciona: o calendário do recurso da
> tarefa (`recursoId → calendarioId`) tem `diasSemana = [3]`, então
> `somaDiasUteis` só conta quartas. Se a tarefa não tem recurso, usa o calendário
> do projeto.

### 2. Construir o grafo e detectar ciclo
- Montar lista de adjacência a partir de `dependencias`.
- Ordenação topológica (Kahn). Se sobrar nó → **ciclo**: retornar em `erros` com
  os ids envolvidos e **não** calcular datas (devolver as anteriores intactas).

### 3. Forward pass (datas cedo)
Em ordem topológica, para cada tarefa:
- Se `status='concluida'` e tem `fimReal` → ancora em `inicioReal/fimReal`.
- Se `em_andamento` com `inicioReal` → começa em `inicioReal`, recalcula só o fim.
- Senão, início mais cedo = máximo entre:
  - `inicioProjeto`;
  - restrição (`iniciar_nao_antes` / `data_fixa`);
  - para cada predecessora, conforme o tipo:
    - **FS**: início_suc ≥ fim_pred + lag
    - **SS**: início_suc ≥ início_pred + lag
    - **FF**: fim_suc ≥ fim_pred + lag
    - **SF**: fim_suc ≥ início_pred + lag
  - `lag` é em dias úteis do calendário aplicável.
- `fimCalc = somaDiasUteis(cal, inicioCalc, duracaoDias)` (marco: fim = início).
- Tarefas-resumo (`tipo='resumo'`): início = min dos filhos, fim = max dos filhos
  (calculadas depois dos filhos, não entram no forward pass como duração própria).

### 4. Backward pass (datas tarde) e folga
- `fimProjeto = max(fimCalc)` de todas as folhas.
- Em ordem topológica **reversa**, calcular fim-mais-tarde e início-mais-tarde
  respeitando os sucessores (espelhando as 4 regras acima).
- `folgaDias = diasUteisEntre(inicioCalc, inicioTarde)`.
- `eCritica = folgaDias <= 0` (use um epsilon p/ fracionários).

### 5. Restrições "não depois de"
- Se `iniciar_nao_depois`/`data_fixa` for violada pelo forward pass, registrar
  `restricao_violada` em `erros` (não force silenciosamente — o usuário precisa ver).

---

## Fora do escopo desta fase (não implementar agora)
- **Nivelamento de recursos** (resolver dois trabalhos competindo pelo mesmo
  recurso no mesmo dia). A Fase 4 faz **detecção** de conflito; auto-nivelamento
  fica como evolução futura. O calendário de recurso (disponibilidade) **está** no
  escopo; a alocação concorrente não.

---

## Testes obrigatórios (casos mínimos)

1. Cadeia linear A→B→C (FS), calendário seg–sex: datas batem, todas críticas.
2. Diamante A→B, A→C, B→D, C→D: o ramo mais longo é crítico, o outro tem folga > 0.
3. Calendário "só quartas": tarefa de 3 dias começando numa segunda termina **três
   quartas depois** — esse é o caso do pintor.
4. Lag positivo e negativo em FS.
5. SS, FF e SF, um teste cada.
6. Tarefa `em_andamento` com `inicioReal` ancora e empurra sucessoras.
7. Ciclo A→B→A → retorna erro, não datas.
8. Exceção de feriado dentro de uma tarefa empurra o fim em 1 dia útil.

---

## Gate de revisão — Fase 1

- [ ] Aritmética de calendário testada isolada (inclui "só quartas" e feriado).
- [ ] Forward + backward pass corretos no diamante (folga só no ramo curto).
- [ ] Caminho crítico identificado corretamente.
- [ ] Ciclo detectado sem quebrar.
- [ ] Zero imports de React/Supabase/Node-fs — o pacote roda no browser e no Deno.

**Pare aqui e peça revisão antes da Fase 2.**
