# Ethereum Escrow dApp

**⚠️ PROOF OF CONCEPT - NOT FOR PRODUCTION USE ⚠️**

## ⚠️ IMPORTANT DISCLAIMER

**THIS IS A PROOF OF CONCEPT (POC) PROJECT AND SHOULD NOT BE USED IN PRODUCTION.**

This project is intended for:
- ✅ **Educational purposes** - Learning Web3 development
- ✅ **Starter template** - Base for building your own escrow system
- ✅ **Testing and experimentation** - Development and testing environments only

**DO NOT USE THIS IN PRODUCTION** without:
- Comprehensive security audit
- Professional code review
- Extensive testing on testnets
- Proper error handling and monitoring
- Production-grade infrastructure
- Legal and compliance review

**The authors and contributors are not responsible for any losses, damages, or security breaches resulting from the use of this code in production environments.**

## Overview

This is a proof-of-concept Ethereum decentralized application for escrow management with time-based vesting on Sepolia testnet. It demonstrates secure transactions between clients and service providers using smart contracts.

### Features (POC Implementation)

- **Wallet Connection**: MetaMask/Rabby compatible
- **Network Enforcement**: Only works on Sepolia testnet (rejects Mainnet)
- **Role Detection**: Automatically detects if user is client or provider based on contract state
- **Time-Based Vesting**: Incremental fund release over time intervals
- **Escrow Management**: Create escrows, deposit funds, claim payouts/refunds
- **Dispute Resolution**: Basic dispute raising and resolution with time extensions
- **Real-time Updates**: Event-driven UI synchronization with blockchain state
- **Error Handling**: Basic error handling for common scenarios

**Note**: This is a simplified POC. Production systems require additional features like multi-signature support, advanced dispute resolution, comprehensive auditing, and more robust security measures.

## Tech Stack

- **Frontend**: React 19 + Vite
- **Backend**: Express.js
- **Web3**: ethers.js v6
- **Blockchain**: Ethereum Sepolia (chainId: 11155111)
- **Smart Contracts**: Solidity ^0.8.20

## Project Structure

```
ethereum_app/
├── blockchain_core/          # Smart contracts
│   ├── contracts/
│   │   └── EscrowContract.sol
│   ├── scripts/
│   │   └── deploy.js
│   └── hardhat.config.js
├── src/
│   ├── components/          # React components
│   │   ├── WalletConnection.jsx
│   │   ├── CreateEscrowModal.jsx
│   │   ├── ClientDashboard.jsx
│   │   ├── ServiceProviderDashboard.jsx
│   │   └── EscrowCard.jsx
│   ├── contexts/           # React contexts
│   │   └── Web3Context.jsx
│   └── utils/              # Utilities
│       └── api.js
├── server/                 # Express.js backend
│   └── app.js
└── blockchain_core/        # Smart contracts
    ├── contracts/
    │   └── EscrowContract.sol
    └── scripts/
        └── deploy.js
└── package.json
```

## Getting Started

### Prerequisites

