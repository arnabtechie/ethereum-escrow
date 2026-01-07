import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import './AccountSelectionModal.css';

const AccountSelectionModal = ({ onSelect, onClose, role }) => {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [balances, setBalances] = useState({});
  const [activeAccount, setActiveAccount] = useState(null);

  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        if (typeof window === 'undefined' || !window.ethereum) {
          setLoading(false);
          return;
        }

        const provider = new ethers.BrowserProvider(window.ethereum);
        const allAccounts = await provider.send('eth_requestAccounts', []);
        
        // Get the currently active account
        const currentAccounts = await provider.send('eth_accounts', []);
        const active = currentAccounts[0];
        setActiveAccount(active);
        
        // Get balances for all accounts
        const balancePromises = allAccounts.map(async (account) => {
          const balance = await provider.getBalance(account);
          return { account, balance: ethers.formatEther(balance) };
        });

        const accountBalances = await Promise.all(balancePromises);
        const balanceMap = {};
        accountBalances.forEach(({ account, balance }) => {
          balanceMap[account] = balance;
        });

        setAccounts(allAccounts);
        setBalances(balanceMap);
      } catch (error) {
        console.error('Error fetching accounts:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchAccounts();
  }, []);

  const formatAddress = (address) => {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const handleAccountSelect = async (account) => {
    // Check if this account is currently active
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const currentAccounts = await provider.send('eth_accounts', []);
      const currentActive = currentAccounts[0];
      
      if (currentActive && currentActive.toLowerCase() === account.toLowerCase()) {
        // Account is already active, proceed
        onSelect(account);
      } else {
        // Account is not active, inform user
        const message = 
          `The selected account is not currently active in your wallet.\n\n` +
          `Selected: ${account.slice(0, 6)}...${account.slice(-4)}\n` +
          `Active: ${currentActive ? `${currentActive.slice(0, 6)}...${currentActive.slice(-4)}` : 'None'}\n\n` +
          `Please switch to the desired account in your wallet, then click "Connect Wallet & Continue" again.\n\n` +
          `Or click OK to use the currently active account.`;
        
        if (window.confirm(message)) {
          // Use the currently active account instead
          if (currentActive) {
            onSelect(currentActive);
          } else {
            alert('No active account found. Please connect your wallet first.');
          }
        }
      }
    } catch (error) {
      console.error('Error checking account:', error);
      // Fallback: use the selected account
      onSelect(account);
    }
  };

  if (loading) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content account-modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>Select Account for {role === 'client' ? 'Client' : 'Service Provider'}</h2>
            <button className="modal-close" onClick={onClose}>×</button>
          </div>
          <div className="loading-state">
            <p>Loading accounts...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content account-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Select Account for {role === 'client' ? 'Client' : 'Service Provider'}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="account-list">
          {accounts.length === 0 ? (
            <div className="empty-accounts">
              <p>No accounts found. Please make sure your wallet is unlocked.</p>
            </div>
          ) : (
            accounts.map((account) => {
              const isActive = activeAccount && account.toLowerCase() === activeAccount.toLowerCase();
              return (
                <div
                  key={account}
                  className={`account-item ${isActive ? 'active-account' : ''}`}
                  onClick={() => handleAccountSelect(account)}
                >
                  <div className="account-info">
                    <div className="account-header">
                      <div className="account-address">{formatAddress(account)}</div>
                      {isActive && <span className="active-badge">Active</span>}
                    </div>
                    <div className="account-full">{account}</div>
                    <div className="account-balance">
                      {parseFloat(balances[account] || '0').toFixed(4)} ETH
                    </div>
                  </div>
                  <div className="account-select-icon">→</div>
                </div>
              );
            })
          )}
        </div>

        <div className="account-selection-hint">
          <p>💡 <strong>Tip:</strong> You can use different accounts for Client and Service Provider roles</p>
          <p style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
            ⚠️ If you want to use a different account, make sure it's active in your wallet before selecting it
          </p>
        </div>
      </div>
    </div>
  );
};

export default AccountSelectionModal;

