/**
 * Hardcoded User Data
 * Contains client and service provider details for the escrow platform
 */

export const CLIENT = {
  id: 'client_1',
  name: 'TechVenture Solutions Inc.',
  address: '0xCaa2978508A434Ae13DbBA385D301b4FE727b575',
  email: 'contact@techventure.io',
  description: 'Enterprise software company specializing in fintech solutions.',
  role: 'client',
  industry: 'Financial Technology',
  founded: 2018,
  location: 'San Francisco, CA',
};

export const SERVICE_PROVIDER = {
  id: 'provider_1',
  name: 'Blockchain Studio Limited',
  address: '0x49472b0565790292df1153f067C5993e8Bf1D4De',
  email: 'hello@blockchaindev.studio',
  description: 'A leading blockchain development agency.',
  role: 'provider',
  specialties: [
    'Smart Contract Development',
    'Solidity & Vyper',
    'Web3 Integration',
    'DApp Architecture',
    'Security Auditing',
    'Token Economics',
    'DeFi Protocols'
  ],
  rating: 4.9,
  projectsCompleted: 127,
  location: 'Remote (Global)',
  certifications: ['Certified Solidity Developer', 'Security Auditor'],
};

// Export arrays for easy iteration
export const CLIENTS = [CLIENT];
export const SERVICE_PROVIDERS = [SERVICE_PROVIDER];

// Helper function to get user by address
export const getUserByAddress = (address) => {
  const allUsers = [...CLIENTS, ...SERVICE_PROVIDERS];
  return allUsers.find(
    user => user.address.toLowerCase() === address?.toLowerCase()
  );
};

// Helper function to get user by role
export const getUsersByRole = (role) => {
  if (role === 'client') {
    return CLIENTS;
  } else if (role === 'provider') {
    return SERVICE_PROVIDERS;
  }
  return [];
};

