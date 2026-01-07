import { useState } from 'react';
import { useWeb3 } from '../contexts/Web3Context';
import AccountSelectionModal from './AccountSelectionModal';
import './LoginPage.css';

const LoginPage = ({ onLogin }) => {
  const { connectWallet } = useWeb3();
  const [selectedRole, setSelectedRole] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);

  const handleRoleSelect = (role) => {
    setSelectedRole(role);
  };

  const handleConnect = async () => {
    if (!selectedRole) {
      alert('Please select a role first');
      return;
    }

    // Show account selection modal
    setShowAccountModal(true);
  };

  const handleAccountSelect = async (account) => {
    setShowAccountModal(false);
    setConnecting(true);
    try {
      await connectWallet(selectedRole, account);
      onLogin(selectedRole);
    } catch (error) {
      console.error('Connection error:', error);
      alert('Failed to connect wallet. Please try again.');
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-header">
          <h1>🔒 Escrow Platform (Powered by Ethereum)</h1>
          <p className="login-subtitle">Secure transactions between clients and service providers</p>
        </div>

        <div className="role-selection">
          <h2>Select Your Role</h2>
          <div className="role-cards">
            <div
              className={`role-card ${selectedRole === 'client' ? 'selected' : ''}`}
              onClick={() => handleRoleSelect('client')}
            >
              <div className="role-icon">👤</div>
              <h3>Client</h3>
              <p>Create escrows, deposit funds, and manage your transactions</p>
              <ul className="role-features">
                <li>Create new escrow contracts</li>
                <li>Deposit funds securely</li>
                <li>Release payments</li>
                <li>File disputes if needed</li>
              </ul>
            </div>

            <div
              className={`role-card ${selectedRole === 'provider' ? 'selected' : ''}`}
              onClick={() => handleRoleSelect('provider')}
            >
              <div className="role-icon">🛠️</div>
              <h3>Service Provider</h3>
              <p>Accept escrows, complete work, and receive payments</p>
              <ul className="role-features">
                <li>Accept escrow contracts</li>
                <li>Mark work as complete</li>
                <li>Withdraw funds</li>
                <li>Track your earnings</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="login-actions">
          <button
            onClick={handleConnect}
            disabled={!selectedRole || connecting}
            className="btn-login"
          >
            {connecting ? 'Connecting...' : 'Connect Wallet & Continue'}
          </button>
          <p className="login-hint">
            You'll be prompted to connect your wallet. Make sure you have MetaMask or Rabby installed.
            <br />
            <strong>Tip:</strong> You can use different accounts for Client and Service Provider roles.
          </p>
        </div>
      </div>

      {showAccountModal && (
        <AccountSelectionModal
          role={selectedRole}
          onSelect={handleAccountSelect}
          onClose={() => setShowAccountModal(false)}
        />
      )}
    </div>
  );
};

export default LoginPage;

