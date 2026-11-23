# Contributing

WordPressJS welcomes code, design, documentation, accessibility reviews and reproducible bug reports. Human and AI-assisted contributions follow the same review standard. You are responsible for understanding and verifying what you submit.

## Start here

Read the [architecture](docs/ARCHITECTURE.md), [roadmap](docs/ROADMAP.md), and [agent instructions](AGENTS.md). Look for a bounded task with explicit acceptance criteria. Discuss major dependencies, persistence changes and extension APIs in an issue before implementing them.

Use Node 24, run `npm ci`, then `npm run dev`. Run `npm run check` and `npm run test:e2e` before submitting changes. Browser installation is described in the README.

## Pull requests

Fork the repository and branch from `main`. Use a descriptive branch and focused commits. Explain the problem, resulting behavior, validation, and any migration or security implications. Include screenshots for interface changes without credentials or personal content. Add meaningful tests for regressions and new behavior; avoid tests that only repeat implementation details.

Use conventional commit subjects such as `feat(editor): add a quote block`, `fix(publishing): reject stale revisions`, or `docs: clarify local setup`. Keep documentation and code in the same contribution. Never publish secrets or runtime databases.

Contributions are licensed under the repository's MIT license. Do not copy incompatible third-party code. Disclose material AI assistance in your PR and review generated code before submission. No contributor license agreement is currently required.

## Governance

The repository owner is the initial maintainer. Architecture decisions are recorded under `docs/decisions/`. New maintainers and release policies will be proposed publicly as the community grows. There is no promise of a support SLA or fixed release dates.

Be respectful and specific. Harassment, discriminatory language, threats and disclosure of others' private information are not acceptable. Maintainers may moderate contributions or restrict participation to protect contributors. Report sensitive concerns through the repository owner's GitHub profile; do not disclose private details in public issues.
