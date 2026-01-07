const API_BASE_URL = 'http://localhost:4000/api';

export const getEscrowsByAddress = async (address, role) => {
  try {
    const params = new URLSearchParams();
    if (address) params.append('address', address);
    if (role) params.append('role', role);
    
    const url = `${API_BASE_URL}/escrows${params.toString() ? `?${params.toString()}` : ''}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to get escrows: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error getting escrows:', error);
    throw error;
  }
};

export const getAllEscrows = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/escrows`);
    
    if (!response.ok) {
      throw new Error(`Failed to get all escrows: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error getting all escrows:', error);
    throw error;
  }
};

export const getEscrow = async (escrowId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/escrows/${escrowId}`);
    
    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Failed to get escrow: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error getting escrow:', error);
    throw error;
  }
};

export const saveEscrow = async (escrowData) => {
  try {
    const response = await fetch(`${API_BASE_URL}/escrows`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(escrowData),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to save escrow: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error saving escrow:', error);
    throw error;
  }
};

export const updateEscrowStatus = async (escrowId, newStatus, transactionHash = null) => {
  try {
    const response = await fetch(`${API_BASE_URL}/escrows/${escrowId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status: newStatus,
        transactionHash,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to update escrow status: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error updating escrow status:', error);
    throw error;
  }
};

export const getEscrowSteps = async (escrowId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/escrows/${escrowId}/steps`);
    
    if (!response.ok) {
      throw new Error(`Failed to get steps: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error getting steps:', error);
    throw error;
  }
};

export const addEscrowStep = async (escrowId, stepData) => {
  try {
    const response = await fetch(`${API_BASE_URL}/escrows/${escrowId}/steps`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(stepData),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to add step: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error adding step:', error);
    throw error;
  }
};

export const createEscrowWithStep = async (escrowData, performedBy, transactionHash = null) => {
  try {
    const response = await fetch(`${API_BASE_URL}/escrows/create-with-step`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        escrowData,
        performedBy,
        transactionHash,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to create escrow with step: ${response.statusText}`);
    }
    
    const result = await response.json();
    return result.escrow;
  } catch (error) {
    console.error('Error creating escrow with step:', error);
    throw error;
  }
};

export const updateEscrowWithStep = async (
  escrowId,
  newStatus,
  action,
  performedBy,
  transactionHash = null,
  notes = null
) => {
  try {
    const response = await fetch(`${API_BASE_URL}/escrows/${escrowId}/update-with-step`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        newStatus,
        action,
        performedBy,
        transactionHash,
        notes,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to update escrow with step: ${response.statusText}`);
    }
    
    const result = await response.json();
    return result.escrow;
  } catch (error) {
    console.error('Error updating escrow with step:', error);
    throw error;
  }
};

export const clearAllData = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/storage/clear`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      throw new Error(`Failed to clear data: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error clearing data:', error);
    throw error;
  }
};

export const initDB = async () => {
  return Promise.resolve();
};

