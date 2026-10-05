-- Visible == loaded: file buffers die when they leave the last window, so native
-- `:q` closes the buffer with its split and quits on the last one. No tabline;
-- the (global) statusline shows the focused file's path instead of just its name.

---@type LazySpec
return {
  {
    "AstroNvim/astrocore",
    ---@type AstroCoreOpts
    opts = {
      options = { opt = { showtabline = 0 } },
      mappings = {
        n = {
          -- tabline buffer pickers and toggle: no tabline anymore
          ["<Leader>bb"] = false,
          ["<Leader>bd"] = false,
          ["<Leader>b\\"] = false,
          ["<Leader>b|"] = false,
          ["<Leader>ut"] = false,
        },
      },
      autocmds = {
        delete_hidden_buffers = {
          {
            -- BufWritePost: a hidden buffer kept for unsaved changes goes once saved (`:wa`)
            event = { "BufHidden", "BufUnload", "BufWritePost" },
            desc = "Delete file buffers no longer shown in any window (unless modified)",
            callback = function(args)
              local buf = args.buf
              vim.schedule(function()
                if
                  not vim.api.nvim_buf_is_valid(buf)
                  or not vim.bo[buf].buflisted
                  or vim.bo[buf].buftype ~= ""
                  or vim.bo[buf].modified
                  or #vim.fn.win_findbuf(buf) > 0
                then
                  return
                end
                vim.cmd.bdelete(buf)
              end)
            end,
          },
        },
      },
    },
  },
  {
    "rebelot/heirline.nvim",
    opts = function(_, opts)
      opts.tabline = nil
      -- statusline[3] is AstroNvim's file_info; `:~:.` = cwd-relative, else ~-relative
      opts.statusline[3] = require("astroui.status").component.file_info { filename = { modify = ":~:." } }
    end,
  },
}