- Node.js 18+ 
- MetaMask or Rabby wallet extension
- Sepolia ETH (get from [Sepolia Faucet](https://sepoliafaucet.com/))

### Installation

1. Install dependencies:
```bash
npm install
```

2. Configure your environment:
   - Copy `config.js.example` to `config.js` in the root directory
   - Copy `blockchain_core/config.js.example` to `blockchain_core/config.js`
   - Fill in your private key and API keys (use testnet keys only!)

3. Start the backend server:
```bash
npm run server
```

4. In another terminal, start the frontend:
```bash
npm run dev
```

5. Open [http://localhost:5173](http://localhost:5173) in your browser

## Usage Flow

See [FLOW.md](./FLOW.md) for detailed step-by-step flow with examples.

### For Clients

1. Connect wallet (must be on Sepolia network)
2. Create an escrow by specifying:
   - Service provider address
   - Amount in ETH
   - Description
   - Vesting percentage (e.g., 70% time-based, 30% completion)
   - Duration and interval settings
3. Deposit funds into the escrow contract
4. Monitor vesting progress
5. Approve completion to release settlement bonus
6. Claim refunds (full or partial) if needed
7. File disputes if issues arise

### For Service Providers

1. Connect wallet (must be on Sepolia network)
2. View escrows assigned to your address
3. Claim vested payouts incrementally as time passes
4. Receive completion bonus after client approval
5. File disputes if needed

## Important Notes

### Single Wallet Connection

**Why only one wallet can be connected at a time:**

1. `window.ethereum` (MetaMask/Rabby) only exposes one active account at a time
2. Users must manually switch accounts in their wallet extension
3. This prevents confusion and ensures clear ownership of actions
4. The role (client/provider) is detected based on contract state, not separate wallets

### Network Enforcement

The dApp **only works on Sepolia testnet**:
- Automatically detects if you're on the wrong network
- Prompts to switch to Sepolia if needed
- Rejects Mainnet connections for safety

### Role Detection

The app automatically detects your role (client or provider) by:
1. Scanning all escrows from the backend storage
2. Checking if your address is a client (created escrows) or provider (assigned to escrows)
3. Defaulting to "client" if no escrows found (so you can create escrows)

## Development

### Running Locally

```bash
npm run dev:all
```

This starts both the backend server and frontend development server concurrently.

### Build for Testing

```bash
npm run build
npm start
```

**Note**: This builds for testing purposes only. Do not deploy to production without proper security review.

### Configuration

Configuration files (not committed to git):
- `config.js` - Backend server configuration (private keys, RPC URLs)
- `blockchain_core/config.js` - Hardhat configuration for contract deployment

**⚠️ Important**: Never commit `config.js` files with real keys. Use the `.example` files as templates.

## Smart Contract

The smart contract (`blockchain_core/contracts/EscrowContract.sol`) implements:
- Time-based vesting mechanism
- Dispute resolution with time extensions
- Flexible payout and refund system
- Auto-closure when funds are fully distributed

See `FLOW.md` for detailed flow documentation.

## Security Considerations (POC Limitations)

**Current Implementation:**
- ✅ Network enforcement (Sepolia only)
- ✅ Basic input validation
- ✅ Basic error handling
- ✅ Reentrancy protection in smart contract
- ✅ State transition validation

**Missing for Production:**
- ❌ Comprehensive security audit
- ❌ Formal verification
- ❌ Advanced access control
- ❌ Rate limiting
- ❌ Comprehensive monitoring
- ❌ Multi-signature support
- ❌ Advanced dispute resolution mechanisms
- ❌ Production-grade error handling
- ❌ Comprehensive testing suite

**⚠️ Security Warnings:**
- Never commit private keys
- Always verify contracts on Etherscan
- Use testnet keys only
- This POC has not undergone professional security audit
- Do not use with real funds without proper review

## Troubleshooting

### "Please switch to Sepolia network"
- Make sure you're connected to Sepolia in your wallet
- The app will prompt you to switch automatically

### "Insufficient balance"
- Ensure you have enough ETH for the escrow amount + gas fees
- Get testnet ETH from a Sepolia faucet

### "Failed to connect wallet"
- Make sure MetaMask/Rabby is installed
- Check that the extension is enabled
- Try refreshing the page

### "Invalid contract address"
- Make sure you've deployed the contract using the backend API
- Verify the contract is on Sepolia network
- Check that the backend server is running

## Using This as a Starter Project

If you want to build upon this POC:

1. **Fork or clone this repository**
2. **Review the code thoroughly** - Understand all components
3. **Add production features**:
   - Comprehensive testing
   - Security enhancements
   - Advanced dispute resolution
   - Multi-signature support
   - Production monitoring
   - Rate limiting
   - Enhanced error handling
4. **Conduct security audit** before any production deployment
5. **Customize for your use case** - This is a template, adapt as needed

## Contributing

This is a POC project. Contributions are welcome for educational purposes. However, remember this is not production-ready code.

## License

MIT

---

**Remember**: This is a proof of concept. Use responsibly and never deploy to production without proper security review and testing.
