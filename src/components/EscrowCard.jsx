const EscrowCard = ({ escrow, role, onDeposit, onRelease, onDispute, onRefund, onResolveDispute, onAccept, onComplete, onWithdraw }) => {
  const formatAddress = (address) => {
    if (!address) return 'N/A';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  // Check if payout is available for provider
  const hasPayoutAvailable = () => {
    if (!escrow.payoutAvailable) return false;
    try {
      const payout = typeof escrow.payoutAvailable === 'string' 
        ? BigInt(escrow.payoutAvailable) 
        : BigInt(escrow.payoutAvailable || '0');
      return payout > 0n;
    } catch (e) {
      return false;
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      pending: '#f59e0b',
      accepted: '#3b82f6',
      completed: '#10b981',
      disputed: '#ef4444',
      withdrawn: '#6b7280',
      closed: '#10b981', // Same as completed - green
      funded: '#3b82f6',
      created: '#f59e0b',
    };
    return colors[status] || '#6b7280';
  };

  const getStatusLabel = (status) => {
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[date.getMonth()];
    const day = date.getDate();
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${month} ${day}, ${year}, ${hours}:${minutes}`;
  };

  const formatEscrowId = (id) => {
    if (!id) return 'N/A';
    // If it's a contract address, show shortened version
    if (id.length > 20) {
      return `${id.slice(0, 6)}...${id.slice(-4)}`;
    }
    return id;
  };

  return (
    <div className="escrow-card">
      <div className="escrow-header">
        <div className="escrow-id" style={{ fontSize: '0.875rem', fontWeight: 600, color: '#6b7280' }}>
          #{formatEscrowId(escrow.id)}
        </div>
        <div 
          className="escrow-status"
          style={{ 
            backgroundColor: getStatusColor(escrow.status),
            fontSize: '0.75rem',
            padding: '0.25rem 0.75rem',
            borderRadius: '12px',
            fontWeight: 600,
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          {getStatusLabel(escrow.status)}
        </div>
      </div>

      <div className="escrow-body">
        <div className="escrow-info">
          <div className="info-row">
            <span className="info-label">Amount:</span>
            <span className="info-value">{escrow.amount} ETH</span>
          </div>
          <div className="info-row">
            <span className="info-label">
              {role === 'client' ? 'Service Provider:' : 'Client:'}
            </span>
            <span className="info-value">
              {role === 'client' && escrow.serviceProviderName ? (
                <span>
                  {escrow.serviceProviderName}
                  <span style={{ fontSize: '0.75rem', color: '#9ca3af', marginLeft: '0.5rem' }}>
                    ({formatAddress(escrow.serviceProvider)})
                  </span>
                </span>
              ) : role === 'provider' && escrow.clientName ? (
                <span>
                  {escrow.clientName}
                  <span style={{ fontSize: '0.75rem', color: '#9ca3af', marginLeft: '0.5rem' }}>
                    ({formatAddress(escrow.client)})
                  </span>
                </span>
              ) : (
                formatAddress(role === 'client' ? escrow.serviceProvider : escrow.client)
              )}
            </span>
          </div>
          <div className="info-row">
            <span className="info-label">Description:</span>
            <span className="info-value">{escrow.description}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Created:</span>
            <span className="info-value">
              {formatDate(escrow.createdAt)}
            </span>
          </div>
          {escrow.endTime && (
            <div className="info-row">
              <span className="info-label">End Time:</span>
              <span className="info-value">
                {formatDate(new Date(escrow.endTime).toISOString())}
              </span>
            </div>
          )}
          {escrow.vestingPeriod && escrow.vestingPercentage && (
            <>
              <div className="info-row" style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '2px solid #e5e7eb' }}>
                <span className="info-label" style={{ color: '#667eea', fontWeight: 700 }}>Vesting Period:</span>
                <span className="info-value" style={{ color: '#667eea', fontWeight: 700 }}>
                  {escrow.vestingPeriod} minutes
                  <span style={{ fontSize: '0.7rem', color: '#9ca3af', fontStyle: 'italic', marginLeft: '0.25rem' }}>(POC)</span>
                </span>
              </div>
              {escrow.vestingAmount && escrow.settlementAmount && (
                <div style={{ 
                  marginTop: '0.75rem', 
                  padding: '0.75rem', 
                  background: 'linear-gradient(135deg, #f0f4ff 0%, #e0e7ff 100%)',
                  borderRadius: '8px',
                  fontSize: '0.875rem'
                }}>
                  <div style={{ fontWeight: 600, marginBottom: '0.5rem', color: '#374151' }}>
                    Payment Structure:
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', color: '#6b7280' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Vesting ({escrow.vestingPercentage}%):</span>
                      <strong style={{ color: '#667eea' }}>{parseFloat(escrow.vestingAmount).toFixed(4)} ETH</strong>
                    </div>
                    {escrow.perMinutePayment && (
                      <div style={{ fontSize: '0.75rem', marginLeft: '1rem', color: '#9ca3af' }}>
                        → {parseFloat(escrow.perMinutePayment).toFixed(4)} ETH/minute
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.25rem', paddingTop: '0.25rem', borderTop: '1px solid #c7d2fe' }}>
                      <span>Settlement ({100 - parseFloat(escrow.vestingPercentage)}%):</span>
                      <strong style={{ color: '#10b981' }}>{parseFloat(escrow.settlementAmount).toFixed(4)} ETH</strong>
                    </div>
                    <div style={{ fontSize: '0.75rem', fontStyle: 'italic', color: '#9ca3af' }}>
                      → Released after completion (if no dispute)
                    </div>
                  </div>
                  <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: '#fef3c7', borderRadius: '4px', fontSize: '0.7rem', color: '#92400e' }}>
                    ⚠️ POC: Using minutes for testing. Can be changed in production.
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="escrow-actions">
          {role === 'client' && (
            <>
              {escrow.status === 'created' && onDeposit && (
                <button onClick={onDeposit} className="btn-primary">
                  Deposit Funds
                </button>
              )}
              {escrow.status === 'funded' && onDispute && (
                <button 
                  onClick={onDispute} 
                  className="btn-danger" 
                  style={{ 
                    background: '#ef4444', 
                    color: 'white',
                    border: 'none',
                    width: '100%'
                  }}
                >
                  File Dispute
                </button>
              )}
              {escrow.status === 'disputed' && (onRefund || onResolveDispute) && (
                <div style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
                  {onResolveDispute && (
                    <button 
                      onClick={onResolveDispute} 
                      className="btn-success"
                      style={{ 
                        background: '#10b981', 
                        color: 'white',
                        border: 'none',
                        flex: 1
                      }}
                    >
                      Resolve Dispute
                    </button>
                  )}
                  {onRefund && (
                    <button 
                      onClick={onRefund} 
                      className="btn-primary"
                      style={{ 
                        background: '#3b82f6', 
                        color: 'white',
                        border: 'none',
                        flex: 1
                      }}
                    >
                      Claim Refund
                    </button>
                  )}
                </div>
              )}
              {/* Show refund button at any time (not just when disputed) if refund is available, including closed escrows */}
              {onRefund && escrow.status !== 'disputed' && escrow.status !== 'created' && escrow.maxRefund && BigInt(escrow.maxRefund || '0') > 0n && (
                <button 
                  onClick={onRefund} 
                  className="btn-primary"
                  style={{ 
                    background: '#3b82f6', 
                    color: 'white',
                    border: 'none',
                    width: '100%'
                  }}
                >
                  Claim Refund
                </button>
              )}
              {escrow.status === 'completed' && (
                <button onClick={onRelease} className="btn-success">
                  Release Funds
                </button>
              )}
            </>
          )}

          {role === 'provider' && (
            <>
              {/* Show payout button if payout is available (even if disputed) */}
              {onWithdraw && escrow.canClaimPayout && (
                <button 
                  onClick={onWithdraw} 
                  className="btn-primary"
                  style={{ 
                    background: '#10b981', 
                    color: 'white',
                    border: 'none',
                    width: '100%'
                  }}
                >
                  Claim Payout
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default EscrowCard;

