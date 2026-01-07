/**
 * IndexedDB Service for Escrow Management
 * Stores escrow details and workflow steps locally
 */

const DB_NAME = 'EscrowDB';
const DB_VERSION = 1;
const ESCROWS_STORE = 'escrows';
const STEPS_STORE = 'steps';

let dbInstance = null;

/**
 * Initialize IndexedDB database
 */
export const initDB = () => {
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      resolve(dbInstance);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('IndexedDB error:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Create escrows object store
      if (!db.objectStoreNames.contains(ESCROWS_STORE)) {
        const escrowsStore = db.createObjectStore(ESCROWS_STORE, {
          keyPath: 'id',
          autoIncrement: false,
        });
        escrowsStore.createIndex('client', 'client', { unique: false });
        escrowsStore.createIndex('serviceProvider', 'serviceProvider', { unique: false });
        escrowsStore.createIndex('status', 'status', { unique: false });
        escrowsStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // Create steps object store (for escrow workflow history)
      if (!db.objectStoreNames.contains(STEPS_STORE)) {
        const stepsStore = db.createObjectStore(STEPS_STORE, {
          keyPath: 'id',
          autoIncrement: true,
        });
        stepsStore.createIndex('escrowId', 'escrowId', { unique: false });
        stepsStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
  });
};

/**
 * Escrow Data Structure:
 * {
 *   id: number,
 *   client: string,
 *   serviceProvider: string,
 *   amount: string,
 *   description: string,
 *   status: 'pending' | 'accepted' | 'completed' | 'disputed' | 'withdrawn',
 *   createdAt: string (ISO date),
 *   updatedAt: string (ISO date),
 *   vestingPeriod: number (minutes - POC, can be changed to days/weeks in production),
 *   vestingPercentage: number (0-100),
 *   vestingAmount: string (calculated: amount * vestingPercentage / 100),
 *   settlementAmount: string (calculated: amount - vestingAmount),
 *   perMinutePayment: string (calculated: vestingAmount / vestingPeriod - POC, can be changed in production),
 *   contractAddress?: string,
 *   transactionHash?: string
 * }
 * 
 * NOTE: This is a Proof of Concept (POC). Vesting period and payment interval are in minutes for testing.
 * In production, these can be changed to days, weeks, or other intervals as needed.
 */

/**
 * Step Data Structure:
 * {
 *   id: number (auto-increment),
 *   escrowId: number,
 *   action: 'created' | 'accepted' | 'completed' | 'disputed' | 'withdrawn' | 'released',
 *   performedBy: string (address),
 *   timestamp: string (ISO date),
 *   transactionHash?: string,
 *   notes?: string
 * }
 */

/**
 * Save or update an escrow
 */
export const saveEscrow = async (escrowData) => {
  const db = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([ESCROWS_STORE], 'readwrite');
    const store = transaction.objectStore(ESCROWS_STORE);
    
    // Add updatedAt timestamp
    const escrow = {
      ...escrowData,
      updatedAt: new Date().toISOString(),
    };

    const request = store.put(escrow);

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
};

/**
 * Get an escrow by ID
 */
export const getEscrow = async (escrowId) => {
  const db = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([ESCROWS_STORE], 'readonly');
    const store = transaction.objectStore(ESCROWS_STORE);
    const request = store.get(escrowId);

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
};

/**
 * Get all escrows for a specific address (client or provider)
 */
export const getEscrowsByAddress = async (address, role) => {
  const db = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([ESCROWS_STORE], 'readonly');
    const store = transaction.objectStore(ESCROWS_STORE);
    
    const indexName = role === 'client' ? 'client' : 'serviceProvider';
    const index = store.index(indexName);
    const request = index.getAll(address.toLowerCase());

    request.onsuccess = () => {
      const escrows = request.result;
      // Sort by createdAt (newest first)
      escrows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      resolve(escrows);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
};

/**
 * Get all escrows
 */
export const getAllEscrows = async () => {
  const db = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([ESCROWS_STORE], 'readonly');
    const store = transaction.objectStore(ESCROWS_STORE);
    const request = store.getAll();

    request.onsuccess = () => {
      const escrows = request.result;
      escrows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      resolve(escrows);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
};

/**
 * Update escrow status
 */
export const updateEscrowStatus = async (escrowId, newStatus, transactionHash = null) => {
  const escrow = await getEscrow(escrowId);
  if (!escrow) {
    throw new Error('Escrow not found');
  }

  const updatedEscrow = {
    ...escrow,
    status: newStatus,
    updatedAt: new Date().toISOString(),
  };

  if (transactionHash) {
    updatedEscrow.transactionHash = transactionHash;
  }

  return saveEscrow(updatedEscrow);
};

/**
 * Add a step to escrow workflow history
 */
export const addEscrowStep = async (stepData) => {
  const db = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STEPS_STORE], 'readwrite');
    const store = transaction.objectStore(STEPS_STORE);
    
    const step = {
      ...stepData,
      timestamp: stepData.timestamp || new Date().toISOString(),
    };

    const request = store.add(step);

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
};

/**
 * Get all steps for an escrow
 */
export const getEscrowSteps = async (escrowId) => {
  const db = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STEPS_STORE], 'readonly');
    const store = transaction.objectStore(STEPS_STORE);
    const index = store.index('escrowId');
    const request = index.getAll(escrowId);

    request.onsuccess = () => {
      const steps = request.result;
      // Sort by timestamp (oldest first)
      steps.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      resolve(steps);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
};

