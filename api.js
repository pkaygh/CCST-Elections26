// api.js - Updated for your new backend

/**
 * Make a request to the Apps Script API
 * Uses GET for reading, POST for writing
 */
async function callApi(action, data = {}, method = 'POST') {
  try {
    let url = CONFIG.API_URL;
    let options = {
      method: method,
      headers: {
        'Content-Type': 'application/json',
      }
    };
    
    if (method === 'GET') {
      // For GET requests, append action to URL
      url += `?action=${encodeURIComponent(action)}`;
      // If there are additional params, add them as query string
      if (data && Object.keys(data).length > 0) {
        const params = new URLSearchParams(data);
        url += `&${params.toString()}`;
      }
    } else {
      // For POST requests, send data in body
      options.body = JSON.stringify({
        action: action,
        ...data
      });
    }
    
    const response = await fetch(url, options);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const text = await response.text();
    
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
// SPECIFIC API FUNCTIONS - Using GET when possible
// ============================================

// Admin Functions (POST - require password)
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

// Voting Functions (GET for reading, POST for writing)
async function getBallotData() {
  // Use GET for better performance
  return await callApi('getBallotData', {}, 'GET');
}

async function submitVotes(voterName, studentId, selections, votedNone) {
  return await callApi('submitVotes', { voterName, studentId, selections, votedNone });
}

// Results Functions (GET for reading)
async function getRealtimeTally() {
  // Use GET for better performance
  return await callApi('getRealtimeTally', {}, 'GET');
}