import { useState, useEffect } from 'react';
import { useWeb3 } from '../contexts/Web3Context';
import AccountSelectionModal from './AccountSelectionModal';

const WalletConnection = ({ role }) => {
  const { 
    clientAccount, 
    clientIsConnected, 
    providerAccount,
    providerIsConnected,
    connectWallet, 
    disconnectWallet 
  } = useWeb3();

  const [showAccountModal, setShowAccountModal] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);

  const isConnected = role === 'client' ? clientIsConnected : providerIsConnected;
  const account = role === 'client' ? clientAccount : providerAccount;

  useEffect(() => {
    const fetchAccounts = async () => {
      if (typeof window.ethereum !== 'undefined') {
        try {
          const accs = await window.ethereum.request({ method: 'eth_accounts' });
          setAccounts(accs);
        } catch (error) {
          console.error('Error fetching accounts:', error);
        }
      }
    };

    fetchAccounts();

    // Listen for account changes
    if (window.ethereum) {
      window.ethereum.on('accountsChanged', fetchAccounts);
      return () => {
        window.ethereum.removeListener('accountsChanged', fetchAccounts);
      };
    }
  }, []);

  const handleConnect = async () => {
    if (accounts.length === 0) {
      // No accounts, request access
      setLoading(true);
      try {
        await connectWallet(role);
      } catch (error) {
        console.error('Error connecting:', error);
      } finally {
        setLoading(false);
      }
    } else if (accounts.length === 1) {
      // Single account, connect directly
      setLoading(true);
      try {
        await connectWallet(role, accounts[0]);
      } catch (error) {
        console.error('Error connecting:', error);
      } finally {
        setLoading(false);
      }
    } else {
      // Multiple accounts, show selection modal
      setShowAccountModal(true);
    }
  };

  const handleDisconnect = () => {
    disconnectWallet(role);
  };

  const handleAccountSelect = async (selectedAccount) => {
    setShowAccountModal(false);
    setLoading(true);
    try {
      await connectWallet(role, selectedAccount);
    } catch (error) {
      console.error('Error connecting:', error);
    } finally {
      setLoading(false);
    }
  };

  if (isConnected && account) {
  return (
    <div className="wallet-connection">
        <span className="wallet-address">
          {account.slice(0, 6)}...{account.slice(-4)}
        </span>
        <button onClick={handleDisconnect} className="btn-secondary">
            Disconnect
          </button>
        </div>
    );
  }

  return (
    <>
      <button 
        onClick={handleConnect} 
        className="btn-primary"
        disabled={loading}
      >
        {loading ? 'Connecting...' : 'Connect Wallet'}
        </button>
      
      {showAccountModal && (
        <AccountSelectionModal
          accounts={accounts}
          onSelect={handleAccountSelect}
          onClose={() => setShowAccountModal(false)}
        />
      )}
    </>
  );
};

export default WalletConnection;
