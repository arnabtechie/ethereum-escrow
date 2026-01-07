import express from 'express';
import { ethers } from 'ethers';
import config from '../config.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import morgan from 'morgan';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const artifactsPath = join(
  __dirname,
  '../blockchain_core/artifacts/contracts/EscrowContract.sol/EscrowVesting.json'
);

const dumpPath = join(__dirname, 'dump.json');
const storagePath = join(__dirname, 'storage.json');

const loadStorage = () => {
  try {
    if (existsSync(storagePath)) {
      const data = readFileSync(storagePath, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading storage:', error);
  }
  return {
    escrows: [],
    steps: [],
    nextStepId: 1,
  };
};

const saveStorage = (data) => {
  try {
    writeFileSync(storagePath, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving storage:', error);
    return false;
  }
};

let EscrowVestingArtifact;

try {
  EscrowVestingArtifact = JSON.parse(readFileSync(artifactsPath, 'utf8'));
} catch (error) {
  console.error('❌ Error loading contract artifacts.');
  console.error('Compile contracts first:');
  console.error('  cd blockchain_core && npx hardhat compile');
  console.error('Artifacts path:', artifactsPath);
  process.exit(1);
}

const app = express();

app.use(morgan('combined'));

app.use(express.json());
app.use(cors());

app.get('/health', (_, res) => {
  res.json({ status: 'ok', service: 'EscrowVesting API' });
});

app.get('/abi', (_, res) => {
  try {
    res.json({
      abi: EscrowVestingArtifact.abi,
      bytecode: EscrowVestingArtifact.bytecode,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load ABI' });
  }
});

app.get('/api/escrows', (req, res) => {
  try {
    const storage = loadStorage();
    const { address, role } = req.query;
    
    let escrows = storage.escrows;
    
    if (address && role) {
      const filterKey = role === 'client' ? 'client' : 'serviceProvider';
      escrows = escrows.filter(
        escrow => escrow[filterKey]?.toLowerCase() === address.toLowerCase()
      );
    }
    
    escrows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    res.json(escrows);
  } catch (error) {
    console.error('Error getting escrows:', error);
    res.status(500).json({ error: 'Failed to get escrows' });
  }
});

app.get('/api/escrows/:id', (req, res) => {
  try {
    const storage = loadStorage();
    const escrow = storage.escrows.find(e => e.id === req.params.id);
    
    if (!escrow) {
      return res.status(404).json({ error: 'Escrow not found' });
    }
    
    res.json(escrow);
  } catch (error) {
    console.error('Error getting escrow:', error);
    res.status(500).json({ error: 'Failed to get escrow' });
  }
});

app.post('/api/escrows', (req, res) => {
  try {
    const storage = loadStorage();
    const escrowData = req.body;
    
    const now = new Date().toISOString();
    if (!escrowData.createdAt) {
      escrowData.createdAt = now;
    }
    escrowData.updatedAt = now;
    
    const existingIndex = storage.escrows.findIndex(e => e.id === escrowData.id);
    
    if (existingIndex >= 0) {
      storage.escrows[existingIndex] = { ...storage.escrows[existingIndex], ...escrowData };
    } else {
      storage.escrows.push(escrowData);
    }
    
    if (saveStorage(storage)) {
      res.json(existingIndex >= 0 ? storage.escrows[existingIndex] : escrowData);
    } else {
      res.status(500).json({ error: 'Failed to save escrow' });
    }
  } catch (error) {
    console.error('Error saving escrow:', error);
    res.status(500).json({ error: 'Failed to save escrow' });
  }
});

app.patch('/api/escrows/:id/status', (req, res) => {
  try {
    const storage = loadStorage();
    const { status, transactionHash } = req.body;
    
    const escrowIndex = storage.escrows.findIndex(e => e.id === req.params.id);
    
    if (escrowIndex < 0) {
      return res.status(404).json({ error: 'Escrow not found' });
    }
    
    storage.escrows[escrowIndex].status = status;
    storage.escrows[escrowIndex].updatedAt = new Date().toISOString();
    
    if (transactionHash) {
      storage.escrows[escrowIndex].transactionHash = transactionHash;
    }
    
    if (saveStorage(storage)) {
      res.json(storage.escrows[escrowIndex]);
    } else {
      res.status(500).json({ error: 'Failed to update escrow' });
    }
  } catch (error) {
    console.error('Error updating escrow status:', error);
    res.status(500).json({ error: 'Failed to update escrow status' });
  }
});

app.get('/api/escrows/:id/steps', (req, res) => {
  try {
    const storage = loadStorage();
    const steps = storage.steps
      .filter(step => step.escrowId === req.params.id)
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    
    res.json(steps);
  } catch (error) {
    console.error('Error getting steps:', error);
    res.status(500).json({ error: 'Failed to get steps' });
  }
});

app.post('/api/escrows/:id/steps', (req, res) => {
  try {
    const storage = loadStorage();
    const stepData = {
      id: storage.nextStepId++,
      escrowId: req.params.id,
      ...req.body,
      timestamp: req.body.timestamp || new Date().toISOString(),
    };
    
    storage.steps.push(stepData);
    
    if (saveStorage(storage)) {
      res.json(stepData);
    } else {
      res.status(500).json({ error: 'Failed to save step' });
    }
  } catch (error) {
    console.error('Error saving step:', error);
    res.status(500).json({ error: 'Failed to save step' });
  }
});

app.post('/api/escrows/create-with-step', (req, res) => {
  try {
    const storage = loadStorage();
    const { escrowData, performedBy, transactionHash } = req.body;
    
    const now = new Date().toISOString();
    escrowData.createdAt = escrowData.createdAt || now;
    escrowData.updatedAt = now;
    
    storage.escrows.push(escrowData);
    
    const stepData = {
      id: storage.nextStepId++,
      escrowId: escrowData.id,
      action: 'created',
      performedBy: performedBy?.toLowerCase() || '',
      transactionHash: transactionHash || null,
      timestamp: now,
      notes: 'Escrow created',
    };
    storage.steps.push(stepData);
    
    if (saveStorage(storage)) {
      res.json({ escrow: escrowData, step: stepData });
    } else {
      res.status(500).json({ error: 'Failed to save escrow and step' });
    }
  } catch (error) {
    console.error('Error creating escrow with step:', error);
    res.status(500).json({ error: 'Failed to create escrow with step' });
  }
});

app.post('/api/escrows/:id/update-with-step', (req, res) => {
  try {
    const storage = loadStorage();
    const { newStatus, action, performedBy, transactionHash, notes } = req.body;
    
    const escrowIndex = storage.escrows.findIndex(e => e.id === req.params.id);
    
    if (escrowIndex < 0) {
      return res.status(404).json({ error: 'Escrow not found' });
    }
    
    storage.escrows[escrowIndex].status = newStatus;
    storage.escrows[escrowIndex].updatedAt = new Date().toISOString();
    
    if (transactionHash) {
      storage.escrows[escrowIndex].transactionHash = transactionHash;
    }
    
    const stepData = {
      id: storage.nextStepId++,
      escrowId: req.params.id,
      action,
      performedBy: performedBy?.toLowerCase() || '',
      transactionHash: transactionHash || null,
      timestamp: new Date().toISOString(),
      notes: notes || `${action} action performed`,
    };
    storage.steps.push(stepData);
    
    if (saveStorage(storage)) {
      res.json({ escrow: storage.escrows[escrowIndex], step: stepData });
    } else {
      res.status(500).json({ error: 'Failed to update escrow with step' });
    }
  } catch (error) {
    console.error('Error updating escrow with step:', error);
    res.status(500).json({ error: 'Failed to update escrow with step' });
  }
});

app.delete('/api/storage/clear', (req, res) => {
  try {
    const emptyStorage = {
      escrows: [],
      steps: [],
      nextStepId: 1,
    };
    
    if (saveStorage(emptyStorage)) {
      res.json({ success: true, message: 'All data cleared' });
    } else {
      res.status(500).json({ error: 'Failed to clear data' });
    }
  } catch (error) {
    console.error('Error clearing data:', error);
    res.status(500).json({ error: 'Failed to clear data' });
  }
});

app.post('/deploy', async (req, res) => {
  try {
    const {
      serviceProvider,
      totalAmountWei,
      vestedPercentage,
      totalMinutes,
      intervalMinutes,
      clientAddress,
      signature,
      message,
    } = req.body;

    if (
      !clientAddress ||
      !serviceProvider ||
      !totalAmountWei ||
      vestedPercentage === undefined ||
      !totalMinutes ||
      !intervalMinutes
    ) {
      return res.status(400).json({
        error: 'Missing required fields',
      });
    }

    if (!ethers.isAddress(clientAddress)) {
      return res.status(400).json({ error: 'Invalid clientAddress' });
    }

    if (!ethers.isAddress(serviceProvider)) {
      return res.status(400).json({ error: 'Invalid serviceProvider address' });
    }

    if (vestedPercentage < 0 || vestedPercentage > 90) {
      return res.status(400).json({ error: 'vestedPercentage must be 0–90' });
    }

    if (totalMinutes <= 0 || intervalMinutes <= 0) {
      return res.status(400).json({ error: 'Minutes must be > 0' });
    }

    if (totalMinutes % intervalMinutes !== 0) {
      return res.status(400).json({
        error: 'totalMinutes must be divisible by intervalMinutes',
      });
    }

    if (clientAddress && signature && message) {
      try {
        const recoveredAddress = ethers.verifyMessage(message, signature);
        if (recoveredAddress.toLowerCase() !== clientAddress.toLowerCase()) {
          return res.status(401).json({
            error: 'Invalid signature. Signature does not match client address.',
          });
        }
        console.log('✅ Signature verified for:', recoveredAddress);
      } catch (sigError) {
        return res.status(401).json({
          error: 'Invalid signature format',
        });
      }
    }

    const provider = new ethers.JsonRpcProvider(config.SEPOLIA_RPC_URL);
    const wallet = new ethers.Wallet(config.PRIVATE_KEY, provider);

    const balance = await provider.getBalance(wallet.address);
    if (balance === 0n) {
      return res.status(400).json({ error: 'Wallet has no Sepolia ETH' });
    }

    console.log('🚀 Deploying EscrowVesting');
    console.log('Deployer:', wallet.address);
    console.log('Client:', clientAddress);
    console.log('Balance:', ethers.formatEther(balance), 'ETH');

    const factory = new ethers.ContractFactory(
      EscrowVestingArtifact.abi,
      EscrowVestingArtifact.bytecode,
      wallet
    );

    const deployTx = factory.getDeployTransaction(
      clientAddress,
      serviceProvider,
      totalAmountWei,
      vestedPercentage,
      totalMinutes,
      intervalMinutes
    );
    const estimatedGas = await provider.estimateGas(deployTx);
    const gasPrice = await provider.getFeeData();
    const estimatedGasCost = estimatedGas * (gasPrice.gasPrice || gasPrice.maxFeePerGas || 0n);

    const contract = await factory.deploy(
      clientAddress,
      serviceProvider,
      totalAmountWei,
      vestedPercentage,
      totalMinutes,
      intervalMinutes
    );

    await contract.waitForDeployment();

    const contractAddress = await contract.getAddress();
    const txHash = contract.deploymentTransaction().hash;
    const actualGasUsed = contract.deploymentTransaction().gasLimit;
    const actualGasCost = actualGasUsed * (gasPrice.gasPrice || gasPrice.maxFeePerGas || 0n);

    console.log('✅ Deployed at:', contractAddress);
    console.log('⛽ Gas used:', actualGasUsed.toString());
    console.log('💰 Gas cost:', ethers.formatEther(actualGasCost), 'ETH');

    const dump = {
      contractName: 'EscrowVesting',
      address: contractAddress,
      transactionHash: txHash,
      network: config.NETWORK.name,
      chainId: config.NETWORK.chainId,
      deployer: wallet.address,
      client: clientAddress,
      serviceProvider,
      constructor: {
        client: clientAddress,
        serviceProvider,
        totalAmountWei: totalAmountWei.toString(),
        vestedPercentage,
        totalMinutes,
        intervalMinutes,
      },
      deployedAt: new Date().toISOString(),
      explorer: `${config.NETWORK.explorer}/address/${contractAddress}`,
    };

    writeFileSync(dumpPath, JSON.stringify(dump, null, 2));

    res.json({
      success: true,
      contractAddress,
      txHash,
      dumpFile: dumpPath,
      explorer: dump.explorer,
      gasUsed: actualGasUsed.toString(),
      gasCost: actualGasCost.toString(),
      gasCostEth: ethers.formatEther(actualGasCost),
    });
  } catch (err) {
    console.error('❌ Deployment failed:', err);
    res.status(500).json({
      error: err.message,
    });
  }
});

const PORT = config.SERVER?.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 Escrow API running on port ${PORT}`);
  console.log(`📡 Network: ${config.NETWORK.name}`);
  console.log(`📄 Dump file: ${dumpPath}`);
  console.log(`💾 Storage file: ${storagePath}`);
});
