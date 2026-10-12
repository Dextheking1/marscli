// Blocky wordmark: "MARS" in ANSI Shadow figlet — rendered with a vertical
// orange→red gradient in component/logo.tsx, with the CLI/V2 badge beside it.
const mars = [
  "███╗   ███╗ █████╗ ██████╗ ███████╗",
  "████╗ ████║██╔══██╗██╔══██╗██╔════╝",
  "██╔████╔██║███████║██████╔╝███████╗",
  "██║╚██╔╝██║██╔══██║██╔══██╗╚════██║",
  "██║ ╚═╝ ██║██║  ██║██║  ██║███████║",
]

// Badge stacked to the right of the wordmark behind a vertical rule.
const cli = ["CLI", "*", "V2"]

export const logo = {
  mars,
  cli,
}

export const go = {
  left: ["    ", "█▀▀▀", "█_^█", "▀▀▀▀"],
  right: ["    ", "█▀▀█", "█__█", "▀▀▀▀"],
}
