// weather.js

class WeatherManager {
  constructor() {
    this.apiKey = this.getEnvVariable('OPENWEATHER_API_KEY');
    this.cache = new Map();
    this.cacheTTL = 5 * 60 * 1000; // 10 minutes
  }

  // Get environment variable
  getEnvVariable(name) {
    // Check various places where env vars might be available
    if (typeof process !== 'undefined' && process.env && process.env[name]) {
      return process.env[name];
    }
    
    // For browser environments using webpack DefinePlugin or similar
    if (typeof window !== 'undefined' && window.ENV && window.ENV[name]) {
      return window.ENV[name];
    }
    
    // Check if it's available as a global variable
    if (typeof window !== 'undefined' && window[name]) {
      return window[name];
    }
    
    throw new Error(`Environment variable ${name} is not defined. Please check your .env file or environment configuration.`);
  }

  // Get weather data for a single point at a specific time
  async getWeatherAtPoint(lat, lng, targetTime = null) {
    const timestamp = targetTime ?? Math.floor(Date.now() / 1000);
    const cacheKey = `${lat.toFixed(4)}_${lng.toFixed(4)}_${timestamp}`;

    //if (this.cache.has(cacheKey)) {
    //  const cached = this.cache.get(cacheKey);
    //  if (Date.now() - cached.timestamp < this.cacheTTL) {
    //    return cached.data;
    //  }
    //}

    try {
      // Always fetch everything (current, minutely, hourly, daily)
      const url = `https://api.openweathermap.org/data/3.0/onecall?lat=${lat}&lon=${lng}&units=metric&appid=${this.apiKey}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Weather API error: ${response.status}`);
      }

      const json = await response.json();
      const now = json.current.dt;

      // Use the appropriate function based on target time
      let weatherData;
      if (timestamp - now <= 3600 * 48) {
          

        weatherData = this.selectWeatherUpTo48Hours(json, timestamp);
      } else if (timestamp - now > 3600 * 48) {
        weatherData = this.selectWeatherAfter48Hours(json, timestamp);
            } else {
        // Log lat, lng, and that we're using the "else" block (current/past time)
        // Using current/past time block for weather
        // For current or past times, use current data
        weatherData = this._formatCurrent(json.current, json.hourly[0]);
        weatherData.timestamp = now;
      }

      this.cache.set(cacheKey, {
        data: weatherData,
        timestamp: Date.now()
      });

