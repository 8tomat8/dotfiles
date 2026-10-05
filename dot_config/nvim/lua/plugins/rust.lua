-- astrocommunity's `pack.rust` hands rustaceanvim its server config by reading
-- `vim.lsp.config.rust_analyzer`, but that table is still empty when rustaceanvim
-- loads on `FileType rust`: astrolsp is what registers it, and nothing had pulled
-- astrolsp in yet. The merge silently yields `{}`, so neither the pack's settings
-- (clippy, `files.exclude`) nor ours in `astrolsp.lua` ever reach rust-analyzer.

-- When the rust-analyzer behind a live client dies (crash, kill; with lspmux the
-- daemon then drops our connection on the next message), Neovim either ends the
-- client silently or, when the socket is reset, keeps a deaf client that never
-- answers. rustaceanvim restarts neither, so the buffer just stops getting LSP data.
local last_auto_restart = -math.huge

-- `<Leader>lx` only reconnects to the same rust-analyzer; when that server (or the
-- lspmux daemon) is wedged, restart the launchd agent: it takes every instance
-- with it (other nvims auto-reconnect cold), then start fresh clients here.
local function lspmux_restart()
  local bufs = {}
  -- ponytail: `_uninitialized` is private; without it a client stuck at `initialize`
  -- (wedged daemon) is skipped here and later reused by `start`
  for _, client in ipairs(vim.lsp.get_clients { name = "rust-analyzer", _uninitialized = true }) do
    vim.list_extend(bufs, vim.tbl_keys(client.attached_buffers))
    client:stop(true) -- requested stop: on_exit below won't auto-restart it
  end
  local agent = ("gui/%d/org.codeberg.p2502.lspmux"):format(vim.uv.getuid())
  -- async: launchd throttles respawns to one per 10s, so a quick second restart blocks
  vim.system(
    { "launchctl", "kickstart", "-k", agent },
    {},
    vim.schedule_wrap(function(res)
      local ok = res.code == 0
      if not ok then vim.notify("lspmux restart failed: " .. vim.trim(res.stderr or ""), vim.log.levels.ERROR) end
      -- start clients only once the daemon listens; `status` hangs on a stopped one, hence its timeout
      local up = ok
        and vim.wait(5000, function() return vim.system({ "lspmux", "status" }):wait(1000).code == 0 end, 200)
      for _, buf in ipairs(bufs) do
        if vim.api.nvim_buf_is_loaded(buf) then require("rustaceanvim.lsp").start(buf) end
      end
      if ok then
        vim.notify(up and "lspmux restarted" or "lspmux did not come back", not up and vim.log.levels.WARN or nil)
      end
    end)
  )
end
vim.api.nvim_create_user_command("LspmuxRestart", lspmux_restart, { desc = "Restart lspmux and rust-analyzer" })

---@type LazySpec
return {
  {
    "mrcjkb/rustaceanvim",
    optional = true,
    dependencies = { "AstroNvim/astrolsp" },
    opts = function(_, opts)
      -- the merge also pulls in nvim-lspconfig's bare `cmd = { "rust-analyzer" }`; drop
      -- it (as the pack already does for `root_dir`) so rustaceanvim keeps its own
      -- binary resolution, `--log-file` and `lspmux` handling
      opts.server.cmd = nil
      -- lspmux closes the socket as soon as it answers `shutdown`, so the `exit` that
      -- follows often draws a reset and the stopping client never exits: without a
      -- timeout `:RustAnalyzer restart` (`:lsp restart`) then hangs forever
      opts.server.exit_timeout = 1000
      opts.server.on_error = function(code)
        if code ~= vim.lsp.rpc.client_errors.READ_ERROR then return end
        -- a reset connection is gone for good; close it so `on_exit` below restarts it
        -- (`client:stop()` would mark the exit as requested)
        for _, client in ipairs(vim.lsp.get_clients { name = "rust-analyzer" }) do
          if not client:is_stopped() then client.rpc.terminate() end
        end
      end
      opts.server.on_exit = function(_, _, client_id)
        local client = vim.lsp.get_client_by_id(client_id)
        -- ponytail: `_is_stopping` is private (set by every requested stop: `:lsp stop`,
        -- `:lsp restart`, quitting); swap for a public signal if Neovim grows one
        if not client or client._is_stopping or not client.initialized then return end
        local bufs = vim.tbl_keys(client.attached_buffers)
        if #bufs == 0 then return end -- the next rust buffer starts a client anyway
        -- runs in a fast event when a plain (non-lspmux) server process exits
        vim.schedule(function()
          if vim.uv.now() - last_auto_restart < 30000 then
            vim.notify("rust-analyzer died again; not restarting (`:RustAnalyzer start`)", vim.log.levels.ERROR)
            return
          end
          last_auto_restart = vim.uv.now()
          for _, buf in ipairs(bufs) do
            if vim.api.nvim_buf_is_loaded(buf) then require("rustaceanvim.lsp").start(buf) end
          end
          vim.notify("rust-analyzer went away; restarting", vim.log.levels.WARN)
        end)
      end
    end,
  },
  {
    "AstroNvim/astrolsp",
    ---@type AstroLSPOpts
    opts = {
      mappings = {
        n = {
          ["<Leader>lx"] = {
            function() vim.cmd.RustAnalyzer "restart" end,
            desc = "Restart rust-analyzer",
            cond = function(client) return client.name == "rust-analyzer" end,
          },
          ["<Leader>lX"] = {
            lspmux_restart,
            desc = "Restart lspmux (fresh rust-analyzer)",
            cond = function(client) return client.name == "rust-analyzer" end,
          },
        },
      },
    },
  },
}
