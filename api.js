// api.js - Handles all communication with the Apps Script backend

/**
 * Make a POST request to the Apps Script API
 */
async function callApi(action, data = {}) {
  try {
    const payload = {
      action: action,
      ...data
    };
    
    const response = await fetch(CONFIG.API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });
    
    // Check if response is OK
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const text = await response.text();
    
    // Check if we got valid JSON
    try {
      const result = JSON.parse(text);
      return result;
    } catch (e) {
      console.error('Invalid JSON response:', text);
      return { success: false, message: 'Invalid response from server' };
    }
  } catch (error) {
    console.error('API Error:', error);
    return { success: false, message: error.toString() };
  }
}

// ============================================
// SPECIFIC API FUNCTIONS
// ============================================

// Admin Functions
async function checkAdminPassword(password) {
  return await callApi('checkAdminPassword', { password });
}

async function getAdminCandidateList() {
  return await callApi('getAdminCandidateList');
}

async function addCandidateWithFile(adminPassword, position, name, program, fileData) {
  return await callApi('addCandidateWithFile', { adminPassword, position, name, program, fileData });
}

async function updateCandidate(adminPassword, rowIndex, position, name, program) {
  return await callApi('updateCandidate', { adminPassword, rowIndex, position, name, program });
}

async function deleteCandidate(adminPassword, rowIndex) {
  return await callApi('deleteCandidate', { adminPassword, rowIndex });
}

async function deletePosition(adminPassword, positionName) {
  return await callApi('deletePosition', { adminPassword, positionName });
}

// Voting Functions
async function getBallotData() {
  return await callApi('getBallotData');
}

async function submitVotes(voterName, studentId, selections, votedNone) {
  return await callApi('submitVotes', { voterName, studentId, selections, votedNone });
}

// Results Functions
async function getRealtimeTally() {
  return await callApi('getRealtimeTally');
}