-- AstroLSP allows you to customize the features in AstroNvim's LSP configuration engine
-- Configuration documentation can be found with `:h astrolsp`
-- NOTE: We highly recommend setting up the Lua Language Server (`:LspInstall lua_ls`)
--       as this provides autocomplete and documentation while editing

-- oxlint's LSP has no scope option: it lints every open file, while a project's
-- own script usually names paths (`oxlint src ...`), so editor-only warnings
-- appear in files CI never lints. Mirror the script's leading path arguments.
---@param root string project root
---@return string[] paths relative to `root`; empty means "no restriction"
local function oxlint_scope(root)
  local file = io.open(root .. "/package.json")
  if not file then return {} end
  local ok, pkg = pcall(vim.json.decode, file:read "*a")
  file:close()
  local paths = {}
  for _, script in pairs((ok and type(pkg) == "table" and pkg.scripts) or {}) do
    for arg in (script:match "%f[%w]oxlint%s+(.*)" or ""):gmatch "%S+" do
      if arg:sub(1, 1) == "-" then break end
      paths[#paths + 1] = (arg:gsub("^%./", ""):gsub("/+$", ""))
    end
    if #paths > 0 then return paths end
  end
  return paths
end

local lspconfig_oxlint -- upstream `lsp/oxlint.lua`, for its root detection

---@type LazySpec
return {
  "AstroNvim/astrolsp",
  ---@type AstroLSPOpts
  opts = {
    -- Configuration table of features provided by AstroLSP
    features = {
      codelens = true, -- enable/disable codelens refresh on start
      inlay_hints = true, -- enable/disable inlay hints on start
      semantic_tokens = true, -- enable/disable semantic token highlighting
    },
    -- customize lsp formatting options
    formatting = {
      -- control auto formatting on save
      format_on_save = {
        enabled = true, -- enable or disable format on save globally
      },
      timeout_ms = 1000, -- default format timeout
      -- oxfmt owns formatting wherever a project uses it (.oxfmtrc.json), so
      -- prettier (none-ls) and vtsls stand down there
      filter = function(client)
        if client.name == "oxfmt" then return true end
        return #vim.lsp.get_clients { bufnr = vim.api.nvim_get_current_buf(), name = "oxfmt" } == 0
      end,
    },
    -- enable servers that you already have installed without mason
    servers = {
      "starlark_rust", -- Bazel/Starlark LSP (install via: cargo install starlark)
      "oxlint", -- uses node_modules/.bin/oxlint when present, needs .oxlintrc.json
      "oxfmt", -- uses node_modules/.bin/oxfmt when present, needs .oxfmtrc.json
    },
    -- customize language server configuration options passed to `lspconfig`
    ---@diagnostic disable: missing-fields
    config = {
      rust_analyzer = {
        settings = {
          ["rust-analyzer"] = {
            -- rustaceanvim forces server-side file watching whenever the client
            -- advertises `didChangeWatchedFiles` (its `configure_file_watcher`
            -- workaround for mrcjkb/rustaceanvim#423). On macOS rust-analyzer's
            -- notify backend then opens one FSEvents stream per watched directory,
            -- and on a ~1000 crate workspace its VfsLoader sits in
            -- `FSEventStreamCreate` for minutes on every start: progress freezes at
            -- "Roots Scanned", nothing indexes. Client-side watching settles the
            -- same workspace in ~16s.
            files = { watcher = "client" },
          },
        },
      },
      oxlint = {
        root_dir = function(bufnr, on_dir)
          lspconfig_oxlint = lspconfig_oxlint or dofile(vim.api.nvim_get_runtime_file("lsp/oxlint.lua", false)[1])
          lspconfig_oxlint.root_dir(bufnr, function(root)
            if not root then return end
            local scope = oxlint_scope(root)
            local rel = vim.fs.relpath(root, vim.api.nvim_buf_get_name(bufnr))
            if #scope == 0 then return on_dir(root) end
            for _, path in ipairs(scope) do
              if path == "." or rel == path or vim.startswith(rel or "", path .. "/") then return on_dir(root) end
            end
          end)
        end,
      },
      vtsls = {
        settings = {
          -- use the workspace's own TypeScript instead of the one vtsls bundles
          vtsls = { autoUseWorkspaceTsdk = true },
          -- suggestion diagnostics (e.g. 80001 "convert to ES module") are
          -- editor-only advice; `tsc --noEmit` never emits them, so drop them
          javascript = { suggestionActions = { enabled = false } },
          typescript = { suggestionActions = { enabled = false } },
        },
      },
    },
    -- customize how language servers are attached
    handlers = {
      ts_ls = false, -- vtsls is the only TypeScript server
    },
    -- Configure buffer local auto commands to add when attaching a language server
    autocmds = {
      -- first key is the `augroup` to add the auto commands to (:h augroup)
      lsp_codelens_refresh = {
        -- Optional condition to create/delete auto command group
        -- can either be a string of a client capability or a function of `fun(client, bufnr): boolean`
        -- condition will be resolved for each client on each execution and if it ever fails for all clients,
        -- the auto commands will be deleted for that buffer
        cond = "textDocument/codeLens",
        -- cond = function(client, bufnr) return client.name == "lua_ls" end,
        -- list of auto commands to set
        {
          -- events to trigger
          event = { "InsertLeave", "BufEnter" },
          -- the rest of the autocmd options (:h nvim_create_autocmd)
          desc = "Refresh codelens (buffer)",
          callback = function(args)
            if require("astrolsp").config.features.codelens then vim.lsp.codelens.enable(true, { bufnr = args.buf }) end
          end,
        },
      },
      rust_external_change_flycheck = {
        cond = function(client) return client.name == "rust-analyzer" end,
        {
          event = "FileChangedShellPost",
          desc = "Rerun rust-analyzer flycheck after external reload",
          callback = function(_, client, bufnr)
            if not vim.api.nvim_buf_is_valid(bufnr) then return end
            client:notify("rust-analyzer/runFlycheck", {
              textDocument = { uri = vim.uri_from_bufnr(bufnr) },
            })
          end,
        },
      },
    },
    -- mappings to be set up on attaching of a language server
    mappings = {
      n = {
        -- a `cond` key can provided as the string of a server capability to be required to attach, or a function with `client` and `bufnr` parameters from the `on_attach` that returns a boolean
        gD = {
          function() vim.lsp.buf.declaration() end,
          desc = "Declaration of current symbol",
          cond = "textDocument/declaration",
        },
        ["<Leader>uY"] = {
          function() require("astrolsp.toggles").buffer_semantic_tokens() end,
          desc = "Toggle LSP semantic highlight (buffer)",
          cond = function(client)
            return client:supports_method "textDocument/semanticTokens/full" and vim.lsp.semantic_tokens ~= nil
          end,
        },
        -- Route LSP navigation through Snacks picker (floating window + preview)
        gd = {
          function() Snacks.picker.lsp_definitions() end,
          desc = "Definition of current symbol",
          cond = "textDocument/definition",
        },
        ["<Leader>lR"] = {
          function() Snacks.picker.lsp_references() end,
          desc = "References of current symbol",
          cond = "textDocument/references",
        },
        gy = {
          function() Snacks.picker.lsp_type_definitions() end,
          desc = "Type definition of current symbol",
          cond = "textDocument/typeDefinition",
        },
        gI = {
          function() Snacks.picker.lsp_implementations() end,
          desc = "Implementation of current symbol",
          cond = "textDocument/implementation",
        },
        ["<Leader>lG"] = {
          function() Snacks.picker.lsp_workspace_symbols() end,
          desc = "Search workspace symbols",
          cond = "workspace/symbol",
        },
      },
    },
    -- A custom `on_attach` function to be run after the default `on_attach` function
    -- takes two parameters `client` and `bufnr`  (`:h lspconfig-setup`)
    on_attach = function(client, bufnr)
      -- this would disable semanticTokensProvider for all clients
      -- client.server_capabilities.semanticTokensProvider = nil
    end,
  },
}
