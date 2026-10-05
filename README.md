# 8tomat8's Dotfiles

Managed with [chezmoi](https://www.chezmoi.io/).

## Bootstrap

```sh
sh -c "$(curl -fsLS get.chezmoi.io)" -- init --apply 8tomat8/dotfiles
```

## What's included

This repository contains configuration for:

- **Shell**: zsh (with oh-my-zsh and plugins)
- **Terminal**: tmux, alacritty, herdr (with local `equalize-splits` plugin)
- **Git**: git configuration and global ignore
- **Editor**: neovim (AstroNvim), Zed (keymaps and tasks), IdeaVim
- **AI Tools**: OpenCode, oh-my-pi (`~/.omp/agent`: config, agents, commands, skills, extensions), shared agent skills (`~/.agents/skills`)
- **CLI Tools**: btop, television, pgcli, lsd, lspmux, tuicr
- **Version Management**: asdf plugin bootstrap (no global `.tool-versions` tracked)
- **Package Management**: Homebrew (Brewfile)

## What's NOT included (Secrets)

The following files are ignored and must be set up manually:

- `~/.npmrc` — npm auth token
- `~/.sentryclirc` — sentry auth token
- `~/.config/opencode/opencode.json` — OpenCode API keys
- `~/.config/gh/hosts.yml` — GitHub auth (run `gh auth login`)
- `~/.config/zed/settings.json` — Zed settings with API keys
- `~/.zsh_secrets` — local-only env secrets (e.g. `HINDSIGHT_API_URL`, `HINDSIGHT_API_TOKEN` for oh-my-pi memory); sourced by `~/.zshrc` if present, `chmod 600`

## Cross-platform notes

- **macOS**: Fully supported and tested.
- **Linux**: Templated but untested.

## Manual steps after bootstrap

1. Import GPG keys.
2. Set up SSH keys.
3. Copy secret files from backup (see list above).
4. Register herdr plugins: `herdr plugin link ~/.config/herdr/plugins/local/equalize-splits` and `herdr plugin install plannotator/herdr-annotate`.
5. Install third-party agent skills (not tracked) with `npx skills add <owner/repo>`: `vercel-labs/skills` (find-skills), `github/gh-stack`, `herdrdev/herdr`, `upstash/context7` (context7-mcp).

## Package management

- **macOS**: Uses Homebrew via `Brewfile`.
- **Tools**: cargo, go, and npm tools are installed via bootstrap scripts.

## External dependencies

The following are automatically fetched by chezmoi:
- oh-my-zsh
- zsh-history-substring-search
- alacritty themes
