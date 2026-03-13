---@type LazySpec
return {
  "AstroNvim/astrocore",
  opts = function(_, opts)
    opts.options = opts.options or {}
    opts.options.opt = opts.options.opt or {}
    opts.options.opt.autoread = true

    opts.autocmds = opts.autocmds or {}
    opts.autocmds.checktime = {
      {
        event = { "FocusGained", "TermClose", "TermLeave", "BufEnter", "CursorHold" },
        desc = "Check if buffers changed outside of Neovim",
        callback = function(args)
          local bufnr = args.buf or vim.api.nvim_get_current_buf()
          if vim.bo[bufnr].buftype ~= "nofile" then vim.cmd "checktime" end
        end,
      },
    }
  end,
}
