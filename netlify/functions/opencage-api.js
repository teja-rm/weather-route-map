const fetch = require('node-fetch');

exports.handler = async (event, context) => {
  // Set CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };

  // Handle preflight OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  try {
    const OPENCAGE_API_KEY = process.env.OPENCAGE_API_KEY;
    
    if (!OPENCAGE_API_KEY) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'OpenCage API key not configured' }),
      };
    }

    // Parse the request with error handling
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch (error) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid JSON in request body' }),
      };
    }
    
    const { queryParams } = body;
    
    if (!queryParams || !queryParams.q) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Query parameter (q) is required' }),
      };
    }

    // Build OpenCage API URL
    const params = new URLSearchParams(queryParams);
    params.append('key', OPENCAGE_API_KEY);
    
    const url = `https://api.opencagedata.com/geocode/v1/json?${params.toString()}`;

    // Make the API request
    const response = await fetch(url);
    const data = await response.json();

    return {
      statusCode: response.status,
      headers,
      body: JSON.stringify(data),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
