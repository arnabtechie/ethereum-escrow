import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';

const Web3Context = createContext();

export const useWeb3 = () => {
  const context = useContext(Web3Context);
  if (!context) {
    throw new Error('useWeb3 must be used within Web3Provider');
  }
  return context;
};

// Helper function to detect available wallet providers
const getWalletProvider = () => {
  if (typeof window === 'undefined') return null;
  
  // Check for Rabby wallet (it injects window.ethereum and window.rabby)
  if (window.rabby && window.ethereum) {
    return window.ethereum;
  }
  
  // Check for MetaMask
  if (window.ethereum) {
    return window.ethereum;
  }
  
  // Check for other common wallets
  if (window.web3) {
    return window.web3.currentProvider;
  }
  
  return null;
};

// Helper function to get wallet name
const getWalletName = () => {
  if (typeof window === 'undefined') return 'Unknown';
  
  if (window.rabby) {
    return 'Rabby';
  }
  
  if (window.ethereum?.isMetaMask) {
    return 'MetaMask';
  }
  
  if (window.ethereum) {
    return 'Web3 Wallet';
  }
  
  return 'Unknown';
};

// Helper function to create wallet state
const createWalletState = () => ({
  account: null,
  provider: null,
  signer: null,
  isConnected: false,
  chainId: null,
  balance: '0',
  walletProvider: null,
});

