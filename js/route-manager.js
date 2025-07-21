/**
 * Route Manager for handling routing operations
 */
class RouteManager {
    constructor(apiManager, mapManager) {
        this.apiManager = apiManager;
        this.mapManager = mapManager;
        this.currentRoute = null;
        this.originLocation = null;
        this.destinationLocation = null;
    }
    
    async calculateRoute(origin, destination, mode = 'car', routeType = 'fast', departureTime = new Date()) {
        try {
            Utils.showLoading();
            Utils.hideError();

            // Store locations
            this.originLocation = origin;
            this.destinationLocation = destination;

            let routeDataArr;

            // Handle transit mode differently
            if (mode === 'publicTransport') {
                // Only one route for transit for now
                routeDataArr = [await this.apiManager.calculateTransitRoute(origin, destination, departureTime)];
            } else {
                // Get all alternative routes (array)
                routeDataArr = await this.apiManager.calculateRoute(origin, destination, mode, routeType);
            }

            // Store all alternatives
            this.allRoutes = routeDataArr;
            this.currentRouteIdx = 0;

            // Show the first route by default
            await this.showRouteByIndex(0, origin, destination, mode, routeType, departureTime);

        } catch (error) {
            console.error('Route calculation error:', error);
            Utils.showError('Failed to calculate route: ' + error.message);
            // Fallback: show straight line
            this.drawFallbackRoute(origin, destination);
        } finally {
            Utils.hideLoading();
        }
    }

    async showRouteByIndex(idx, origin, destination, mode, routeType, departureTime) {
        if (!this.allRoutes || !this.allRoutes[idx]) return;
        const routeData = this.allRoutes[idx];
        this.currentRouteIdx = idx;

        // Clear existing route and markers
        this.mapManager.clearAll();

        // Initialize current route object
        this.currentRoute = {
            coordinates: routeData.polyline ? this.decodePolyline(routeData.polyline) : null,
            data: routeData,
            origin: origin,
            destination: destination,
            mode: mode,
            routeType: routeType,
            departureTime: departureTime,
            weather: null,
            isTransitRoute: mode === 'publicTransport' || routeData.isTransitRoute
        };

        // Handle transit routes or segment-based bicycle routes
        if (mode === 'publicTransport' || routeData.isTransitRoute || routeData.useSegmentDrawing) {
            await this.handleTransitRoute(routeData, origin, destination, departureTime);
        } else {
            await this.handleRegularRoute(routeData, origin, destination, mode, departureTime);
        }
    }

    async handleTransitRoute(routeData, origin, destination, departureTime) {
        console.log('[RouteManager] Handling transit route');
        
        // Check if waypoints exist, if not create basic ones
        if (!routeData.waypoints || routeData.waypoints.length === 0) {
            console.log('[RouteManager] No waypoints in route data, creating basic waypoints');
            routeData.waypoints = [
                {
                    lat: origin.lat,
                    lng: origin.lng,
                    type: 'origin',
                    mode: 'origin',
                    placeName: 'Origin',
                    time: departureTime.toISOString(),
                    sectionIndex: 0,
                    isTransitStop: false
                },
                {
                    lat: destination.lat,
                    lng: destination.lng,
                    type: 'destination',
                    mode: 'destination',
                    placeName: 'Destination',
                    time: new Date(departureTime.getTime() + (routeData.duration * 1000)).toISOString(),
                    sectionIndex: 1,
                    isTransitStop: false
                }
            ];
        }
        
        console.log('[RouteManager] Processing', routeData.waypoints.length, 'waypoints');
        
        // Add markers for all waypoints (mode transition points)
        routeData.waypoints.forEach((waypoint, index) => {
            let markerType, markerLabel, markerPopup;

            if (index === 0) {
                markerType = 'origin';
                markerLabel = 'Origin';
            } else if (index === routeData.waypoints.length - 1) {
                markerType = 'destination';
                markerLabel = 'Destination';
            } else {
                markerType = waypoint.isTransitStop ? 'transit-stop' : 'waypoint';
                markerLabel = waypoint.placeName || `Stop ${index}`;
            }

            // Add arrival time to popup if available
            let arrivalTime = waypoint.estimatedArrivalTimeFormatted || waypoint.arrivalTimeFormatted || waypoint.time || '';
            if (arrivalTime && typeof arrivalTime === 'string' && arrivalTime.length > 0) {
                markerPopup = `<div><strong>${markerLabel}</strong><br>Arrival: ${arrivalTime}</div>`;
            } else {
                markerPopup = markerLabel;
            }

            this.mapManager.addMarker(
                waypoint.lat,
                waypoint.lng,
                markerType,
                markerPopup,
                waypoint.transportInfo
            );
        });
        
        // Draw route segments with different colors for different modes
        if (routeData.segments && routeData.segments.length > 0) {
            this.drawTransitSegments(routeData.segments);
        } else if (routeData.polyline) {
            // Fallback: draw single polyline if no segments
            console.log('[RouteManager] No segments found, drawing single polyline');
            const coordinates = this.decodePolyline(routeData.polyline);
            if (coordinates && coordinates.length > 0) {
                this.mapManager.drawRoute(coordinates, '#8b5cf6', {
                    weight: 5,
                    opacity: 0.8
                });
            }
        }
        
        // Fit map to show all waypoints
        this.fitMapToWaypoints(routeData.waypoints);
        
        // Update route information for transit
        this.updateTransitRouteInfo(routeData, departureTime);
        
        // Update instructions for transit
        this.updateInstructions(routeData.instructions);
        
        // Get weather data for transit waypoints with timing
        const weatherData = await this.getTransitWeatherData(routeData, departureTime);
        
        // Update weather display
        this.updateWeatherDisplay(weatherData, departureTime);
        
        // Store weather data in route
        this.currentRoute.weather = weatherData;
    }

    async handleRegularRoute(routeData, origin, destination, mode, departureTime) {
        // Decode polyline to coordinates
        const coordinates = this.decodePolyline(routeData.polyline);
        
        if (!coordinates || coordinates.length === 0) {
            throw new Error('Failed to decode route polyline');
        }
        
        // Add markers for origin and destination
        this.mapManager.addMarker(origin.lat, origin.lng, 'origin', 'Origin');
        this.mapManager.addMarker(destination.lat, destination.lng, 'destination', 'Destination');
        
        // Draw route on map
        this.mapManager.drawRoute(coordinates, this.getRouteColor(mode));
        
        // Fit map to show entire route
        this.fitMapToRoute(coordinates);
        
        // Update route information
        Utils.updateRouteInfo(routeData, departureTime);
        
        // Update turn-by-turn instructions
        this.updateInstructions(routeData.instructions);
        
        // Get weather data for the route
        const weatherData = await this.getRouteWeatherData(coordinates, routeData, departureTime);
        
        // Update weather display
        this.updateWeatherDisplay(weatherData, departureTime);
        
        // Store weather data
        this.currentRoute.weather = weatherData;
    }
    
    decodePolyline(polyline) {
        if (!polyline || typeof polyline !== 'string' || polyline.trim().length === 0) {
            console.warn('[RouteManager] Invalid polyline provided');
            return null;
        }
        try {
            // Use only the official FlexPolylineDecoder
            if (window.FlexPolylineDecoder) {
                const result = window.FlexPolylineDecoder.decode(polyline);
                // The decoder returns an array of coordinates
                if (result && Array.isArray(result) && result.length > 0) {
                    console.log('[RouteManager] Successfully decoded with FlexPolylineDecoder');
                    return this.validateAndFixCoordinates(result);
                }
            }
            throw new Error('FlexPolylineDecoder failed or not available');
        } catch (error) {
            console.error('Polyline decoding error:', error);
            return null;
        }
    }
    
    validateAndFixCoordinates(coordinates) {
        if (!Array.isArray(coordinates) || coordinates.length === 0) {
            throw new Error('Invalid coordinates array');
        }
        
        const validCoordinates = [];
        let invalidCount = 0;
        let skipLog = false;
        
        // Log total coordinates to validate
        console.log(`[RouteManager] Validating ${coordinates.length} coordinates`);
        
        // If we have too many coordinates, we'll only log a few of the invalid ones
        if (coordinates.length > 100) {
            skipLog = true;
        }
        
        for (let i = 0; i < coordinates.length; i++) {
            const coord = coordinates[i];
            
            // Handle different coordinate formats
            let lat, lng;
            
            if (Array.isArray(coord)) {
                // [lat, lng] format
                lat = parseFloat(coord[0]);
                lng = parseFloat(coord[1]);
            } else if (coord && typeof coord === 'object') {
                // {lat: x, lng: y} or {latitude: x, longitude: y} format
                lat = parseFloat(coord.lat || coord.latitude);
                lng = parseFloat(coord.lng || coord.longitude);
            } else {
                if (!skipLog) {
                    console.warn('[RouteManager] Invalid coordinate format at index', i, coord);
                }
                invalidCount++;
                continue;
            }
            
            // Validate coordinate values
            if (isNaN(lat) || isNaN(lng)) {
                if (!skipLog) {
                    console.warn('[RouteManager] Non-numeric coordinates at index', i, { lat, lng });
                }
                invalidCount++;
                continue;
            }
            
            // Check if coordinates are within valid ranges
            if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
                if (!skipLog) {
                    console.warn('[RouteManager] Coordinates out of range at index', i, { lat, lng });
                }
                invalidCount++;
                continue;
            }
            
            // Add to valid coordinates in [lat, lng] format (Leaflet format)
            validCoordinates.push([lat, lng]);
        }
        
        // Log statistics about validation
        if (invalidCount > 0) {
            console.warn(`[RouteManager] Found ${invalidCount} invalid coordinates out of ${coordinates.length}. Valid: ${validCoordinates.length}`);
        } else {
            console.log(`[RouteManager] All ${validCoordinates.length} coordinates are valid`);
        }
        
        if (validCoordinates.length === 0) {
            throw new Error('No valid coordinates found after validation');
        }
        
