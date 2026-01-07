import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { useWeb3 } from '../contexts/Web3Context';
import EscrowCard from './EscrowCard';
import {
  initDB,
  getAllEscrows,
  updateEscrowWithStep,
  clearAllData,
} from '../utils/api';
import { CLIENTS, SERVICE_PROVIDERS, getUserByAddress } from '../data/users';

const ServiceProviderDashboard = () => {
  const { providerAccount, providerSigner, providerProvider, providerIsConnected, refreshBalance } = useWeb3();
  const account = providerAccount;
  const signer = providerSigner;
  const provider = providerProvider;
  const isConnected = providerIsConnected;
  const [escrows, setEscrows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmDialogData, setConfirmDialogData] = useState(null);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [successDialogData, setSuccessDialogData] = useState(null);
  const [showErrorDialog, setShowErrorDialog] = useState(false);
  const [errorDialogData, setErrorDialogData] = useState(null);

  // Function to check contract status and get end time from blockchain
  const checkContractStatus = async (contractAddress) => {
    if (!contractAddress || !provider) return null;
    
    try {
      // Load ABI with timeout
      const abiResponse = await fetch('http://localhost:4000/abi', {
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });
      if (!abiResponse.ok) {
        console.warn('Failed to load ABI:', abiResponse.status);
        return null;
      }
      const { abi } = await abiResponse.json();
      
      // Create contract instance
      const contract = new ethers.Contract(contractAddress, abi, provider);
      
      // Check status, dispute flag, and end time with error handling
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
      
      // If status is null, contract might not exist or be accessible
      if (status === null) {
        return null;
      }
      
      // Status enum: 0=CREATED, 1=FUNDED, 2=COMPLETED, 3=CLOSED
      const statusMap = {
        0: 'created',
        1: 'funded',
        2: 'completed',
        3: 'closed',
      };
      
      let finalStatus = statusMap[status] || 'created';
      
      // If disputed, override status to 'disputed' (unless closed)
      if (isDisputed && finalStatus !== 'closed') {
        finalStatus = 'disputed';
      }
      
      // Get payout availability
      let payoutAvailable = 0n;
      let canClaimPayout = false;
      try {
        payoutAvailable = await contract.getEstimatedProviderPayout();
        // Payout is available if there's payout (disputed or not - contract allows it)
        canClaimPayout = payoutAvailable > 0n;
      } catch (err) {
        console.warn('Error getting payout:', err);
      }
      
      return {
        status: finalStatus,
        endTime: endTime ? Number(endTime) * 1000 : null, // Convert to milliseconds
        payoutAvailable: payoutAvailable.toString(),
        isDisputed: isDisputed,
        canClaimPayout: canClaimPayout,
      };
    } catch (error) {
      console.error('Error checking contract status:', error);
      return null;
    }
  };

  // Initialize and load escrows
  useEffect(() => {
    const loadEscrows = async () => {
      try {
        await initDB();
        
        // Get ALL escrows from API
        const allEscrows = await getAllEscrows();
        console.log('🔍 Provider Dashboard - Loading ALL escrows:', allEscrows.length);
        
        if (allEscrows.length === 0) {
          console.log('No escrows found in database');
          setEscrows([]);
          return;
        }
        
        // Check contract status for each escrow that has a contract address
        // Use Promise.allSettled to handle errors gracefully
        const escrowsWithStatus = await Promise.allSettled(
          allEscrows.map(async (escrow) => {
            let updatedEscrow = { ...escrow };
            
            // Get client name
            if (escrow.client) {
              try {
                const client = getUserByAddress(escrow.client);
                if (client) {
                  updatedEscrow.clientName = client.name;
                }
              } catch (error) {
                console.error('Error getting client name:', error);
              }
            }
            
            // Get contract status, end time, and payout availability (only if provider is available)
            if (escrow.contractAddress && provider) {
              try {
                const contractData = await checkContractStatus(escrow.contractAddress);
                if (contractData) {
                  updatedEscrow.status = contractData.status;
                  updatedEscrow.endTime = contractData.endTime;
                  updatedEscrow.payoutAvailable = contractData.payoutAvailable;
                  updatedEscrow.isDisputed = contractData.isDisputed;
                  updatedEscrow.canClaimPayout = contractData.canClaimPayout;
                }
              } catch (statusError) {
                console.error('Error checking contract status for', escrow.contractAddress, ':', statusError);
                // Continue without status update
              }
            }
            
            return updatedEscrow;
          })
        );
        
        // Filter out failed promises and extract values
        const successfulEscrows = escrowsWithStatus
          .filter(result => result.status === 'fulfilled')
          .map(result => result.value);
        
        console.log('Final escrows to display:', successfulEscrows.length);
        setEscrows(successfulEscrows);
      } catch (error) {
        console.error('Error loading escrows from IndexedDB:', error);
        setEscrows([]); // Set empty array on error to prevent undefined state
      }
    };

    loadEscrows();
  }, [provider]);

  // Helper function to show confirmation dialog
  const showConfirmation = (data) => {
    return new Promise((resolve) => {
      setConfirmDialogData({ ...data, onConfirm: () => { setShowConfirmDialog(false); resolve(true); }, onCancel: () => { setShowConfirmDialog(false); resolve(false); } });
      setShowConfirmDialog(true);
    });
  };

  const handleClaimPayout = async (escrowId) => {
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

      // Get estimated payout amount
      const estimatedPayoutWei = await contract.getEstimatedProviderPayout();
      const estimatedPayoutEth = ethers.formatEther(estimatedPayoutWei);

      if (estimatedPayoutWei === 0n) {
        throw new Error('No payout available. Wait for vesting period or client approval.');
      }

      // Estimate gas for claim payout transaction
      let payoutGasEstimate;
      let payoutGasCost;
      try {
        payoutGasEstimate = await contract.claimProviderPayout.estimateGas();
        const currentGasPrice = await provider.getFeeData();
        const gasPriceValue = currentGasPrice.gasPrice || currentGasPrice.maxFeePerGas || 0n;
        payoutGasCost = payoutGasEstimate * gasPriceValue;
    } catch (error) {
        console.error('Error estimating gas:', error);
        payoutGasEstimate = 100000n;
        const currentGasPrice = await provider.getFeeData();
        const gasPriceValue = currentGasPrice.gasPrice || currentGasPrice.maxFeePerGas || 0n;
        payoutGasCost = payoutGasEstimate * gasPriceValue;
      }

      const payoutGasCostEth = ethers.formatEther(payoutGasCost);
      const gasPriceGwei = ethers.formatUnits(
        (await provider.getFeeData()).gasPrice || (await provider.getFeeData()).maxFeePerGas || 0n,
        'gwei'
      );

      // Show confirmation dialog with estimated payout
      const payoutConfirmed = await showConfirmation({
        title: 'Claim Payout',
        gasInfo: {
          currentGasPrice: `${parseFloat(gasPriceGwei).toFixed(2)} Gwei`,
          payoutAmount: `${estimatedPayoutEth} ETH`,
          estimatedGas: `${payoutGasEstimate.toString()}`,
          estimatedGasCost: `${payoutGasCostEth} ETH`,
        },
        warning: '⚠️ This action will permanently close the escrow before the scheduled end time. Each party will receive their due amount based on the current contract state.',
        confirmText: 'Claim Payout',
        cancelText: 'Cancel',
      });

      if (!payoutConfirmed) {
      return;
    }

      // Call claimProviderPayout function
      const tx = await contract.claimProviderPayout();
      console.log('Payout transaction sent:', tx.hash);
      
      // Wait for confirmation
      const receipt = await tx.wait();
      console.log('Payout confirmed:', receipt);

      // Calculate actual gas cost
      const actualGasUsed = receipt.gasUsed;
      const actualGasPrice = receipt.gasPrice || receipt.maxFeePerGas || 0n;
      const actualGasCost = actualGasUsed * actualGasPrice;

      // Update in IndexedDB with step
      await updateEscrowWithStep(
        escrowId,
        escrow.status, // Keep current status
        'payout_claimed',
        account,
        receipt.hash,
        `Payout of ${estimatedPayoutEth} ETH claimed by service provider`
      );

      // Refresh escrows with updated status from contract
      const updatedEscrows = await getEscrowsByAddress(account, 'provider');
      const escrowsWithStatus = await Promise.all(
        updatedEscrows.map(async (e) => {
          let updatedEscrow = { ...e };
          
          // Get client name
          if (e.client) {
            const client = getUserByAddress(e.client);
            if (client) {
              updatedEscrow.clientName = client.name;
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
      await refreshBalance('provider');
      
      setSuccessDialogData({
        title: 'Payout Claimed',
        contractAddress: `${escrow.contractAddress.slice(0, 6)}...${escrow.contractAddress.slice(-4)}`,
        gasInfo: {
          payoutAmount: `${estimatedPayoutEth} ETH`,
          gasUsed: `${actualGasUsed.toString()}`,
          gasCost: `${ethers.formatEther(actualGasCost)} ETH`,
        },
        onClose: () => setShowSuccessDialog(false),
      });
      setShowSuccessDialog(true);
    } catch (error) {
      console.error('Error claiming payout:', error);
      setErrorDialogData({
        message: `Failed to claim payout: ${error.message}`,
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

  if (!isConnected) {
    return (
      <div className="dashboard-placeholder">
        <p>Please connect your wallet to access the Service Provider Dashboard</p>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h2>Service Provider Dashboard</h2>
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
        </div>
      </div>

      {/* Available Clients Section */}
      <div className="clients-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h3 style={{ margin: 0, color: '#111827', fontSize: '1.25rem', fontWeight: 700 }}>Available Clients</h3>
          <span style={{ fontSize: '0.875rem', color: '#6b7280', background: '#f3f4f6', padding: '0.25rem 0.75rem', borderRadius: '12px' }}>
            {CLIENTS.length} Available
          </span>
        </div>
        <div className="clients-list" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
          {CLIENTS.map(client => (
            <div 
              key={client.id} 
              className="client-card"
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
                  fontWeight: 700
                }}>
                  {client.name}
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
                  {client.address.slice(0, 6)}...{client.address.slice(-4)}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.5rem' }}>
                  {client.email && (
                    <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                      📧 {client.email}
                    </div>
                  )}
                  {client.location && (
                    <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                      📍 {client.location}
                    </div>
                  )}
                  {client.industry && (
                    <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                      🏢 {client.industry}
                    </div>
                  )}
                  {client.founded && (
                    <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                      📅 Established {client.founded}
                    </div>
                  )}
                </div>
              </div>
              {client.description && (
                <div style={{ 
                  fontSize: '0.875rem', 
                  color: '#374151', 
                  marginTop: '1rem', 
                  paddingTop: '1rem', 
                  borderTop: '1px solid #e5e7eb',
                  lineHeight: '1.6'
                }}>
                  {client.description}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="escrows-section" style={{ marginTop: '3rem', paddingTop: '2rem', borderTop: '2px solid #e5e7eb' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h3 style={{ margin: 0, color: '#111827', fontSize: '1.25rem', fontWeight: 700 }}>All Escrows</h3>
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
              No escrows yet. Wait for clients to create escrows with you as the service provider.
            </p>
            <p style={{ margin: '0.5rem 0 0 0', color: '#6b7280', fontSize: '0.875rem' }}>
              Once a client creates an escrow with your address, it will appear here
            </p>
          </div>
        ) : (
          <div className="escrows-grid">
            {escrows.map(escrow => (
              <EscrowCard
                key={escrow.id}
                escrow={escrow}
                role="provider"
                onWithdraw={() => handleClaimPayout(escrow.id)}
              />
            ))}
          </div>
        )}
      </div>

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
                {confirmDialogData.gasInfo.payoutAmount && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
                    <span style={{ color: '#6b7280' }}>Payout Amount:</span>
                    <span style={{ color: '#10b981', fontWeight: 600 }}>{confirmDialogData.gasInfo.payoutAmount}</span>
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
                {successDialogData.gasInfo.payoutAmount && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
                    <span style={{ color: '#6b7280' }}>Payout Amount:</span>
                    <span style={{ color: '#10b981', fontWeight: 600 }}>{successDialogData.gasInfo.payoutAmount}</span>
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

export default ServiceProviderDashboard;
