# Release Setup Documentation

This document explains how to set up automated releases for the Autotask MCP Server, including GitHub releases, NPM publishing, and Docker Hub publishing.

## Overview

The release process is automated using GitHub Actions and follows these patterns inspired by the [autotask-node repository](https://github.com/WYRE-AI/autotask-node):

1. **Semantic Versioning**: Uses conventional commits and semantic-release
2. **Multi-Platform Testing**: Tests on Node.js 18, 20, and 22
3. **GitHub Releases**: Automated release notes and asset publishing
4. **Docker Publishing**: Multi-architecture builds (amd64/arm64) to Docker Hub
5. **Security Scanning**: Automated vulnerability scanning with Trivy

## Prerequisites

### Required GitHub Secrets

Set these secrets in your GitHub repository settings (`Settings > Secrets and variables > Actions`):

| Secret Name | Description | Example Value |
|-------------|-------------|---------------|
| `GITHUB_TOKEN` | Automatically provided by GitHub | *(automatic)* |
| `NPM_TOKEN` | NPM authentication token | `npm_xxxxxxxxxxxxx` |
| `DOCKERHUB_USERNAME` | Docker Hub username | `WYRE-AI` |
| `DOCKERHUB_TOKEN` | Docker Hub access token | `dckr_pat_xxxxxxx` |

### Getting NPM Token

1. Log in to [npmjs.com](https://www.npmjs.com/)
2. Go to Access Tokens in your account settings
3. Generate a new **Automation** token
4. Copy the token and add it as `NPM_TOKEN` secret

### Getting Docker Hub Token

1. Log in to [hub.docker.com](https://hub.docker.com/)
2. Go to Account Settings > Security
3. Create a new Access Token with Read/Write permissions
4. Copy the token and add it as `DOCKERHUB_TOKEN` secret

## Workflow Files

### `.github/workflows/release.yml`

Main release workflow that:
- Runs on pushes to `main` branch
- Tests across multiple Node.js versions
- Creates GitHub releases using semantic-release
- Builds and publishes Docker images
- Runs security scans

### `.github/workflows/test.yml`

Pull request testing workflow that:
- Runs on pull requests
- Tests across multiple Node.js versions
- Runs code quality checks
- Tests Docker builds

## Semantic Release Configuration

### `.releaserc.json`

Configures semantic-release with:
- Branch configuration for main, next, beta, alpha
- Plugins for changelog, GitHub releases, NPM publishing
- Automated version bumping based on commit messages

### Commit Message Convention

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```bash
# Patch release (1.0.0 → 1.0.1)
fix: resolve API timeout issues

# Minor release (1.0.0 → 1.1.0) 
feat: add project search functionality

# Major release (1.0.0 → 2.0.0)
feat: restructure API endpoints

BREAKING CHANGE: API endpoints have changed
```

## Docker Configuration

### Multi-Stage Dockerfile

The Dockerfile uses multi-stage builds for:
- **Builder stage**: Compiles TypeScript and installs dependencies
- **Production stage**: Minimal runtime image with only production dependencies
- **Security**: Runs as non-root user with proper file permissions
- **Observability**: Includes health checks and proper logging

### Docker Hub Publishing

Images are published to Docker Hub with multiple tags:
- `latest`: Latest stable release
- `v1.0.1`: Specific version tag
- Platform support: `linux/amd64` and `linux/arm64`

### Image Labels

Images include comprehensive OCI labels:
- Version, commit SHA, build date
- Source repository and documentation links
- Vendor and license information

## Release Process

### Automated Release (Recommended)

1. **Make Changes**: Develop features/fixes on feature branches
2. **Create PR**: Submit pull request to `main` branch
3. **Review & Test**: GitHub Actions run automatic tests
4. **Merge PR**: Merge to `main` using conventional commit messages
5. **Automatic Release**: GitHub Actions automatically:
   - Determines version bump based on commits
   - Creates GitHub release with notes
   - Publishes to NPM (if configured)
   - Builds and pushes Docker images
   - Runs security scans

### Manual Release Preparation

Use the preparation script:

```bash
# Make script executable
chmod +x scripts/prepare-release.sh

# Run preparation checks
./scripts/prepare-release.sh
```

The script will:
- ✅ Verify all tools are installed
- ✅ Check Node.js version compatibility
- ✅ Run linting and tests
- ✅ Build the project
- ✅ Test Docker build
- ✅ Verify Git status

### Manual Release Commands

If needed, you can manually create releases:

```bash
# Create GitHub release
gh release create v1.0.1 --auto --notes

# Publish to NPM
npm publish

# Build and push Docker image
docker build -t WYRE-AI/autotask-mcp:v1.0.1 .
docker push WYRE-AI/autotask-mcp:v1.0.1
docker tag WYRE-AI/autotask-mcp:v1.0.1 WYRE-AI/autotask-mcp:latest
docker push WYRE-AI/autotask-mcp:latest
```

## Monitoring and Maintenance

### Release Monitoring

Monitor releases through:
- **GitHub**: Check Actions tab for workflow status
- **NPM**: Verify package publication at https://www.npmjs.com/package/autotask-mcp
- **Docker Hub**: Check images at https://hub.docker.com/r/WYRE-AI/autotask-mcp

### Security Scanning

Automated security scanning with Trivy:
- Scans Docker images for vulnerabilities
- Results uploaded to GitHub Security tab
- Runs after each release

### Failed Release Recovery

If a release fails:

1. **Check Logs**: Review GitHub Actions logs for errors
2. **Fix Issues**: Address any build, test, or deployment issues
3. **Retry Release**: Push a fix with conventional commit message
4. **Manual Intervention**: If needed, manually create release components

Common failure points:
- **NPM Publishing**: Token expiration or package conflicts
- **Docker Publishing**: Authentication or build issues
- **Security Scan**: Critical vulnerabilities found

## Version Management

### Pre-release Branches

Support for pre-release versions:

```bash
# Beta release
git checkout -b beta
git push origin beta
# Creates version like 1.1.0-beta.1

# Alpha release  
git checkout -b alpha
git push origin alpha
# Creates version like 1.1.0-alpha.1
```

### Version Rollback

If you need to rollback a release:

```bash
# Revert Git tag
git tag -d v1.0.1
git push origin :refs/tags/v1.0.1

# NPM deprecation (cannot delete)
npm deprecate autotask-mcp@1.0.1 "Version deprecated due to critical issue"

# Docker image removal
docker push --delete WYRE-AI/autotask-mcp:v1.0.1
```

## Troubleshooting

### Common Issues

#### Semantic Release Fails
```bash
# Error: No GITHUB_TOKEN
# Solution: Token is automatically provided, check permissions

# Error: No NPM_TOKEN  
# Solution: Add NPM_TOKEN secret to repository
```

#### Docker Build Fails
```bash
# Error: Architecture not supported
# Solution: Check build-args and platform specification

# Error: Authentication failed
# Solution: Verify DOCKERHUB_USERNAME and DOCKERHUB_TOKEN
```

#### Tests Fail in CI
```bash
# Error: Node version mismatch
# Solution: Update Node.js version in workflow

# Error: Dependencies not found
# Solution: Ensure npm ci runs before build/test
```

### Debug Mode

Enable debug logging in GitHub Actions:

1. Go to repository Settings > Secrets
2. Add secret: `ACTIONS_STEP_DEBUG` = `true`
3. Re-run workflow for detailed logs

## Best Practices

### Commit Messages
- Use conventional commit format
- Write clear, descriptive messages
- Reference issues when applicable

### Branch Management
- Keep `main` branch stable
- Use feature branches for development
- Require PR reviews before merging

### Release Planning
- Group related changes in single release
- Test thoroughly before releasing
- Document breaking changes clearly

### Security
- Regularly update dependencies
- Monitor security scan results
- Rotate access tokens periodically

## Related Documentation

- [Docker Usage Guide](DOCKER_USAGE.md)
- [Main README](README.md)
- [Autotask Node Library](https://github.com/WYRE-AI/autotask-node)
- [Semantic Release Documentation](https://semantic-release.gitbook.io/)
- [Conventional Commits](https://www.conventionalcommits.org/)

For questions or issues with the release process, please open an issue in the GitHub repository. 