export const Web3Provider = ({ children }) => {
  const [clientWallet, setClientWallet] = useState(createWalletState());
  const [providerWallet, setProviderWallet] = useState(createWalletState());

  const updateBalance = async (provider, address, role) => {
    try {
      const balance = await provider.getBalance(address);
      const formattedBalance = ethers.formatEther(balance);
      
      if (role === 'client') {
        setClientWallet(prev => ({ ...prev, balance: formattedBalance }));
      } else {
        setProviderWallet(prev => ({ ...prev, balance: formattedBalance }));
      }
    } catch (error) {
      console.error('Error updating balance:', error);
    }
  };

  const connectWallet = useCallback(async (role, selectedAccount = null) => {
    try {
      const ethereumProvider = getWalletProvider();
      
      if (!ethereumProvider) {
        const walletName = getWalletName();
        alert(`Please install a Web3 wallet like MetaMask or Rabby. ${walletName === 'Unknown' ? 'No wallet detected.' : `Detected: ${walletName}`}`);
        return;
      }

      const provider = new ethers.BrowserProvider(ethereumProvider);
      
      // Request accounts first
      const accounts = await provider.send('eth_requestAccounts', []);
      
      // Get the currently active account (wallets don't allow programmatic switching)
      const activeAccount = accounts[0];
      
      // If a specific account was selected, verify it matches the active account
      if (selectedAccount && selectedAccount.toLowerCase() !== activeAccount.toLowerCase()) {
        alert(
          `The selected account is not currently active in your wallet.\n\n` +
          `Currently active: ${activeAccount.slice(0, 6)}...${activeAccount.slice(-4)}\n` +
          `Selected: ${selectedAccount.slice(0, 6)}...${selectedAccount.slice(-4)}\n\n` +
          `Please switch to the desired account in your wallet and try again.`
        );
        throw new Error('Account mismatch - please switch accounts in your wallet');
      }
      
      // Use the active account
      const accountToUse = activeAccount;
      const signer = await provider.getSigner();
      const network = await provider.getNetwork();
      const balance = await provider.getBalance(accountToUse);

      const walletState = {
        account: accountToUse,
        provider: provider,
        signer: signer,
        isConnected: true,
        chainId: network.chainId.toString(),
        balance: ethers.formatEther(balance),
        walletProvider: ethereumProvider,
      };

      if (role === 'client') {
        setClientWallet(walletState);
        localStorage.setItem('escrowAccount_client', accountToUse);
      } else {
        setProviderWallet(walletState);
        localStorage.setItem('escrowAccount_provider', accountToUse);
      }

      // Listen for account changes
      const handleAccountsChanged = (accounts) => {
        if (accounts.length === 0) {
          disconnectWallet(role);
        } else {
          if (role === 'client') {
            setClientWallet(prev => ({ ...prev, account: accounts[0] }));
            updateBalance(provider, accounts[0], role);
          } else {
            setProviderWallet(prev => ({ ...prev, account: accounts[0] }));
            updateBalance(provider, accounts[0], role);
          }
        }
      };

      // Listen for chain changes
      const handleChainChanged = () => {
        window.location.reload();
      };

      ethereumProvider.on('accountsChanged', handleAccountsChanged);
      ethereumProvider.on('chainChanged', handleChainChanged);

      // Update balance periodically
      updateBalance(provider, accountToUse, role);
    } catch (error) {
      console.error('Error connecting wallet:', error);
      alert('Failed to connect wallet: ' + error.message);
    }
  }, []);

  const disconnectWallet = useCallback((role) => {
    if (role === 'client') {
      setClientWallet(prev => {
        // Remove event listeners if they exist
        if (prev.walletProvider) {
          prev.walletProvider.removeAllListeners('accountsChanged');
          prev.walletProvider.removeAllListeners('chainChanged');
        }
        return createWalletState();
      });
      localStorage.removeItem('escrowAccount_client');
    } else {
      setProviderWallet(prev => {
        // Remove event listeners if they exist
        if (prev.walletProvider) {
          prev.walletProvider.removeAllListeners('accountsChanged');
          prev.walletProvider.removeAllListeners('chainChanged');
        }
        return createWalletState();
      });
      localStorage.removeItem('escrowAccount_provider');
    }
  }, []);

  const refreshBalance = useCallback(async (role) => {
    if (role === 'client') {
      if (clientWallet.provider && clientWallet.account) {
        await updateBalance(clientWallet.provider, clientWallet.account, role);
      }
    } else {
      if (providerWallet.provider && providerWallet.account) {
        await updateBalance(providerWallet.provider, providerWallet.account, role);
      }
    }
  }, [clientWallet.provider, clientWallet.account, providerWallet.provider, providerWallet.account]);

  // Get wallet state for a specific role
  const getWallet = useCallback((role) => {
    return role === 'client' ? clientWallet : providerWallet;
  }, [clientWallet, providerWallet]);

  // Auto-connect if previously logged in
  useEffect(() => {
    const checkAutoConnect = async () => {
      const savedRole = localStorage.getItem('escrowRole');
      const savedClientAccount = localStorage.getItem('escrowAccount_client');
      const savedProviderAccount = localStorage.getItem('escrowAccount_provider');
      
      const ethereumProvider = getWalletProvider();
      if (!ethereumProvider) return;

      try {
        const accounts = await ethereumProvider.request({ method: 'eth_accounts' });
        
        if (savedRole === 'client' && savedClientAccount && accounts.includes(savedClientAccount)) {
          await connectWallet('client');
        } else if (savedRole === 'provider' && savedProviderAccount && accounts.includes(savedProviderAccount)) {
          await connectWallet('provider');
        }
      } catch (error) {
        console.error('Auto-connect error:', error);
      }
    };

    // Wait a bit for wallet injection
    const timeout = setTimeout(checkAutoConnect, 1000);
    return () => clearTimeout(timeout);
  }, [connectWallet]);

  const value = {
    // Client wallet
    clientAccount: clientWallet.account,
    clientProvider: clientWallet.provider,
    clientSigner: clientWallet.signer,
    clientIsConnected: clientWallet.isConnected,
    clientChainId: clientWallet.chainId,
    clientBalance: clientWallet.balance,
    
    // Provider wallet
    providerAccount: providerWallet.account,
    providerProvider: providerWallet.provider,
    providerSigner: providerWallet.signer,
    providerIsConnected: providerWallet.isConnected,
    providerChainId: providerWallet.chainId,
    providerBalance: providerWallet.balance,
    
    // Functions
    connectWallet,
    disconnectWallet,
    refreshBalance,
    getWallet,
  };

  return <Web3Context.Provider value={value}>{children}</Web3Context.Provider>;
};
