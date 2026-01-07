import { useState, useEffect } from 'react';
import { Web3Provider, useWeb3 } from './contexts/Web3Context';
import LoginPage from './components/LoginPage';
import WalletConnection from './components/WalletConnection';
import ClientDashboard from './components/ClientDashboard';
import ServiceProviderDashboard from './components/ServiceProviderDashboard';
import './App.css';

function AppContent() {
  const { disconnectWallet } = useWeb3();
  const [currentRole, setCurrentRole] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const savedRole = localStorage.getItem('escrowRole');
    const savedAccount = localStorage.getItem(`escrowAccount_${savedRole}`);
    
    if (savedRole && savedAccount) {
      setCurrentRole(savedRole);
      setIsLoggedIn(true);
    }
  }, []);

  const handleLogin = (role) => {
    setCurrentRole(role);
    setIsLoggedIn(true);
    localStorage.setItem('escrowRole', role);
  };

  const handleLogout = () => {
    if (currentRole) {
      disconnectWallet(currentRole);
    }
    setCurrentRole(null);
    setIsLoggedIn(false);
    localStorage.removeItem('escrowRole');
    localStorage.removeItem('escrowAccount_client');
    localStorage.removeItem('escrowAccount_provider');
  };

  return (
    <>
      {!isLoggedIn ? (
        <LoginPage onLogin={handleLogin} />
      ) : (
        <div className="app">
          <header className="app-header">
            <div className="header-content">
              <h1>🔒 Escrow Platform (Powered by Ethereum)</h1>
              <div className="header-actions">
                <WalletConnection role={currentRole} />
                <button onClick={handleLogout} className="btn-logout">
                  Logout
                </button>
              </div>
            </div>
          </header>

          <main className="app-main">
            {currentRole === 'client' ? (
              <ClientDashboard />
            ) : (
              <ServiceProviderDashboard />
            )}
          </main>

          <footer className="app-footer">
            <div className="footer-content">
              <div className="footer-section">
                <p className="footer-title">🔒 Escrow Platform</p>
                <p className="footer-subtitle">Secure Ethereum-based Escrow Service</p>
              </div>
              <div className="footer-section">
                <p className="footer-author">
                  Developed by <span className="author-name">Arnab Banerjee</span>
                </p>
                <p className="footer-copyright">
                  © {new Date().getFullYear()} All rights reserved
                </p>
              </div>
            </div>
          </footer>
        </div>
      )}
    </>
  );
}

function App() {
  return (
    <Web3Provider>
      <AppContent />
    </Web3Provider>
  );
}

export default App;
