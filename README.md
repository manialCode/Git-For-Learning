# GitLet — README rápido ✅

## Descripción

GitLet es una implementación educativa y mínima de operaciones tipo `git` para aprendizaje y pruebas. Este repositorio ha sido modernizado a ESM, con **JSDoc** para las APIs públicas y mejoras de calidad (lint/tests integrados).

---

## Requisitos

- Node.js (v16+ recomendado)
- pnpm

---

## Instalación

1. Clona el repositorio y entra en la carpeta:
   - git clone "repo"
   - cd GitLet
2. Instalación de dependencias:
   - pnpm install

---

## Scripts útiles

- Ejecutar tests:
  - `pnpm test`
- Ejecutar ESLint (autofix):
  - `pnpm exec eslint api --ext .js --fix`
  - _Nota_: la configuración de ESLint puede mostrar una advertencia sobre un config plano vacío; está intencionalmente adaptada para este proyecto.

---

## Uso rápido (CLI)

Puedes invocar la CLI mínima que delega en la API procedural:

- Inicializar repo:
  - `node api/gitAPI.js init`
- Ver estado:
  - `node api/gitAPI.js status`
- Agregar archivos:
  - `node api/gitAPI.js add <ruta>`
- Commit (ejemplo):
  - `node api/gitAPI.js commit -m "mensaje"`

> La CLI implementa un subconjunto educativo de comandos.

---

## Uso programático (inyección de dependencias)

```js
import { createGitlet } from './api/gitAPI.js';

const api = createGitlet({ files, config, index, refs, objects, diff, merge, util });
api.add('src');
```

---

## Visión general del código

Para un panorama más detallado de la arquitectura interna, consulta
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Esta guía explica la finalidad de
cada módulo y cómo interactúan, ideal para cualquier persona que se incorpore
al proyecto.

## Notas de modernización / cambios técnicos 🔧

- Convertido a ESM y añadido JSDoc en las APIs públicas.
- Añadida la fábrica `createGitlet(ctx)` (facilita tests por DI).
- Exportados: `createGitlet`, `gitLet` (procedural) y `runCli(argv)`.
- Tests: configuración de Jest adaptada; se añadió `jest.setup.cjs` para compatibilidad con ESM tests.
- ESLint: se añadió `.eslintrc.cjs` para reglas recomendadas; `eslint.config.cjs` quedó como placeholder.

---

## Contribuir

- Haz cambios en una rama, ejecuta `pnpm test` y `pnpm exec eslint api --ext .js --fix` antes de abrir PR.

---
