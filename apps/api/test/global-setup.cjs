const { execSync } = require("node:child_process")

module.exports = () => {
  execSync("pnpm db:seed", { cwd: `${__dirname}/..`, stdio: "pipe" })
}
