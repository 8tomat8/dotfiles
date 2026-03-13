# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is the Claude Code user configuration directory (`~/.claude`). It stores user-specific settings, plugins, MCP server configurations, and session data.

## Directory Structure

- `settings.json` - User permissions, hooks, and enabled plugins
- `mcp_config.json` - MCP server configurations
- `projects/` - Per-project CLAUDE.md and settings (path-encoded directory names)
- `plugins/` - Installed plugins and marketplace cache
- `agents/`, `commands/` - Custom user-defined agents and slash commands
- `history.jsonl` - Conversation history
- `plans/`, `todos/` - Session planning artifacts

## Current Configuration

### Enabled Plugins
- `context7` - Documentation lookup
- `rust-analyzer-lsp` - Rust LSP integration
- `typescript-lsp` - TypeScript LSP integration

### MCP Servers
- `context7` - Context management
- `playwright` - Browser automation
- `ast` - AST-grep for code pattern matching

### Auto-Approved Tools
- `mcp__lsmcp`, `mcp__astgrep`, `mcp__rustlsp`, `mcp__context7`
- `Bash(cargo test:*)` - Rust test commands

### Post-Edit Hooks
Files are auto-formatted after edits:
- `.go` files → `gofumpt`
- `.rs` files → `cargo fmt`
- `.ts` files → `npx prettier`

## Editing Configuration

- **settings.json**: Modify permissions, hooks, or enabled plugins
- **mcp_config.json**: Add/remove MCP server integrations
- **projects/[encoded-path]/**: Project-specific overrides use path-encoded directory names (e.g., `-Users-username-Projects-foo` for `/Users/username/Projects/foo`)
