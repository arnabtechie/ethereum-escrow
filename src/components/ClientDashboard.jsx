import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { useWeb3 } from '../contexts/Web3Context';
import EscrowCard from './EscrowCard';
import CreateEscrowModal from './CreateEscrowModal';
import {
  initDB,
  getEscrowsByAddress,
  createEscrowWithStep,
  updateEscrowWithStep,
  clearAllData,
} from '../utils/api';
import { SERVICE_PROVIDERS, getUserByAddress } from '../data/users';

const ClientDashboard = () => {
  const { clientAccount, clientSigner, clientProvider, clientIsConnected, refreshBalance } = useWeb3();
  const account = clientAccount;
  const signer = clientSigner;
  const provider = clientProvider;
  const isConnected = clientIsConnected;
  const [escrows, setEscrows] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmDialogData, setConfirmDialogData] = useState(null);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [successDialogData, setSuccessDialogData] = useState(null);
  const [showErrorDialog, setShowErrorDialog] = useState(false);
  const [errorDialogData, setErrorDialogData] = useState(null);

  const checkContractStatus = async (contractAddress) => {
    if (!contractAddress || !provider) return null;
    
    try {
      const abiResponse = await fetch('http://localhost:4000/abi', {
        signal: AbortSignal.timeout(5000),
      });
      if (!abiResponse.ok) {
        console.warn('Failed to load ABI:', abiResponse.status);
        return null;
      }
      const { abi } = await abiResponse.json();
      
      const contract = new ethers.Contract(contractAddress, abi, provider);
      
      const statusPromise = contract.status().catch(err => {
        console.warn('Error getting status:', err);
        return null;
      });
      
      const disputePromise = contract.isDisputed().catch(err => {
        console.warn('Error getting dispute status:', err);
        return false;
      });
      
      const endTimePromise = contract.effectiveEndTime()
        .catch(() => contract.originalEndTime())
        .catch(err => {
          console.warn('Error getting end time:', err);
          return null;
        });
      
      const [status, isDisputed, endTime] = await Promise.all([
        statusPromise,
        disputePromise,
        endTimePromise,
      ]);
      
      if (status === null) {
        return null;
      }
      
      const statusMap = {
        0: 'created',
        1: 'funded',
        2: 'completed',
        3: 'closed',
      };
      
      let finalStatus = statusMap[status] || 'created';
      
      if (isDisputed && finalStatus !== 'closed') {
        finalStatus = 'disputed';
      }
      
      let maxRefund = 0n;
      try {
        maxRefund = await contract.getMaxClientRefund();
      } catch (err) {
        console.warn('Error getting max refund:', err);
      }
      
      return {
        status: finalStatus,
        endTime: endTime ? Number(endTime) * 1000 : null,
        maxRefund: maxRefund.toString(),
      };
    } catch (error) {
      console.error('Error checking contract status:', error);
      return null;
    }
  };

  useEffect(() => {
    const loadEscrows = async () => {
      if (!account || !provider) return;
      
      try {
        await initDB();
        const savedEscrows = await getEscrowsByAddress(account, 'client');
        
        const escrowsWithStatus = await Promise.all(
          savedEscrows.map(async (escrow) => {
            let updatedEscrow = { ...escrow };
            
            if (escrow.serviceProvider) {
              const provider = getUserByAddress(escrow.serviceProvider);
              if (provider) {
                updatedEscrow.serviceProviderName = provider.name;
              }
            }
            
            if (escrow.contractAddress) {
              const contractData = await checkContractStatus(escrow.contractAddress);
              if (contractData) {
                updatedEscrow.status = contractData.status;
                updatedEscrow.endTime = contractData.endTime;
                updatedEscrow.maxRefund = contractData.maxRefund;
              }
            }
            
            return updatedEscrow;
          })
        );
        
        setEscrows(escrowsWithStatus);
      } catch (error) {
        console.error('Error loading escrows from IndexedDB:', error);
      }
    };

    loadEscrows();
  }, [account, provider]);

  const showConfirmation = (data) => {
    return new Promise((resolve) => {
      setConfirmDialogData({ ...data, onConfirm: () => { setShowConfirmDialog(false); resolve(true); }, onCancel: () => { setShowConfirmDialog(false); resolve(false); } });
      setShowConfirmDialog(true);
    });
  };

  const handleCreateEscrow = async (escrowData) => {
    if (!isConnected || !signer) {
      setErrorDialogData({ message: 'Please connect your wallet first', onClose: () => setShowErrorDialog(false) });
      setShowErrorDialog(true);
      return;
    }

    setLoading(true);
    try {
      const totalAmountWei = escrowData.amount;
      
      const vestedPercentage = parseInt(escrowData.vestedPercentage) || 70;
      const totalMinutes = parseInt(escrowData.totalMinutes) || 60;
      const intervalMinutes = parseInt(escrowData.intervalMinutes) || 10;

      const initialGasPrice = await provider.getFeeData();
      const initialGasPriceGwei = ethers.formatUnits(initialGasPrice.gasPrice || initialGasPrice.maxFeePerGas || 0n, 'gwei');
      const estimatedDeploymentCost = (parseFloat(initialGasPriceGwei) * 2500000 / 1e9).toFixed(6);

      const deploymentMessage = `Authorize Escrow Deployment\n\n` +
        `Service Provider: ${escrowData.serviceProvider}\n` +
        `Amount: ${ethers.formatEther(totalAmountWei)} ETH\n` +
        `Vesting: ${vestedPercentage}% time-based\n` +
        `Duration: ${totalMinutes} minutes\n` +
        `Interval: ${intervalMinutes} minutes\n\n` +
        `This signature authorizes the backend to deploy the escrow contract on your behalf.\n` +
        `The contract will be configured with your address (${account}) as the client.`;
      
      const signatureConfirmed = await showConfirmation({
        title: 'Authorize Deployment',
        gasInfo: {
          currentGasPrice: `${parseFloat(initialGasPriceGwei).toFixed(2)} Gwei`,
          estimatedGas: '~2,500,000',
          estimatedCost: `~${estimatedDeploymentCost} ETH`,
        },
        confirmText: 'Sign',
        cancelText: 'Cancel',
      });

      if (!signatureConfirmed) {
        throw new Error('Deployment authorization cancelled');
      }

      const signature = await signer.signMessage(deploymentMessage);
      console.log('Deployment authorization signature:', signature);

      try {
        const healthCheck = await fetch('http://localhost:4000/health', {
          method: 'GET',
          signal: AbortSignal.timeout(5000),
        });
        if (!healthCheck.ok) {
          throw new Error('Server health check failed');
        }
      } catch (healthError) {
        throw new Error(
          'Backend server is not running. Please start the server with: npm run server'
        );
      }

      let response;
      try {
        response = await fetch('http://localhost:4000/deploy', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            serviceProvider: escrowData.serviceProvider,
            totalAmountWei,
            vestedPercentage,
            totalMinutes,
            intervalMinutes,
            clientAddress: account,
            signature,
            message: deploymentMessage,
          }),
          signal: AbortSignal.timeout(60000),
        });
      } catch (fetchError) {
        if (fetchError.name === 'AbortError') {
          throw new Error('Request timed out. Please check your network connection.');
        }
        throw new Error(
          `Cannot connect to backend server. Make sure the server is running on port 4000. Error: ${fetchError.message}`
        );
      }

      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch {
          errorData = { error: `Server returned status ${response.status}` };
        }
        throw new Error(errorData.error || 'Failed to deploy contract');
      }

      const result = await response.json();
      const contractAddress = result.contractAddress;
      const txHash = result.txHash;

      const amountInEth = ethers.formatEther(escrowData.amount);
      let newEscrow;
      try {
        newEscrow = await createEscrowWithStep(
        {
            id: contractAddress,
          client: account.toLowerCase(),
          serviceProvider: escrowData.serviceProvider.toLowerCase(),
            amount: amountInEth,
          description: escrowData.description,
            status: 'created',
            contractAddress,
            transactionHash: txHash,
          createdAt: new Date().toISOString(),
        },
        account,
          txHash
        );
      } catch (dbError) {
        console.error('Error saving escrow to database:', dbError);
        newEscrow = {
          id: contractAddress,
          client: account.toLowerCase(),
          serviceProvider: escrowData.serviceProvider.toLowerCase(),
          amount: amountInEth,
          description: escrowData.description,
          status: 'created',
          contractAddress,
          transactionHash: txHash,
          createdAt: new Date().toISOString(),
        };
      }

      setShowCreateModal(false);
      
      try {
        const updatedEscrows = await getEscrowsByAddress(account, 'client');
        const escrowsWithStatus = await Promise.all(
          updatedEscrows.map(async (e) => {
            let updatedEscrow = { ...e };
            
            if (e.serviceProvider) {
              const provider = getUserByAddress(e.serviceProvider);
              if (provider) {
                updatedEscrow.serviceProviderName = provider.name;
              }
            }
            
            if (e.contractAddress) {
              try {
                const contractData = await checkContractStatus(e.contractAddress);
                if (contractData) {
                  updatedEscrow.status = contractData.status;
                  updatedEscrow.endTime = contractData.endTime;
                }
              } catch (statusError) {
                console.error('Error checking contract status:', statusError);
              }
            }
            
            return updatedEscrow;
          })
        );
        setEscrows(escrowsWithStatus);
      } catch (stateError) {
        console.error('Error reloading escrows:', stateError);
        try {
          setEscrows([newEscrow, ...escrows]);
        } catch (fallbackError) {
          console.error('Error updating escrows state (fallback):', fallbackError);
        }
      }

      try {
      await refreshBalance('client');
      } catch (balanceError) {
        console.error('Error refreshing balance:', balanceError);
      }
      
      setSuccessDialogData({
        title: 'Escrow Created',
        contractAddress: `${contractAddress.slice(0, 6)}...${contractAddress.slice(-4)}`,
        status: 'Not Funded',
        onClose: () => setShowSuccessDialog(false),
      });
      setShowSuccessDialog(true);
    } catch (error) {
      console.error('Error creating escrow:', error);
      setErrorDialogData({
        message: `Failed to create escrow: ${error.message}`,
        onClose: () => setShowErrorDialog(false),
      });
      setShowErrorDialog(true);
    } finally {
      setLoading(false);
    }
  };

  const handleDeposit = async (escrowId) => {
    if (!isConnected || !signer) {
      setErrorDialogData({ message: 'Please connect your wallet first', onClose: () => setShowErrorDialog(false) });
      setShowErrorDialog(true);
      return;
    }

    setLoading(true);
    try {
      // Find the escrow
      const escrow = escrows.find(e => e.id === escrowId);
      if (!escrow) {
        throw new Error('Escrow not found');
      }

      if (escrow.status !== 'created') {
        throw new Error('Escrow is not in created status');
      }

      if (!escrow.contractAddress) {
        throw new Error('Contract address not found');
      }

      // Load contract ABI from API
      let abiResponse;
      try {
        abiResponse = await fetch('http://localhost:4000/abi', {
          signal: AbortSignal.timeout(10000), // 10 second timeout
        });
      } catch (fetchError) {
        throw new Error(
          `Cannot load contract ABI. Make sure the server is running. Error: ${fetchError.message}`
        );
      }
      if (!abiResponse.ok) {
        throw new Error('Failed to load contract ABI');
      }
      const { abi } = await abiResponse.json();

      // Convert amount from ETH to wei
      const totalAmountWei = ethers.parseEther(escrow.amount);

      // Create contract instance
      const contract = new ethers.Contract(escrow.contractAddress, abi, signer);

      // Estimate gas for deposit transaction
      let depositGasEstimate;
      let depositGasCost;
      let totalCost;
      try {
        depositGasEstimate = await contract.deposit.estimateGas({
          value: totalAmountWei,
        });
        const currentGasPrice = await provider.getFeeData();
        const gasPriceValue = currentGasPrice.gasPrice || currentGasPrice.maxFeePerGas || 0n;
        depositGasCost = depositGasEstimate * gasPriceValue;
        const depositAmount = BigInt(totalAmountWei);
        totalCost = depositAmount + depositGasCost;
      } catch (error) {
        console.error('Error estimating gas:', error);
        // Use default estimate if estimation fails
        depositGasEstimate = 100000n; // Default estimate
        const currentGasPrice = await provider.getFeeData();
        const gasPriceValue = currentGasPrice.gasPrice || currentGasPrice.maxFeePerGas || 0n;
        depositGasCost = depositGasEstimate * gasPriceValue;
        const depositAmount = BigInt(totalAmountWei);
        totalCost = depositAmount + depositGasCost;
      }

      const depositAmountEth = ethers.formatEther(totalAmountWei);
      const depositGasCostEth = ethers.formatEther(depositGasCost);
      const totalCostEth = ethers.formatEther(totalCost);

      // Request user to deposit funds with gas estimates
      const depositConfirmed = await showConfirmation({
        title: 'Deposit Funds',
        gasInfo: {
          depositAmount: `${depositAmountEth} ETH`,
          estimatedGas: `${depositGasEstimate.toString()}`,
          estimatedGasCost: `${depositGasCostEth} ETH`,
          totalCost: `${totalCostEth} ETH`,
        },
        confirmText: 'Deposit',
        cancelText: 'Cancel',
      });

      if (!depositConfirmed) {
        return;
      }

      // Call deposit function
      const depositTx = await contract.deposit({
        value: totalAmountWei,
      });

      console.log('Deposit transaction sent:', depositTx.hash);
      
      // Wait for confirmation
      const depositReceipt = await depositTx.wait();
      console.log('Deposit confirmed:', depositReceipt);

      // Calculate actual gas cost
      const actualGasUsed = depositReceipt.gasUsed;
      const actualGasPrice = depositReceipt.gasPrice || depositReceipt.maxFeePerGas || 0n;
      const actualGasCost = actualGasUsed * actualGasPrice;
      const actualTotalCost = BigInt(totalAmountWei) + actualGasCost;

      // Update escrow status to 'funded'
      await updateEscrowWithStep(
        escrowId,
        'funded',
        'funded',
        account,
        depositReceipt.hash,
        'Funds deposited to escrow contract'
      );

      // Refresh escrows with updated status from contract
      const updatedEscrows = await getEscrowsByAddress(account, 'client');
      const escrowsWithStatus = await Promise.all(
        updatedEscrows.map(async (e) => {
          let updatedEscrow = { ...e };
          
          // Get service provider name
          if (e.serviceProvider) {
            const provider = getUserByAddress(e.serviceProvider);
            if (provider) {
              updatedEscrow.serviceProviderName = provider.name;
            }
          }
          
          // Get contract status and end time
          if (e.contractAddress) {
            const contractData = await checkContractStatus(e.contractAddress);
            if (contractData) {
              updatedEscrow.status = contractData.status;
              updatedEscrow.endTime = contractData.endTime;
            }
          }
          
          return updatedEscrow;
        })
      );
      setEscrows(escrowsWithStatus);
      await refreshBalance('client');
      
      setSuccessDialogData({
        title: 'Escrow Funded',
        contractAddress: `${escrow.contractAddress.slice(0, 6)}...${escrow.contractAddress.slice(-4)}`,
        gasInfo: {
          depositAmount: `${depositAmountEth} ETH`,
          gasUsed: `${actualGasUsed.toString()}`,
          gasCost: `${ethers.formatEther(actualGasCost)} ETH`,
          totalPaid: `${ethers.formatEther(actualTotalCost)} ETH`,
        },
        onClose: () => setShowSuccessDialog(false),
      });
      setShowSuccessDialog(true);
    } catch (error) {
      console.error('Error depositing funds:', error);
      setErrorDialogData({
        message: `Failed to deposit funds: ${error.message}`,
        onClose: () => setShowErrorDialog(false),
      });
      setShowErrorDialog(true);
    } finally {
      setLoading(false);
    }
  };

  const handleReleaseFunds = async (escrowId) => {
    if (!isConnected || !signer) {
      setErrorDialogData({ message: 'Please connect your wallet first', onClose: () => setShowErrorDialog(false) });
      setShowErrorDialog(true);
      return;
    }

    setLoading(true);
    try {
      // In production: 
      // const contract = new ethers.Contract(contractAddress, abi, signer);
      // const tx = await contract.releaseFunds(escrowId);
      // const receipt = await tx.wait();
      // const transactionHash = receipt.hash;

      // Update in IndexedDB with step
      await updateEscrowWithStep(
        escrowId,
        'completed',
        'released',
        account,
        // receipt.hash, // Uncomment when using real contract
        'Funds released to service provider'
      );

      // Update state
      const updatedEscrows = await getEscrowsByAddress(account, 'client');
      setEscrows(updatedEscrows);
      
      await refreshBalance('client');
      setSuccessDialogData({
        title: '✅ Funds Released',
        message: 'Funds have been released to the service provider successfully!',
        onClose: () => setShowSuccessDialog(false),
      });
      setShowSuccessDialog(true);
    } catch (error) {
      console.error('Error releasing funds:', error);
      setErrorDialogData({
        message: `Failed to release funds: ${error.message}`,
        onClose: () => setShowErrorDialog(false),
      });
      setShowErrorDialog(true);
    } finally {
      setLoading(false);
    }
  };

  const handleClearAllEscrows = async () => {
    const confirmed = await showConfirmation({
      title: 'Clear All Escrows',
      gasInfo: null,
      confirmText: 'Clear All',
      cancelText: 'Cancel',
    });

    if (!confirmed) {
      return;
    }

    setLoading(true);
    try {
      await clearAllData();
      setEscrows([]);
      setSuccessDialogData({
        title: 'Escrows Cleared',
        status: 'All escrows have been removed',
        onClose: () => setShowSuccessDialog(false),
      });
      setShowSuccessDialog(true);
    } catch (error) {
      console.error('Error clearing escrows:', error);
      setErrorDialogData({
        message: `Failed to clear escrows: ${error.message}`,
        onClose: () => setShowErrorDialog(false),
      });
      setShowErrorDialog(true);
    } finally {
      setLoading(false);
    }
  };

  const handleRefund = async (escrowId) => {
    if (!isConnected || !signer) {
      setErrorDialogData({ message: 'Please connect your wallet first', onClose: () => setShowErrorDialog(false) });
      setShowErrorDialog(true);
      return;
    }

    setLoading(true);
    try {
      // Find the escrow
      const escrow = escrows.find(e => e.id === escrowId);
      if (!escrow || !escrow.contractAddress) {
        throw new Error('Escrow or contract address not found');
      }

      // Load contract ABI
      const abiResponse = await fetch('http://localhost:4000/abi');
      if (!abiResponse.ok) {
        throw new Error('Failed to load contract ABI');
      }
      const { abi } = await abiResponse.json();

      // Create contract instance
      const contract = new ethers.Contract(escrow.contractAddress, abi, signer);

      // Get max refund amount (can be full or partial)
      const maxRefundWei = await contract.getMaxClientRefund();
      const maxRefundEth = ethers.formatEther(maxRefundWei);

      if (maxRefundWei === 0n) {
        throw new Error('No refund available');
      }

      // Get estimated refund (for display purposes)
      let estimatedRefundWei = 0n;
      try {
        estimatedRefundWei = await contract.getEstimatedClientRefund();
      } catch (err) {
        console.warn('Error getting estimated refund:', err);
      }
      const estimatedRefundEth = ethers.formatEther(estimatedRefundWei);

      // Use max refund for the transaction (allows full refund)
      const refundAmountWei = maxRefundWei;

      // Estimate gas for refund transaction
      let refundGasEstimate;
      let refundGasCost;
      try {
        refundGasEstimate = await contract.claimClientRefund.estimateGas(refundAmountWei);
        const currentGasPrice = await provider.getFeeData();
        const gasPriceValue = currentGasPrice.gasPrice || currentGasPrice.maxFeePerGas || 0n;
        refundGasCost = refundGasEstimate * gasPriceValue;
      } catch (error) {
        console.error('Error estimating gas:', error);
        refundGasEstimate = 100000n;
        const currentGasPrice = await provider.getFeeData();
        const gasPriceValue = currentGasPrice.gasPrice || currentGasPrice.maxFeePerGas || 0n;
        refundGasCost = refundGasEstimate * gasPriceValue;
      }

      const refundGasCostEth = ethers.formatEther(refundGasCost);

      // Show confirmation dialog with refund amount (full or partial)
      const refundAmountDisplay = maxRefundEth === estimatedRefundEth 
        ? `${maxRefundEth} ETH (Full Refund)`
        : `${maxRefundEth} ETH (Max Available)`;

      const refundConfirmed = await showConfirmation({
        title: 'Claim Refund',
        gasInfo: {
          refundAmount: refundAmountDisplay,
          estimatedRefund: estimatedRefundEth !== maxRefundEth ? `Estimated: ${estimatedRefundEth} ETH` : null,
          estimatedGas: `${refundGasEstimate.toString()}`,
          estimatedGasCost: `${refundGasCostEth} ETH`,
        },
        warning: '⚠️ This action will permanently close the escrow before the scheduled end time. Each party will receive their due amount based on the current contract state.',
        confirmText: 'Claim Refund',
        cancelText: 'Cancel',
      });

      if (!refundConfirmed) {
        return;
      }

      // Call claimClientRefund function with max refund amount
      const tx = await contract.claimClientRefund(refundAmountWei);
      console.log('Refund transaction sent:', tx.hash);
      
      // Wait for confirmation
      const receipt = await tx.wait();
      console.log('Refund confirmed:', receipt);

      // Calculate actual gas cost
      const actualGasUsed = receipt.gasUsed;
      const actualGasPrice = receipt.gasPrice || receipt.maxFeePerGas || 0n;
      const actualGasCost = actualGasUsed * actualGasPrice;

      // Check final status after refund (might be 'closed' if all funds distributed)
      const finalStatusData = await checkContractStatus(escrow.contractAddress);
      const finalStatus = finalStatusData?.status || 'disputed';
      
      // Update in API with step
      await updateEscrowWithStep(
        escrowId,
        finalStatus, // Use actual contract status (might be 'closed' if all funds distributed)
        'refunded',
        account,
        receipt.hash,
        `Refund of ${estimatedRefundEth} ETH claimed by client`
      );

      // Refresh escrows with updated status from contract
      const updatedEscrows = await getEscrowsByAddress(account, 'client');
      const escrowsWithStatus = await Promise.all(
        updatedEscrows.map(async (e) => {
          let updatedEscrow = { ...e };
          
          // Get service provider name
          if (e.serviceProvider) {
            const provider = getUserByAddress(e.serviceProvider);
            if (provider) {
              updatedEscrow.serviceProviderName = provider.name;
            }
          }
          
          // Get contract status and end time
          if (e.contractAddress) {
            const contractData = await checkContractStatus(e.contractAddress);
            if (contractData) {
              updatedEscrow.status = contractData.status;
              updatedEscrow.endTime = contractData.endTime;
            }
          }
          
          return updatedEscrow;
        })
      );
      setEscrows(escrowsWithStatus);
      await refreshBalance('client');
      
      setSuccessDialogData({
        title: 'Refund Claimed',
        contractAddress: `${escrow.contractAddress.slice(0, 6)}...${escrow.contractAddress.slice(-4)}`,
        gasInfo: {
          refundAmount: `${estimatedRefundEth} ETH`,
          gasUsed: `${actualGasUsed.toString()}`,
          gasCost: `${ethers.formatEther(actualGasCost)} ETH`,
        },
        onClose: () => setShowSuccessDialog(false),
      });
      setShowSuccessDialog(true);
    } catch (error) {
      console.error('Error claiming refund:', error);
      setErrorDialogData({
        message: `Failed to claim refund: ${error.message}`,
        onClose: () => setShowErrorDialog(false),
      });
      setShowErrorDialog(true);
    } finally {
      setLoading(false);
    }
  };

  const handleResolveDispute = async (escrowId) => {
    if (!isConnected || !signer) {
      setErrorDialogData({ message: 'Please connect your wallet first', onClose: () => setShowErrorDialog(false) });
      setShowErrorDialog(true);
      return;
    }

    setLoading(true);
    try {
      // Find the escrow
      const escrow = escrows.find(e => e.id === escrowId);
      if (!escrow || !escrow.contractAddress) {
        throw new Error('Escrow or contract address not found');
      }

      // Load contract ABI
      const abiResponse = await fetch('http://localhost:4000/abi');
      if (!abiResponse.ok) {
        throw new Error('Failed to load contract ABI');
      }
      const { abi } = await abiResponse.json();

      // Create contract instance
      const contract = new ethers.Contract(escrow.contractAddress, abi, signer);

      // Estimate gas for resolve dispute transaction (with 0 additional minutes - just resolve)
      let resolveGasEstimate;
      let resolveGasCost;
      try {
        resolveGasEstimate = await contract.resolveDispute.estimateGas(0);
        const currentGasPrice = await provider.getFeeData();
        const gasPriceValue = currentGasPrice.gasPrice || currentGasPrice.maxFeePerGas || 0n;
        resolveGasCost = resolveGasEstimate * gasPriceValue;
      } catch (error) {
        console.error('Error estimating gas:', error);
        resolveGasEstimate = 100000n;
        const currentGasPrice = await provider.getFeeData();
        const gasPriceValue = currentGasPrice.gasPrice || currentGasPrice.maxFeePerGas || 0n;
        resolveGasCost = resolveGasEstimate * gasPriceValue;
      }

      const resolveGasCostEth = ethers.formatEther(resolveGasCost);

      // Show confirmation dialog
      const resolveConfirmed = await showConfirmation({
        title: 'Resolve Dispute',
        gasInfo: {
          estimatedGas: `${resolveGasEstimate.toString()}`,
          estimatedGasCost: `${resolveGasCostEth} ETH`,
        },
        confirmText: 'Resolve',
        cancelText: 'Cancel',
      });

      if (!resolveConfirmed) {
        return;
      }

      // Call resolveDispute function with 0 additional minutes (just resolve, no extension)
      const tx = await contract.resolveDispute(0);
      console.log('Resolve dispute transaction sent:', tx.hash);
      
      // Wait for confirmation
      const receipt = await tx.wait();
      console.log('Dispute resolved:', receipt);

      // Calculate actual gas cost
      const actualGasUsed = receipt.gasUsed;
      const actualGasPrice = receipt.gasPrice || receipt.maxFeePerGas || 0n;
      const actualGasCost = actualGasUsed * actualGasPrice;

      // Update in IndexedDB with step
      await updateEscrowWithStep(
        escrowId,
        'funded', // Status goes back to funded after dispute is resolved
        'dispute_resolved',
        account,
        receipt.hash,
        'Dispute resolved by client'
      );

      // Refresh escrows with updated status from contract
      const updatedEscrows = await getEscrowsByAddress(account, 'client');
      const escrowsWithStatus = await Promise.all(
        updatedEscrows.map(async (e) => {
          let updatedEscrow = { ...e };
          
          // Get service provider name
          if (e.serviceProvider) {
            const provider = getUserByAddress(e.serviceProvider);
            if (provider) {
              updatedEscrow.serviceProviderName = provider.name;
            }
          }
          
          // Get contract status and end time
          if (e.contractAddress) {
            const contractData = await checkContractStatus(e.contractAddress);
            if (contractData) {
              updatedEscrow.status = contractData.status;
              updatedEscrow.endTime = contractData.endTime;
            }
          }
          
          return updatedEscrow;
        })
      );
      setEscrows(escrowsWithStatus);
      
      setSuccessDialogData({
        title: 'Dispute Resolved',
        status: 'Dispute has been resolved successfully!',
        gasInfo: {
          gasUsed: `${actualGasUsed.toString()}`,
          gasCost: `${ethers.formatEther(actualGasCost)} ETH`,
        },
        onClose: () => setShowSuccessDialog(false),
      });
      setShowSuccessDialog(true);
    } catch (error) {
      console.error('Error resolving dispute:', error);
      setErrorDialogData({
        message: `Failed to resolve dispute: ${error.message}`,
        onClose: () => setShowErrorDialog(false),
      });
      setShowErrorDialog(true);
    } finally {
      setLoading(false);
    }
  };

  const handleDispute = async (escrowId) => {
    if (!isConnected || !signer) {
      setErrorDialogData({ message: 'Please connect your wallet first', onClose: () => setShowErrorDialog(false) });
      setShowErrorDialog(true);
      return;
    }

    setLoading(true);
    try {
      // Find the escrow
      const escrow = escrows.find(e => e.id === escrowId);
      if (!escrow || !escrow.contractAddress) {
        throw new Error('Escrow or contract address not found');
      }

      // Load contract ABI
      const abiResponse = await fetch('http://localhost:4000/abi');
      if (!abiResponse.ok) {
        throw new Error('Failed to load contract ABI');
      }
      const { abi } = await abiResponse.json();

      // Create contract instance
      const contract = new ethers.Contract(escrow.contractAddress, abi, signer);

      // Estimate gas for dispute transaction
      let disputeGasEstimate;
      let disputeGasCost;
      try {
        disputeGasEstimate = await contract.raiseDispute.estimateGas();
        const currentGasPrice = await provider.getFeeData();
        const gasPriceValue = currentGasPrice.gasPrice || currentGasPrice.maxFeePerGas || 0n;
        disputeGasCost = disputeGasEstimate * gasPriceValue;
      } catch (error) {
        console.error('Error estimating gas:', error);
        disputeGasEstimate = 100000n;
        const currentGasPrice = await provider.getFeeData();
        const gasPriceValue = currentGasPrice.gasPrice || currentGasPrice.maxFeePerGas || 0n;
        disputeGasCost = disputeGasEstimate * gasPriceValue;
      }

      const disputeGasCostEth = ethers.formatEther(disputeGasCost);
      const gasPriceGwei = ethers.formatUnits(
        (await provider.getFeeData()).gasPrice || (await provider.getFeeData()).maxFeePerGas || 0n,
        'gwei'
      );

      // Show confirmation dialog with gas estimates
      const disputeConfirmed = await showConfirmation({
        title: 'File Dispute',
        gasInfo: {
          currentGasPrice: `${parseFloat(gasPriceGwei).toFixed(2)} Gwei`,
          estimatedGas: `${disputeGasEstimate.toString()}`,
          estimatedGasCost: `${disputeGasCostEth} ETH`,
        },
        confirmText: 'File Dispute',
        cancelText: 'Cancel',
      });

      if (!disputeConfirmed) {
        return;
      }

      // Call raiseDispute function
      const tx = await contract.raiseDispute();
      console.log('Dispute transaction sent:', tx.hash);
      
      // Wait for confirmation
      const receipt = await tx.wait();
      console.log('Dispute confirmed:', receipt);

      // Calculate actual gas cost
      const actualGasUsed = receipt.gasUsed;
      const actualGasPrice = receipt.gasPrice || receipt.maxFeePerGas || 0n;
      const actualGasCost = actualGasUsed * actualGasPrice;

      // Update in IndexedDB with step
      await updateEscrowWithStep(
        escrowId,
        'disputed',
        'disputed',
        account,
        receipt.hash,
        'Dispute filed by client'
      );

      // Refresh escrows with updated status from contract
      const updatedEscrows = await getEscrowsByAddress(account, 'client');
      const escrowsWithStatus = await Promise.all(
        updatedEscrows.map(async (e) => {
          let updatedEscrow = { ...e };
          
          // Get service provider name
          if (e.serviceProvider) {
            const provider = getUserByAddress(e.serviceProvider);
            if (provider) {
              updatedEscrow.serviceProviderName = provider.name;
            }
          }
          
          // Get contract status and end time
          if (e.contractAddress) {
            const contractData = await checkContractStatus(e.contractAddress);
            if (contractData) {
              updatedEscrow.status = contractData.status;
              updatedEscrow.endTime = contractData.endTime;
            }
          }
          
          return updatedEscrow;
        })
      );
      setEscrows(escrowsWithStatus);
      
      setSuccessDialogData({
        title: 'Dispute Filed',
        status: 'Dispute has been filed successfully!',
        gasInfo: {
          gasUsed: `${actualGasUsed.toString()}`,
          gasCost: `${ethers.formatEther(actualGasCost)} ETH`,
        },
        onClose: () => setShowSuccessDialog(false),
      });
      setShowSuccessDialog(true);
    } catch (error) {
      console.error('Error filing dispute:', error);
      setErrorDialogData({
        message: `Failed to file dispute: ${error.message}`,
        onClose: () => setShowErrorDialog(false),
      });
      setShowErrorDialog(true);
    } finally {
      setLoading(false);
    }
  };

  if (!isConnected) {
    return (
      <div className="dashboard-placeholder">
        <p>Please connect your wallet to access the Client Dashboard</p>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h2>Client Dashboard</h2>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          {escrows.length > 0 && (
            <button 
              onClick={handleClearAllEscrows} 
              className="btn-secondary"
              disabled={loading}
              style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}
            >
              Clear All Escrows
            </button>
          )}
        <button 
          onClick={() => setShowCreateModal(true)} 
          className="btn-primary"
          disabled={loading}
        >
          + Create New Escrow
        </button>
        </div>
      </div>

      {/* Available Service Providers Section */}
      <div className="providers-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h3 style={{ margin: 0, color: '#111827', fontSize: '1.25rem', fontWeight: 700 }}>Available Service Providers</h3>
          <span style={{ fontSize: '0.875rem', color: '#6b7280', background: '#f3f4f6', padding: '0.25rem 0.75rem', borderRadius: '12px' }}>
            {SERVICE_PROVIDERS.length} Available
          </span>
        </div>
        <div className="providers-list" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
          {SERVICE_PROVIDERS.map(provider => (
            <div 
              key={provider.id} 
              className="provider-card"
              style={{
                padding: '1.5rem',
                background: 'linear-gradient(135deg, #f9fafb 0%, #ffffff 100%)',
                border: '2px solid #e5e7eb',
                borderRadius: '12px',
                transition: 'all 0.3s ease',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#667eea';
                e.currentTarget.style.boxShadow = '0 4px 16px rgba(102, 126, 234, 0.15)';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#e5e7eb';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.05)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <div style={{ marginBottom: '1rem' }}>
                <h4 style={{ 
                  margin: '0 0 0.75rem 0', 
                  color: '#111827', 
                  fontSize: '1.125rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  flexWrap: 'wrap'
                }}>
                  {provider.name}
                  {provider.rating && (
                    <span style={{ 
                      fontSize: '0.75rem', 
                      background: '#fef3c7', 
                      color: '#92400e',
                      padding: '0.125rem 0.5rem',
                      borderRadius: '8px',
                      fontWeight: 600
                    }}>
                      ⭐ {provider.rating}
                    </span>
                  )}
                </h4>
                <div style={{ 
                  fontSize: '0.875rem', 
                  color: '#374151', 
                  marginBottom: '0.5rem',
                  fontFamily: 'monospace',
                  background: '#f3f4f6',
                  padding: '0.5rem',
                  borderRadius: '6px',
                  display: 'inline-block'
                }}>
                  {provider.address.slice(0, 6)}...{provider.address.slice(-4)}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.5rem' }}>
                  {provider.email && (
                    <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                      📧 {provider.email}
                    </div>
                  )}
                  {provider.location && (
                    <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                      📍 {provider.location}
                    </div>
                  )}
                  {provider.yearsExperience && (
                    <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                      ⏱️ {provider.yearsExperience}+ Years Experience
                    </div>
                  )}
                  {provider.projectsCompleted && (
                    <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                      ✅ {provider.projectsCompleted} Projects Completed
                    </div>
                  )}
                </div>
              </div>
              
              {provider.description && (
                <div style={{ 
                  fontSize: '0.875rem', 
                  color: '#374151', 
                  marginTop: '1rem', 
                  paddingTop: '1rem', 
                  borderTop: '1px solid #e5e7eb',
                  lineHeight: '1.6'
                }}>
                  {provider.description}
                </div>
              )}
              
              {provider.specialties && provider.specialties.length > 0 && (
                <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #e5e7eb' }}>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.5rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Specialties
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {provider.specialties.map((specialty, idx) => (
                      <span 
                        key={idx}
                        style={{
                          fontSize: '0.75rem',
                          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                          color: 'white',
                          padding: '0.25rem 0.75rem',
                          borderRadius: '12px',
                          fontWeight: 600
                        }}
                      >
                        {specialty}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="escrows-section" style={{ marginTop: '3rem', paddingTop: '2rem', borderTop: '2px solid #e5e7eb' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h3 style={{ margin: 0, color: '#111827', fontSize: '1.25rem', fontWeight: 700 }}>My Escrows</h3>
          {escrows.length > 0 && (
            <span style={{ fontSize: '0.875rem', color: '#6b7280', background: '#f3f4f6', padding: '0.25rem 0.75rem', borderRadius: '12px' }}>
              {escrows.length} {escrows.length === 1 ? 'Escrow' : 'Escrows'}
            </span>
          )}
        </div>
        {escrows.length === 0 ? (
          <div className="empty-state" style={{
            textAlign: 'center',
            padding: '4rem 2rem',
            background: '#f9fafb',
            borderRadius: '12px',
            border: '2px dashed #e5e7eb'
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📋</div>
            <p style={{ margin: 0, color: '#374151', fontSize: '1.1rem', fontWeight: 500 }}>
              No escrows yet. Create your first escrow to get started!
            </p>
            <p style={{ margin: '0.5rem 0 0 0', color: '#6b7280', fontSize: '0.875rem' }}>
              Select a service provider above and create an escrow to begin
            </p>
          </div>
        ) : (
          <div className="escrows-grid">
            {escrows.map(escrow => (
              <EscrowCard
                key={escrow.id}
                escrow={escrow}
                role="client"
                onDeposit={() => handleDeposit(escrow.id)}
                onRelease={() => handleReleaseFunds(escrow.id)}
                onDispute={() => handleDispute(escrow.id)}
                onRefund={() => handleRefund(escrow.id)}
                onResolveDispute={() => handleResolveDispute(escrow.id)}
              />
            ))}
          </div>
        )}
      </div>

      {showCreateModal && (
        <CreateEscrowModal
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateEscrow}
          loading={loading}
        />
      )}

      {/* Confirmation Dialog */}
      {showConfirmDialog && confirmDialogData && (
        <div className="modal-overlay" style={{ zIndex: 2000 }} onClick={confirmDialogData.onCancel}>
          <div className="modal-content" style={{ 
            maxWidth: '380px', 
            borderRadius: '4px',
            padding: '1.25rem',
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              marginBottom: '1rem',
            }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: '#111827' }}>
                {confirmDialogData.title}
              </h3>
              <button 
                onClick={confirmDialogData.onCancel}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  color: '#6b7280',
                  padding: '0',
                  width: '24px',
                  height: '24px',
                  lineHeight: '1',
                }}
              >
                ×
              </button>
            </div>
            
            {confirmDialogData.gasInfo && (
              <div style={{
                background: '#f9fafb',
                border: '1px solid #e5e7eb',
                padding: '0.875rem',
                marginBottom: '1rem',
              }}>
                {confirmDialogData.gasInfo.currentGasPrice && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
                    <span style={{ color: '#6b7280' }}>Gas Price:</span>
                    <span style={{ color: '#111827', fontWeight: 600 }}>{confirmDialogData.gasInfo.currentGasPrice}</span>
                  </div>
                )}
                {confirmDialogData.gasInfo.estimatedGas && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
                    <span style={{ color: '#6b7280' }}>Gas:</span>
                    <span style={{ color: '#111827', fontWeight: 600 }}>{confirmDialogData.gasInfo.estimatedGas}</span>
                  </div>
                )}
                {confirmDialogData.gasInfo.estimatedCost && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
                    <span style={{ color: '#6b7280' }}>Est. Cost:</span>
                    <span style={{ color: '#111827', fontWeight: 600 }}>{confirmDialogData.gasInfo.estimatedCost}</span>
                  </div>
                )}
                {confirmDialogData.gasInfo.depositAmount && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
                    <span style={{ color: '#6b7280' }}>Amount:</span>
                    <span style={{ color: '#111827', fontWeight: 600 }}>{confirmDialogData.gasInfo.depositAmount}</span>
                  </div>
                )}
                {confirmDialogData.gasInfo.refundAmount && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
                    <span style={{ color: '#6b7280' }}>Refund Amount:</span>
                    <span style={{ color: '#10b981', fontWeight: 600 }}>{confirmDialogData.gasInfo.refundAmount}</span>
                  </div>
                )}
                {confirmDialogData.gasInfo.estimatedGasCost && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
                    <span style={{ color: '#6b7280' }}>Gas Cost:</span>
                    <span style={{ color: '#111827', fontWeight: 600 }}>{confirmDialogData.gasInfo.estimatedGasCost}</span>
                  </div>
                )}
                {confirmDialogData.gasInfo.totalCost && (
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    paddingTop: '0.5rem',
                    borderTop: '1px solid #e5e7eb',
                    marginTop: '0.5rem',
                    fontSize: '0.95rem',
                  }}>
                    <span style={{ color: '#111827', fontWeight: 700 }}>Total:</span>
                    <span style={{ color: '#111827', fontWeight: 700 }}>{confirmDialogData.gasInfo.totalCost}</span>
                  </div>
                )}
              </div>
            )}

            {confirmDialogData.warning && (
              <div style={{
                background: '#fef3c7',
                border: '1px solid #fbbf24',
                borderRadius: '8px',
                padding: '0.875rem',
                marginBottom: '1rem',
                fontSize: '0.875rem',
                color: '#92400e',
                lineHeight: '1.5',
              }}>
                {confirmDialogData.warning}
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button 
                type="button" 
                onClick={confirmDialogData.onCancel} 
                className="btn-secondary"
                style={{ flex: 1, padding: '0.625rem 1rem', fontSize: '0.9rem' }}
              >
                {confirmDialogData.cancelText || 'Cancel'}
              </button>
              <button 
                type="button" 
                onClick={confirmDialogData.onConfirm} 
                className="btn-primary"
                style={{ flex: 1, padding: '0.625rem 1rem', fontSize: '0.9rem' }}
              >
                {confirmDialogData.confirmText || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Dialog */}
      {showSuccessDialog && successDialogData && (
        <div className="modal-overlay" style={{ zIndex: 2000 }} onClick={successDialogData.onClose}>
          <div className="modal-content" style={{ 
            maxWidth: '380px',
            borderRadius: '4px',
            padding: '1.25rem',
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              marginBottom: '1rem',
            }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: '#10b981' }}>
                {successDialogData.title}
              </h3>
              <button 
                onClick={successDialogData.onClose}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  color: '#6b7280',
                  padding: '0',
                  width: '24px',
                  height: '24px',
                  lineHeight: '1',
                }}
              >
                ×
              </button>
            </div>
            
            {successDialogData.contractAddress && (
              <div style={{ marginBottom: '0.75rem', fontSize: '0.875rem', color: '#6b7280' }}>
                Contract: <span style={{ color: '#111827', fontWeight: 600 }}>{successDialogData.contractAddress}</span>
              </div>
            )}

            {successDialogData.status && (
              <div style={{ marginBottom: '0.75rem', fontSize: '0.875rem', color: '#6b7280' }}>
                Status: <span style={{ color: '#111827', fontWeight: 600 }}>{successDialogData.status}</span>
              </div>
            )}

            {successDialogData.gasInfo && (
              <div style={{
                background: '#f9fafb',
                border: '1px solid #e5e7eb',
                padding: '0.875rem',
                marginBottom: '1rem',
              }}>
                {successDialogData.gasInfo.depositAmount && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
                    <span style={{ color: '#6b7280' }}>Amount:</span>
                    <span style={{ color: '#111827', fontWeight: 600 }}>{successDialogData.gasInfo.depositAmount}</span>
                  </div>
                )}
                {successDialogData.gasInfo.refundAmount && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
                    <span style={{ color: '#6b7280' }}>Refund Amount:</span>
                    <span style={{ color: '#10b981', fontWeight: 600 }}>{successDialogData.gasInfo.refundAmount}</span>
                  </div>
                )}
                {successDialogData.gasInfo.gasUsed && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
                    <span style={{ color: '#6b7280' }}>Gas:</span>
                    <span style={{ color: '#111827', fontWeight: 600 }}>{successDialogData.gasInfo.gasUsed}</span>
                  </div>
                )}
                {successDialogData.gasInfo.gasCost && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
                    <span style={{ color: '#6b7280' }}>Gas Cost:</span>
                    <span style={{ color: '#111827', fontWeight: 600 }}>{successDialogData.gasInfo.gasCost}</span>
                  </div>
                )}
                {successDialogData.gasInfo.totalPaid && (
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    paddingTop: '0.5rem',
                    borderTop: '1px solid #e5e7eb',
                    marginTop: '0.5rem',
                    fontSize: '0.95rem',
                  }}>
                    <span style={{ color: '#111827', fontWeight: 700 }}>Total:</span>
                    <span style={{ color: '#111827', fontWeight: 700 }}>{successDialogData.gasInfo.totalPaid}</span>
                  </div>
                )}
              </div>
            )}

            <button 
              type="button" 
              onClick={successDialogData.onClose} 
              className="btn-primary" 
              style={{ width: '100%', padding: '0.625rem 1rem', fontSize: '0.9rem' }}
            >
              OK
            </button>
          </div>
        </div>
      )}

      {/* Error Dialog */}
      {showErrorDialog && errorDialogData && (
        <div className="modal-overlay" style={{ zIndex: 2000 }} onClick={errorDialogData.onClose}>
          <div className="modal-content" style={{ 
            maxWidth: '380px',
            borderRadius: '4px',
            padding: '1.25rem',
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              marginBottom: '1rem',
            }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: '#ef4444' }}>
                Error
              </h3>
              <button 
                onClick={errorDialogData.onClose}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  color: '#6b7280',
                  padding: '0',
                  width: '24px',
                  height: '24px',
                  lineHeight: '1',
                }}
              >
                ×
              </button>
            </div>
            <p style={{ margin: '0 0 1rem 0', color: '#374151', fontSize: '0.9rem', lineHeight: '1.5' }}>
              {errorDialogData.message}
            </p>
            <button 
              type="button" 
              onClick={errorDialogData.onClose} 
              className="btn-primary" 
              style={{ width: '100%', padding: '0.625rem 1rem', fontSize: '0.9rem' }}
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientDashboard;

