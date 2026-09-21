# Workflow Obrigatório de Desenvolvimento — Galaxia

> **Este arquivo deve ser lido e seguido por qualquer agente de qualquer modelo** (Grok, Claude, Cursor, Windsurf, etc.).

## 1. Issues + Pull Requests (Padrão Inviolável)

### Regra fundamental
**Toda Tarefa** (Correção, Melhoria ou Nova Função) **deve** começar com uma GitHub Issue.

### Fluxo obrigatório
1. Criar Issue com título claro e body detalhado.
2. Aplicar labels:
   - `bug` → Correção
   - `enhancement` → Melhoria
   - `feature` → Nova função
   - `documentation` / `ui` / `quality` / `testing` conforme necessário
3. Trabalhar **sempre** em branch derivada da Issue:
   - `feature/issue-N-descricao-curta`
   - `fix/issue-N-descricao-curta`
   - `chore/issue-N-descricao-curta`
4. Abrir Pull Request **sempre** mencionando a Issue na descrição:
   ```markdown
   Closes #N
   ```
   ou
   ```markdown
   Related to #N
   ```
5. Deploy **só ocorre** via merge de PR (nunca commit direto em `main`).
6. CI (lint, testes, quality gates) deve passar antes do merge.

### Por que este padrão?
- Rastreabilidade total
- Histórico limpo
- Revisão obrigatória
- Facilita rollback e auditoria

---

## 2. Motion Principles (UI)

Toda interface do sistema **deve** seguir a skill [Design Motion Principles](https://github.com/kylezantos/design-motion-principles).

### Requisitos obrigatórios em **todos** os elementos:
- Skeleton loaders
- Lazy loading
- Animações suaves de:
  - Entrada
  - Saída
  - Carregamento
  - Progresso

### Como aplicar
```bash
npx skills add kylezantos/design-motion-principles
```

Usar as três lentes com **Frequency Gate**:
- **Emil Kowalski** → restraint & speed (produtividade)
- **Jakub Krehel** → production polish
- **Jhey Tompkins** → creative experimentation

Documentação detalhada: `.grok/skills/design-ui/references/motion-principles.md`

Issue relacionada: #3

---

## 3. Observabilidade + Qualidade + Testes

### Observabilidade (obrigatório)
- Sentry
- OpenTelemetry (preferencial)
- Datadog / New Relic (opcional)

### Qualidade e Lint de Código
- Architecture Contracts (arch-contract)
- Biome (formatter + linter)
- Knip (dead code)
- Stryker (mutation testing)

### Testes
- Unitários
- Integração
- End-to-end → Playwright
- Cobertura → Codecov

Issue relacionada: #4

---

## Checklist rápido para qualquer agente

- [ ] Existe Issue aberta para esta tarefa?
- [ ] Branch criada a partir da Issue?
- [ ] PR menciona a Issue (`Closes #N`)?
- [ ] UI tem skeleton + lazy + animações suaves?
- [ ] Lint / testes / mutation score passando?
- [ ] Observabilidade configurada (quando aplicável)?

**Nunca ignore este arquivo.**
