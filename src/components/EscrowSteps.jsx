import { useState, useEffect } from 'react';
import { getEscrowSteps } from '../utils/indexedDB';

const EscrowSteps = ({ escrowId }) => {
  const [steps, setSteps] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadSteps = async () => {
      try {
        const escrowSteps = await getEscrowSteps(escrowId);
        setSteps(escrowSteps);
      } catch (error) {
        console.error('Error loading escrow steps:', error);
      } finally {
        setLoading(false);
      }
    };

    if (escrowId) {
      loadSteps();
    }
  }, [escrowId]);

  if (loading) {
    return <div>Loading steps...</div>;
  }

  if (steps.length === 0) {
    return (
      <div style={{ padding: '1rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
        No steps recorded yet.
      </div>
    );
  }

  const getActionLabel = (action) => {
    const labels = {
      created: 'Created',
      accepted: 'Accepted',
      completed: 'Completed',
      disputed: 'Disputed',
      withdrawn: 'Withdrawn',
      released: 'Released',
    };
    return labels[action] || action;
  };

  return (
    <div className="escrow-steps">
      <h4 style={{ marginBottom: '1rem' }}>Escrow History</h4>
      <div className="steps-list">
        {steps.map((step, index) => (
          <div key={step.id} className="step-item" style={{ marginBottom: '1rem', padding: '0.75rem', background: 'var(--bg-color)', borderRadius: '0.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.5rem' }}>
              <div>
                <strong>{getActionLabel(step.action)}</strong>
                {step.notes && (
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                    {step.notes}
                  </div>
                )}
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                {new Date(step.timestamp).toLocaleString()}
              </span>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              By: {step.performedBy.slice(0, 6)}...{step.performedBy.slice(-4)}
            </div>
            {step.transactionHash && (
              <div style={{ fontSize: '0.75rem', color: 'var(--primary-color)', marginTop: '0.25rem' }}>
                TX: {step.transactionHash.slice(0, 10)}...
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default EscrowSteps;

