import { useState } from 'react';
import { ethers } from 'ethers';
import { SERVICE_PROVIDERS } from '../data/users';

const CreateEscrowModal = ({ onClose, onCreate, loading }) => {
  const [formData, setFormData] = useState({
    serviceProvider: '',
    amount: '',
    description: '',
    vestedPercentage: '70',
    totalMinutes: '60',
    intervalMinutes: '10',
  });

  const [errors, setErrors] = useState({});
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [amountInWei, setAmountInWei] = useState(false); // Track if amount is displayed in wei
  const [showErrorDialog, setShowErrorDialog] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const validateForm = () => {
    const newErrors = {};

    if (!formData.serviceProvider) {
      newErrors.serviceProvider = 'Service provider address is required';
    } else if (!/^0x[a-fA-F0-9]{40}$/.test(formData.serviceProvider)) {
      newErrors.serviceProvider = 'Invalid Ethereum address';
    }

    if (!formData.amount) {
      newErrors.amount = 'Amount is required';
    } else {
      if (amountInWei) {
        try {
          const weiValue = BigInt(formData.amount);
          if (weiValue <= 0n) {
            newErrors.amount = 'Amount must be greater than 0';
          }
        } catch (error) {
          newErrors.amount = 'Invalid wei amount';
        }
      } else {
        const ethValue = parseFloat(formData.amount);
        if (isNaN(ethValue) || ethValue <= 0) {
      newErrors.amount = 'Amount must be a positive number';
        }
      }
    }

    if (!formData.description) {
      newErrors.description = 'Description is required';
    }

    const vestedPercentage = parseFloat(formData.vestedPercentage);
    if (isNaN(vestedPercentage) || vestedPercentage < 0 || vestedPercentage > 90) {
      newErrors.vestedPercentage = 'Vesting percentage must be between 0 and 90';
    }

    const totalMinutes = parseFloat(formData.totalMinutes);
    if (isNaN(totalMinutes) || totalMinutes <= 0) {
      newErrors.totalMinutes = 'Total duration must be greater than 0';
    }

    const intervalMinutes = parseFloat(formData.intervalMinutes);
    if (isNaN(intervalMinutes) || intervalMinutes <= 0) {
      newErrors.intervalMinutes = 'Interval must be greater than 0';
    }

    if (!isNaN(totalMinutes) && !isNaN(intervalMinutes) && totalMinutes > 0 && intervalMinutes > 0) {
      if (totalMinutes % intervalMinutes !== 0) {
        newErrors.intervalMinutes = `Interval must divide evenly into total duration (${totalMinutes} minutes)`;
      }
    }

    setErrors(newErrors);
    const isValid = Object.keys(newErrors).length === 0;
    
    if (!isValid) {
      console.log('Validation errors:', newErrors);
      console.log('Form data:', formData);
    }
    
    return isValid;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const newErrors = {};
    
    if (!formData.serviceProvider) {
      newErrors.serviceProvider = 'Service provider address is required';
    } else if (!/^0x[a-fA-F0-9]{40}$/.test(formData.serviceProvider)) {
      newErrors.serviceProvider = 'Invalid Ethereum address';
    }

    if (!formData.amount) {
      newErrors.amount = 'Amount is required';
    } else {
      if (amountInWei) {
        try {
          const weiValue = BigInt(formData.amount);
          if (weiValue <= 0n) {
            newErrors.amount = 'Amount must be greater than 0';
          }
        } catch (error) {
          newErrors.amount = 'Invalid wei amount';
        }
      } else {
        const ethValue = parseFloat(formData.amount);
        if (isNaN(ethValue) || ethValue <= 0) {
          newErrors.amount = 'Amount must be a positive number';
        }
      }
    }

    if (!formData.description) {
      newErrors.description = 'Description is required';
    }

    const vestedPercentage = parseFloat(formData.vestedPercentage);
    if (isNaN(vestedPercentage) || vestedPercentage < 0 || vestedPercentage > 90) {
      newErrors.vestedPercentage = 'Vesting percentage must be between 0 and 90';
    }

    const totalMinutes = parseFloat(formData.totalMinutes);
    if (isNaN(totalMinutes) || totalMinutes <= 0) {
      newErrors.totalMinutes = 'Total duration must be greater than 0';
    }

    const intervalMinutes = parseFloat(formData.intervalMinutes);
    if (isNaN(intervalMinutes) || intervalMinutes <= 0) {
      newErrors.intervalMinutes = 'Interval must be greater than 0';
    }

    if (!isNaN(totalMinutes) && !isNaN(intervalMinutes) && totalMinutes > 0 && intervalMinutes > 0) {
      if (totalMinutes % intervalMinutes !== 0) {
        newErrors.intervalMinutes = `Interval must divide evenly into total duration (${totalMinutes} minutes)`;
      }
    }

    setErrors(newErrors);
    const isValid = Object.keys(newErrors).length === 0;
    
    if (isValid) {
      onCreate(formData);
    } else {
      const firstError = Object.values(newErrors)[0];
      if (firstError) {
        setErrorMessage(firstError);
        setShowErrorDialog(true);
      }
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    
    if (name === 'amount' && amountInWei) {
      setAmountInWei(false);
    }
    
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: '',
      }));
    }
  };

  const handleAmountBlur = (e) => {
    const value = e.target.value;
    if (value && !isNaN(value) && parseFloat(value) > 0) {
      try {
        const weiValue = ethers.parseEther(value).toString();
        setFormData(prev => ({
          ...prev,
          amount: weiValue,
        }));
        setAmountInWei(true);
      } catch (error) {
        console.error('Error converting to wei:', error);
      }
    }
  };

  const handleProviderSelect = (e) => {
    const address = e.target.value;
    const provider = SERVICE_PROVIDERS.find(p => p.address === address);
    setSelectedProvider(provider);
    setFormData(prev => ({
      ...prev,
      serviceProvider: address,
    }));
    if (errors.serviceProvider) {
      setErrors(prev => ({
        ...prev,
        serviceProvider: '',
      }));
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Create New Escrow</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} className="escrow-form">
          <div className="form-group">
            <label htmlFor="serviceProvider">Select Service Provider</label>
            <select
              id="serviceProvider"
              name="serviceProvider"
              value={formData.serviceProvider}
              onChange={handleProviderSelect}
              className={errors.serviceProvider ? 'error' : 'form-select'}
              style={{
                width: '100%',
                padding: '0.75rem',
                background: '#ffffff',
                border: '2px solid #e5e7eb',
                borderRadius: '8px',
                color: '#111827',
                fontSize: '1rem',
                fontFamily: 'inherit',
                cursor: 'pointer',
                appearance: 'none',
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23667eea' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 0.75rem center',
                backgroundSize: '12px',
                paddingRight: '2.5rem',
                transition: 'all 0.3s ease',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = '#667eea';
                e.target.style.boxShadow = '0 0 0 3px rgba(102, 126, 234, 0.1)';
              }}
              onBlur={(e) => {
                if (!errors.serviceProvider) {
                  e.target.style.borderColor = '#e5e7eb';
                  e.target.style.boxShadow = 'none';
                }
              }}
            >
              <option value="" style={{ color: '#6b7280' }}>-- Select a Service Provider --</option>
              {SERVICE_PROVIDERS.map((provider) => (
                <option key={provider.id} value={provider.address} style={{ color: '#111827', background: '#ffffff' }}>
                  {provider.name} - {provider.address.slice(0, 6)}...{provider.address.slice(-4)}
                </option>
              ))}
            </select>
            {selectedProvider && (
              <div style={{ 
                marginTop: '0.75rem', 
                padding: '1rem', 
                background: 'linear-gradient(135deg, #f0f4ff 0%, #e0e7ff 100%)',
                border: '2px solid #c7d2fe',
                borderRadius: '8px', 
                fontSize: '0.875rem' 
              }}>
                <div style={{ 
                  fontWeight: 700, 
                  marginBottom: '0.5rem',
                  color: '#111827',
                  fontSize: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  flexWrap: 'wrap'
                }}>
                  {selectedProvider.name}
                  {selectedProvider.rating && (
                    <span style={{ 
                      fontSize: '0.75rem', 
                      background: '#fef3c7', 
                      color: '#92400e',
                      padding: '0.125rem 0.5rem',
                      borderRadius: '8px',
                      fontWeight: 600
                    }}>
                      ⭐ {selectedProvider.rating}
                    </span>
                  )}
                </div>
                <div style={{ 
                  color: '#374151', 
                  marginBottom: '0.75rem',
                  lineHeight: '1.6',
                  fontSize: '0.875rem'
                }}>
                  {selectedProvider.description}
                </div>
                <div style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  gap: '0.25rem', 
                  marginBottom: '0.75rem',
                  paddingBottom: '0.75rem',
                  borderBottom: '1px solid #c7d2fe'
                }}>
                  {selectedProvider.location && (
                    <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                      📍 {selectedProvider.location}
                    </div>
                  )}
                  {selectedProvider.yearsExperience && (
                    <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                      ⏱️ {selectedProvider.yearsExperience}+ Years Experience
                    </div>
                  )}
                  {selectedProvider.projectsCompleted && (
                    <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                      ✅ {selectedProvider.projectsCompleted} Projects Completed
                    </div>
                  )}
                  {selectedProvider.certifications && selectedProvider.certifications.length > 0 && (
                    <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                      🏆 {selectedProvider.certifications.join(', ')}
                    </div>
                  )}
                </div>
                {selectedProvider.specialties && selectedProvider.specialties.length > 0 && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <div style={{ color: '#6b7280', fontSize: '0.75rem', marginBottom: '0.5rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Specialties
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                      {selectedProvider.specialties.map((specialty, idx) => (
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
            )}
            {errors.serviceProvider && (
              <span className="error-message">{errors.serviceProvider}</span>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="amount">
              Amount {amountInWei ? '(Wei)' : '(ETH)'}
              {amountInWei && formData.amount && (
                <span style={{ 
                  fontSize: '0.75rem', 
                  color: '#6b7280', 
                  fontWeight: 400,
                  marginLeft: '0.5rem'
                }}>
                  ({ethers.formatEther(formData.amount)} ETH)
                </span>
              )}
            </label>
            <input
              type="text"
              id="amount"
              name="amount"
              value={formData.amount}
              onChange={handleChange}
              onBlur={handleAmountBlur}
              placeholder={amountInWei ? "Enter amount in wei" : "0.0 (will convert to wei)"}
              className={errors.amount ? 'error' : ''}
              style={{
                fontFamily: amountInWei ? 'monospace' : 'inherit',
                fontSize: amountInWei ? '0.875rem' : '1rem',
              }}
            />
            {!amountInWei && formData.amount && (
              <div style={{ 
                marginTop: '0.5rem', 
                fontSize: '0.75rem', 
                color: '#6b7280',
                fontStyle: 'italic'
              }}>
                💡 Enter amount in ETH (e.g., 0.05). It will convert to wei when you finish typing.
              </div>
            )}
            {errors.amount && (
              <span className="error-message">{errors.amount}</span>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              placeholder="Describe the service or work to be done..."
              rows="4"
              className={errors.description ? 'error' : ''}
            />
            {errors.description && (
              <span className="error-message">{errors.description}</span>
            )}
          </div>

          {/* Vesting Configuration Section */}
          <div style={{ 
            marginTop: '1.5rem', 
            padding: '1.5rem', 
            background: 'linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%)',
            border: '2px solid #e5e7eb',
            borderRadius: '12px'
          }}>
            <h3 style={{ 
              margin: '0 0 1rem 0', 
              color: '#111827', 
              fontSize: '1rem', 
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              ⏱️ Vesting Configuration
            </h3>
            <div style={{ 
              marginBottom: '1rem', 
              padding: '0.75rem', 
              background: '#fef3c7',
              border: '1px solid #fbbf24',
              borderRadius: '8px',
              fontSize: '0.75rem',
              color: '#92400e',
              lineHeight: '1.5'
            }}>
              <strong>📝 Note:</strong> This is a proof of concept. Vesting periods and intervals are currently in minutes for testing purposes. These can be changed to days, weeks, or other intervals in production.
            </div>
            <p style={{ 
              margin: '0 0 1.25rem 0', 
              color: '#6b7280', 
              fontSize: '0.875rem',
              lineHeight: '1.5'
            }}>
              Configure how funds will be released over time. {formData.vestedPercentage}% will be time-based, {100 - parseFloat(formData.vestedPercentage || 0)}% will be completion-based.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label htmlFor="vestedPercentage">
                  Vesting Percentage (%)
                  <span style={{ 
                    fontSize: '0.75rem', 
                    color: '#6b7280', 
                    fontWeight: 400,
                    marginLeft: '0.25rem'
                  }}>
                    (0-90)
                  </span>
                </label>
                <input
                  type="number"
                  id="vestedPercentage"
                  name="vestedPercentage"
                  value={formData.vestedPercentage}
                  onChange={handleChange}
                  placeholder="70"
                  min="0"
                  max="90"
                  step="1"
                  className={errors.vestedPercentage ? 'error' : ''}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: errors.vestedPercentage ? '2px solid #ef4444' : '2px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '1rem',
                    transition: 'all 0.3s ease',
                  }}
                  onFocus={(e) => {
                    if (!errors.vestedPercentage) {
                      e.target.style.borderColor = '#667eea';
                      e.target.style.boxShadow = '0 0 0 3px rgba(102, 126, 234, 0.1)';
                    }
                  }}
                  onBlur={(e) => {
                    if (!errors.vestedPercentage) {
                      e.target.style.borderColor = '#e5e7eb';
                      e.target.style.boxShadow = 'none';
                    }
                  }}
                />
                {errors.vestedPercentage && (
                  <span className="error-message" style={{ fontSize: '0.875rem', marginTop: '0.25rem', display: 'block' }}>
                    {errors.vestedPercentage}
                  </span>
                )}
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label htmlFor="totalMinutes">
                  Total Duration
                  <span style={{ 
                    fontSize: '0.75rem', 
                    color: '#6b7280', 
                    fontWeight: 400,
                    marginLeft: '0.25rem'
                  }}>
                    (minutes)
                  </span>
                </label>
                <input
                  type="number"
                  id="totalMinutes"
                  name="totalMinutes"
                  value={formData.totalMinutes}
                  onChange={handleChange}
                  placeholder="60"
                  min="1"
                  step="1"
                  className={errors.totalMinutes ? 'error' : ''}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: errors.totalMinutes ? '2px solid #ef4444' : '2px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '1rem',
                    transition: 'all 0.3s ease',
                  }}
                  onFocus={(e) => {
                    if (!errors.totalMinutes) {
                      e.target.style.borderColor = '#667eea';
                      e.target.style.boxShadow = '0 0 0 3px rgba(102, 126, 234, 0.1)';
                    }
                  }}
                  onBlur={(e) => {
                    if (!errors.totalMinutes) {
                      e.target.style.borderColor = '#e5e7eb';
                      e.target.style.boxShadow = 'none';
                    }
                  }}
                />
                {errors.totalMinutes && (
                  <span className="error-message" style={{ fontSize: '0.875rem', marginTop: '0.25rem', display: 'block' }}>
                    {errors.totalMinutes}
                  </span>
                )}
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label htmlFor="intervalMinutes">
                  Vesting Interval
                  <span style={{ 
                    fontSize: '0.75rem', 
                    color: '#6b7280', 
                    fontWeight: 400,
                    marginLeft: '0.25rem'
                  }}>
                    (minutes)
                  </span>
                </label>
                <input
                  type="number"
                  id="intervalMinutes"
                  name="intervalMinutes"
                  value={formData.intervalMinutes}
                  onChange={handleChange}
                  placeholder="10"
                  min="1"
                  step="1"
                  className={errors.intervalMinutes ? 'error' : ''}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: errors.intervalMinutes ? '2px solid #ef4444' : '2px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '1rem',
                    transition: 'all 0.3s ease',
                  }}
                  onFocus={(e) => {
                    if (!errors.intervalMinutes) {
                      e.target.style.borderColor = '#667eea';
                      e.target.style.boxShadow = '0 0 0 3px rgba(102, 126, 234, 0.1)';
                    }
                  }}
                  onBlur={(e) => {
                    if (!errors.intervalMinutes) {
                      e.target.style.borderColor = '#e5e7eb';
                      e.target.style.boxShadow = 'none';
                    }
                  }}
                />
                {errors.intervalMinutes && (
                  <span className="error-message" style={{ fontSize: '0.875rem', marginTop: '0.25rem', display: 'block' }}>
                    {errors.intervalMinutes}
                  </span>
                )}
              </div>
            </div>

            {formData.totalMinutes && formData.intervalMinutes && 
             parseFloat(formData.totalMinutes) > 0 && 
             parseFloat(formData.intervalMinutes) > 0 && 
             parseFloat(formData.totalMinutes) % parseFloat(formData.intervalMinutes) === 0 && (
              <div style={{ 
                marginTop: '1rem', 
                padding: '0.75rem', 
                background: '#d1fae5',
                border: '1px solid #10b981',
                borderRadius: '8px',
                fontSize: '0.875rem',
                color: '#065f46'
              }}>
                ✅ Funds will be released in {Math.floor(parseFloat(formData.totalMinutes) / parseFloat(formData.intervalMinutes))} intervals of {formData.intervalMinutes} minutes each
              </div>
            )}
          </div>

          <div className="form-actions">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button 
              type="submit" 
              className="btn-primary" 
              disabled={loading}
              style={{
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? 'Creating...' : 'Create Escrow'}
            </button>
          </div>
        </form>
      </div>

      {/* Error Dialog */}
      {showErrorDialog && (
        <div 
          className="modal-overlay" 
          style={{ zIndex: 2000 }}
          onClick={() => setShowErrorDialog(false)}
        >
          <div 
            className="modal-content" 
            style={{
              maxWidth: '400px',
              padding: '1.5rem',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '1rem',
            }}>
              <h3 style={{
                margin: 0,
                color: '#ef4444',
                fontSize: '1.25rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}>
                ⚠️ Validation Error
              </h3>
              <button
                onClick={() => setShowErrorDialog(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  color: '#6b7280',
                  padding: '0',
                  width: '24px',
                  height: '24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  lineHeight: '1',
                }}
              >
                ×
              </button>
            </div>
            <p style={{
              margin: 0,
              color: '#374151',
              fontSize: '1rem',
              lineHeight: '1.5',
              marginBottom: '1.5rem',
            }}>
              {errorMessage}
            </p>
            <button
              onClick={() => setShowErrorDialog(false)}
              className="btn-primary"
              style={{
                width: '100%',
                padding: '0.75rem 1.5rem',
              }}
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CreateEscrowModal;