      return weatherData;

    } catch (error) {
      console.error('Error fetching weather data:', error);
      // Always provide fallback dummy data instead of throwing
      return this.generateDemoWeatherPoint();
    }
  }

  // Select weather data for times up to 48 hours after current
  selectWeatherUpTo48Hours(apiResponse, targetTimestamp) {
    const now = apiResponse.current.dt;
    const diff = targetTimestamp - now;

    // 1. Current time range (departure time within 5 minutes of current time)
    if (diff < 300) { // 300 seconds = 5 minutes
      const data = {
        temperature: apiResponse.current.temp,
        description: apiResponse.current.weather[0].description,
        humidity: apiResponse.current.humidity,
        windSpeed: Math.round((apiResponse.current.wind_speed || 0) * 3.6), // Convert m/s to km/h
        visibility: (apiResponse.current.visibility || 0) / 1000,
        timestamp: apiResponse.current.dt,
        isCurrentData: true
      };

      // For current weather, use actual precipitation from current data
      data.precipitation = apiResponse.current.rain?.['1h'] || apiResponse.current.rain?.['3h'] || 0;
      
      // For current weather, calculate rain probability based only on current precipitation
      // Minutely and hourly checks are commented out for this time window
      let rainProbability = 0;
      if (data.precipitation > 0) {
        // If it's currently raining, high probability
        rainProbability = 90;
      } else {
        // No rain in current data, set to 0%
        rainProbability = 0;
      }
      // Commented out: minutely and hourly rain probability checks for <5min window
      // else if (apiResponse.minutely && apiResponse.minutely.length > 0) { ... }
      // else if (apiResponse.hourly && apiResponse.hourly[0] && typeof apiResponse.hourly[0].pop === 'number') { ... }
      data.rainProbability = rainProbability;

// Add feels_like if available
if (typeof apiResponse.current.feels_like === 'number') {
  data.feelsLike = apiResponse.current.feels_like;
}

// Add wind gust if available
if (typeof apiResponse.current.wind_gust === 'number') {
  data.windGust = Math.round(apiResponse.current.wind_gust * 3.6); // Convert m/s to km/h
}

// Add wind direction if available
if (typeof apiResponse.current.wind_deg === 'number') {
  data.windDeg = apiResponse.current.wind_deg;
}

// Add snow if available
if (typeof apiResponse.current.snow?.['1h'] === 'number') {
  data.snow = apiResponse.current.snow['1h'];
} else if (typeof apiResponse.current.snow?.['3h'] === 'number') {
  data.snow = apiResponse.current.snow['3h'];
}

// Add rain data (already handled in precipitation above, but keep for completeness)
if (typeof apiResponse.current.rain?.['1h'] === 'number') {
  data.rain = apiResponse.current.rain['1h'];
} else if (typeof apiResponse.current.rain?.['3h'] === 'number') {
  data.rain = apiResponse.current.rain['3h'];
}

return data;
    }

    // 2. 5 minutes to 60 minutes ahead: use minutely data for precipitation and rain probability
    if (diff >= 300 && diff <= 3600 && apiResponse.minutely) {
      const minutelyIndex = Math.floor(diff / 60);
      const targetMinute = apiResponse.minutely[minutelyIndex] || apiResponse.minutely[0];
      const minutesAhead = Math.floor(diff / 60);

      // For other weather fields, decide between current and hourly data
      let source;
      if (minutesAhead < 30) {
        source = apiResponse.current;
      } else {
        source = apiResponse.hourly && apiResponse.hourly[1] ? apiResponse.hourly[1] : apiResponse.current;
      }

      const data = {
        temperature: source.temp,
        description: source.weather[0].description,
        humidity: source.humidity,
        windSpeed: Math.round((source.wind_speed || 0) * 3.6), // Convert m/s to km/h
        visibility: (source.visibility || 0) / 1000,
        timestamp: targetMinute.dt,
        isCurrentData: false
      };

      // Use minutely precipitation data
      data.precipitation = targetMinute.precipitation || 0;
      
      // Calculate rain probability based on minutely forecast around target time
      let rainProbability = 0;
      const startIdx = Math.max(0, minutelyIndex - 15); // 15 minutes before
      const endIdx = Math.min(apiResponse.minutely.length - 1, minutelyIndex + 15); // 15 minutes after
      const surroundingMinutes = apiResponse.minutely.slice(startIdx, endIdx + 1);
      
      if (data.precipitation > 0) {
        // If precipitation is expected at target time
        rainProbability = Math.min(95, 60 + (data.precipitation * 15)); // Base 60% + intensity
      } else {
        // Check surrounding 30-minute window for rain probability
        const precipSum = surroundingMinutes.reduce((sum, minute) => sum + (minute.precipitation || 0), 0);
        const minutesWithRain = surroundingMinutes.filter(minute => (minute.precipitation || 0) > 0).length;
        
        if (precipSum > 1) {
          rainProbability = Math.min(80, 25 + (precipSum * 12));
        } else if (minutesWithRain > 5) {
          rainProbability = Math.min(60, 15 + (minutesWithRain * 3));
        } else if (minutesWithRain > 0) {
          rainProbability = Math.min(40, minutesWithRain * 4);
        }
      }
      
      data.rainProbability = rainProbability;

if (typeof source.wind_gust === 'number') {
  data.windGust = Math.round(source.wind_gust * 3.6); // Convert m/s to km/h
}
if (typeof source.wind_deg === 'number') {
  data.windDeg = source.wind_deg;
}
if (typeof source.snow?.['1h'] === 'number') {
  data.snow = source.snow['1h'];
}
if (typeof source.rain?.['1h'] === 'number') {
  data.rain = source.rain['1h'];
}
if (typeof source.feels_like === 'number') {
  data.feelsLike = source.feels_like;
}

return data;
    }

    // 3. More than 1 hour ahead: use hourly forecast (nearest hour logic)
    if (apiResponse.hourly && apiResponse.hourly.length > 0) {
      // Find the two hourly entries surrounding the target time
      let prevHour = null, nextHour = null;
      for (let i = 0; i < apiResponse.hourly.length; i++) {
        if (apiResponse.hourly[i].dt <= targetTimestamp) {
          prevHour = apiResponse.hourly[i];
        }
        if (apiResponse.hourly[i].dt > targetTimestamp) {
          nextHour = apiResponse.hourly[i];
          break;
        }
      }
      
      // Helper function to format hourly data with all fields
      const formatHourlyData = (chosen) => {
        const data = {
          temperature: chosen.temp,
          description: chosen.weather[0].description,
          humidity: chosen.humidity,
          windSpeed: Math.round((chosen.wind_speed || 0) * 3.6), // Convert m/s to km/h
          visibility: (chosen.visibility || 0) / 1000,
          precipitation: chosen.rain?.['1h'] || 0,
          rainProbability: Math.round((chosen.pop || 0) * 100),
          timestamp: chosen.dt,
          isCurrentData: false
        };

        // Add feels_like if available
        if (typeof chosen.feels_like === 'number') {
          data.feelsLike = chosen.feels_like;
        }

        // Add wind gust if available
        if (typeof chosen.wind_gust === 'number') {
          data.windGust = Math.round(chosen.wind_gust * 3.6); // Convert m/s to km/h
        }

        // Add wind direction if available
        if (typeof chosen.wind_deg === 'number') {
          data.windDeg = chosen.wind_deg;
        }

        // Add snow if available
        if (typeof chosen.snow?.['1h'] === 'number') {
          data.snow = chosen.snow['1h'];
        }

        // Add rain data (already handled in precipitation above, but keep for completeness)
        if (typeof chosen.rain?.['1h'] === 'number') {
          data.rain = chosen.rain['1h'];
        }

        return data;
      };

      // Decide which hour to use based on how far into the hour the target is
      if (prevHour && nextHour) {
        const minutesIntoNextHour = Math.floor((targetTimestamp - prevHour.dt) / 60);
        const useNext = minutesIntoNextHour > 30;
        const chosen = useNext ? nextHour : prevHour;
        return formatHourlyData(chosen);
      } else if (prevHour) {
        // If only previous hour found
        return formatHourlyData(prevHour);
      } else if (nextHour) {
        // If only next hour found
        return formatHourlyData(nextHour);
      }
    }

    // Fallback: use current if no suitable forecast found
    return this._formatCurrent(apiResponse.current, apiResponse.hourly[0]);
  }

  // Select weather data for times more than 48 hours after current
  selectWeatherAfter48Hours(apiResponse, targetTimestamp) {
    if (!apiResponse.daily || apiResponse.daily.length === 0) {
      return this._formatCurrent(apiResponse.current, apiResponse.hourly[0]);
    }

    // Find the daily forecast closest to the target timestamp
    let closestDay = apiResponse.daily[0];
    let minDiff = Math.abs(targetTimestamp - closestDay.dt);

    for (let i = 1; i < apiResponse.daily.length; i++) {
      const diff = Math.abs(targetTimestamp - apiResponse.daily[i].dt);
      if (diff < minDiff) {
        minDiff = diff;
        closestDay = apiResponse.daily[i];
      }
    }

    const dailyData = {
      temperature: closestDay.temp.day,
      description: closestDay.weather[0].description,
      humidity: closestDay.humidity,
      windSpeed: Math.round((closestDay.wind_speed || 0) * 3.6), // Convert m/s to km/h
      precipitation: closestDay.rain?.['1d'] || closestDay.rain || 0,
      rainProbability: Math.round((closestDay.pop || 0) * 100),
      timestamp: closestDay.dt,
      isCurrentData: false
    };

    // Add feels_like if available (use day temperature)
    if (typeof closestDay.feels_like?.day === 'number') {
      dailyData.feelsLike = closestDay.feels_like.day;
    }

    // Add optional wind data if available
    if (typeof closestDay.wind_gust === 'number') {
      dailyData.windGust = Math.round(closestDay.wind_gust * 3.6); // Convert m/s to km/h
    }
    if (typeof closestDay.wind_deg === 'number') {
      dailyData.windDeg = closestDay.wind_deg;
    }

    return dailyData;
  }

  _formatCurrent(current, nextHour) {
    const currentData = {
      temperature: current.temp,
      description: current.weather[0].description,
      humidity: current.humidity,
      windSpeed: Math.round((current.wind_speed || 0) * 3.6), // Convert m/s to km/h
      visibility: (current.visibility || 0) / 1000,
      precipitation: current.rain?.['1h'] || current.rain?.['3h'] || 0,
      rainProbability: Math.round((nextHour?.pop || 0) * 100),
      timestamp: current.dt,
      isCurrentData: true
    };

    // Add feels_like if available
    if (typeof current.feels_like === 'number') {
      currentData.feelsLike = current.feels_like;
    }

    // Add optional wind data if available
    if (typeof current.wind_gust === 'number') {
      currentData.windGust = Math.round(current.wind_gust * 3.6); // Convert m/s to km/h
    }
    if (typeof current.wind_deg === 'number') {
      currentData.windDeg = current.wind_deg;
    }

    return currentData;
  }

  // Get weather data for multiple waypoints with their estimated arrival times
  async getWeatherAlongRouteWithTiming(waypointsWithTiming) {
    const promises = waypointsWithTiming.map(waypoint => 
      this.getWeatherAtPoint(waypoint.lat, waypoint.lng, waypoint.estimatedArrivalTime)
    );
    try {
      const results = await Promise.all(promises);
      return results;
    } catch (error) {
      console.error('Error fetching weather along route with timing:', error);
      throw error;
    }
  }

  // Legacy method for backward compatibility (without timing)
  async getWeatherAlongRoute(waypoints) {
    const promises = waypoints.map(waypoint => 
      this.getWeatherAtPoint(waypoint.lat, waypoint.lng)
    );
    try {
      const results = await Promise.all(promises);
      return results;
    } catch (error) {
      console.error('Error fetching weather along route:', error);
      throw error;
    }
  }

  // Calculate estimated arrival times for waypoints based on route data
  calculateWaypointTimings(route, departureTime) {
    const departure = new Date(departureTime);
    const departureTimestamp = Math.floor(departure.getTime() / 1000);
    const totalDurationSeconds = route.durationMin * 60;
    const waypointsWithTiming = [];

    route.waypoints.forEach((waypoint, index) => {
      const progress = index / (route.waypoints.length - 1);
      const arrivalSeconds = departureTimestamp + (totalDurationSeconds * progress);
      waypointsWithTiming.push({
        lat: waypoint.lat,
        lng: waypoint.lng,
        estimatedArrivalTime: arrivalSeconds,
        index: index
      });
    });

    return waypointsWithTiming;
  }

  // Enhanced method to get weather for route with calculated timings
  async getTimedWeatherForRoute(route, departureTime) {
    const waypointsWithTiming = this.calculateWaypointTimings(route, departureTime);
    const weatherData = await this.getWeatherAlongRouteWithTiming(waypointsWithTiming);
    return weatherData.map((weather, index) => ({
      ...weather,
      waypoint: route.waypoints[index],
      estimatedArrivalTime: waypointsWithTiming[index].estimatedArrivalTime,
      estimatedArrivalTimeFormatted: new Date(waypointsWithTiming[index].estimatedArrivalTime * 1000).toLocaleTimeString()
    }));
  }

  // Get detailed weather forecast for a specific location
  async getDetailedForecast(lat, lng, hours = 48) {
    try {
      const url = `https://api.openweathermap.org/data/3.0/onecall?lat=${lat}&lon=${lng}&units=metric&appid=${this.apiKey}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Weather forecast API error: ${response.status}`);
      }

      const data = await response.json();

      const forecast = data.hourly.slice(0, hours).map(item => ({
        timestamp: item.dt,
        formattedTime: new Date(item.dt * 1000).toLocaleString(),
        temperature: item.temp,
        description: item.weather[0].description,
        humidity: item.humidity,
        windSpeed: Math.round((item.wind_speed || 0) * 3.6), // Convert m/s to km/h
        precipitation: item.rain?.['1h'] || 0,
        rainProbability: Math.round((item.pop || 0) * 100),
        visibility: (item.visibility || 0) / 1000,
        cloudiness: item.clouds
      }));

      return forecast;

    } catch (error) {
      console.error('Error fetching detailed forecast:', error);
      throw error;
    }
  }

  // Analyze weather conditions for travel planning with mixed-mode considerations
  analyzeWeatherForTravel(weatherData) {
    const analysis = {
      overallScore: 0,
      risks: [],
      recommendations: [],
      alerts: [],
      mixedModeConsiderations: []
    };

    let totalScore = 0;
    let pointCount = 0;

    weatherData.forEach((data, index) => {
      let pointScore = 100;
      
      // Temperature analysis
      if (data.temperature < -5) {
        pointScore -= 30;
        analysis.risks.push({
          type: 'extreme_cold',
          location: data.name || `Waypoint ${index + 1}`,
          time: data.estimatedArrivalTimeFormatted,
          severity: 'high',
          message: 'Extreme cold weather - risk of ice'
        });
      } else if (data.temperature < 0) {
        pointScore -= 20;
        analysis.risks.push({
          type: 'cold',
          location: data.name || `Waypoint ${index + 1}`,
          time: data.estimatedArrivalTimeFormatted,
          severity: 'medium',
          message: 'Freezing temperatures - possible ice'
        });
      } else if (data.temperature > 35) {
        pointScore -= 25;
        analysis.risks.push({
          type: 'extreme_heat',
          location: data.name || `Waypoint ${index + 1}`,
          time: data.estimatedArrivalTimeFormatted,
          severity: 'high',
          message: 'Extreme heat - ensure hydration'
        });
      }

      // Precipitation analysis - more critical for mixed-mode
      const precipitationPenalty = data.isMixedMode ? 1.3 : 1.0;
      if (data.precipitation > 20) {
        pointScore -= 40 * precipitationPenalty;
        analysis.risks.push({
          type: 'heavy_rain',
          location: data.name || `Waypoint ${index + 1}`,
          time: data.estimatedArrivalTimeFormatted,
          severity: 'high',
          message: data.isMixedMode ? 'Heavy rain - cycling and walking both difficult' : 'Heavy rain - reduce speed, increase distance'
        });
      } else if (data.precipitation > 10) {
        pointScore -= 25 * precipitationPenalty;
        analysis.risks.push({
          type: 'moderate_rain',
          location: data.name || `Waypoint ${index + 1}`,
          time: data.estimatedArrivalTimeFormatted,
          severity: 'medium',
          message: data.isMixedMode ? 'Moderate rain - both cycling and walking affected' : 'Moderate rain - drive carefully'
        });
      } else if (data.precipitation > 2) {
        pointScore -= 10 * precipitationPenalty;
      }

      // Rain probability analysis - this affects the score significantly
      const rainProbPenalty = data.isMixedMode ? 1.2 : 1.0;
      if (data.rainProbability > 80) {
        pointScore -= 25 * rainProbPenalty; // High probability of rain
        analysis.risks.push({
          type: 'very_high_rain_probability',
          location: data.name || `Waypoint ${index + 1}`,
          time: data.estimatedArrivalTimeFormatted,
          severity: 'high',
          message: `${data.rainProbability}% chance of rain - very likely${data.isMixedMode ? ' (affects both cycling and walking)' : ''}`
        });
      } else if (data.rainProbability > 60) {
        pointScore -= 15 * rainProbPenalty; // Moderate-high probability
        analysis.risks.push({
          type: 'high_rain_probability',
          location: data.name || `Waypoint ${index + 1}`,
          time: data.estimatedArrivalTimeFormatted,
          severity: 'medium',
          message: `${data.rainProbability}% chance of rain - likely${data.isMixedMode ? ' (affects both cycling and walking)' : ''}`
        });
      } else if (data.rainProbability > 40) {
        pointScore -= 8 * rainProbPenalty; // Moderate probability
        analysis.alerts.push({
          type: 'moderate_rain_probability',
          location: data.name || `Waypoint ${index + 1}`,
          time: data.estimatedArrivalTimeFormatted,
          message: `${data.rainProbability}% chance of rain - possible${data.isMixedMode ? ' (affects both cycling and walking)' : ''}`
        });
      } else if (data.rainProbability > 20) {
        pointScore -= 3 * rainProbPenalty; // Low-moderate probability
      }

      // Wind analysis - more critical for cycling portions
      const windPenalty = data.mode === 'bicycle' || data.isMixedMode ? 1.2 : 1.0;
      if (data.windSpeed > 25) {
        pointScore -= 30 * windPenalty;
        analysis.risks.push({
          type: 'strong_wind',
          location: data.name || `Waypoint ${index + 1}`,
          time: data.estimatedArrivalTimeFormatted,
          severity: 'high',
          message: data.mode === 'bicycle' ? 'Strong winds - very difficult for cycling' : 'Strong winds - difficult for high vehicles'
        });
      } else if (data.windSpeed > 15) {
        pointScore -= 15 * windPenalty;
        analysis.risks.push({
          type: 'moderate_wind',
          location: data.name || `Waypoint ${index + 1}`,
          time: data.estimatedArrivalTimeFormatted,
          severity: 'medium',
          message: data.mode === 'bicycle' ? 'Moderate winds - cycling will be challenging' : 'Moderate winds - drive carefully'
        });
      }

      // Visibility analysis
      if (data.visibility < 1) {
        pointScore -= 35;
        analysis.risks.push({
          type: 'poor_visibility',
          location: data.name || `Waypoint ${index + 1}`,
          time: data.estimatedArrivalTimeFormatted,
          severity: 'high',
          message: 'Very poor visibility - extreme caution required'
        });
      } else if (data.visibility < 5) {
        pointScore -= 20;
        analysis.risks.push({
          type: 'reduced_visibility',
          location: data.name || `Waypoint ${index + 1}`,
          time: data.estimatedArrivalTimeFormatted,
          severity: 'medium',
          message: 'Reduced visibility - use lights and high visibility clothing'
        });
      }

      // Mixed-mode specific considerations
      if (data.isMixedMode) {
        analysis.mixedModeConsiderations.push({
          location: data.name || `Waypoint ${index + 1}`,
          mode: data.mode,
          message: `Mixed-mode segment (${data.mode}) - weather affects both cycling and walking portions`
        });
      }

      // Additional comfort factors
      // High humidity penalty (especially in hot weather)
      if (data.humidity > 85 && data.temperature > 25) {
        pointScore -= 10;
        analysis.alerts.push({
          type: 'high_humidity',
          location: data.name || `Waypoint ${index + 1}`,
          time: data.estimatedArrivalTimeFormatted,
          message: `Very humid conditions (${data.humidity}%) - uncomfortable in heat`
        });
      } else if (data.humidity > 90) {
        pointScore -= 5;
      }

      // "Feels like" temperature analysis (more accurate comfort assessment)
      if (data.feelsLike !== undefined) {
        const feelsDiff = Math.abs(data.feelsLike - data.temperature);
        if (feelsDiff > 5) {
          if (data.feelsLike < -5 || data.feelsLike > 35) {
            pointScore -= 15; // Extreme feels-like conditions
          } else if (data.feelsLike < 0 || data.feelsLike > 30) {
            pointScore -= 8; // Uncomfortable feels-like conditions
          }
        }
      }

      totalScore += Math.max(0, pointScore);
      pointCount++;
    });

    analysis.overallScore = Math.round(totalScore / pointCount);

    // Generate recommendations based on overall score and mixed-mode presence
    const hasMixedMode = weatherData.some(d => d.isMixedMode);
    
    if (analysis.overallScore >= 85) {
      analysis.recommendations.push('Excellent conditions for travel');
      if (hasMixedMode) {
        analysis.recommendations.push('Good conditions for both cycling and walking segments');
      }
    } else if (analysis.overallScore >= 70) {
      analysis.recommendations.push('Good conditions for travel');
      analysis.recommendations.push('Check weather updates before departure');
      if (hasMixedMode) {
        analysis.recommendations.push('Generally good for mixed-mode segments');
      }
    } else if (analysis.overallScore >= 55) {
      analysis.recommendations.push('Fair conditions - travel with caution');
      analysis.recommendations.push('Consider postponing non-essential travel');
      if (hasMixedMode) {
        analysis.recommendations.push('Mixed-mode route may be more challenging in these conditions');
      }
    } else if (analysis.overallScore >= 40) {
      analysis.recommendations.push('Poor conditions - avoid travel if possible');
      analysis.recommendations.push('If travel is necessary, take extra precautions');
      if (hasMixedMode) {
        analysis.recommendations.push('Mixed-mode travel not recommended in these conditions');
      }
    } else {
      analysis.recommendations.push('Very poor conditions - strongly avoid travel');
      analysis.recommendations.push('Wait for weather to improve');
      if (hasMixedMode) {
        analysis.recommendations.push('Mixed-mode travel dangerous in these conditions');
      }
    }

    return analysis;
  }

  // Generate demo weather point for testing
  generateDemoWeatherPoint() {
    const demo = {
      temperature: 10 + Math.random() * 15,
      description: ['Clear sky', 'Partly cloudy', 'Cloudy', 'Light rain'][Math.floor(Math.random() * 4)],
      humidity: 50 + Math.random() * 40,
      windSpeed: Math.round(5 + Math.random() * 20), // Generate in km/h directly (5-25 km/h)
      visibility: 8 + Math.random() * 7,
      precipitation: Math.random() < 0.3 ? Math.random() * 5 : 0,
      rainProbability: Math.round(Math.random() * 100),
      feelsLike: Math.round(10 + Math.random() * 15), // Add feels like temperature
      timestamp: Math.floor(Date.now() / 1000),
      isCurrentData: true
    };

    // Add wind gust with 80% probability
    if (Math.random() > 0.2) {
      demo.windGust = Math.round(8 + Math.random() * 17); // 8-25 km/h
    }

    // Add wind direction with 90% probability
    if (Math.random() > 0.1) {
      demo.windDeg = Math.round(Math.random() * 360); // 0-360°
    }

    return demo;
  }

  // Clear cache
  clearCache() {
    this.cache.clear();
  }

  // Get cache statistics
  getCacheStats() {
    return {
      size: this.cache.size,
      maxAge: this.cacheTTL,
      keys: Array.from(this.cache.keys())
    };
  }

  // Get location name for coordinates using reverse geocoding
  async getLocationName(lat, lng) {
    try {
      // Use global app's apiManager if available
      if (window.routeMapApp && window.routeMapApp.apiManager) {
        const location = await window.routeMapApp.apiManager.reverseGeocodeWithOpenCage(lat, lng);
        return location.name;
      }
      
      // Fallback: simple coordinate display
      return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    } catch (error) {
      console.error('Error getting location name:', error);
      return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    }
  }

  // Enhanced method to get weather with location names
  async getWeatherAlongRouteWithTimingAndNames(waypointsWithTiming) {
    try {
      // Get weather data and location names in parallel for better performance
      const weatherPromises = waypointsWithTiming.map(waypoint => 
        this.getWeatherAtPoint(waypoint.lat, waypoint.lng, waypoint.estimatedArrivalTime)
      );
      
      const locationPromises = waypointsWithTiming.map(waypoint => 
        this.getLocationName(waypoint.lat, waypoint.lng)
      );
      
      const [weatherResults, locationResults] = await Promise.all([
        Promise.all(weatherPromises),
        Promise.all(locationPromises)
      ]);
      
      // Combine weather data with location names
      const combinedResults = weatherResults.map((weather, index) => ({
        ...weather,
        locationName: locationResults[index],
        estimatedArrivalTime: waypointsWithTiming[index].estimatedArrivalTime,
        estimatedArrivalTimeFormatted: waypointsWithTiming[index].estimatedArrivalTimeFormatted
      }));
      
      return combinedResults;
      
    } catch (error) {
      console.error('Error fetching weather with location names:', error);
      
      // Fallback to original method without location names
      try {
        return await this.getWeatherAlongRouteWithTiming(waypointsWithTiming);
      } catch (fallbackError) {
        console.error('Fallback method also failed:', fallbackError);
        throw fallbackError;
      }
    }
  }
}