        return validCoordinates;
    }
    
    fitMapToRoute(coordinates) {
        if (!coordinates || coordinates.length === 0) return;
        
        try {
            // Calculate bounds
            let minLat = coordinates[0][0];
            let maxLat = coordinates[0][0];
            let minLng = coordinates[0][1];
            let maxLng = coordinates[0][1];
            
            coordinates.forEach(coord => {
                const [lat, lng] = coord;
                minLat = Math.min(minLat, lat);
                maxLat = Math.max(maxLat, lat);
                minLng = Math.min(minLng, lng);
                maxLng = Math.max(maxLng, lng);
            });
            
            // Add padding
            const latPadding = (maxLat - minLat) * 0.1;
            const lngPadding = (maxLng - minLng) * 0.1;
            
            const bounds = [
                [minLat - latPadding, minLng - lngPadding],
                [maxLat + latPadding, maxLng + lngPadding]
            ];
            
            this.mapManager.fitBounds(bounds);
        } catch (error) {
            console.error('Error fitting map to route:', error);
        }
    }
    
    drawFallbackRoute(origin, destination) {
        // Clear existing elements
        this.mapManager.clearAll();
        
        // Add markers
        this.mapManager.addMarker(origin.lat, origin.lng, 'origin', 'Origin');
        this.mapManager.addMarker(destination.lat, destination.lng, 'destination', 'Destination');
        
        // Draw straight line
        const coordinates = [
            [origin.lat, origin.lng],
            [destination.lat, destination.lng]
        ];
        
        this.mapManager.drawRoute(coordinates, '#ef4444'); // Red for fallback
        
        // Fit map to show both points
        this.fitMapToRoute(coordinates);
        
        // Calculate approximate distance
        const distance = this.calculateDistance(origin, destination);
        
        Utils.updateRouteInfo({
            distance: distance,
            duration: Math.round(distance / 50 * 3600), // Rough estimate: 50 km/h average
            summary: {
                length: distance,
                duration: Math.round(distance / 50 * 3600)
            }
        });
        
        // Show fallback message
        Utils.showError('Route service unavailable. Showing direct line.');
    }
    
    calculateDistance(coord1, coord2) {
        const R = 6371000; // Earth's radius in meters
        const dLat = this.toRadians(coord2.lat - coord1.lat);
        const dLon = this.toRadians(coord2.lng - coord1.lng);
        const a = 
            Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(this.toRadians(coord1.lat)) * Math.cos(this.toRadians(coord2.lat)) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }
    
    toRadians(degrees) {
        return degrees * (Math.PI / 180);
    }
    
    getRouteColor(mode) {
        const colors = {
            'car': '#3b82f6',        // Blue
            'bicycle': '#22c55e',    // Green
            'pedestrian': '#f59e0b', // Orange
            'walk': '#f59e0b',       // Orange
            'publicTransport': '#8b5cf6', // Purple
            'truck': '#dc2626'       // Red
        };
        return colors[mode] || '#3b82f6';
    }
    
    updateInstructions(instructions) {
        const listEl = document.getElementById('instructions-list');
        if (!listEl) {
            console.warn('Instructions list element not found');
            return;
        }
        
        listEl.innerHTML = '';
        
        if (!instructions || instructions.length === 0) {
            listEl.innerHTML = '<li class="instruction-item">No detailed instructions available</li>';
            return;
        }
        
        instructions.forEach((instruction, index) => {
            const li = document.createElement('li');
            li.className = 'instruction-item';
            
            // Extract instruction text
            let instructionText = '';
            if (typeof instruction === 'string') {
                instructionText = instruction;
            } else if (instruction.instruction) {
                instructionText = instruction.instruction;
            } else if (instruction.action) {
                instructionText = this.formatAction(instruction);
            } else {
                instructionText = 'Continue on route';
            }
            
            // Add step number
            const stepNumber = document.createElement('span');
            stepNumber.className = 'step-number';
            stepNumber.textContent = (index + 1) + '. ';
            
            li.appendChild(stepNumber);
            li.appendChild(document.createTextNode(instructionText));
            
            // Add distance if available
            if (instruction.length) {
                const distance = document.createElement('span');
                distance.className = 'instruction-distance';
                distance.textContent = ` (${Utils.formatDistance(instruction.length)})`;
                li.appendChild(distance);
            }
            
            listEl.appendChild(li);
        });
    }
    
    formatAction(instruction) {
        const actionMap = {
            'depart': 'Start your journey',
            'arrive': 'You have arrived at your destination',
            'turn': `Turn ${instruction.direction || ''}`,
            'continue': 'Continue straight',
            'roundaboutExit': `Take exit ${instruction.exit || ''} from the roundabout`,
            'merge': 'Merge onto the road',
            'ferry': 'Take the ferry',
            'ramp': 'Take the ramp'
        };
        
        const action = actionMap[instruction.action] || `${instruction.action || 'Continue'}`;
        return action;
    }
    
    clearRoute() {
        // Clear map elements
        this.mapManager.clearAll();
        
        // Reset route data
        this.currentRoute = null;
        this.originLocation = null;
        this.destinationLocation = null;
        
        // Hide route info
        const routeInfoEl = document.getElementById('route-info');
        if (routeInfoEl) {
            routeInfoEl.classList.add('hidden');
        }
        
        // Clear instructions
        const listEl = document.getElementById('instructions-list');
        if (listEl) {
            listEl.innerHTML = '';
        }
        
        // Clear weather display
        const weatherContainer = document.querySelector('.weather-placeholder');
        if (weatherContainer) {
            weatherContainer.innerHTML = `
                <h3 style="color:rgba(255,255,255,0.9);position:relative;z-index:2;">🌦️ Weather Along Route</h3>
                <p class="text-secondary" style="color:rgba(255,255,255,0.7);position:relative;z-index:2;">Calculate a route to see weather conditions along your journey</p>
            `;
        }
        
        // Hide any error messages
        Utils.hideError();
    }
    
    getCurrentRoute() {
        return this.currentRoute;
    }
    
    // Additional utility methods
    recalculateRoute() {
        if (this.currentRoute) {
            const { origin, destination, mode, routeType } = this.currentRoute;
            this.calculateRoute(origin, destination, mode, routeType);
        }
    }
    
    exportRoute() {
        if (!this.currentRoute) {
            Utils.showError('No route to export');
            return null;
        }
        
        return {
            origin: this.currentRoute.origin,
            destination: this.currentRoute.destination,
            coordinates: this.currentRoute.coordinates,
            distance: this.currentRoute.data.distance,
            duration: this.currentRoute.data.duration,
            mode: this.currentRoute.mode,
            routeType: this.currentRoute.routeType,
            weather: this.currentRoute.weather,
            timestamp: new Date().toISOString()
        };
    }
    
    getRouteStatistics() {
        if (!this.currentRoute) return null;
        
        return {
            totalDistance: this.currentRoute.data.distance,
            totalDuration: this.currentRoute.data.duration,
            numberOfPoints: this.currentRoute.coordinates.length,
            mode: this.currentRoute.mode,
            routeType: this.currentRoute.routeType
        };
    }
    
    // Rename existing method for clarity
    extractWaypointsFromRouteSingleMode(coordinates, totalDistance) {
        if (!coordinates || coordinates.length === 0) {
            return [];
        }
        
        // Default to 3 waypoints for very short routes
        let numWaypoints = Math.max(3, Math.ceil(totalDistance / 1000));
        
        console.log(`Extracting ${numWaypoints} waypoints from route (${totalDistance}m)`);
        
        const waypoints = [];
        const step = Math.max(1, Math.floor(coordinates.length / (numWaypoints - 1)));
        
        // MANDATORY: Always include start point (origin)
        waypoints.push({
            lat: coordinates[0][0],
            lng: coordinates[0][1],
            index: 0,
            distance: 0,
            type: 'origin'
        });
        
        // Add intermediate waypoints
        for (let i = 1; i < numWaypoints - 1; i++) {
            const index = Math.min(i * step, coordinates.length - 1);
            waypoints.push({
                lat: coordinates[index][0],
                lng: coordinates[index][1],
                index: index,
                distance: this.calculateDistanceFromStart(coordinates, index),
                type: 'intermediate'
            });
        }
        
        // MANDATORY: Always include end point (destination)
        waypoints.push({
            lat: coordinates[coordinates.length - 1][0],
            lng: coordinates[coordinates.length - 1][1],
            index: coordinates.length - 1,
            distance: totalDistance,
            type: 'destination'
        });
        
        console.log('Extracted waypoints:', waypoints);
        return waypoints;
    }
    
    // Calculate distance from start to a specific point in the route
    calculateDistanceFromStart(coordinates, targetIndex) {
        let totalDistance = 0;
        
        for (let i = 0; i < targetIndex && i < coordinates.length - 1; i++) {
            const coord1 = { lat: coordinates[i][0], lng: coordinates[i][1] };
            const coord2 = { lat: coordinates[i + 1][0], lng: coordinates[i + 1][1] };
            totalDistance += this.calculateDistance(coord1, coord2);
        }
        
        return totalDistance;
    }
    
    // Calculate estimated arrival times for waypoints
    calculateWaypointTimings(waypoints, totalDuration, departureTime = new Date()) {
        const departureTimestamp = Math.floor(departureTime.getTime() / 1000);
        // Convert duration to seconds if it's in minutes (HERE API typically returns duration in seconds)
        const totalDurationSeconds = typeof totalDuration === 'number' ? totalDuration : 0;
        
        console.log('Calculating waypoint timings:', {
            totalWaypoints: waypoints.length,
            totalDurationSeconds,
            departureTime: departureTime.toISOString(),
            departureTimestamp
        });
        
        return waypoints.map((waypoint, index) => {
            // Calculate progress based on distance if available, otherwise use index
            let progress;
            if (waypoint.distance !== undefined && waypoints[waypoints.length - 1].distance > 0) {
                progress = waypoint.distance / waypoints[waypoints.length - 1].distance;
            } else {
                progress = index / Math.max(1, waypoints.length - 1);
            }
            
            const arrivalTimestamp = departureTimestamp + Math.round(totalDurationSeconds * progress);
            
            const result = {
                ...waypoint,
                estimatedArrivalTime: arrivalTimestamp,
                estimatedArrivalTimeFormatted: new Date(arrivalTimestamp * 1000).toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit'
                }),
                progress: progress
            };
            
            console.log(`Waypoint ${index + 1}:`, {
                lat: waypoint.lat,
                lng: waypoint.lng,
                progress: progress.toFixed(3),
                arrivalTime: new Date(arrivalTimestamp * 1000).toLocaleString()
            });
            
            return result;
        });
    }
    
    // Get weather data for the route
    async getRouteWeatherData(coordinates, routeData, departureTime = new Date()) {
        try {
            // Initialize WeatherManager if not exists
            if (!window.weatherManager) {
                console.log('Initializing WeatherManager...');
                window.weatherManager = new WeatherManager();
            }
            
            const totalDistance = routeData.distance || routeData.summary?.length || 0;
            const totalDuration = routeData.duration || routeData.summary?.duration || 0;
            
            console.log('Route data for weather:', {
                totalDistance,
                totalDuration,
                routeType: routeData.isTransitRoute ? 'transit' : 'regular',
                coordinatesLength: coordinates?.length || 0
            });
            
            // Check if this is a transit route
            if (routeData.mode === 'publicTransport' || routeData.isTransitRoute) {
                return await this.getTransitWeatherData(routeData, departureTime);
            }
            
            // Extract waypoints based on distance (for regular routes)
            const waypoints = this.extractWaypointsFromRoute(coordinates, totalDistance, routeData);
            console.log('Extracted waypoints:', waypoints.length);
            
            // Calculate estimated arrival times
            const waypointsWithTiming = this.calculateWaypointTimings(waypoints, totalDuration, departureTime);
            console.log('Waypoints with timing calculated:', waypointsWithTiming.length);
            
            let weatherData;
            
            // Try the enhanced method with location names first
            if (typeof window.weatherManager.getWeatherAlongRouteWithTimingAndNames === 'function') {
                console.log('🌦️ RouteManager: Using getWeatherAlongRouteWithTimingAndNames method...');
                weatherData = await window.weatherManager.getWeatherAlongRouteWithTimingAndNames(waypointsWithTiming);
            } else if (typeof window.weatherManager.getWeatherAlongRouteWithTiming === 'function') {
                console.log('🌦️ RouteManager: Using getWeatherAlongRouteWithTiming method...');
                weatherData = await window.weatherManager.getWeatherAlongRouteWithTiming(waypointsWithTiming);
            } else if (typeof window.weatherManager.getWeatherAlongRoute === 'function') {
                console.log('🌦️ RouteManager: Falling back to getWeatherAlongRoute method...');
                // Transform waypoints to simple lat/lng format for legacy method
                const simpleWaypoints = waypointsWithTiming.map(wp => ({
                    lat: wp.lat,
                    lng: wp.lng
                }));
                weatherData = await window.weatherManager.getWeatherAlongRoute(simpleWaypoints);
                
                // Add timing information back to weather data
                weatherData = weatherData.map((weather, index) => ({
                    ...weather,
                    estimatedArrivalTime: waypointsWithTiming[index].estimatedArrivalTime,
                    estimatedArrivalTimeFormatted: waypointsWithTiming[index].estimatedArrivalTimeFormatted
                }));
            } else {
                throw new Error('WeatherManager does not have required methods');
            }
            
            console.log('Weather data received:', weatherData.length, 'points');
            
            // Debug: Log raw weather data received from WeatherManager
            weatherData.forEach((weather, index) => {
                console.log(`🔍 RouteManager: Raw weather data ${index + 1} from WeatherManager:`, {
                    temperature: weather.temperature,
                    feelsLike: weather.feelsLike,
                    windSpeed: weather.windSpeed,
                    windGust: weather.windGust,
                    windDeg: weather.windDeg,
                    locationName: weather.locationName,
                    hasFeelsLike: weather.feelsLike !== undefined,
                    hasWindGust: weather.windGust !== undefined,
                    hasWindDeg: weather.windDeg !== undefined
                });
            });
            
            // Combine waypoint and weather data
            const routeWeatherData = weatherData.map((weather, index) => {
                const waypoint = waypointsWithTiming[index];
                let locationName;
                
                // Use reverse geocoded location name if available
                if (weather.locationName) {
                    // Add emoji prefixes for origin and destination
                    if (waypoint.type === 'origin') {
                        locationName = `🚩 ${weather.locationName}`;
                    } else if (waypoint.type === 'destination') {
                        locationName = `🏁 ${weather.locationName}`;
                    } else {
                        locationName = `📍 ${weather.locationName}`;
                    }
                } else {
                    // Fallback to generic names
                    if (waypoint.type === 'origin') {
                        locationName = '🚩 Origin';
                    } else if (waypoint.type === 'destination') {
                        locationName = '🏁 Destination';
                    } else {
                        locationName = `📍 Waypoint ${index + 1}`;
                    }
                }
                
                return {
                    ...weather,
                    waypoint: waypoint,
                    location: locationName,
                    distanceFromStart: waypoint.distance || 0,
                    // Add timing information directly to weather object for UI access
                    estimatedArrivalTime: waypoint.estimatedArrivalTime,
                    estimatedArrivalTimeFormatted: waypoint.estimatedArrivalTimeFormatted
                };
            });
            
            // Debug: Log combined route weather data
            routeWeatherData.forEach((weather, index) => {
                console.log(`🔄 RouteManager: Combined weather data ${index + 1} after merging:`, {
                    location: weather.location,
                    temperature: weather.temperature,
                    feelsLike: weather.feelsLike,
                    windSpeed: weather.windSpeed,
                    windGust: weather.windGust,
                    windDeg: weather.windDeg,
                    hasFeelsLike: weather.feelsLike !== undefined,
                    hasWindGust: weather.windGust !== undefined,
                    hasWindDeg: weather.windDeg !== undefined
                });
            });
            
            // Analyze weather for travel
            let weatherAnalysis;
            if (typeof window.weatherManager.analyzeWeatherForTravel === 'function') {
                weatherAnalysis = window.weatherManager.analyzeWeatherForTravel(routeWeatherData);
            } else {
                // Simple fallback analysis
                const avgTemp = routeWeatherData.reduce((sum, w) => sum + (w.temperature || 20), 0) / routeWeatherData.length;
                weatherAnalysis = {
                    overallScore: avgTemp > 10 && avgTemp < 30 ? 85 : 70,
                    risks: [],
                    recommendations: ['Weather data available for route planning'],
                    alerts: []
                };
            }
            
            const weatherDataResult = {
                waypoints: routeWeatherData,
                analysis: weatherAnalysis,
                summary: {
                    totalWaypoints: waypoints.length,
                    routeDistance: totalDistance,
                    routeDuration: totalDuration
                }
            };
            
            // Deduplicate waypoints to remove locations that appear multiple times
            const deduplicatedWeatherData = this.deduplicateWaypoints(weatherDataResult);
            
            return deduplicatedWeatherData;
            
        } catch (error) {
            console.error('Error getting route weather data:', error);
            console.log('🔄 RouteManager: Falling back to dummy weather data...');
            return this.generateDummyWeatherData(coordinates, routeData, departureTime);
        }
    }
    
    // Generate dummy weather data for demo/fallback
    generateDummyWeatherData(coordinates, routeData, departureTime = new Date()) {
        const totalDistance = routeData.distance || routeData.summary?.length || 10000;
        const totalDuration = routeData.duration || routeData.summary?.duration || 3600;
        const waypoints = this.extractWaypointsFromRoute(coordinates, totalDistance, routeData);
        
        // Calculate proper timing for dummy data
        const waypointsWithTiming = this.calculateWaypointTimings(waypoints, totalDuration, departureTime);
        
        const dummyWeatherData = waypointsWithTiming.map((waypoint, index) => {
            let locationName;
            if (waypoint.type === 'origin') {
                locationName = '🚩 Origin';
            } else if (waypoint.type === 'destination') {
                locationName = '🏁 Destination';
            } else {
                locationName = `📍 Waypoint ${index + 1}`;
            }
            
            const dummyWeather = {
                temperature: Math.round(15 + Math.random() * 10), // 15-25°C
                description: ['Clear sky', 'Partly cloudy', 'Cloudy', 'Light rain'][Math.floor(Math.random() * 4)],
                humidity: Math.round(40 + Math.random() * 40), // 40-80%
                windSpeed: Math.round(5 + Math.random() * 10), // 5-15 km/h
                visibility: Math.round(8 + Math.random() * 7), // 8-15 km
                precipitation: Math.random() < 0.3 ? Math.round(Math.random() * 3) : 0, // 0-3mm
                rainProbability: Math.round(Math.random() * 50), // 0-50%
                snow: 0,
                feelsLike: Math.round(15 + Math.random() * 10), // Always include feels like
                timestamp: waypoint.estimatedArrivalTime,
                isCurrentData: index === 0,
                waypoint: waypoint,
                location: locationName,
                distanceFromStart: waypoint.distance || 0,
                estimatedArrivalTime: waypoint.estimatedArrivalTime,
                estimatedArrivalTimeFormatted: waypoint.estimatedArrivalTimeFormatted
            };
            
            // Optionally add wind gust (simulate sometimes missing data)
            if (Math.random() > 0.2) { // 80% chance of having wind gust data (increased for testing)
                dummyWeather.windGust = Math.round(10 + Math.random() * 15); // 10-25 km/h
            }
            
            // Optionally add wind direction (simulate sometimes missing data)
            if (Math.random() > 0.1) { // 90% chance of having wind direction data (increased for testing)
                dummyWeather.windDeg = Math.round(Math.random() * 360); // 0-360°
            }
            
            // Debug log to see what fields are being generated
            console.log(`Dummy weather for ${locationName}:`, {
                temperature: dummyWeather.temperature,
                feelsLike: dummyWeather.feelsLike,
                windGust: dummyWeather.windGust,
                windDeg: dummyWeather.windDeg,
                windSpeed: dummyWeather.windSpeed
            });
            
            return dummyWeather;
        });
        
        const dummyWeatherResult = {
            waypoints: dummyWeatherData,
            analysis: {
                overallScore: Math.round(70 + Math.random() * 30),
                risks: [],
                recommendations: ['Excellent conditions for travel', 'Demo weather data - actual weather integration available'],
                alerts: []
            },
            summary: {
                totalWaypoints: waypoints.length,
                routeDistance: totalDistance,
                routeDuration: totalDuration
            }
        };
        
        // Apply deduplication to dummy data as well
        return this.deduplicateWaypoints(dummyWeatherResult);
    }
    
    // Helper methods for weather score display
    getScoreColor(score) {
        if (score >= 85) return '#4ade80';  // Green - Excellent
        if (score >= 70) return '#facc15';  // Yellow - Good  
        if (score >= 55) return '#f97316';  // Orange - Fair
        if (score >= 40) return '#ef4444';  // Red - Poor
        return '#dc2626';                   // Dark Red - Very Poor
    }
    
    getScoreDescription(score) {
        if (score >= 85) return 'Excellent conditions for travel';
        if (score >= 70) return 'Good conditions for travel';
        if (score >= 55) return 'Fair conditions - travel with caution';
        if (score >= 40) return 'Poor conditions - avoid travel if possible';
        return 'Very poor conditions - strongly avoid travel';
    }
    
    // Get icon for transit mode
    getModeIcon(mode) {
        switch (mode?.toLowerCase()) {
            case 'walk': return '🚶';
            case 'bicycle': return '🚲';
            case 'car': return '🚗';
            case 'taxi': return '🚕';
            case 'bus': return '🚌';
            case 'train': 
            case 'railway': return '🚆';
            case 'subway': 
            case 'metro': return '🚇';
            case 'tram': return '🚊';
            case 'ferry': return '⛴️';
            case 'airplane': 
            case 'flight': return '✈️';
            default: return '🚆';
        }
    }
    
    // Get color for transit segment
    getTransitSegmentColor(mode, line) {
        switch (mode?.toLowerCase()) {
            case 'walk': return 'rgba(74, 222, 128, 0.8)'; // Green
            case 'bicycle': return 'rgba(34, 211, 238, 0.8)'; // Cyan
            case 'car': 
            case 'taxi': return 'rgba(251, 146, 60, 0.8)'; // Orange
            case 'bus': return 'rgba(14, 165, 233, 0.8)'; // Blue
            case 'train': 
            case 'railway': return 'rgba(139, 92, 246, 0.8)'; // Purple
            case 'subway': 
            case 'metro': return 'rgba(236, 72, 153, 0.8)'; // Pink
            case 'tram': return 'rgba(168, 85, 247, 0.8)'; // Purple-pink
            case 'ferry': return 'rgba(59, 130, 246, 0.8)'; // Blue
            case 'airplane': 
            case 'flight': return 'rgba(99, 102, 241, 0.8)'; // Indigo
            default: return 'rgba(79, 70, 229, 0.8)'; // Default indigo
        }
    }
    
    // Format distance for transit segments display
    formatSegmentDistance(meters) {
        if (!meters || meters === 0) return 'N/A';
        if (meters < 1000) {
            return Math.round(meters) + ' m';
        } else {
            return (meters / 1000).toFixed(1) + ' km';
        }
    }
    
    // Format duration for transit segments display
    formatSegmentDuration(seconds) {
        if (!seconds || seconds === 0) return 'N/A';
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        
        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        } else {
            return `${minutes}m`;
        }
    }
    
    // Update weather display in the UI
    updateWeatherDisplay(weatherData, departureTime = null) {
        const weatherContainer = document.querySelector('.weather-placeholder');
        if (!weatherContainer || !weatherData) {
            return;
        }
        
        // Check if we're dealing with segment-based transit weather
        if (weatherData.segments && weatherData.summary?.isSegmentBased) {
            this.updateTransitSegmentWeatherDisplay(weatherData, departureTime, weatherContainer);
            return;
        }
        
        // Standard waypoint-based weather display
        
        // Debug: Log the weather data structure
        console.log('updateWeatherDisplay - Weather data structure:', {
            totalWaypoints: weatherData.waypoints?.length || 0,
            firstWaypoint: weatherData.waypoints?.[0],
            sampleTiming: weatherData.waypoints?.[0]?.estimatedArrivalTimeFormatted
        });
        
        // Add weather waypoint markers to the map
        if (this.mapManager && typeof this.mapManager.addWeatherWaypoints === 'function') {
            console.log('Adding weather waypoints to map...');
            this.mapManager.addWeatherWaypoints(weatherData.waypoints);
        } else {
            console.warn('MapManager does not support weather waypoints');
        }
        
        // Create weather display HTML
        // ${weatherData.summary?.deduplicationApplied ? `
        // <div style="color:rgba(102,126,234,0.9);font-size:0.75rem;margin-bottom:12px;padding:4px 8px;background:rgba(102,126,234,0.1);border-radius:6px;border:1px solid rgba(102,126,234,0.2);">
        //     🔄 Showing ${weatherData.waypoints.length} unique locations (removed ${weatherData.summary.removedDuplicates} duplicate${weatherData.summary.removedDuplicates !== 1 ? 's' : ''})
        // </div>` : ''}
        const weatherHTML = `
            <div class="weather-analysis">
            <div class="weather-header">
            <h3 style="color:rgba(255,255,255,0.95);position:relative;z-index:2;margin-bottom:8px;">
            🌦️ Weather Along Route
            </h3>
            ${departureTime ? (() => {
            const now = new Date();
            const isNow = Math.abs(departureTime.getTime() - now.getTime()) < 60000;
            const isFuture = departureTime.getTime() > now.getTime() + 60000;
            
            if (isNow) {
                return `<div style="color:rgba(255,255,255,0.7);font-size:0.85rem;margin-bottom:12px;">📅 Current weather conditions</div>`;
            } else if (isFuture) {
                return `<div style="color:rgba(102,126,234,0.9);font-size:0.85rem;margin-bottom:12px;padding:6px 10px;background:rgba(102,126,234,0.1);border-radius:8px;border:1px solid rgba(102,126,234,0.2);">
                📅 Future forecast for ${departureTime.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} at ${departureTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </div>`;
            } else {
                return `<div style="color:rgba(255,255,255,0.7);font-size:0.85rem;margin-bottom:12px;">📅 Using current weather (past time selected)</div>`;
            }
            })() : `<div style="color:rgba(255,255,255,0.7);font-size:0.85rem;margin-bottom:12px;">📅 Current weather conditions</div>`}
            <!-- Deduplication info hidden from UI -->
            <!--
            <div class="overall-score" style="background:rgba(255,255,255,0.1);border-radius:12px;padding:12px;margin-bottom:20px;">
            <div class="score-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                <span style="color:rgba(255,255,255,0.8;);font-weight:600;">Overall Weather Score</span>
                <span style="color:${this.getScoreColor(weatherData.analysis.overallScore)};font-weight:700;font-size:1.2rem;">${weatherData.analysis.overallScore}/100</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
                <span style="width:8px;height:8px;border-radius:50%;background:${this.getScoreColor(weatherData.analysis.overallScore)};"></span>
                <span style="color:rgba(255,255,255,0.9);font-size:0.9rem;">${this.getScoreDescription(weatherData.analysis.overallScore)}</span>
            </div>
            </div>
            -->
            </div>
            
            <div class="weather-waypoints" style="max-height:300px;overflow-y:auto;">
            ${weatherData.waypoints.map((weather, index) => `
            <div class="weather-point" style="
                background:rgba(255,255,255,0.08);
                border:1px solid rgba(255,255,255,0.1);
                border-radius:16px;
                padding:16px;
                margin-bottom:12px;
                transition:all 0.3s ease;
            " onmouseover="this.style.background='rgba(255,255,255,0.12)'" onmouseout="this.style.background='rgba(255,255,255,0.08)'">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                <div style="display:flex;align-items:center;gap:8px;">
                <span style="width:8px;height:8px;border-radius:50%;background:#667eea;"></span>
                <span style="color:rgba(255,255,255,0.9);font-weight:600;">${weather.location}</span>
                </div>
                <span style="color:#4ade80;font-weight:700;font-size:1.1rem;">${Math.round(weather.temperature)}°C</span>
                </div>
                
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
                <div style="display:flex;align-items:center;gap:6px;">
                <span style="color:rgba(255,255,255,0.7);">🕐 Arrival:</span>
                <span style="color:rgba(255,255,255,0.9);font-size:0.85rem;">${weather.estimatedArrivalTimeFormatted || 'N/A'}</span>
                </div>
                <div style="display:flex;align-items:center;gap:6px;">
                <span style="color:rgba(255,255,255,0.7);">📍</span>
                <span style="color:rgba(255,255,255,0.9);font-size:0.85rem;">${(weather.distanceFromStart / 1000).toFixed(1)} km</span>
                </div>
                </div>
                
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:0.85rem;">
                <div style="display:flex;align-items:center;gap:4px;">
                <span>💧</span>
                <span style="color:rgba(255,255,255,0.8);">${weather.precipitation}mm</span>
                </div>
                <div style="display:flex;align-items:center;gap:4px;">
                <span>☔</span>
                <span style="color:rgba(255,255,255,0.8);">${weather.rainProbability}%</span>
                </div>
                <div style="display:flex;align-items:center;gap:4px;">
                <span>💨</span>
                <span style="color:rgba(255,255,255,0.8);">${weather.windSpeed.toFixed(1)} km/h</span>
                </div>
                <div style="display:flex;align-items:center;gap:4px;">
                <span>👁️</span>
                <span style="color:rgba(255,255,255,0.8);">${weather.visibility?.toFixed(1) || '10.0'} km</span>
                </div>
                <div style="display:flex;align-items:center;gap:4px;">
                <span>💨</span>
                <span style="color:rgba(255,255,255,0.8);">Gust: ${weather.windGust ? weather.windGust.toFixed(1) + ' km/h' : '--'}</span>
                </div>
                <div style="display:flex;align-items:center;gap:4px;">
                <span>🧭</span>
                <span style="color:rgba(255,255,255,0.8);">Dir: ${weather.windDeg !== undefined ? weather.windDeg + '°' : '--'}</span>
                </div>
                <div style="display:flex;align-items:center;gap:4px;">
                <span>🌡️</span>
                <span style="color:rgba(255,255,255,0.8);">Feels like: ${weather.feelsLike ? Math.round(weather.feelsLike) + '°C' : '--'}</span>
                </div>
                ${weather.snow ? `
                <div style="display:flex;align-items:center;gap:4px;">
                <span>❄️</span>
                <span style="color:rgba(255,255,255,0.8);">Snow: ${weather.snow}mm</span>
                </div>` : ''}
                </div>
                
                <div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.1);">
                <span style="color:rgba(255,255,255,0.7);font-size:0.8rem;">${weather.description}</span>
                </div>
            </div>
            `).join('')}
            </div>
            
            ${weatherData.analysis.recommendations.length > 0 ? `
            <div class="weather-recommendations" style="margin-top:16px;padding:12px;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.2);border-radius:12px;">
            <div style="color:rgba(255,255,255,0.9);font-weight:600;margin-bottom:8px;display:flex;align-items:center;gap:8px;">
            <span>💡</span> Travel Tips
            </div>
            ${weatherData.analysis.recommendations.map(rec => `
            <div style="color:rgba(255,255,255,0.8);font-size:0.9rem;margin-bottom:4px;">• ${rec}</div>
            `).join('')}
            </div>` : ''}
            </div>
        `;
        
        // Update the weather container
        weatherContainer.innerHTML = weatherHTML;
        
        // Add custom scrollbar styling to weather waypoints
        const weatherWaypoints = weatherContainer.querySelector('.weather-waypoints');
        if (weatherWaypoints) {
            weatherWaypoints.style.cssText += `
                scrollbar-width: thin;
                scrollbar-color: rgba(102,126,234,0.6) rgba(255,255,255,0.1);
            `;
        }
        
        console.log('Weather display updated with', weatherData.waypoints.length, 'waypoints');
    }
    
    // Special display method for transit segment weather
    updateTransitSegmentWeatherDisplay(weatherData, departureTime, weatherContainer) {
        console.log('[RouteManager] Updating transit segment weather display:', {
            segmentsCount: weatherData.segments?.length || 0,
            hasSegments: !!weatherData.segments?.length,
            firstSegment: weatherData.segments?.[0],
            hasDepartureWeather: !!weatherData.segments?.[0]?.departure?.weather,
            hasArrivalWeather: !!weatherData.segments?.[0]?.arrival?.weather
        });
        
        // Check if we have segments to display
        if (!weatherData.segments || weatherData.segments.length === 0) {
            console.warn('[RouteManager] No transit segments available for weather display');
            // Display a message about missing weather data
            weatherContainer.innerHTML = `
                <div class="weather-analysis transit-weather" style="background:rgba(255,255,255,0.08);border-radius:16px;padding:20px;text-align:center;">
                    <h3 style="color:rgba(255,255,255,0.95);margin-bottom:8px;">🌦️ Transit Weather Report</h3>
                    <div style="color:rgba(255,255,255,0.7);margin-bottom:12px;">
                        <p>No weather data available for transit segments</p>
                    </div>
                    <div style="background:rgba(102,126,234,0.1);border-radius:8px;padding:10px;margin-top:15px;">
                        <p style="color:rgba(102,126,234,0.9);font-size:0.9rem;">💡 Transit Weather Tips</p>
                        <p style="color:rgba(255,255,255,0.8);font-size:0.85rem;margin-top:5px;">• Check weather before departure</p>
                    </div>
                </div>
            `;
            return;
        }
        
        // Count segments with actual weather data
        const segmentsWithWeather = weatherData.segments.filter(segment => 
            (segment.departure?.weather && segment.arrival?.weather)
        );
        
        console.log(`[RouteManager] Found ${segmentsWithWeather.length} of ${weatherData.segments.length} segments with complete weather data`);
        
        // If we don't have any segments with complete weather data
        if (segmentsWithWeather.length === 0) {
            console.warn('[RouteManager] No transit segments have complete weather data');
            weatherContainer.innerHTML = `
                <div class="weather-analysis transit-weather" style="background:rgba(255,255,255,0.08);border-radius:16px;padding:20px;text-align:center;">
                    <h3 style="color:rgba(255,255,255,0.95);margin-bottom:8px;">🌦️ Transit Weather Report</h3>
                    <div style="color:rgba(255,255,255,0.7);margin-bottom:12px;">
                        <p>No complete weather data available for transit segments</p>
                    </div>
                    <div style="background:rgba(102,126,234,0.1);border-radius:8px;padding:10px;margin-top:15px;">
                        <p style="color:rgba(102,126,234,0.9);font-size:0.9rem;">💡 Transit Weather Tips</p>
                        <p style="color:rgba(255,255,255,0.8);font-size:0.85rem;margin-top:5px;">• Check weather before departure</p>
                    </div>
                </div>
            `;
            return;
        }
        
        console.log('Updating transit segment weather display with', weatherData.segments.length, 'segments');
        
        // Add transit segment markers to the map if supported
        if (this.mapManager && typeof this.mapManager.addTransitSegmentWeatherMarkers === 'function') {
            this.mapManager.addTransitSegmentWeatherMarkers(weatherData.segments);
        } else if (this.mapManager && typeof this.mapManager.addWeatherWaypoints === 'function') {
            // Fallback to standard markers
            console.log('Falling back to standard weather markers for transit segments');
            
            const waypoints = [];
            weatherData.segments.forEach(segment => {
                if (segment.departure?.weather && segment.departure?.point) {
                    waypoints.push({
                        ...segment.departure.weather,
                        waypoint: {
                            lat: segment.departure.point.lat,
                            lng: segment.departure.point.lng
                        }
                    });
                }
                if (segment.arrival?.weather && segment.arrival?.point) {
                    waypoints.push({
                        ...segment.arrival.weather,
                        waypoint: {
                            lat: segment.arrival.point.lat,
                            lng: segment.arrival.point.lng
                        }
                    });
                }
            });
            
            if (waypoints.length > 0) {
                this.mapManager.addWeatherWaypoints(waypoints);
            }
        }
        
        // Create transit segment weather display HTML
        const weatherHTML = `
            <div class="weather-analysis transit-weather">
                <div class="weather-header">
                    <h3 style="color:rgba(255,255,255,0.95);position:relative;z-index:2;margin-bottom:8px;">
                        🌦️ Transit Weather Report
                    </h3>
                    
                    ${departureTime ? (() => {
                        const now = new Date();
                        const isNow = Math.abs(departureTime.getTime() - now.getTime()) < 60000;
                        const isFuture = departureTime.getTime() > now.getTime() + 60000;
                        
                        if (isNow) {
                            return `<div style="color:rgba(255,255,255,0.7);font-size:0.85rem;margin-bottom:12px;">📅 Current weather conditions</div>`;
                        } else if (isFuture) {
                            return `<div style="color:rgba(102,126,234,0.9);font-size:0.85rem;margin-bottom:12px;padding:6px 10px;background:rgba(102,126,234,0.1);border-radius:8px;border:1px solid rgba(102,126,234,0.2);">
                                📅 Forecast for ${departureTime.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} at ${departureTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                            </div>`;
                        } else {
                            return `<div style="color:rgba(255,255,255,0.7);font-size:0.85rem;margin-bottom:12px;">📅 Using current weather (past time selected)</div>`;
                        }
                    })() : `<div style="color:rgba(255,255,255,0.7);font-size:0.85rem;margin-bottom:12px;">📅 Current weather conditions</div>`}
                    
                    <div class="overall-score" style="background:rgba(255,255,255,0.1);border-radius:12px;padding:12px;margin-bottom:20px;">
                        <div class="score-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                            <span style="color:rgba(255,255,255,0.8);font-weight:600;">Overall Weather Score</span>
                            <span style="color:${this.getScoreColor(weatherData.analysis.overallScore)};font-weight:700;font-size:1.2rem;">${weatherData.analysis.overallScore}/100</span>
                        </div>
                        <div style="display:flex;align-items:center;gap:8px;">
                            <span style="width:8px;height:8px;border-radius:50%;background:${this.getScoreColor(weatherData.analysis.overallScore)};"></span>
                            <span style="color:rgba(255,255,255,0.9);font-size:0.9rem;">${this.getScoreDescription(weatherData.analysis.overallScore)}</span>
                        </div>
                    </div>
                </div>
                
                <!-- Transit segments weather -->
                <div class="transit-weather-segments" style="max-height:350px;overflow-y:auto;">
                    ${weatherData.segments.map((segment, index) => {
                        const depWeather = segment.departure?.weather;
                        const arrWeather = segment.arrival?.weather;
                        
                        if (!depWeather || !arrWeather) return '';
                        
                        // Get mode icon and segment color
                        const modeIcon = this.getModeIcon(segment.mode);
                        const segmentColor = this.getTransitSegmentColor(segment.mode, segment.mode);
                        
                        return `
                        <div class="transit-segment" style="
                            margin-bottom: 16px;
                            background: rgba(255,255,255,0.08);
                            border-radius: 16px;
                            overflow: hidden;
                        ">
                            <div class="segment-header" style="
                                background: ${segmentColor};
                                padding: 10px 16px;
                                display: flex;
                                justify-content: space-between;
                                align-items: center;
                            ">
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <span style="font-size: 1.2rem;">${modeIcon}</span>
                                    <span style="font-weight: 600; color: white;">
                                        ${segment.mode.charAt(0).toUpperCase() + segment.mode.slice(1)} 
                                        ${segment.line ? `· ${segment.line}` : ''}
                                    </span>
                                </div>
                                <div style="color: white; font-size: 0.85rem;">
                                    ${this.formatSegmentDistance(segment.distance)} · ${this.formatSegmentDuration(segment.duration)}
                                </div>
                            </div>
                            
                            <div class="segment-weather" style="
                                display: grid;
                                grid-template-columns: 1fr 1fr;
                                gap: 2px;
                                background: rgba(255,255,255,0.05);
                            ">
                                <!-- Departure weather -->
                                <div class="segment-point" style="
                                    padding: 16px;
                                    background: rgba(255,255,255,0.05);
                                ">
                                    <div style="
                                        display: flex;
                                        justify-content: space-between;
                                        align-items: center;
                                        margin-bottom: 10px;
                                    ">
                                        <div style="color: rgba(255,255,255,0.9); font-weight: 600;">
                                            <span style="font-size: 0.75rem; color: rgba(255,255,255,0.6); display: block; margin-bottom: 3px;">Departure</span>
                                            ${depWeather.location || 'Departure'}
                                        </div>
                                        <div style="
                                            background: rgba(255,255,255,0.1);
                                            border-radius: 50%;
                                            width: 40px;
                                            height: 40px;
                                            display: flex;
                                            align-items: center;
                                            justify-content: center;
                                            font-weight: 700;
                                            color: #4ade80;
                                        ">
                                            ${Math.round(depWeather.temperature)}°
                                        </div>
                                    </div>
                                    
                                    <div style="font-size: 0.85rem; margin-bottom: 8px;">
                                        <div style="display: flex; justify-content: space-between;">
                                            <span style="color: rgba(255,255,255,0.7);">🕐 Time:</span>
                                            <span style="color: rgba(255,255,255,0.9);">${depWeather.estimatedArrivalTimeFormatted || segment.departure?.time?.toLocaleTimeString() || 'N/A'}</span>
                                        </div>
                                        <div style="display: flex; justify-content: space-between; margin-top: 4px;">
                                            <span style="color: rgba(255,255,255,0.7);">☔ Rain:</span>
                                            <span style="color: rgba(255,255,255,0.9);">${depWeather.rainProbability}%</span>
                                        </div>
                                        <div style="display: flex; justify-content: space-between; margin-top: 4px;">
                                            <span style="color: rgba(255,255,255,0.7);">💨 Wind:</span>
                                            <span style="color: rgba(255,255,255,0.9);">${depWeather.windSpeed.toFixed(1)} km/h</span>
                                        </div>
                                        <div style="display: flex; justify-content: space-between; margin-top: 4px;">
                                            <span style="color: rgba(255,255,255,0.7);">🌡️ Feels:</span>
                                            <span style="color: rgba(255,255,255,0.9);">${depWeather.feelsLike ? Math.round(depWeather.feelsLike) + '°C' : '--'}</span>
                                        </div>
                                    </div>
                                    
                                    <div style="
                                        background: rgba(255,255,255,0.08);
                                        border-radius: 8px;
                                        padding: 6px;
                                        text-align: center;
                                        color: rgba(255,255,255,0.7);
                                        font-size: 0.8rem;
                                    ">
                                        ${depWeather.description}
                                    </div>
                                </div>
                                
                                <!-- Arrival weather -->
                                <div class="segment-point" style="
                                    padding: 16px;
                                    background: rgba(255,255,255,0.05);
                                ">
                                    <div style="
                                        display: flex;
                                        justify-content: space-between;
                                        align-items: center;
                                        margin-bottom: 10px;
                                    ">
                                        <div style="color: rgba(255,255,255,0.9); font-weight: 600;">
                                            <span style="font-size: 0.75rem; color: rgba(255,255,255,0.6); display: block; margin-bottom: 3px;">Arrival</span>
                                            ${arrWeather.location || 'Arrival'}
                                        </div>
                                        <div style="
                                            background: rgba(255,255,255,0.1);
                                            border-radius: 50%;
                                            width: 40px;
                                            height: 40px;
                                            display: flex;
                                            align-items: center;
                                            justify-content: center;
                                            font-weight: 700;
                                            color: #4ade80;
                                        ">
                                            ${Math.round(arrWeather.temperature)}°
                                        </div>
                                    </div>
                                    
                                    <div style="font-size: 0.85rem; margin-bottom: 8px;">
                                        <div style="display: flex; justify-content: space-between;">
                                            <span style="color: rgba(255,255,255,0.7);">🕐 Time:</span>
                                            <span style="color: rgba(255,255,255,0.9);">${arrWeather.estimatedArrivalTimeFormatted || segment.arrival?.time?.toLocaleTimeString() || 'N/A'}</span>
                                        </div>
                                        <div style="display: flex; justify-content: space-between; margin-top: 4px;">
                                            <span style="color: rgba(255,255,255,0.7);">☔ Rain:</span>
                                            <span style="color: rgba(255,255,255,0.9);">${arrWeather.rainProbability}%</span>
                                        </div>
                                        <div style="display: flex; justify-content: space-between; margin-top: 4px;">
                                            <span style="color: rgba(255,255,255,0.7);">💨 Wind:</span>
                                            <span style="color: rgba(255,255,255,0.9);">${arrWeather.windSpeed.toFixed(1)} km/h</span>
                                        </div>
                                        <div style="display: flex; justify-content: space-between; margin-top: 4px;">
                                            <span style="color: rgba(255,255,255,0.7);">🌡️ Feels:</span>
                                            <span style="color: rgba(255,255,255,0.9);">${arrWeather.feelsLike ? Math.round(arrWeather.feelsLike) + '°C' : '--'}</span>
                                        </div>
                                    </div>
                                    
                                    <div style="
                                        background: rgba(255,255,255,0.08);
                                        border-radius: 8px;
                                        padding: 6px;
                                        text-align: center;
                                        color: rgba(255,255,255,0.7);
                                        font-size: 0.8rem;
                                    ">
                                        ${arrWeather.description}
                                    </div>
                                </div>
                                
                                ${(() => {
                                    // Add temperature change indicator if significant
                                    const tempDiff = Math.round(arrWeather.temperature - depWeather.temperature);
                                    if (Math.abs(tempDiff) >= 3) {
                                        const color = tempDiff > 0 ? '#f59e0b' : '#3b82f6';
                                        const icon = tempDiff > 0 ? '↗️' : '↘️';
                                        return `
                                            <div style="grid-column: span 2; text-align: center; background: rgba(255,255,255,0.05); padding: 6px;">
                                                <span style="font-size: 0.8rem; color: ${color};">
                                                    ${icon} Temperature changes by ${Math.abs(tempDiff)}°C during this segment
                                                </span>
                                            </div>
                                        `;
                                    }
                                    return '';
                                })()}
                            </div>
                        </div>
                        `;
                    }).join('')}
                </div>
                
                ${weatherData.analysis.recommendations.length > 0 ? `
                <div class="weather-recommendations" style="margin-top:16px;padding:12px;background:rgba(102,126,234,0.1);border:1px solid rgba(102,126,234,0.2);border-radius:12px;">
                    <div style="color:rgba(255,255,255,0.9);font-weight:600;margin-bottom:8px;display:flex;align-items:center;gap:8px;">
                        <span>💡</span> Transit Weather Tips
                    </div>
                    ${weatherData.analysis.recommendations.map(rec => `
                        <div style="color:rgba(255,255,255,0.8);font-size:0.9rem;margin-bottom:6px;">• ${rec}</div>
                    `).join('')}
                </div>` : ''}
            </div>
        `;
        
        // Update the weather container
        weatherContainer.innerHTML = weatherHTML;
        
        // Add custom scrollbar styling to transit segment container
        const transitSegments = weatherContainer.querySelector('.transit-weather-segments');
        if (transitSegments) {
            transitSegments.style.cssText += `
                scrollbar-width: thin;
                scrollbar-color: rgba(102,126,234,0.6) rgba(255,255,255,0.1);
            `;
        }
        
        console.log('Transit segment weather display updated with', weatherData.segments.length, 'segments');
    }
    
    // Enhanced waypoint extraction for mixed-mode routes (cycling + walking)
    extractMixedModeWaypoints(coordinates, totalDistance, routeSegments = null) {
        if (!coordinates || coordinates.length === 0) {
            return [];
        }

        console.log('🚴‍♂️🚶‍♂️ Extracting waypoints for mixed-mode route:', {
            totalDistance: (totalDistance / 1000).toFixed(2) + 'km',
            coordinatesLength: coordinates.length,
            hasSegments: routeSegments !== null
        });

        // If we have route segments with mode information, use them
        if (routeSegments && routeSegments.length > 0) {
            return this.extractWaypointsFromRouteSegments(coordinates, routeSegments, totalDistance);
        }

        // Fallback: simulate mixed-mode segments for demonstration
        // In a real implementation, this would come from the routing API
        const simulatedSegments = this.simulateMixedModeSegments(coordinates, totalDistance);
        return this.extractWaypointsFromRouteSegments(coordinates, simulatedSegments, totalDistance);
    }

    // Extract waypoints from route segments with mode information
    extractWaypointsFromRouteSegments(coordinates, routeSegments, totalDistance) {
        const waypoints = [];
        let currentDistance = 0;

        // Always add start point
        waypoints.push({
            lat: coordinates[0][0],
            lng: coordinates[0][1],
            index: 0,
            distance: 0,
            type: 'origin',
            mode: routeSegments[0]?.mode || 'bicycle',
            segmentId: 0
        });

        // Add waypoints for each segment transition
        routeSegments.forEach((segment, segmentIndex) => {
            // Add start of segment (mode transition points)
            if (segmentIndex > 0) {
                const transitionIndex = Math.floor((segment.startIndex || 0) / coordinates.length * coordinates.length);
                const safeIndex = Math.min(Math.max(transitionIndex, 0), coordinates.length - 1);
                
                waypoints.push({
                    lat: coordinates[safeIndex][0],
                    lng: coordinates[safeIndex][1],
                    index: safeIndex,
                    distance: segment.startDistance || currentDistance,
                    type: 'mode_transition',
                    mode: segment.mode,
                    modeTransition: {
                        from: routeSegments[segmentIndex - 1]?.mode || 'bicycle',
                        to: segment.mode
                    },
                    segmentId: segmentIndex
                });
            }

            // Add mid-segment waypoints for longer segments
            if (segment.distance > 1000) { // Add waypoint for segments longer than 1km
                const midIndex = Math.floor(((segment.startIndex || 0) + (segment.endIndex || coordinates.length - 1)) / 2);
                const safeMidIndex = Math.min(Math.max(midIndex, 0), coordinates.length - 1);
                
                waypoints.push({
                    lat: coordinates[safeMidIndex][0],
                    lng: coordinates[safeMidIndex][1],
                    index: safeMidIndex,
                    distance: (segment.startDistance || 0) + (segment.distance / 2),
                    type: 'segment_middle',
                    mode: segment.mode,
                    segmentId: segmentIndex
                });
            }

            currentDistance += segment.distance || 0;
        });

        // Always add end point
        waypoints.push({
            lat: coordinates[coordinates.length - 1][0],
            lng: coordinates[coordinates.length - 1][1],
            index: coordinates.length - 1,
            distance: totalDistance,
            type: 'destination',
            mode: routeSegments[routeSegments.length - 1]?.mode || 'bicycle',
            segmentId: routeSegments.length - 1
        });

        console.log('🚴‍♂️🚶‍♂️ Mixed-mode waypoints extracted:', waypoints.map(wp => ({
            type: wp.type,
            mode: wp.mode,
            distance: (wp.distance / 1000).toFixed(2) + 'km',
            modeTransition: wp.modeTransition
        })));

        return waypoints;
    }

    // Simulate mixed-mode segments for demonstration (in real app, this comes from routing API)
    simulateMixedModeSegments(coordinates, totalDistance) {
        // Example: 4km route with mixed cycling and walking
        // 0-1.2km: cycling
        // 1.2-1.6km: walking (0.4km walking segment)
        // 1.6-4km: cycling
        
        const segments = [];
        const totalKm = totalDistance / 1000;
        
        if (totalKm <= 2) {
            // Short route: mostly cycling with short walking segment
            segments.push(
                {
                    mode: 'bicycle',
                    startDistance: 0,
                    distance: totalDistance * 0.7,
                    startIndex: 0,
                    endIndex: Math.floor(coordinates.length * 0.7)
                },
                {
                    mode: 'pedestrian',
                    startDistance: totalDistance * 0.7,
                    distance: totalDistance * 0.3,
                    startIndex: Math.floor(coordinates.length * 0.7),
                    endIndex: coordinates.length - 1
                }
            );
        } else if (totalKm <= 5) {
            // Medium route: cycling with walking segment in middle
            segments.push(
                {
                    mode: 'bicycle',
                    startDistance: 0,
                    distance: totalDistance * 0.4,
                    startIndex: 0,
                    endIndex: Math.floor(coordinates.length * 0.4)
                },
                {
                    mode: 'pedestrian',
                    startDistance: totalDistance * 0.4,
                    distance: totalDistance * 0.2,
                    startIndex: Math.floor(coordinates.length * 0.4),
                    endIndex: Math.floor(coordinates.length * 0.6)
                },
                {
                    mode: 'bicycle',
                    startDistance: totalDistance * 0.6,
                    distance: totalDistance * 0.4,
                    startIndex: Math.floor(coordinates.length * 0.6),
                    endIndex: coordinates.length - 1
                }
            );
        } else {
            // Long route: multiple segments
            segments.push(
                {
                    mode: 'bicycle',
                    startDistance: 0,
                    distance: totalDistance * 0.5,
                    startIndex: 0,
                    endIndex: Math.floor(coordinates.length * 0.5)
                },
                {
                    mode: 'pedestrian',
                    startDistance: totalDistance * 0.5,
                    distance: totalDistance * 0.15,
                    startIndex: Math.floor(coordinates.length * 0.5),
                    endIndex: Math.floor(coordinates.length * 0.65)
                },
                {
                    mode: 'bicycle',
                    startDistance: totalDistance * 0.65,
                    distance: totalDistance * 0.35,
                    startIndex: Math.floor(coordinates.length * 0.65),
                    endIndex: coordinates.length - 1
                }
            );
        }

        console.log('🧩 Simulated mixed-mode segments:', segments.map(s => ({
            mode: s.mode,
            distance: (s.distance / 1000).toFixed(2) + 'km',
            percentage: ((s.distance / totalDistance) * 100).toFixed(1) + '%'
        })));

        return segments;
    }

    // Update route data extraction to handle multiple modes
    extractWaypointsFromRoute(coordinates, totalDistance, routeData = {}) {
        // Check if this is a transit route
        if (routeData.mode === 'publicTransport' || routeData.isTransitRoute) {
            console.log('[RouteManager] Using transit waypoints extraction');
            return this.extractTransitWaypoints(routeData);
        }
        
        // Check if this is a mixed-mode route
        const isMixedMode = routeData.mode === 'bicycle' && routeData.hasPedestrianSegments;
        
        if (isMixedMode) {
            console.log('[RouteManager] Using mixed-mode waypoints extraction');
            return this.extractMixedModeWaypoints(coordinates, totalDistance, routeData.segments);
        } else {
            // Use existing logic for single-mode routes
            console.log('[RouteManager] Using single-mode waypoints extraction');
            return this.extractWaypointsFromRouteSingleMode(coordinates, totalDistance);
        }
    }
    
    // Extract waypoints from transit route data
    extractTransitWaypoints(routeData) {
        // If there are predefined waypoints in the transit data, use those
        if (routeData.waypoints && routeData.waypoints.length > 0) {
            console.log('[RouteManager] Using provided transit waypoints:', routeData.waypoints.length);
            
            // Process and enhance the existing waypoints
            return routeData.waypoints.map((waypoint, index) => {
                // Ensure all required fields are present
                return {
                    lat: waypoint.lat,
                    lng: waypoint.lng,
                    index: index,
                    distance: waypoint.distance || 0, // May need to be calculated if missing
                    type: index === 0 ? 'origin' : 
                          index === routeData.waypoints.length - 1 ? 'destination' : 
                          waypoint.isTransitStop ? 'transit-stop' : 'waypoint',
                    mode: waypoint.mode || 'publicTransport',
                    placeName: waypoint.placeName || waypoint.name || `Stop ${index + 1}`,
                    isTransitStop: !!waypoint.isTransitStop,
                    transportInfo: waypoint.transportInfo || null,
                    sectionIndex: waypoint.sectionIndex || index,
                    time: waypoint.time
                };
            });
        }
        
        // Fallback: No predefined waypoints, need to create from segments
        if (routeData.segments && routeData.segments.length > 0) {
            console.log('[RouteManager] Creating waypoints from transit segments:', routeData.segments.length);
            const waypoints = [];
            
            // Always add origin
            if (routeData.origin) {
                waypoints.push({
                    lat: routeData.origin.lat,
                    lng: routeData.origin.lng,
                    index: 0,
                    distance: 0,
                    type: 'origin',
                    mode: 'origin',
                    placeName: 'Origin',
                    isTransitStop: false,
                    sectionIndex: 0
                });
            }
            
            // Add waypoints for each segment transition
            routeData.segments.forEach((segment, index) => {
                if (segment.start) {
                    waypoints.push({
                        lat: segment.start.lat,
                        lng: segment.start.lng,
                        index: index + 1,
                        distance: segment.distance || 0,
                        type: 'transit-stop',
                        mode: segment.mode || 'publicTransport',
                        placeName: segment.start.name || `Transit Stop ${index + 1}`,
                        isTransitStop: true,
                        transportInfo: segment.transportInfo || null,
                        sectionIndex: index + 1
                    });
                }
            });
            
            // Always add destination
            if (routeData.destination) {
                waypoints.push({
                    lat: routeData.destination.lat,
                    lng: routeData.destination.lng,
                    index: waypoints.length,
                    distance: routeData.distance || 0,
                    type: 'destination',
                    mode: 'destination',
                    placeName: 'Destination',
                    isTransitStop: false,
                    sectionIndex: waypoints.length
                });
            }
            
            console.log('[RouteManager] Created transit waypoints from segments:', waypoints.length);
            return waypoints;
        }
        
        // Ultimate fallback: Create minimal waypoints with origin and destination
        console.log('[RouteManager] No transit waypoints or segments available, creating minimal waypoints');
        return [
            {
                lat: routeData.origin?.lat || 0,
                lng: routeData.origin?.lng || 0,
                index: 0,
                distance: 0,
                type: 'origin',
                mode: 'origin',
                placeName: 'Origin',
                isTransitStop: false,
                sectionIndex: 0
            },
            {
                lat: routeData.destination?.lat || 0,
                lng: routeData.destination?.lng || 0,
                index: 1,
                distance: routeData.distance || 0,
                type: 'destination',
                mode: 'destination',
                placeName: 'Destination',
                isTransitStop: false,
                sectionIndex: 1
            }
        ];
    }

    // Rename existing method for clarity
    extractWaypointsFromRouteSingleMode(coordinates, totalDistance) {
        if (!coordinates || coordinates.length === 0) {
            return [];
        }
        
        // Default to 3 waypoints for very short routes
        let numWaypoints = Math.max(3, Math.ceil(totalDistance / 1000));
        
        console.log(`Extracting ${numWaypoints} waypoints from route (${totalDistance}m)`);
        
        const waypoints = [];
        const step = Math.max(1, Math.floor(coordinates.length / (numWaypoints - 1)));
        
        // MANDATORY: Always include start point (origin)
        waypoints.push({
            lat: coordinates[0][0],
            lng: coordinates[0][1],
            index: 0,
            distance: 0,
            type: 'origin'
        });
        
        // Add intermediate waypoints
        for (let i = 1; i < numWaypoints - 1; i++) {
            const index = Math.min(i * step, coordinates.length - 1);
            waypoints.push({
                lat: coordinates[index][0],
                lng: coordinates[index][1],
                index: index,
                distance: this.calculateDistanceFromStart(coordinates, index),
                type: 'intermediate'
            });
        }
        
        // MANDATORY: Always include end point (destination)
        waypoints.push({
            lat: coordinates[coordinates.length - 1][0],
            lng: coordinates[coordinates.length - 1][1],
            index: coordinates.length - 1,
            distance: totalDistance,
            type: 'destination'
        });
        
        console.log('Extracted waypoints:', waypoints);
        return waypoints;
    }
    
    // Deduplicate waypoints that represent the same location
    deduplicateWaypoints(weatherData) {
        if (!weatherData || !weatherData.waypoints || weatherData.waypoints.length === 0) {
            return weatherData;
        }

        console.log('🔄 Deduplicating waypoints - before:', weatherData.waypoints.length);
        
        const uniqueWaypoints = [];
        const seenLocations = new Set();
        
        weatherData.waypoints.forEach((waypoint, index) => {
            // Always keep origin and destination
            if (waypoint.waypoint?.type === 'origin' || waypoint.waypoint?.type === 'destination') {
                uniqueWaypoints.push(waypoint);
                console.log(`✅ Keeping ${waypoint.waypoint.type}: ${waypoint.location}`);
                return;
    }
    
            // For intermediate waypoints, check for duplicates
            let locationKey = waypoint.locationName || waypoint.location || `${waypoint.waypoint?.lat}_${waypoint.waypoint?.lng}`;
            
            // Clean up location key to remove emoji prefixes for comparison
            const cleanLocationKey = locationKey.replace(/^[🚩🏁📍�]\s*/, '').trim();
            
            // Skip if we've already seen this location (but keep if it's significantly different in distance)
            if (seenLocations.has(cleanLocationKey)) {
                // Check if this waypoint is significantly far from the previous same-location waypoint
                const previousWaypoint = uniqueWaypoints.find(wp => {
                    const prevCleanKey = (wp.locationName || wp.location || '').replace(/^[🚩🏁📍�]\s*/, '').trim();
                    return prevCleanKey === cleanLocationKey;
                });
                
                if (previousWaypoint) {
                    const distanceDiff = Math.abs(waypoint.distanceFromStart - previousWaypoint.distanceFromStart);
                    // Only keep if waypoints are more than 2km apart with same location name
                    if (distanceDiff > 2000) {
                        console.log(`✅ Keeping duplicate location (${distanceDiff.toFixed(0)}m apart): ${waypoint.location}`);
                        uniqueWaypoints.push(waypoint);
            } else {
                        console.log(`❌ Removing duplicate waypoint (${distanceDiff.toFixed(0)}m apart): ${waypoint.location}`);
                    }
                } else {
                    console.log(`❌ Removing duplicate waypoint: ${waypoint.location}`);
                }
                return;
    }
    
            // Add to unique waypoints and mark location as seen
            seenLocations.add(cleanLocationKey);
            uniqueWaypoints.push(waypoint);
            console.log(`✅ Keeping unique waypoint: ${waypoint.location}`);
        });
        
        console.log('🔄 Deduplication complete - after:', uniqueWaypoints.length);
        console.log('📍 Final waypoint locations:', uniqueWaypoints.map(wp => wp.location));
        
        return {
            ...weatherData,
            waypoints: uniqueWaypoints,
            summary: {
                ...weatherData.summary,
                totalWaypoints: uniqueWaypoints.length,
                deduplicationApplied: true,
                originalWaypointCount: weatherData.waypoints.length,
                removedDuplicates: weatherData.waypoints.length - uniqueWaypoints.length
            }
        };
    }
    
    drawTransitSegments(segments) {
        if (!segments || !Array.isArray(segments) || segments.length === 0) {
            console.warn('[RouteManager] No valid segments provided for drawing segment-based route');
            return;
        }

        console.log('[RouteManager] Drawing', segments.length, 'segments in segment-based route');
        this.mapManager.clearRoute();

        let successfullyDrawnSegments = 0;

        segments.forEach((segment, index) => {
            console.log(`[RouteManager] Processing segment ${index}:`, {
                type: segment.type,
                mode: segment.mode,
                hasPolyline: !!segment.polyline,
                polylineLength: segment.polyline?.length || 0
            });

            let coordinates = null;
            if (segment.polyline) {
                try {
                    coordinates = this.decodePolyline(segment.polyline);
                } catch (error) {
                    console.error(`[RouteManager] Failed to decode polyline for segment ${index}:`, error.message);
                }
            }

            // If decoding fails or no polyline, draw direct line between departure and arrival
            if (!coordinates || !Array.isArray(coordinates) || coordinates.length === 0) {
                const dep = segment.departureLoc || (segment.departure?.place?.location ? segment.departure.place.location : null);
                const arr = segment.arrivalLoc || (segment.arrival?.place?.location ? segment.arrival.place.location : null);
                if (dep && arr) {
                    const directLine = [ [dep.lat, dep.lng], [arr.lat, arr.lng] ];
                    const color = this.getTransitSegmentColor(segment.type, segment.mode);
                    this.mapManager.drawRoute(directLine, color, {
                        weight: 2,
                        opacity: 0.6,
                        dashArray: '5, 15',
                        transitInfo: { mode: segment.mode, isDirect: true }
                    });
                    successfullyDrawnSegments++;
                    console.log(`[RouteManager] Drew direct line for segment ${index}`);
            } else {
                    console.warn(`[RouteManager] Cannot draw segment ${index} - missing departure or arrival coordinates`);
            }
                return;
            }

            // Use mode-specific color and icon
            const color = this.getTransitSegmentColor(segment.type, segment.mode);
            const icon = this.getModeIcon(segment.mode);
            
            // Calculate line style based on segment type/mode
            let weight = 4;
            let opacity = 0.8;
            let dashArray = null;

            if (segment.type === 'transit') {
                weight = 5;
            } else if (segment.type === 'pedestrian') {
                weight = 3;
                dashArray = '5, 10';
            } else if (segment.mode === 'bicycle') {
                weight = 4;
            } else if (segment.type === 'walking' || segment.mode === 'walking') {
                weight = 3;
                dashArray = '5, 10';
            }

            this.mapManager.drawRoute(coordinates, color, {
                weight: weight,
                opacity: opacity,
                dashArray: dashArray,
                transitInfo: {
                    mode: segment.mode,
                    line: segment.line || segment.lineName || null,
                    departureTime: segment.departureTime || null,
                    arrivalTime: segment.arrivalTime || null,
                    stops: segment.stops || null
                }
            });
            
            // Markers for start and end of each segment
            if (coordinates.length > 0) {
                const start = coordinates[0];
                const locationName = segment.departure?.place?.name || segment.name || `Segment ${index+1}`;
                this.mapManager.addMarker(start[0], start[1], segment.mode, `${icon} ${locationName}`);
            }
            if (coordinates.length > 1) {
                const end = coordinates[coordinates.length-1];
                const locationName = segment.arrival?.place?.name || segment.name || `Segment ${index+1}`;
                this.mapManager.addMarker(end[0], end[1], segment.mode, `${icon} ${locationName}`);
                    }

            console.log(`[RouteManager] Drew ${segment.type} segment (${segment.mode}) with ${coordinates.length} coordinates, color ${color}`);
            successfullyDrawnSegments++;
        });

        console.log(`[RouteManager] Successfully drew ${successfullyDrawnSegments} out of ${segments.length} segments`);
    }

    getTransitSegmentColor(type, mode) {
        // Enhanced color scheme for different transit segment types
        const colors = {
            // Walking/cycling segments
            'pedestrian': '#ff6b6b',        // Red for walking
            'walk': '#ff6b6b',              // Red for walking (alternative naming)
            'walking': '#ff6b6b',           // Red for walking (another alternative)
            'bicycle': '#22c55e',           // Green for cycling
            'cycling': '#22c55e',           // Green for cycling (alternative)
            
            // For mixed mode bicycle routes
            'bicycle_mixed': '#38a169',     // Darker green for bicycle mixed mode

            // Rail-based transit
            'regionalTrain': '#4ecdc4',     // Teal for regional trains
            'train': '#4ecdc4',             // Teal for trains
            'highSpeedTrain': '#0ea5e9',    // Bright blue for high speed trains
            'subway': '#45b7d1',            // Blue for subway/metro
            'metro': '#45b7d1',             // Blue for metro (alternative naming)
            'underground': '#45b7d1',       // Blue for underground (alternative naming)
            'tram': '#ffeaa7',              // Yellow for trams

            // Road-based transit
            'bus': '#29d12eff',               // Green for buses
            'expressBus': '#29d12eff',        // Lime green for express buses
            'shuttleBus': '#29d12eff',        // Light green for shuttle buses

            // Water transit
            'ferry': '#74b9ff',             // Light blue for ferries
            'boat': '#74b9ff',              // Light blue for boats

            // Special transit
            'cable': '#f97316',             // Orange for cable cars/gondolas
            'funicular': '#f97316',         // Orange for funicular railways

            // Default
            'transit': '#45b7ff',           // Sky blue for generic transit
            'publicTransport': '#45b7ff'    // Sky blue for generic public transport
        };
        
        // Normalize inputs to handle different API formats
        const normalizedMode = mode?.toLowerCase();
        const normalizedType = type?.toLowerCase();
        
        // First try to match by mode, then by type, then use default
        let color = colors[normalizedMode] || colors[normalizedType];
        
        // If no match, try to find a partial match
        if (!color && normalizedMode) {
            // Check if the mode contains any of our known transit types
            for (const [key, value] of Object.entries(colors)) {
                if (normalizedMode.includes(key.toLowerCase())) {
                    color = value;
                    break;
                }
            }
        }
        
        // If still no match, use default transit color
        if (!color) {
            color = colors['transit'];
        }
        
        return color;
    }

    getModeIcon(mode) {
        const icons = {
            car: '🚗',
            bicycle: '🚲',
            pedestrian: '🚶',
            bus: '🚌',
            train: '🚆',
            subway: '🚇',
            tram: '🚊',
            ferry: '⛴️',
            transit: '🚍',
            regionalTrain: '🚄'
        };
        return icons[mode] || '❓';
    }

    fitMapToWaypoints(waypoints) {
        if (!waypoints || waypoints.length === 0) return;
        
        const latitudes = waypoints.map(wp => wp.lat);
        const longitudes = waypoints.map(wp => wp.lng);
        
        const bounds = L.latLngBounds(
            [Math.min(...latitudes), Math.min(...longitudes)],
            [Math.max(...latitudes), Math.max(...longitudes)]
        );
        
        this.mapManager.map.fitBounds(bounds, { padding: [20, 20] });
    }

    updateTransitRouteInfo(routeData, departureTime) {
        const routeInfoEl = document.getElementById('route-info');
        const distanceEl = document.getElementById('route-distance');
        const durationEl = document.getElementById('route-duration');
        
        if (routeInfoEl) {
            routeInfoEl.classList.remove('hidden');
            routeInfoEl.classList.add('transit-route');
        }
        
        // Format distance
        const distance = routeData.distance || routeData.summary?.length || 0;
        const distanceKm = distance / 1000;
        if (distanceEl) {
            distanceEl.textContent = `${Math.round(distance)} m (${distanceKm.toFixed(2)} km)`;
        }
        
        // Format duration
        const duration = routeData.duration || routeData.summary?.duration || 0;
        const hours = Math.floor(duration / 3600);
        const minutes = Math.floor((duration % 3600) / 60);
        if (durationEl) {
            durationEl.textContent = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
        }
        
        // Add transit-specific information if available
        const extraInfoEl = document.getElementById('extra-route-info');
        if (extraInfoEl) {
            // Check if we have detailed transit info
            if (routeData.segments && routeData.segments.length > 0) {
                let transitModes = new Set();
                let lineInfo = [];
                
                // Extract transit mode and line information
                routeData.segments.forEach(segment => {
                    if (segment.mode && segment.mode !== 'pedestrian' && segment.mode !== 'walk') {
                        transitModes.add(segment.mode);
                        
                        // Add line information if available
                        if (segment.line || segment.lineName) {
                            const lineName = segment.line || segment.lineName;
                            const icon = this.getModeIcon(segment.mode);
                            lineInfo.push(`${icon} ${segment.mode.charAt(0).toUpperCase() + segment.mode.slice(1)} ${lineName}`);
                        }
                    }
                });
                
                // Format departure and arrival times
                const departureTimeStr = departureTime ? 
                    `${departureTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}` : 
                    'Not specified';
                
                const arrivalTime = new Date(departureTime.getTime() + (duration * 1000));
                const arrivalTimeStr = `${arrivalTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
                
                // Create the HTML content
                let extraInfoHTML = `
                    <div class="transit-details">
                        <div class="transit-time-info">
                            <span class="departure-time">🕒 Departure: ${departureTimeStr}</span>
                            <span class="arrow">→</span>
                            <span class="arrival-time">🏁 Arrival: ${arrivalTimeStr}</span>
                        </div>
                `;
                
                // Add transit modes summary
                if (transitModes.size > 0) {
                    const modesArray = Array.from(transitModes);
                    const modeIcons = modesArray.map(mode => this.getModeIcon(mode)).join(' ');
                    const modesText = modesArray.map(mode => 
                        mode.charAt(0).toUpperCase() + mode.slice(1)
                    ).join(', ');
                    
                    extraInfoHTML += `
                        <div class="transit-modes-info">
                            <span>${modeIcons} ${modesText}</span>
                        </div>
                    `;
                }
                
                // Add line information if available
                if (lineInfo.length > 0) {
                    extraInfoHTML += `
                        <div class="transit-lines-info">
                            <span>${lineInfo.slice(0, 3).join(' → ')}</span>
                            ${lineInfo.length > 3 ? `<span>+ ${lineInfo.length - 3} more</span>` : ''}
                        </div>
                    `;
                }
                
                // Add transfers info if available
                const transferCount = Math.max(0, transitModes.size - 1);
                extraInfoHTML += `
                        <div class="transit-transfers-info">
                            <span>🔄 Transfers: ${transferCount}</span>
                        </div>
                    </div>
                `;
                
                // Update the extra info element
                extraInfoEl.innerHTML = extraInfoHTML;
                extraInfoEl.classList.remove('hidden');
            } else {
                // Basic info for routes without detailed segment data
                extraInfoEl.innerHTML = `
                    <div class="transit-details">
                        <div class="transit-mode-info">
                            <span>🚍 Public Transportation</span>
                        </div>
                        <div class="transit-time-info">
                            <span>Departure: ${departureTime ? departureTime.toLocaleTimeString() : 'Not specified'}</span>
                        </div>
                    </div>
                `;
                extraInfoEl.classList.remove('hidden');
            }
        }
        
        console.log(`[RouteManager] Updated transit route info: ${distanceEl?.textContent}, ${durationEl?.textContent}`);
    }

    async getTransitWeatherData(routeData, departureTime) {
        console.log('[RouteManager] Getting segment-wise weather data for transit route...');
        
        if (!window.weatherManager) {
            console.warn('[RouteManager] No weather manager available');
            return {
                segments: [],
                analysis: { overallScore: 0 },
                summary: {}
            };
        }
        
        try {
            // Check if we have segments in the route data
            if (!routeData.segments || routeData.segments.length === 0) {
                console.warn('[RouteManager] No segments found in transit route data');
                // Fall back to waypoint-based approach
                return this.getTransitWaypointWeather(routeData, departureTime);
            }
            
            console.log('[RouteManager] Processing', routeData.segments.length, 'transit segments for weather data');
            
            // Process each segment to get weather at departure and arrival points
            const segmentPromises = routeData.segments.map(async (segment, index) => {
                // Check for departure and arrival in the segment structure
                if (!segment.departure || !segment.arrival) {
                    console.warn(`[RouteManager] Missing departure/arrival in segment ${index}`);
                    return null;
                }
                
                // Extract location data from departure and arrival with detailed logging
                console.log(`[RouteManager] Processing segment ${index} for weather data:`, {
                    type: segment.type,
                    mode: segment.mode,
                    departureInfo: segment.departure,
                    arrivalInfo: segment.arrival,
                    hasDepLocReference: !!segment.departureLoc,
                    hasArrLocReference: !!segment.arrivalLoc
                });
                
                // Try multiple ways to extract coordinates, with better logging
                let depLat, depLng, arrLat, arrLng;
                
                // First check if we have the pre-processed coordinate references
                if (segment.departureLoc?.lat) {
                    depLat = segment.departureLoc.lat;
                    depLng = segment.departureLoc.lng;
                    console.log(`[RouteManager] Using pre-processed departure coordinates: ${depLat},${depLng}`);
                } 
                // Then try multiple paths
                else if (segment.departure?.place?.location?.lat) {
                    depLat = segment.departure.place.location.lat;
                    depLng = segment.departure.place.location.lng;
                    console.log(`[RouteManager] Found departure coordinates in place.location: ${depLat},${depLng}`);
                } else if (segment.departure?.place?.lat) {
                    depLat = segment.departure.place.lat;
                    depLng = segment.departure.place.lng;
                    console.log(`[RouteManager] Found departure coordinates in place: ${depLat},${depLng}`);
                } else if (segment.departure?.lat) {
                    depLat = segment.departure.lat;
                    depLng = segment.departure.lng;
                    console.log(`[RouteManager] Found departure coordinates directly: ${depLat},${depLng}`);
                } else {
                    console.warn(`[RouteManager] No departure coordinates found in segment ${index}`);
                }
                
                // First check if we have the pre-processed coordinate references
                if (segment.arrivalLoc?.lat) {
                    arrLat = segment.arrivalLoc.lat;
                    arrLng = segment.arrivalLoc.lng;
                    console.log(`[RouteManager] Using pre-processed arrival coordinates: ${arrLat},${arrLng}`);
                }
                // Then try multiple paths
                else if (segment.arrival?.place?.location?.lat) {
                    arrLat = segment.arrival.place.location.lat;
                    arrLng = segment.arrival.place.location.lng;
                    console.log(`[RouteManager] Found arrival coordinates in place.location: ${arrLat},${arrLng}`);
                } else if (segment.arrival?.place?.lat) {
                    arrLat = segment.arrival.place.lat;
                    arrLng = segment.arrival.place.lng;
                    console.log(`[RouteManager] Found arrival coordinates in place: ${arrLat},${arrLng}`);
                } else if (segment.arrival?.lat) {
                    arrLat = segment.arrival.lat;
                    arrLng = segment.arrival.lng;
                    console.log(`[RouteManager] Found arrival coordinates directly: ${arrLat},${arrLng}`);
                } else {
                    console.warn(`[RouteManager] No arrival coordinates found in segment ${index}`);
                }
                
                // Extract names
                const depName = segment.departure.place?.name || segment.departure.name || `Stop ${index}`;
                const arrName = segment.arrival.place?.name || segment.arrival.name || `Stop ${index + 1}`;
                
                // Skip if we don't have proper coordinates
                if (!depLat || !depLng || !arrLat || !arrLng) {
                    console.warn(`[RouteManager] Missing coordinates in segment ${index} - cannot get weather`);
                    return null;
                }
                
                // Create start/end properties needed by other parts of the code
                segment.start = { lat: depLat, lng: depLng, name: depName };
                segment.end = { lat: arrLat, lng: arrLng, name: arrName };
                
                // Get departure time for this segment
                const segmentDepartureTime = segment.departure?.time ? 
                    new Date(segment.departure.time) : 
                    new Date(departureTime.getTime() + (segment.startOffset || 0) * 1000);
                
                // Get arrival time for this segment
                const segmentArrivalTime = segment.arrival?.time ? 
                    new Date(segment.arrival.time) : 
                    new Date(segmentDepartureTime.getTime() + (segment.duration || 0) * 1000);
                
                // Create waypoint objects for departure and arrival
                const departurePoint = {
                    lat: depLat,
                    lng: depLng,
                    estimatedArrivalTime: Math.floor(segmentDepartureTime.getTime() / 1000),
                    estimatedArrivalTimeFormatted: segmentDepartureTime.toLocaleTimeString(),
                    placeName: depName
                };
                
                const arrivalPoint = {
                    lat: arrLat,
                    lng: arrLng,
                    estimatedArrivalTime: Math.floor(segmentArrivalTime.getTime() / 1000),
                    estimatedArrivalTimeFormatted: segmentArrivalTime.toLocaleTimeString(),
                    placeName: arrName
                };
                
                // Get weather for both points
                let departureWeather, arrivalWeather;
                
                if (typeof window.weatherManager.getWeatherAtPointWithTime === 'function') {
                    // Use direct point weather if available
                    [departureWeather, arrivalWeather] = await Promise.all([
                        window.weatherManager.getWeatherAtPointWithTime(departurePoint),
                        window.weatherManager.getWeatherAtPointWithTime(arrivalPoint)
                    ]);
                } else if (typeof window.weatherManager.getWeatherAlongRouteWithTiming === 'function') {
                    // Use route weather as fallback
                    const segmentWeather = await window.weatherManager.getWeatherAlongRouteWithTiming([departurePoint, arrivalPoint]);
                    departureWeather = segmentWeather[0];
                    arrivalWeather = segmentWeather[1];
                } else {
                    // Ultimate fallback - basic weather
                    const simplePoints = [
                        { lat: departurePoint.lat, lng: departurePoint.lng },
                        { lat: arrivalPoint.lat, lng: arrivalPoint.lng }
                    ];
                    const basicWeather = await window.weatherManager.getWeatherAlongRoute(simplePoints);
                    departureWeather = { 
                        ...basicWeather[0],
                        estimatedArrivalTime: Math.floor(segmentDepartureTime.getTime() / 1000),
                        estimatedArrivalTimeFormatted: segmentDepartureTime.toLocaleTimeString()
                    };
                    arrivalWeather = {
                        ...basicWeather[1],
                        estimatedArrivalTime: Math.floor(segmentArrivalTime.getTime() / 1000),
                        estimatedArrivalTimeFormatted: segmentArrivalTime.toLocaleTimeString()
                    };
                }
                
                // Add location names if missing
                departureWeather.location = departureWeather.location || departurePoint.placeName || `Stop ${index}`;
                arrivalWeather.location = arrivalWeather.location || arrivalPoint.placeName || `Stop ${index + 1}`;
                
                // Get line information from transport if available
                let lineInfo = null;
                if (segment.transport) {
                    lineInfo = segment.transport.name || 
                              (segment.transport.category && segment.transport.number ? 
                               `${segment.transport.category} ${segment.transport.number}` : null);
                }
                
                return {
                    index: index,
                    mode: segment.mode || 'transit',
                    transportInfo: segment.transport || null,
                    line: lineInfo || segment.line || null,
                    distance: segment.distance || 0,
                    duration: segment.duration || 0,
                    departure: {
                        point: {
                            lat: departurePoint.lat,
                            lng: departurePoint.lng,
                            name: departurePoint.placeName
                        },
                        time: segmentDepartureTime,
                        weather: departureWeather
                    },
                    arrival: {
                        point: {
                            lat: arrivalPoint.lat,
                            lng: arrivalPoint.lng,
                            name: arrivalPoint.placeName
                        },
                        time: segmentArrivalTime,
                        weather: arrivalWeather
                    },
                    // Keep original segment data for reference
                    originalSegment: segment
                };
            });
            
            // Wait for all segment weather data
            const segmentsWithWeather = (await Promise.all(segmentPromises)).filter(Boolean);
            
            // Calculate overall analysis from all segment weather points
            const allWeatherPoints = [];
            segmentsWithWeather.forEach(segment => {
                if (segment.departure?.weather) allWeatherPoints.push(segment.departure.weather);
                if (segment.arrival?.weather) allWeatherPoints.push(segment.arrival.weather);
            });
            
            const overallScore = this.calculateOverallWeatherScore(allWeatherPoints);
            const recommendations = this.generateSegmentedWeatherRecommendations(segmentsWithWeather);
            
            return {
                segments: segmentsWithWeather,
                analysis: {
                    overallScore: overallScore,
                    recommendations: recommendations
                },
                summary: {
                    totalSegments: segmentsWithWeather.length,
                    routeDistance: routeData.distance || routeData.summary?.length || 0,
                    routeDuration: routeData.duration || routeData.summary?.duration || 0,
                    departureTime: departureTime,
                    isSegmentBased: true
                }
            };
            
        } catch (error) {
            console.error('[RouteManager] Error getting segment-wise transit weather:', error);
            
            // Fall back to waypoint-based approach
            try {
                console.log('[RouteManager] Falling back to waypoint-based transit weather...');
                return await this.getTransitWaypointWeather(routeData, departureTime);
            } catch (fallbackError) {
                console.error('[RouteManager] Fallback weather also failed:', fallbackError);
                
                // Generate dummy segment weather data if all else fails
                return this.generateDummyTransitSegmentWeather(routeData, departureTime);
            }
        }
    }
    
    // Fallback method that uses the previous waypoint-based approach
    async getTransitWaypointWeather(routeData, departureTime) {
        console.log('[RouteManager] Using waypoint-based transit weather as fallback...');
        
        // Make sure we have waypoints, either from route data or by generating them
        let transitWaypoints;
        if (routeData.waypoints && routeData.waypoints.length > 0) {
            transitWaypoints = routeData.waypoints;
            console.log('[RouteManager] Using', transitWaypoints.length, 'waypoints from transit route data');
        } else {
            transitWaypoints = this.extractTransitWaypoints(routeData);
            console.log('[RouteManager] Generated', transitWaypoints.length, 'transit waypoints');
        }
        
        if (!transitWaypoints || transitWaypoints.length === 0) {
            console.warn('[RouteManager] No transit waypoints available for weather data');
            return {
                waypoints: [],
                analysis: { overallScore: 0, recommendations: ['No weather data available for this route'] },
                summary: {}
            };
        }
        
        // Ensure every waypoint has a location name
        const waypointsWithNames = transitWaypoints.map((wp, idx) => ({
            ...wp,
            location: wp.placeName || wp.location || wp.name || `Stop ${idx + 1}`
        }));
        
        // Create waypoints with timing for weather requests
        const waypointsWithTiming = this.calculateTransitWaypointTimings({ ...routeData, waypoints: waypointsWithNames }, departureTime);
        console.log('[RouteManager] Calculated timing for', waypointsWithTiming.length, 'waypoints');
        
        // Get weather data with location names - try the most advanced method first, then fall back
        let weatherDataWithNames;
        if (typeof window.weatherManager.getWeatherAlongRouteWithTimingAndNames === 'function') {
            console.log('[RouteManager] Using getWeatherAlongRouteWithTimingAndNames method...');
            weatherDataWithNames = await window.weatherManager.getWeatherAlongRouteWithTimingAndNames(waypointsWithTiming);
        } else if (typeof window.weatherManager.getWeatherAlongRouteWithTiming === 'function') {
            console.log('[RouteManager] Using getWeatherAlongRouteWithTiming method...');
            weatherDataWithNames = await window.weatherManager.getWeatherAlongRouteWithTiming(waypointsWithTiming);
        } else if (typeof window.weatherManager.getWeatherAlongRoute === 'function') {
            console.log('[RouteManager] Falling back to getWeatherAlongRoute method...');
            const simpleWaypoints = waypointsWithTiming.map(wp => ({
                lat: wp.lat,
                lng: wp.lng
            }));
            weatherDataWithNames = await window.weatherManager.getWeatherAlongRoute(simpleWaypoints);
        } else {
            throw new Error('WeatherManager does not have required methods');
        }
        
        // Convert waypoint-based data to segment-based format if possible
        if (routeData.segments && routeData.segments.length > 0) {
            try {
                return this.convertWaypointWeatherToSegmentWeather(
                    weatherDataWithNames, 
                    routeData.segments,
                    waypointsWithTiming,
                    departureTime
                );
            } catch (conversionError) {
                console.error('[RouteManager] Failed to convert to segment format:', conversionError);
                // Continue with regular waypoint format below
            }
        }
        
        // Proceed with regular waypoint-based format
        if (weatherDataWithNames && weatherDataWithNames.waypoints) {
            // It already has the correct structure
            const analysis = {
                ...weatherDataWithNames.analysis,
                recommendations: weatherDataWithNames.analysis?.recommendations || 
                    this.generateWeatherRecommendations(weatherDataWithNames.waypoints)
            };
            
            return {
                waypoints: weatherDataWithNames.waypoints,
                analysis: analysis,
                summary: {
                    totalWaypoints: weatherDataWithNames.waypoints.length,
                    routeDistance: routeData.distance || routeData.summary?.length || 0,
                    routeDuration: routeData.duration || routeData.summary?.duration || 0,
                    isSegmentBased: false
                }
            };
        } else if (Array.isArray(weatherDataWithNames)) {
            // It's an array, wrap it in the expected structure
            const enhancedWeatherData = weatherDataWithNames.map((weather, index) => {
                const waypoint = index < waypointsWithNames.length ? waypointsWithNames[index] : waypointsWithNames[waypointsWithNames.length - 1];
                const waypointWithTiming = index < waypointsWithTiming.length ? waypointsWithTiming[index] : waypointsWithTiming[waypointsWithTiming.length - 1];
                
                return {
                    ...weather,
                    name: waypoint.location,
                    location: waypoint.location,
                    isTransitStop: waypoint?.isTransitStop,
                    mode: waypoint?.mode,
                    transportInfo: waypoint?.transportInfo,
                    sectionIndex: waypoint?.sectionIndex,
                    estimatedArrivalTime: waypointWithTiming?.estimatedArrivalTime,
                    estimatedArrivalTimeFormatted: waypointWithTiming?.estimatedArrivalTimeFormatted,
                    waypoint: waypoint
                };
            });
            
            // Calculate overall score from the weather data
            const overallScore = this.calculateOverallWeatherScore(enhancedWeatherData);
            const recommendations = this.generateWeatherRecommendations(enhancedWeatherData);
            
            return {
                waypoints: enhancedWeatherData,
                analysis: { 
                    overallScore: overallScore,
                    recommendations: recommendations
                },
                summary: {
                    totalWaypoints: enhancedWeatherData.length,
                    routeDistance: routeData.distance || routeData.summary?.length || 0,
                    routeDuration: routeData.duration || routeData.summary?.duration || 0,
                    isSegmentBased: false
                }
            };
        } else {
            throw new Error('Unexpected weather data format');
        }
    }

    calculateTransitWaypointTimings(routeData, departureTime) {
        const departure = new Date(departureTime);
        const waypointsWithTiming = [];
        
        routeData.waypoints.forEach((waypoint, index) => {
            let estimatedArrivalTime;
            
            if (waypoint.time) {
                // Use the scheduled time from the transit API
                estimatedArrivalTime = Math.floor(new Date(waypoint.time).getTime() / 1000);
            } else {
                // Fallback: estimate based on route progress
                const totalDuration = routeData.duration || routeData.summary?.duration || 0;
                const progress = index / (routeData.waypoints.length - 1);
                estimatedArrivalTime = Math.floor(departure.getTime() / 1000) + (totalDuration * progress);
            }
            
            waypointsWithTiming.push({
                lat: waypoint.lat,
                lng: waypoint.lng,
                estimatedArrivalTime: estimatedArrivalTime,
                estimatedArrivalTimeFormatted: new Date(estimatedArrivalTime * 1000).toLocaleTimeString(),
                index: index,
                placeName: waypoint.placeName,
                isTransitStop: waypoint.isTransitStop,
                mode: waypoint.mode,
                transportInfo: waypoint.transportInfo
            });
        });
        
        return waypointsWithTiming;
    }

    calculateOverallWeatherScore(weatherData) {
        if (!weatherData || weatherData.length === 0) {
            return 0;
        }
        
        let totalScore = 0;
        let validScores = 0;
        
        weatherData.forEach(weather => {
            if (weather.temperature !== undefined) {
                let score = 50; // Base score
                
                // Temperature scoring (ideal range 15-25°C)
                const temp = weather.temperature;
                if (temp >= 15 && temp <= 25) {
                    score += 20;
                } else if (temp >= 10 && temp <= 15) {
                    score += 10;
                } else if (temp < 0 || temp > 10) {
                    score -= 20;
                }
                
                // Wind scoring
                if (weather.windSpeed !== undefined) {
                    if (weather.windSpeed < 5) {
                        score += 10;
                    } else if (weather.windSpeed > 15) {
                        score -= 10;
                    }
                }
                
                // Rain probability scoring
                if (weather.rainProbability !== undefined) {
                    if (weather.rainProbability < 20) {
                        score += 15;
                    } else if (weather.rainProbability > 60) {
                        score -= 15;
                    }
                }
                
                // Ensure score is within bounds
                score = Math.max(0, Math.min(100, score));
                totalScore += score;
                validScores++;
            }
        });
        
        return validScores > 0 ? Math.round(totalScore / validScores) : 0;
    }

    generateWeatherRecommendations(weatherData) {
        const recommendations = [];
        
        if (!weatherData || weatherData.length === 0) {
            return ['No weather data available'];
        }
        
        // Analyze overall conditions
        const avgTemp = weatherData.reduce((sum, w) => sum + (w.temperature || 15), 0) / weatherData.length;
        const maxRainProb = Math.max(...weatherData.map(w => w.rainProbability || 0));
        const maxWindSpeed = Math.max(...weatherData.map(w => w.windSpeed || 0));
        
        // Temperature recommendations
        if (avgTemp < 5) {
            recommendations.push('Bundle up! Very cold temperatures expected');
        } else if (avgTemp < 10) {
            recommendations.push('Dress warmly - cold weather ahead');
        } else if (avgTemp > 30) {
            recommendations.push('Stay hydrated - hot weather expected');
        } else if (avgTemp >= 15 && avgTemp <= 25) {
            recommendations.push('Perfect weather for your journey!');
        }
        
        // Rain recommendations
        if (maxRainProb > 70) {
            recommendations.push('High chance of rain - bring an umbrella');
        } else if (maxRainProb > 40) {
            recommendations.push('Pack a light raincoat just in case');
        } else if (maxRainProb < 10) {
            recommendations.push('Clear skies expected - great for travel');
        }
        
        // Wind recommendations
        if (maxWindSpeed > 20) {
            recommendations.push('Strong winds expected - secure loose items');
        } else if (maxWindSpeed > 10) {
            recommendations.push('Moderate winds - consider wind-resistant clothing');
        }
        
        // Transit-specific recommendations
        const hasTransitStops = weatherData.some(w => w.isTransitStop);
        if (hasTransitStops) {
            recommendations.push('Weather conditions checked at all transit stops');
            
            if (maxRainProb > 30) {
                recommendations.push('Consider covered waiting areas at transit stops');
            }
        }
        
        // Fallback if no specific recommendations
        if (recommendations.length === 0) {
            recommendations.push('Weather conditions are suitable for travel');
        }
        
        return recommendations;
    }
    
    // Generate weather recommendations specific to transit segments
    generateSegmentedWeatherRecommendations(segmentsWithWeather) {
        const recommendations = [];
        
        if (!segmentsWithWeather || segmentsWithWeather.length === 0) {
            return ['No weather data available for transit segments'];
        }
        
        // Collect all weather points from segments
        const allWeatherPoints = [];
        segmentsWithWeather.forEach(segment => {
            if (segment.departure?.weather) allWeatherPoints.push(segment.departure.weather);
            if (segment.arrival?.weather) allWeatherPoints.push(segment.arrival.weather);
        });
        
        // Get basic recommendations based on all points
        const basicRecommendations = this.generateWeatherRecommendations(allWeatherPoints);
        recommendations.push(...basicRecommendations);
        
        // Find segments with significant weather changes
        const segmentsWithWeatherChanges = segmentsWithWeather.filter(segment => {
            const depWeather = segment.departure?.weather;
            const arrWeather = segment.arrival?.weather;
            
            if (!depWeather || !arrWeather) return false;
            
            // Check for temperature changes
            const tempDiff = Math.abs((depWeather.temperature || 0) - (arrWeather.temperature || 0));
            
            // Check for precipitation changes
            const depRainProb = depWeather.rainProbability || 0;
            const arrRainProb = arrWeather.rainProbability || 0;
            const rainProbChange = Math.abs(depRainProb - arrRainProb);
            
            return tempDiff > 5 || rainProbChange > 30;
        });
        
        // Add transit-specific recommendations
        if (segmentsWithWeatherChanges.length > 0) {
            recommendations.push('Weather changes significantly during your journey - dress in layers');
            
            // Add specific segment recommendations
            segmentsWithWeatherChanges.forEach(segment => {
                const depWeather = segment.departure?.weather;
                const arrWeather = segment.arrival?.weather;
                
                if (depWeather && arrWeather) {
                    const tempDiff = (arrWeather.temperature || 0) - (depWeather.temperature || 0);
                    const depRainProb = depWeather.rainProbability || 0;
                    const arrRainProb = arrWeather.rainProbability || 0;
                    
                    if (tempDiff > 5) {
                        recommendations.push(`Weather getting warmer (${Math.round(tempDiff)}°C) during ${segment.mode || 'transit'} segment`);
                    } else if (tempDiff < -5) {
                        recommendations.push(`Weather getting cooler (${Math.round(-tempDiff)}°C) during ${segment.mode || 'transit'} segment`);
                    }
                    
                    if (depRainProb < 30 && arrRainProb > 50) {
                        recommendations.push(`Increased chance of rain during ${segment.mode || 'transit'} segment - have umbrella ready`);
                    }
                }
            });
        }
        
        // Check for outdoor waiting at transit stops
        const outdoorWaitingSegments = segmentsWithWeather.filter(segment => {
            const depWeather = segment.departure?.weather;
            return (depWeather?.rainProbability > 40 || depWeather?.temperature < 5 || depWeather?.temperature > 30) && 
                   (segment.mode === 'bus' || segment.mode === 'tram' || segment.mode === 'subway');
        });
        
        if (outdoorWaitingSegments.length > 0) {
            if (outdoorWaitingSegments.some(s => s.departure?.weather?.rainProbability > 40)) {
                recommendations.push('Be prepared for rain while waiting at some transit stops');
            }
            if (outdoorWaitingSegments.some(s => s.departure?.weather?.temperature < 5)) {
                recommendations.push('Several transit stops will be cold - dress warmly while waiting');
            }
            if (outdoorWaitingSegments.some(s => s.departure?.weather?.temperature > 30)) {
                recommendations.push('High temperatures at some transit stops - stay hydrated while waiting');
            }
        }
        
        // Deduplicate recommendations
        return [...new Set(recommendations)];
    }
    
    // Generate dummy transit segment weather data for fallback
    generateDummyTransitSegmentWeather(routeData, departureTime) {
        console.log('[RouteManager] Generating dummy segment weather data for transit route');
        
        if (!routeData.segments || routeData.segments.length === 0) {
            // No segments, create dummy waypoint weather instead
            const dummyCoordinates = [
                [routeData.origin?.lat || 0, routeData.origin?.lng || 0],
                [routeData.destination?.lat || 0, routeData.destination?.lng || 0]
            ];
            return this.generateDummyWeatherData(dummyCoordinates, routeData, departureTime);
        }
        
        const segmentsWithWeather = routeData.segments.map((segment, index) => {
            // Extract departure and arrival points from segment
            const depLat = segment.departure?.place?.lat || segment.departure?.lat || 0;
            const depLng = segment.departure?.place?.lng || segment.departure?.lng || 0;
            const depName = segment.departure?.place?.name || segment.departure?.name || `Stop ${index}`;
            
            const arrLat = segment.arrival?.place?.lat || segment.arrival?.lat || 0;
            const arrLng = segment.arrival?.place?.lng || segment.arrival?.lng || 0;
            const arrName = segment.arrival?.place?.name || segment.arrival?.name || `Stop ${index + 1}`;
            
            // Calculate departure and arrival times
            const segmentDepartureTime = segment.departure?.time ? 
                new Date(segment.departure.time) : 
                new Date(departureTime.getTime() + (index * 600) * 1000);
            
            const segmentArrivalTime = segment.arrival?.time ? 
                new Date(segment.arrival.time) : 
                new Date(segmentDepartureTime.getTime() + (segment.duration || 600) * 1000);
            
            // Generate random weather for departure
            const departureWeather = this.generateRandomWeatherPoint(
                segmentDepartureTime,
                depName,
                depLat,
                depLng
            );
            
            // Generate random weather for arrival, slightly different from departure
            const arrivalWeather = this.generateRandomWeatherPoint(
                segmentArrivalTime,
                arrName,
                arrLat,
                arrLng,
                departureWeather // Pass departure weather to create related but different weather
            );
            
            // Get line information from transport if available
            let lineInfo = null;
            if (segment.transport) {
                lineInfo = segment.transport.name || 
                          (segment.transport.category && segment.transport.number ? 
                           `${segment.transport.category} ${segment.transport.number}` : null);
            }
            
            return {
                index: index,
                mode: segment.mode || 'transit',
                transportInfo: segment.transport || null,
                line: lineInfo || segment.line || null,
                distance: segment.distance || 0,
                duration: segment.duration || 0,
                departure: {
                    point: {
                        lat: depLat,
                        lng: depLng,
                        name: depName
                    },
                    time: segmentDepartureTime,
                    weather: departureWeather
                },
                arrival: {
                    point: {
                        lat: arrLat,
                        lng: arrLng,
                        name: arrName
                    },
                    time: segmentArrivalTime,
                    weather: arrivalWeather
                },
                originalSegment: segment
            };
        });
        
        return {
            segments: segmentsWithWeather,
            analysis: {
                overallScore: 75,
                recommendations: [
                    'Weather data is simulated - check actual forecast before traveling',
                    'Prepare for variable conditions during your journey',
                    'Consider checking weather apps at transit stops'
                ]
            },
            summary: {
                totalSegments: segmentsWithWeather.length,
                routeDistance: routeData.distance || routeData.summary?.length || 0,
                routeDuration: routeData.duration || routeData.summary?.duration || 0,
                departureTime: departureTime,
                isSegmentBased: true,
                isDummyData: true
            }
        };
    }
    
    // Helper method to generate a random weather point for dummy data
    generateRandomWeatherPoint(time, locationName, lat, lng, baseWeather = null) {
        // If baseWeather is provided, create slightly different weather from it
        // Otherwise generate completely random weather
        const baseTemp = baseWeather ? baseWeather.temperature : 15 + Math.random() * 10;
        const baseRain = baseWeather ? baseWeather.rainProbability : Math.random() * 50;
        const baseWind = baseWeather ? baseWeather.windSpeed : 5 + Math.random() * 10;
        
        // Add some variation if this is based on existing weather
        const tempVariation = baseWeather ? (Math.random() * 4 - 2) : 0;
        const rainVariation = baseWeather ? (Math.random() * 20 - 10) : 0;
        const windVariation = baseWeather ? (Math.random() * 4 - 2) : 0;
        
        return {
            temperature: Math.round((baseTemp + tempVariation) * 10) / 10,
            description: ['Clear sky', 'Partly cloudy', 'Cloudy', 'Light rain'][Math.floor(Math.random() * 4)],
            humidity: Math.round(40 + Math.random() * 40),
            windSpeed: Math.round((baseWind + windVariation) * 10) / 10,
            visibility: Math.round(8 + Math.random() * 7),
            precipitation: Math.random() < 0.3 ? Math.round(Math.random() * 3 * 10) / 10 : 0,
            rainProbability: Math.min(100, Math.max(0, Math.round(baseRain + rainVariation))),
            feelsLike: Math.round((baseTemp + tempVariation - 2 + Math.random() * 4) * 10) / 10,
            location: locationName,
            lat: lat || 0,
            lng: lng || 0,
            timestamp: Math.floor(time.getTime() / 1000),
            estimatedArrivalTime: Math.floor(time.getTime() / 1000),
            estimatedArrivalTimeFormatted: time.toLocaleTimeString()
        };
    }
    
    // Convert waypoint-based weather data to segment-based format
    convertWaypointWeatherToSegmentWeather(waypointWeather, segments, waypointsWithTiming, departureTime) {
        console.log('[RouteManager] Converting waypoint weather to segment format');
        
        // Extract waypoints data depending on the format
        let waypoints = [];
        if (waypointWeather && waypointWeather.waypoints) {
            waypoints = waypointWeather.waypoints;
        } else if (Array.isArray(waypointWeather)) {
            waypoints = waypointWeather;
        } else {
            throw new Error('Invalid waypoint weather format');
        }
        
        if (waypoints.length === 0 || !segments || segments.length === 0) {
            throw new Error('Insufficient data for conversion');
        }
        
        // Map waypoints to segments based on proximity
        const segmentsWithWeather = segments.map((segment, segmentIndex) => {
            // Find the closest waypoint to the start point
            const startPoint = { lat: segment.start?.lat, lng: segment.start?.lng };
            const departureWaypointIndex = this.findClosestWaypointIndex(startPoint, waypoints);
            
            // Find the closest waypoint to the end point
            const endPoint = { lat: segment.end?.lat, lng: segment.end?.lng };
            const arrivalWaypointIndex = this.findClosestWaypointIndex(endPoint, waypoints);
            
            // Get departure and arrival times from segment or estimate them
            const segmentDepartureTime = segment.departureTime ? 
                new Date(segment.departureTime) : 
                new Date(departureTime.getTime() + (segment.startOffset || 0) * 1000);
            
            const segmentArrivalTime = segment.arrivalTime ? 
                new Date(segment.arrivalTime) : 
                new Date(segmentDepartureTime.getTime() + (segment.duration || 0) * 1000);
            
            // Create the segment with weather
            return {
                index: segmentIndex,
                mode: segment.mode || 'transit',
                transportInfo: segment.transportInfo || null,
                line: segment.line || segment.lineName || null,
                distance: segment.distance || 0,
                duration: segment.duration || 0,
                departure: {
                    point: segment.start,
                    time: segmentDepartureTime,
                    weather: {
                        ...waypoints[departureWaypointIndex],
                        estimatedArrivalTime: Math.floor(segmentDepartureTime.getTime() / 1000),
                        estimatedArrivalTimeFormatted: segmentDepartureTime.toLocaleTimeString(),
                        location: segment.start?.name || waypoints[departureWaypointIndex].location || `Stop ${segmentIndex}`
                    }
                },
                arrival: {
                    point: segment.end,
                    time: segmentArrivalTime,
                    weather: {
                        ...waypoints[arrivalWaypointIndex],
                        estimatedArrivalTime: Math.floor(segmentArrivalTime.getTime() / 1000),
                        estimatedArrivalTimeFormatted: segmentArrivalTime.toLocaleTimeString(),
                        location: segment.end?.name || waypoints[arrivalWaypointIndex].location || `Stop ${segmentIndex + 1}`
                    }
                },
                originalSegment: segment
            };
        });
        
        // Calculate overall analysis from all segment weather points
        const allWeatherPoints = [];
        segmentsWithWeather.forEach(segment => {
            if (segment.departure?.weather) allWeatherPoints.push(segment.departure.weather);
            if (segment.arrival?.weather) allWeatherPoints.push(segment.arrival.weather);
        });
        
        const overallScore = this.calculateOverallWeatherScore(allWeatherPoints);
        const recommendations = this.generateSegmentedWeatherRecommendations(segmentsWithWeather);
        
        return {
            segments: segmentsWithWeather,
            analysis: {
                overallScore: overallScore,
                recommendations: recommendations
            },
            summary: {
                totalSegments: segmentsWithWeather.length,
                routeDistance: segmentsWithWeather.reduce((sum, seg) => sum + (seg.distance || 0), 0),
                routeDuration: segmentsWithWeather.reduce((sum, seg) => sum + (seg.duration || 0), 0),
                departureTime: departureTime,
                isSegmentBased: true,
                convertedFromWaypoints: true
            }
        };
    }
    
    // Helper method to find the closest waypoint to a point
    findClosestWaypointIndex(point, waypoints) {
        if (!waypoints || waypoints.length === 0) return 0;
        
        let closestIndex = 0;
        let minDistance = Infinity;
        
        waypoints.forEach((waypoint, index) => {
            const waypointPoint = { 
                lat: waypoint.lat || waypoint.waypoint?.lat, 
                lng: waypoint.lng || waypoint.waypoint?.lng 
            };
            
            if (waypointPoint.lat && waypointPoint.lng) {
                const distance = this.calculateDistance(point, waypointPoint);
                if (distance < minDistance) {
                    minDistance = distance;
                    closestIndex = index;
                }
            }
        });
        
        return closestIndex;
    }
}

window.RouteManager = RouteManager;