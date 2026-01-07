require('@nomicfoundation/hardhat-toolbox');
require('@nomicfoundation/hardhat-verify');

const config = require('./config.js');

module.exports = {
  solidity: {
    version: '0.8.20',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      chainId: 1337,
    },
    sepolia: {
      url: config.SEPOLIA_RPC_URL,
      accounts: config.PRIVATE_KEY,
    },
  },
  etherscan: {
    apiKey: 'YOUR_ETHERSCAN_API_KEY',
  },
  paths: {
    sources: './contracts',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts',
  },
};