/**
 * Delete an escrow (and its steps)
 */
export const deleteEscrow = async (escrowId) => {
  const db = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([ESCROWS_STORE, STEPS_STORE], 'readwrite');
    const escrowsStore = transaction.objectStore(ESCROWS_STORE);
    const stepsStore = transaction.objectStore(STEPS_STORE);
    
    // Delete escrow
    const deleteEscrowRequest = escrowsStore.delete(escrowId);
    
    deleteEscrowRequest.onsuccess = () => {
      // Delete all steps for this escrow
      const stepsIndex = stepsStore.index('escrowId');
      const getStepsRequest = stepsIndex.getAll(escrowId);
      
      getStepsRequest.onsuccess = () => {
        const steps = getStepsRequest.result;
        steps.forEach(step => {
          stepsStore.delete(step.id);
        });
        resolve();
      };
      
      getStepsRequest.onerror = () => {
        reject(getStepsRequest.error);
      };
    };

    deleteEscrowRequest.onerror = () => {
      reject(deleteEscrowRequest.error);
    };
  });
};

/**
 * Clear all data (useful for testing or reset)
 */
export const clearAllData = async () => {
  const db = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([ESCROWS_STORE, STEPS_STORE], 'readwrite');
    const escrowsStore = transaction.objectStore(ESCROWS_STORE);
    const stepsStore = transaction.objectStore(STEPS_STORE);
    
    const clearEscrows = escrowsStore.clear();
    const clearSteps = stepsStore.clear();

    Promise.all([
      new Promise((res, rej) => {
        clearEscrows.onsuccess = () => res();
        clearEscrows.onerror = () => rej(clearEscrows.error);
      }),
      new Promise((res, rej) => {
        clearSteps.onsuccess = () => res();
        clearSteps.onerror = () => rej(clearSteps.error);
      }),
    ])
      .then(() => resolve())
      .catch(reject);
  });
};

/**
 * Helper: Create escrow with initial step
 */
export const createEscrowWithStep = async (escrowData, performedBy, transactionHash = null) => {
  // Save escrow
  const escrow = await saveEscrow({
    ...escrowData,
    createdAt: escrowData.createdAt || new Date().toISOString(),
  });

  // Add initial step
  await addEscrowStep({
    escrowId: escrow.id,
    action: 'created',
    performedBy: performedBy.toLowerCase(),
    transactionHash,
    notes: 'Escrow created',
  });

  return escrow;
};

/**
 * Helper: Update escrow status with step
 */
export const updateEscrowWithStep = async (
  escrowId,
  newStatus,
  action,
  performedBy,
  transactionHash = null,
  notes = null
) => {
  // Update escrow status
  await updateEscrowStatus(escrowId, newStatus, transactionHash);

  // Add step
  await addEscrowStep({
    escrowId,
    action,
    performedBy: performedBy.toLowerCase(),
    transactionHash,
    notes: notes || `${action} action performed`,
  });
};

