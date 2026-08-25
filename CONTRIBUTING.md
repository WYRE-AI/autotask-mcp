# Contributing

Thank you for your interest in contributing! This project is maintained by [WYRE Technology](https://github.com/WYRE-AI).

## Getting Started

1. Fork the repository
2. Clone your fork
3. Install dependencies: `npm ci`
4. Create a feature branch: `git checkout -b feature/your-feature`

## Development

```bash
npm run build       # Build the project
npm run test        # Run tests
npm run lint        # Run linter
npm run typecheck   # Type-check without emitting
```

## Pull Request Process

1. Ensure all tests pass and linting is clean
2. Update documentation if you're changing public APIs
3. Use [Conventional Commits](https://www.conventionalcommits.org/) for commit messages:
   - `feat:` for new features
   - `fix:` for bug fixes
   - `docs:` for documentation changes
   - `chore:` for maintenance tasks
4. Open a pull request against the `main` branch

## Reporting Issues

- Use GitHub Issues
- Include steps to reproduce, expected behavior, and actual behavior
- Include your Node.js version and OS

## Code Style

- TypeScript with strict mode
- ESM modules (`import`/`export`)
- Prefer `async`/`await` over Promise chains
- Follow existing patterns in the codebase

## License

By contributing, you agree that your contributions will be licensed under the same license as this project (Apache-2.0).
