---@type LazySpec
return {
  "NickvanDyke/opencode.nvim",
  dependencies = {
    { "folke/snacks.nvim", opts = { input = {}, picker = {}, terminal = {} } },
  },
  config = function()
    ---@type opencode.Opts
    vim.g.opencode_opts = {}

    -- Required for automatic buffer reload on opencode edits
    vim.o.autoread = true

    -- stylua: ignore start
    vim.keymap.set({ "n", "t" }, "<leader>ot", function() require("opencode").toggle() end,                             { desc = "Toggle opencode" })
    vim.keymap.set("n",          "<leader>oa", function() require("opencode").ask() end,                                 { desc = "Ask opencode" })
    vim.keymap.set("x",          "<leader>oa", function() require("opencode").ask("@this: ") end,                        { desc = "Ask opencode about selection" })
    vim.keymap.set({ "n", "x" }, "<leader>os", function() require("opencode").select() end,                              { desc = "Select opencode action" })
    vim.keymap.set("n",          "<leader>on", function() require("opencode").command("session.new") end,                { desc = "New session" })
    vim.keymap.set("n",          "<leader>oi", function() require("opencode").command("session.interrupt") end,           { desc = "Interrupt session" })
    vim.keymap.set({ "n", "x" }, "go",         function() return require("opencode").operator("@this ") end,             { desc = "Add range to opencode", expr = true })
    vim.keymap.set("n",          "goo",        function() return require("opencode").operator("@this ") .. "_" end,      { desc = "Add line to opencode", expr = true })
    vim.keymap.set("n",          "<S-C-u>",    function() require("opencode").command("session.half.page.up") end,       { desc = "Scroll opencode up" })
    vim.keymap.set("n",          "<S-C-d>",    function() require("opencode").command("session.half.page.down") end,     { desc = "Scroll opencode down" })
    -- stylua: ignore end
  end,
}
