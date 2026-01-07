import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const artifactsPath = join(__dirname, "../blockchain_core/artifacts/contracts/EscrowContract.sol/EscrowVesting.json");

if (!existsSync(artifactsPath)) {
  console.error("❌ Contract artifacts not found!");
  console.error(`   Expected path: ${artifactsPath}`);
  console.error("\n📦 Please compile contracts first:");
  console.error("   cd blockchain_core && npm install && npm run compile");
  process.exit(1);
}

console.log("✅ Contract artifacts found");
process.exit(0);

