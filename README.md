# 8tomat8's Dotfiles

Managed with [chezmoi](https://www.chezmoi.io/).

## Bootstrap

```sh
sh -c "$(curl -fsLS get.chezmoi.io)" -- init --apply 8tomat8/dotfiles
```

## What's included

This repository contains configuration for:

- **Shell**: zsh (with oh-my-zsh and plugins)
- **Terminal**: tmux, alacritty
- **Git**: git configuration and global ignore
- **Editor**: neovim (AstroNvim), Zed (keymaps and tasks), IdeaVim
- **AI Tools**: Claude Code, OpenCode
- **CLI Tools**: btop, television, pgcli, lsd
- **Version Management**: asdf plugin bootstrap (no global `.tool-versions` tracked)
- **Package Management**: Homebrew (Brewfile)

## What's NOT included (Secrets)

The following files are ignored and must be set up manually:

- `~/.npmrc` — npm auth token
- `~/.sentryclirc` — sentry auth token
- `~/.claude/mcp_config.json` — MCP server API keys
- `~/.config/opencode/opencode.json` — OpenCode API keys
- `~/.config/gh/hosts.yml` — GitHub auth (run `gh auth login`)
- `~/.config/zed/settings.json` — Zed settings with API keys

## Cross-platform notes

- **macOS**: Fully supported and tested.
- **Linux**: Templated but untested.

## Manual steps after bootstrap

1. Import GPG keys.
2. Set up SSH keys.
3. Copy secret files from backup (see list above).

## Package management

- **macOS**: Uses Homebrew via `Brewfile`.
- **Tools**: cargo, go, and npm tools are installed via bootstrap scripts.

## External dependencies

The following are automatically fetched by chezmoi:
- oh-my-zsh
- zsh-history-substring-search
- alacritty themes
