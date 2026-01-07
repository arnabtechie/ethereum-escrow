const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", (await deployer.provider.getBalance(deployer.address)).toString());

  const EscrowVesting = await hre.ethers.getContractFactory("EscrowVesting");
  
  const client = deployer.address;
  const serviceProvider = "0x742d35cc6634c0532925a3b844bc9e7595f0beb1";
  const totalAmount = hre.ethers.parseEther("1.0");
  const vestedPercentage = 70;
  const totalMinutes = 60;
  const intervalMinutes = 2;

  const escrow = await EscrowVesting.deploy(
    client,
    serviceProvider,
    totalAmount,
    vestedPercentage,
    totalMinutes,
    intervalMinutes
  );

  await escrow.waitForDeployment();
  const address = await escrow.getAddress();

  console.log("EscrowVesting deployed to:", address);

  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    console.log("Waiting for block confirmations...");
    await escrow.deploymentTransaction().wait(5);
    
    console.log("Verifying contract on Etherscan...");
    try {
      await hre.run("verify:verify", {
        address: address,
        constructorArguments: [
          client,
          serviceProvider,
          totalAmount,
          vestedPercentage,
          totalMinutes,
          intervalMinutes,
        ],
      });
    } catch (e) {
      if (e.message.toLowerCase().includes("already verified")) {
        console.log("Contract already verified");
      } else {
        console.log("Error verifying contract:", e);
      }
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

