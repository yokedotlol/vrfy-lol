# Contributing to vrfy.lol

Thanks for your interest in contributing! vrfy.lol is an open-source email validation API built with TypeScript on Cloudflare Workers.

## Architecture

- **vrfy-lol** (this repo) — the public API engine. MIT licensed, open source.
- **vrfy-extended** — a closed-source service binding that provides additional signals (Gravatar, breach data, etc.). Not included in this repo.

## Reporting Issues

Open a GitHub issue with:
- What you expected vs. what happened
- The domain or email you tested (if not sensitive)
- Any error messages or response bodies

## Submitting Pull Requests

1. Fork the repo and create a feature branch from `main`.
2. Make your changes — keep PRs focused on a single concern.
3. Run the checks before committing:
   ```bash
   npx tsc --noEmit          # typecheck
   npx @biomejs/biome check . # lint + format
   ```
4. Open a PR against `main` with a clear description of what and why.

## Code Style

- **TypeScript** — strict mode, no `any` where avoidable.
- **Biome** — formatting and linting. Run `npx @biomejs/biome check --write .` to auto-fix.
- No runtime dependencies beyond the Cloudflare Workers platform.

## Data Updates

The disposable email domain list is auto-generated. To update it:

```bash
bun run scripts/update-disposable-list.ts
```

Don't hand-edit `src/data/disposable.ts` — it will be overwritten.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
