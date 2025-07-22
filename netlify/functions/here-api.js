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
    const HERE_API_KEY = process.env.HERE_API_KEY;
    
    if (!HERE_API_KEY) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'HERE API key not configured' }),
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
    
    const { path, queryParams, isTransit } = body;
    
    if (!path) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Path parameter is required' }),
      };
    }

    // Build HERE API URL - use different base for transit vs routing
    let baseUrl = isTransit ? 'https://transit.router.hereapi.com' : 'https://router.hereapi.com';
    let url = `${baseUrl}/${path}`;
    
    // Add API key to query parameters
    const params = new URLSearchParams(queryParams || {});
    params.append('apikey', HERE_API_KEY);
    
    url += `?${params.toString()}`;

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
