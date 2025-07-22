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
    const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;
    
    if (!OPENWEATHER_API_KEY) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'OpenWeather API key not configured' }),
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
    
    const { endpoint, queryParams } = body;
    
    if (!endpoint) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Endpoint parameter is required' }),
      };
    }

    // Build OpenWeather API URL
    let url = `https://api.openweathermap.org/${endpoint}`;
    
    // Add API key to query parameters
    const params = new URLSearchParams(queryParams || {});
    params.append('appid', OPENWEATHER_API_KEY);
    
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
