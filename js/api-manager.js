/**
 * API Manager for handling all external API calls
 */
class APIManager {
    /**
     * Combines all polylines from a bicycle mixed-mode route response into a single route format
     * @param {Object} routeResponse - HERE Routing API route object  
     * @param {Object} origin - {lat, lng}
     * @param {Object} destination - {lat, lng}
     * @returns {Object} Combined route object in single-mode format
     */
  combineBicycleMixedRoutePolylines(routeResponse, origin, destination) {
    try {
        const sections = routeResponse.sections || [];
        if (!sections.length) {
            throw new Error('No sections found in bicycle route response');
        }

        console.log(`[APIManager] Combining ${sections.length} polylines from bicycle mixed-mode route`);

        // Create a master LineString to hold all coordinates
        const combinedLineString = new H.geo.LineString();
        let totalDistance = 0;
        let totalDuration = 0;
        const allInstructions = [];

        sections.forEach((section, index) => {
            // Add distance and duration
            if (section.summary?.length) {
                totalDistance += section.summary.length;
            }
            if (section.summary?.duration) {
                totalDuration += section.summary.duration;
            }

            // Add instructions
            if (section.actions && Array.isArray(section.actions)) {
                allInstructions.push(...section.actions);
            }

            // Decode polyline for this section using HERE Maps JS API
            if (section.polyline) {
                try {
                    // Check if HERE Maps JS API is available
                    if (!window.H || !window.H.geo || !window.H.geo.LineString) {
                        throw new Error('HERE Maps JS API is not loaded or available');
                    }
                    
                    // Decode section polyline to LineString
                    const sectionLineString = window.H.geo.LineString.fromFlexiblePolyline(section.polyline);
                    const latLngArray = sectionLineString.getLatLngAltArray();
                    
                    console.log(`[APIManager] Decoded polyline for section ${index} using HERE Maps JS API:`, latLngArray.length / 3, 'coordinates');
                    
                    // Add coordinates to combined LineString, avoiding duplicates at connection points
                    for (let i = 0; i < latLngArray.length; i += 3) {
                        const lat = latLngArray[i];
                        const lng = latLngArray[i + 1];
                        const alt = latLngArray[i + 2] || 0;
                        
                        // For sections after the first, check if this is a duplicate of the last point
                        if (index > 0 && i === 0 && combinedLineString.getLatLngAltArray().length > 0) {
                            const lastCoords = combinedLineString.getLatLngAltArray();
                            const lastIndex = lastCoords.length - 3;
                            const lastLat = lastCoords[lastIndex];
                            const lastLng = lastCoords[lastIndex + 1];
                            
                            // If coordinates are very close (within ~1 meter), skip the duplicate
                            if (Math.abs(lastLat - lat) < 0.00001 && Math.abs(lastLng - lng) < 0.00001) {
                                console.log(`[APIManager] Skipped duplicate coordinate at section boundary for section ${index}`);
                                continue;
                            }
                        }
                        
                        combinedLineString.pushLatLngAlt(lat, lng, alt);
                    }
                    
                    console.log(`[APIManager] Added section ${index} coordinates, total points: ${combinedLineString.getLatLngAltArray().length / 3}`);
                    
                } catch (error) {
                    console.error(`[APIManager] Failed to decode polyline for section ${index}:`, error);
                    throw error;
                }
            } else {
                console.warn(`[APIManager] No polyline found for section ${index}`);
            }
        });

        // Convert combined LineString directly to flexible polyline
        let combinedPolyline = '';
        try {
            combinedPolyline = combinedLineString.toFlexiblePolyline();
            console.log(`[APIManager] Generated combined polyline directly from LineString:`, combinedPolyline);
        } catch (error) {
            console.error('[APIManager] Failed to generate polyline from LineString:', error);
            throw error;
        }

        const totalPoints = combinedLineString.getLatLngAltArray().length / 3;
        console.log(`[APIManager] Combined ${sections.length} sections into ${totalPoints} coordinates`);
        console.log(`[APIManager] Combined polyline type: ${typeof combinedPolyline}, length: ${combinedPolyline.length}`);

        // Return in simple format as requested
        return {
            polyline: combinedPolyline,
            summary: {
                length: totalDistance,
                duration: totalDuration
            },
            instructions: allInstructions,
            distance: totalDistance,
            duration: totalDuration
        };

    } catch (error) {
        console.error('[APIManager] Error combining bicycle mixed-route polylines:', error);
        throw error;
    }
}


    /**
     * Combines all segment polylines for bicycle mixed-mode route into a single array of coordinates
     * @param {Array} segments - Array of route segments (each with a polyline)
     * @returns {Array} Combined array of coordinates
     */
    combineBicycleMixedPolylines(segments) {
        // Requires a polyline decoder (FlexPolylineDecoder or SimplePolylineDecoder)
        const allCoords = [];
        
        // Check if segments exist
        if (!segments || !Array.isArray(segments) || segments.length === 0) {
            console.warn('[APIManager] No segments to combine in bicycle mixed mode');
            return [];
        }
        
        segments.forEach((segment, idx) => {
            if (segment && segment.polyline) {
                let coords = [];
                try {
                    if (window.FlexPolylineDecoder) {
                        const decoded = window.FlexPolylineDecoder.decode(segment.polyline);
                        if (decoded && Array.isArray(decoded.polyline)) {
                            coords = decoded.polyline;
                        } else {
                            console.warn(`[APIManager] Invalid FlexPolyline decode result for segment ${idx}:`, decoded);
                            return; // Skip this segment
                        }
                    } else if (window.SimplePolylineDecoder) {
                        const decoded = window.SimplePolylineDecoder.decode(segment.polyline);
                        if (decoded && Array.isArray(decoded)) {
                            coords = decoded;
                        } else {
                            console.warn(`[APIManager] Invalid SimplePolyline decode result for segment ${idx}:`, decoded);
                            return; // Skip this segment
                        }
                    } else {
                        console.warn('[APIManager] No polyline decoder available');
                        return; // Skip this segment
                    }
                    
                    // Make sure coords is a valid array before processing
                    if (!Array.isArray(coords) || coords.length === 0) {
                        console.warn(`[APIManager] Empty or invalid coordinates for segment ${idx}`);
                        return; // Skip this segment
                    }
                    
                    // Remove duplicate point at segment boundary
                    if (idx > 0 && allCoords.length > 0 && coords.length > 0) {
                        const last = allCoords[allCoords.length - 1];
                        const first = coords[0];
                        if (last && first && last[0] === first[0] && last[1] === first[1]) {
                            coords = coords.slice(1);
                        }
                    }
                    
                    // Safely add coordinates to the combined array
                    allCoords.push(...coords);
                } catch (error) {
                    console.error(`[APIManager] Error decoding polyline for segment ${idx}:`, error);
                }
            }
        });
        
        console.log(`[APIManager] Combined ${segments.length} segments into ${allCoords.length} coordinates`);
        return allCoords;
    }
    constructor() {
        this.API_KEYS = {
            mapbox: this.getEnvVariable('MAPBOX_API_KEY'),
            opencage: this.getEnvVariable('OPENCAGE_API_KEY'),
            here: this.getEnvVariable('HERE_API_KEY')
        };
        
        this.API_ENDPOINTS = {
            mapbox: {
                suggest: 'https://api.mapbox.com/search/searchbox/v1/suggest',
                retrieve: 'https://api.mapbox.com/search/searchbox/v1/retrieve'
            },
            nominatim: {
                search: 'https://nominatim.openstreetmap.org/search',
                reverse: 'https://nominatim.openstreetmap.org/reverse'
            },
            opencage: {
                geocode: 'https://api.opencagedata.com/geocode/v1/json'
            },
            here: {
                routing: 'https://router.hereapi.com/v8/routes'
            }
        };

        // Initialize HERE Maps Platform for polyline encoding/decoding
        this.initializeHERE();
    }
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
    initializeHERE() {
        try {
            // Wait for HERE Maps JS API to be available
            if (typeof H !== 'undefined') {
                this.herePlatform = new H.service.Platform({
                    'apikey': this.API_KEYS.here
                });
                console.log('[APIManager] HERE Maps Platform initialized successfully');
            } else {
                // Retry after a short delay if H is not yet available
                setTimeout(() => this.initializeHERE(), 100);
            }
        } catch (error) {
            console.warn('[APIManager] Failed to initialize HERE Maps Platform:', error);
        }
    }
    
    async searchMapbox(query) {
        try {
            // Generate a session token if not provided (for demonstration, using a simple UUID)
            if (!this._sessionToken) {
                this._sessionToken = self.crypto?.randomUUID?.() || Math.random().toString(36).substr(2, 16);
            }
            // Ensure spaces are encoded as %20 (encodeURIComponent does this by default)
            const encodedQuery = encodeURIComponent(query);
            const url = `${this.API_ENDPOINTS.mapbox.suggest}?` +
                `q=${encodedQuery}&` +
                `access_token=${this.API_KEYS.mapbox}&` +
                `session_token=${this._sessionToken}&` +
                `limit=5&` +
                `language=da&` +
                `country=DK`;
            const response = await fetch(url);
            
            if (!response.ok) throw new Error('Mapbox API error');
            
            const data = await response.json();
            return data.suggestions?.map(item => ({
                id: item.mapbox_id,
                name: item.name,
                full_address: item.full_address || item.place_formatted,
                coordinates: item.coordinates ? [item.coordinates.longitude, item.coordinates.latitude] : null,
                source: 'mapbox'
            })) || [];
        } catch (error) {
            console.error('Mapbox search error:', error);
            return [];
        }
    }
    /**
     * Handles HERE Routing API response for bicycle mixed-mode routes (cycling + walking segments)
     * @param {Object} routeResponse - The full HERE Routing API response (routes[0])
     * @param {Object} origin - {lat, lng}
     * @param {Object} destination - {lat, lng}
     * @returns {Object} Processed route structure
     */
    handleBicycleRouteResponse(routeResponse, origin, destination) {
        try {
            // Defensive: check for sections array
            const sections = routeResponse.sections || [];
            if (!sections.length) {
                throw new Error('No sections found in bicycle route response');
            }
            
            // Log bicycle route sections to help debugging
            console.log(`[APIManager] Handling bicycle route with ${sections.length} sections:`, 
                sections.map(s => ({type: s.type, mode: s.transport?.mode, hasPolyline: !!s.polyline})));
            
            // Check if we need to handle mixed mode (cycling + walking)
            let isMixedMode = sections.length > 1;
            
            // If sections have different modes, it's definitely a mixed mode route
            if (sections.length > 1) {
                const modeTypes = new Set(sections.map(s => s.transport?.mode || s.type));
                if (modeTypes.size > 1) {
                    console.log('[APIManager] Found multiple transportation modes in bicycle route:', [...modeTypes]);
                    isMixedMode = true;
                }
            }
            
            // Even with one section, check if it's actually a mixed mode route internally
            if (sections.length === 1) {
                const singleSection = sections[0];
                
                // Look for indicators of mixed-mode within a single section
                if (singleSection.notices && Array.isArray(singleSection.notices)) {
                    const hasMixedModeNotice = singleSection.notices.some(notice => 
                        notice.title?.toLowerCase().includes('walk') ||
                        notice.code?.includes('mixed_route') ||
                        notice.description?.toLowerCase().includes('walk')
                    );
                    
                    if (hasMixedModeNotice) {
                        console.log('[APIManager] Found mixed-mode indicators in single section bicycle route');
                        isMixedMode = true;
                    }
                }
            }
            
            // Process as mixed mode or regular mode based on our determination
            if (isMixedMode) {
                return this.combineBicycleMixedRoutePolylines(routeResponse, origin, destination);
            } else {
                // For truly single-mode bicycle routes, we can use a simpler processing
                // that just extracts the key information without complex segment handling
                const section = sections[0];
                return {
                    polyline: section.polyline,
                    summary: section.summary,
                    instructions: section.actions || [],
                    distance: section.summary.length,
                    duration: section.summary.duration,
                    waypoints: [
                        {
                            lat: origin.lat,
                            lng: origin.lng,
                            type: 'origin',
                            mode: 'bicycle',
                            placeName: 'Origin'
                        },
                        {
                            lat: destination.lat,
                            lng: destination.lng,
                            type: 'destination',
                            mode: 'bicycle',
                            placeName: 'Destination'
                        }
                    ],
                    segments: [{
                        type: 'bicycle',
                        mode: 'bicycle',
                        polyline: section.polyline,
                        distance: section.summary.length,
                        duration: section.summary.duration
                    }],
                    isBicycleMixedRoute: false
                };
            }
        } catch (error) {
            console.error('[APIManager] Error in handleBicycleRouteResponse:', error);
            throw error;
        }
    }

    /**
     * Processes mixed-mode bicycle route (cycling + walking segments)
     * @param {Object} routeResponse - HERE Routing API route object
     * @param {Object} origin - {lat, lng}
     * @param {Object} destination - {lat, lng}
     * @returns {Object} Processed route structure
     */
    processBicycleMixedRoute(routeResponse, origin, destination) {
        console.log('[APIManager] Processing bicycle mixed-mode route with', routeResponse.sections?.length || 0, 'segments');
        const sections = routeResponse.sections || [];
        const waypoints = [];
        const segments = [];
        let totalDistance = 0;
        let totalDuration = 0;

        // Get selected source/destination from global or window.routeMapApp
        const selectedOrigin = window.routeMapApp?.state?.addressState?.origin?.fullAddress || null;
        const selectedDestination = window.routeMapApp?.state?.addressState?.destination?.fullAddress || null;

        sections.forEach((section, index) => {
            // Override departure/arrival names for first/last section
            if (index === 0 && selectedOrigin) {
                if (!section.departure) section.departure = {};
                if (!section.departure.place) section.departure.place = {};
                section.departure.place.name = selectedOrigin;
            }
            if (index === sections.length - 1 && selectedDestination) {
                if (!section.arrival) section.arrival = {};
                if (!section.arrival.place) section.arrival.place = {};
                section.arrival.place.name = selectedDestination;
            }

            // Add departure waypoint
            if (section.departure?.place?.location) {
                const departureWaypoint = {
                    lat: section.departure.place.location.lat,
                    lng: section.departure.place.location.lng,
                    type: index === 0 ? 'origin' : 'mode_transition',
                    mode: section.transport?.mode || section.type,
                    placeName: section.departure.place.name || `Location ${waypoints.length + 1}`,
                    time: section.departure.time,
                    sectionIndex: index,
                    // Add extra information for UI display
                    isModeChange: index > 0,
                    transportInfo: {
                        mode: section.transport?.mode || section.type,
                        type: section.type
                    }
                };
                // Deduplicate (within 10 meters)
                const isDuplicate = waypoints.some(wp => Math.abs(wp.lat - departureWaypoint.lat) < 0.0001 && Math.abs(wp.lng - departureWaypoint.lng) < 0.0001);
                if (!isDuplicate) {
                    console.log(`[APIManager] Adding departure waypoint for section ${index}:`, departureWaypoint.placeName);
                    waypoints.push(departureWaypoint);
                }
            }
            
            // Add arrival waypoint
            if (section.arrival?.place?.location) {
                const arrivalWaypoint = {
                    lat: section.arrival.place.location.lat,
                    lng: section.arrival.place.location.lng,
                    type: index === sections.length - 1 ? 'destination' : 'mode_transition',
                    mode: section.transport?.mode || section.type,
                    placeName: section.arrival.place.name || `Location ${waypoints.length + 1}`,
                    time: section.arrival.time,
                    sectionIndex: index,
                    // Add extra information for UI display
                    isModeChange: index < sections.length - 1,
                    transportInfo: {
                        mode: section.transport?.mode || section.type,
                        type: section.type
                    }
                };
                const isDuplicate = waypoints.some(wp => Math.abs(wp.lat - arrivalWaypoint.lat) < 0.0001 && Math.abs(wp.lng - arrivalWaypoint.lng) < 0.0001);
                if (!isDuplicate) {
                    console.log(`[APIManager] Adding arrival waypoint for section ${index}:`, arrivalWaypoint.placeName);
                    waypoints.push(arrivalWaypoint);
                }
            }

            // Calculate section duration
            if (section.departure?.time && section.arrival?.time) {
                const departureTime = new Date(section.departure.time);
                const arrivalTime = new Date(section.arrival.time);
                const sectionDuration = (arrivalTime - departureTime) / 1000;
                totalDuration += sectionDuration;
            } else if (section.summary?.duration) {
                // Use summary duration if departure/arrival times not available
                totalDuration += section.summary.duration;
            }
            
            // Distance
            if (section.summary?.length) {
                totalDistance += section.summary.length;
            }

            // Create segment with all necessary information for rendering
            const segment = {
                type: section.type || 'bicycle', // Default to bicycle if not specified
                mode: section.transport?.mode || section.type || 'bicycle',
                polyline: section.polyline,
                departure: section.departure,
                arrival: section.arrival,
                transport: section.transport || {
                    mode: 'bicycle',
                    type: 'bicycle'
                },
                duration: section.departure?.time && section.arrival?.time ? 
                    (new Date(section.arrival.time) - new Date(section.departure.time)) / 1000 : 
                    section.summary?.duration || 0,
                distance: section.summary?.length || 0
            };
            
            // Add safe coordinate references
            if (section.departure?.place?.location?.lat) {
                segment.departureLoc = {
                    lat: section.departure.place.location.lat,
                    lng: section.departure.place.location.lng
                };
            }
            
            if (section.arrival?.place?.location?.lat) {
                segment.arrivalLoc = {
                    lat: section.arrival.place.location.lat,
                    lng: section.arrival.place.location.lng
                };
            }
            
            segments.push(segment);
        });
        
        console.log(`[APIManager] Created ${waypoints.length} waypoints and ${segments.length} segments for bicycle mixed route`);

        return {
            polyline: null, // Don't combine polylines - use segments instead
            summary: {
                length: totalDistance,
                duration: totalDuration
            },
            waypoints,
            segments,
            instructions: this.generateBicycleMixedInstructions(segments),
            distance: totalDistance,
            duration: totalDuration,
            durationMin: Math.round(totalDuration / 60),
            isBicycleMixedRoute: true,
            // Flag to tell RouteManager to use segment-based drawing
            useSegmentDrawing: true
        };
    }

    generateBicycleMixedInstructions(segments) {
        const instructions = [];
        segments.forEach((segment, index) => {
            if (segment.mode === 'bicycle') {
                instructions.push(`Cycle to ${segment.arrival?.place?.name || 'next point'}`);
            } else if (segment.mode === 'pedestrian' || segment.type === 'pedestrian') {
                instructions.push(`Walk to ${segment.arrival?.place?.name || 'next point'}`);
            } else {
                instructions.push(`Proceed to ${segment.arrival?.place?.name || 'next point'} (${segment.mode})`);
            }
        });
        return instructions;
    }
    
    async searchNominatim(query) {
        try {
            const url = `${this.API_ENDPOINTS.nominatim.search}?q=${encodeURIComponent(query)}&format=json&limit=5&addressdetails=1`;
            const response = await fetch(url);
            
            if (!response.ok) throw new Error('Nominatim API error');
            
            const data = await response.json();
            return data.map(item => ({
                id: item.place_id,
                name: item.display_name.split(',')[0],
                full_address: item.display_name,
                coordinates: [parseFloat(item.lon), parseFloat(item.lat)],
                source: 'nominatim'
            }));
        } catch (error) {
            console.error('Nominatim search error:', error);
            return [];
        }
    }
    
    async geocodeWithOpenCage(address) {
        try {
            const url = `${this.API_ENDPOINTS.opencage.geocode}?q=${encodeURIComponent(address)}&key=${this.API_KEYS.opencage}&limit=1`;
            const response = await fetch(url);
            
            if (!response.ok) throw new Error('OpenCage API error');
            
            const data = await response.json();
            if (data.results && data.results[0]) {
                return {
                    lat: data.results[0].geometry.lat,
                    lng: data.results[0].geometry.lng
                };
            }
            throw new Error('No results found');
        } catch (error) {
            console.error('Geocoding error:', error);
            throw error;
        }
    }
    
    /**
     * Reverse geocode a coordinate (lat, lng) to get location name using OpenCage API
     * @param {number} lat - Latitude
     * @param {number} lng - Longitude
     * @returns {Promise<Object>} Location information
     */
    async reverseGeocodeWithOpenCage(lat, lng) {
        try {
            console.log(`[APIManager] Reverse geocoding coordinates: ${lat}, ${lng}`);
            const url = `${this.API_ENDPOINTS.opencage.geocode}?q=${lat}+${lng}&key=${this.API_KEYS.opencage}&limit=1`;
            const response = await fetch(url);
            
            if (!response.ok) throw new Error('OpenCage API error');
            
            const data = await response.json();
            let locationName = '';
            let components = {};
            
            if (data.results && data.results.length > 0) {
                const result = data.results[0];
                components = result.components || {};
                
                // Try to get a meaningful location name
                if (components.road) {
                    locationName = components.road;
                    if (components.house_number) {
                        locationName = `${components.house_number} ${locationName}`;
                    }
                } else if (components.neighbourhood) {
                    locationName = components.neighbourhood;
                } else if (components.suburb) {
                    locationName = components.suburb;
                } else if (components.town) {
                    locationName = components.town;
                } else if (components.city) {
                    locationName = components.city;
                } else {
                    locationName = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
                }
                
                return {
                    name: locationName,
                    formatted: result.formatted,
                    components: components
                };
            }
            
            // Fallback if no results
            return {
                name: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
                formatted: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
                components: {}
            };
        } catch (error) {
            console.error('Reverse geocoding error:', error);
            // Fallback to coordinates
            return {
                name: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
                formatted: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
                components: {}
            };
        }
    }
    
    // Fallback polyline decoder if the library decoders fail
    decodeFlexPolyline(encoded) {
        if (!encoded || typeof encoded !== 'string') {
            console.warn('[APIManager] Invalid polyline provided to decoder');
            return [];
        }
        
        try {
            // First try the main library decoder
            if (window.FlexPolylineDecoder) {
                try {
                    const result = window.FlexPolylineDecoder.decode(encoded);
                    if (result && Array.isArray(result.polyline) && result.polyline.length > 0) {
                        console.log('[APIManager] Successfully decoded with FlexPolylineDecoder');
                        return result.polyline;
                    }
                } catch (flexError) {
                    console.warn('[APIManager] FlexPolylineDecoder failed:', flexError.message);
                    // Continue to fallback
                }
            }
            
            // Try using the library in libs folder
            if (window.flexpolyline && typeof window.flexpolyline.decode === 'function') {
                try {
                    const result = window.flexpolyline.decode(encoded);
                    if (result && Array.isArray(result) && result.length > 0) {
                        console.log('[APIManager] Successfully decoded with flexpolyline library');
                        return result;
                    }
                } catch (flexLibError) {
                    console.warn('[APIManager] flexpolyline library failed:', flexLibError.message);
                    // Continue to fallback
                }
            }
            
            // If we get here, use a simple fallback that at least extracts coordinates
            console.warn('[APIManager] Using basic fallback polyline decoder');
            
            try {
                // Here's a very basic decoder that works with some HERE polyline formats
                // This won't handle all the nuances of flexible polyline encoding
                // but might extract some basic coordinates
                const coords = [];
                let index = 0;
                let lat = 0;
                let lng = 0;
                
                try {
                    // Try to extract header - 1st byte is the version number
                    const header = encoded.charAt(0);
                    let headerLen = 1;
                    
                    // Skip header - it should contain version, precision, etc.
                    index = headerLen;
                    
                    while (index < encoded.length) {
                        let result = 1;
                        let shift = 0;
                        let b;
                        do {
                            if (index >= encoded.length) break;
                            b = encoded.charCodeAt(index++) - 63;
                            result += (b & 0x1f) << shift;
                            shift += 5;
                        } while (b >= 0x20);
                        const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
                        lat += dlat;
                        
                        if (index >= encoded.length) break;
                        
                        result = 1;
                        shift = 0;
                        do {
                            if (index >= encoded.length) break;
                            b = encoded.charCodeAt(index++) - 63;
                            result += (b & 0x1f) << shift;
                            shift += 5;
                        } while (b >= 0x20);
                        const dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
                        lng += dlng;
                        
                        // Validate coordinates before adding (lat between -90 and 90, lng between -180 and 180)
                        const validLat = lat * 1e-5;
                        const validLng = lng * 1e-5;
                        
                        if (validLat >= -90 && validLat <= 90 && validLng >= -180 && validLng <= 180) {
                            coords.push([validLat, validLng]);
                        } else {
                            console.warn(`[APIManager] Invalid coordinate decoded: ${validLat},${validLng}`);
                        }
                    }
                } catch (innerError) {
                    console.warn('[APIManager] Error during decoding loop:', innerError);
                }
                
                if (coords.length > 0) {
                    console.log('[APIManager] Fallback decoder extracted', coords.length, 'points');
                    return coords;
                }
            } catch (decoderError) {
                console.warn('[APIManager] Basic fallback decoder failed:', decoderError.message);
            }
            
            // Return empty array as last resort
            console.error('[APIManager] All polyline decoders failed for:', encoded.substring(0, 30) + '...');
            return [];
        } catch (error) {
            console.error('[APIManager] Error in fallback polyline decoder:', error);
            return [];
        }
    }

    // Manual HERE FlexPolyline encoder
    encodeFlexPolyline(coordinates) {
        if (!coordinates || !Array.isArray(coordinates) || coordinates.length === 0) {
            console.warn('[APIManager] Invalid coordinates provided to encoder');
            return '';
        }

        try {
            console.log(`[APIManager] Manually encoding ${coordinates.length} coordinates to FlexPolyline`);
            
            // HERE FlexPolyline encoding parameters (match HERE's standard)
            const precision = 5; // Standard precision for HERE (5 decimal places)
            const thirdDim = 0; // No third dimension
            const thirdDimPrecision = 0;
            
            let result = '';
            
            // Encode version and precision in header (HERE format)
            // Version 1, precision 5, no third dimension
            const version = 1;
            const headerByte = (version << 4) | precision;
            result += String.fromCharCode(headerByte + 63);
            
            // Track previous values for delta encoding
            let prevLat = 0;
            let prevLng = 0;
            
            for (let i = 0; i < coordinates.length; i++) {
                const coord = coordinates[i];
                if (!Array.isArray(coord) || coord.length < 2) {
                    console.warn(`[APIManager] Invalid coordinate at index ${i}:`, coord);
                    continue;
                }
                
                // Convert to scaled integers (multiply by 10^precision)
                const lat = Math.round(coord[0] * 100000); // 10^5 for precision 5
                const lng = Math.round(coord[1] * 100000); // 10^5 for precision 5
                
                // Calculate deltas
                const deltaLat = lat - prevLat;
                const deltaLng = lng - prevLng;
                
                // Encode deltas using HERE's signed varint encoding
                result += this.encodeSignedVarintHERE(deltaLat);
                result += this.encodeSignedVarintHERE(deltaLng);
                
                // Update previous values
                prevLat = lat;
                prevLng = lng;
            }
            
            console.log(`[APIManager] Successfully encoded ${coordinates.length} coordinates to HERE FlexPolyline: ${result.substring(0, 50)}...`);
            return result;
        } catch (error) {
            console.error('[APIManager] Error in manual FlexPolyline encoder:', error);
            return '';
        }
    }

    // HERE-specific signed varint encoding
    encodeSignedVarintHERE(value) {
        // Convert signed to unsigned using zigzag encoding (HERE standard)
        const unsignedValue = value < 0 ? ((-value - 1) << 1) | 1 : value << 1;
        return this.encodeUnsignedVarintHERE(unsignedValue);
    }

    // HERE-specific unsigned varint encoding 
    encodeUnsignedVarintHERE(value) {
        let result = '';
        while (value >= 32) { // 0x20 = 32
            result += String.fromCharCode((value & 0x1F) | 0x20 + 63);
            value >>>= 5;
        }
        result += String.fromCharCode(value + 63);
        return result;
    }
    
    async calculateRoute(origin, destination, mode = 'car', routeType = 'fast') {
        try {
            // Always use 'fast' for bicycle mode, regardless of UI selection
            let routingMode;
            if (mode === 'bicycle' || mode === 'pedestrian') {
                routingMode = 'fast';
            } else {
                // Car mode supports all routing modes
                const routeTypeMap = {
                    'fast': 'fast',
                    'short': 'short',
                    'balanced': 'balanced'
                };
                routingMode = routeTypeMap[routeType] || 'fast';
            }

            // Always request 3 alternative routes
            const url = `${this.API_ENDPOINTS.here.routing}?` +
                `origin=${origin.lat},${origin.lng}&` +
                `destination=${destination.lat},${destination.lng}&` +
                `transportMode=${mode}&` +
                `routingMode=${routingMode}&` +
                `alternatives=3&` +
                `return=polyline,summary,actions&` +
                `apiKey=${this.API_KEYS.here}`;
            console.log('[HERE Routing API] Request URL:', url);
            const response = await fetch(url);
            console.log('[HERE Routing API] HTTP status:', response.status);

            if (!response.ok) {
                const text = await response.text();
                let errorInfo = { title: 'Unknown error' };
                try {
                    errorInfo = JSON.parse(text);
                } catch (e) {}
                if (errorInfo.code === 'E605012' && routingMode !== 'fast') {
                    const fallbackUrl = `${this.API_ENDPOINTS.here.routing}?` +
                        `origin=${origin.lat},${origin.lng}&` +
                        `destination=${destination.lat},${destination.lng}&` +
                        `transportMode=${mode}&` +
                        `routingMode=fast&` +
                        `return=polyline,summary,actions&` +
                        `apiKey=${this.API_KEYS.here}`;
                    const fallbackResponse = await fetch(fallbackUrl);
                    if (fallbackResponse.ok) {
                        const fallbackData = await fallbackResponse.json();
                        if (fallbackData.routes && fallbackData.routes.length > 0) {
                            const route = fallbackData.routes[0];
                            const section = route.sections[0];
                            return {
                                polyline: section.polyline,
                                summary: section.summary,
                                instructions: section.actions || [],
                                distance: section.summary.length,
                                duration: section.summary.duration
                            };
                        }
                    }
                }
                throw new Error(`HERE API error: ${response.status} - ${errorInfo.title || 'Unknown error'}`);
            }

            const data = await response.json();
            if (!data.routes || data.routes.length === 0) {
                throw new Error('No route found');
            }

            // Return all 3 routes as an array of processed route objects
            const processedRoutes = data.routes.slice(0, 3).map((route, idx) => {
                // Bicycle mode: check for multi-segment (mixed-mode) route
                if (mode === 'bicycle' && route.sections && route.sections.length > 1) {
                    try {
                        // Use segment-based approach for bicycle mixed-mode route
                        return this.combineBicycleMixedRoutePolylines(route, origin, destination);
                    } catch (error) {
                        console.error('[APIManager] Error processing bicycle mixed-mode route:', error);
                        // Fall back to the single-section processing below
                        console.warn('[APIManager] Falling back to single-mode processing for bicycle route');
                    }
                }
                // Single-mode (bicycle only, or other modes)
                const section = route.sections[0];
                return {
                    polyline: section.polyline,
                    summary: section.summary,
                    instructions: section.actions || [],
                    distance: section.summary.length,
                    duration: section.summary.duration
                };
            });
            return processedRoutes;
        } catch (error) {
            console.error('Route calculation error:', error);
            throw error;
        }
    }

    async calculateTransitRoute(origin, destination, departureTime = new Date()) {
        try {
            // Format departure time for HERE API (ISO format)
            const formattedTime = departureTime.toISOString();
            
            console.log(`[HERE Transit API] Calculating transit route from ${origin.lat},${origin.lng} to ${destination.lat},${destination.lng} at ${formattedTime}`);
            
            const url = `https://transit.router.hereapi.com/v8/routes?` +
                `apiKey=${this.API_KEYS.here}&` +
                `origin=${origin.lat},${origin.lng}&` +
                `destination=${destination.lat},${destination.lng}&` +
                `time=${formattedTime}&` +
                `return=polyline`;
            
            console.log('[HERE Transit API] Request URL:', url);
            
            const response = await fetch(url);
            console.log('[HERE Transit API] HTTP status:', response.status);

            if (!response.ok) {
                const text = await response.text();
                console.error('[HERE Transit API] Error response:', text);
                throw new Error(`HERE Transit API error: ${response.status}`);
            }
            
            const data = await response.json();
            console.log('[HERE Transit API] Success response received:', data);
            
            if (!data.routes || data.routes.length === 0) {
                throw new Error('No transit route found');
            }
            
            // Use static JSON data for testing instead of HERE API response
            /* const staticData = {
                "routes": [{
                    "id": "R0",
                    "sections": [
                        {
                            "id": "R0-S0",
                            "type": "pedestrian",
                            "departure": {
                                "time": "2025-07-15T11:12:00+02:00",
                                "place": {
                                    "type": "place",
                                    "location": { "lat": 55.710291, "lng": 12.467816 }
                                }
                            },
                            "arrival": {
                                "time": "2025-07-15T11:16:00+02:00",
                                "place": {
                                    "name": "Husum St. (Islevhusvej)",
                                    "type": "station",
                                    "location": { "lat": 55.709394, "lng": 12.464222 },
                                    "id": "17355_79536"
                                }
                            },
                            "polyline": "BGmtpoqD2--4XhN9pBjSr7B3N3wBzFzUrJjhB5DpN",
                            "transport": { "mode": "pedestrian" }
                        },
                        {
                            "id": "R0-S1",
                            "type": "transit",
                            "departure": {
                                "time": "2025-07-15T11:16:00+02:00",
                                "place": {
                                    "name": "Husum St. (Islevhusvej)",
                                    "type": "station",
                                    "location": { "lat": 55.709394, "lng": 12.464222 },
                                    "id": "17355_79536"
                                }
                            },
                            "arrival": {
                                "time": "2025-07-15T11:30:00+02:00",
                                "place": {
                                    "name": "Gladsaxevej (Gladsaxe Ringvej)",
                                    "type": "station",
                                    "location": { "lat": 55.740891, "lng": 12.489281 },
                                    "id": "17355_17905"
                                }
                            },
                            "polyline": "BHwkqymhB46x3tHw9J4-iB45OwrwBsgRsz8BksDv3Cg3BzKg5Fo3EwH3cs5Rv6kC0ogDg3pBoGwCg5Uo0I8uGwoC4-2Bk0O0grC4-T86FghCg-FwwDo4B0yB84B42D0xEw2FooEwjHk1BwtCkxD4jFshTs7fwpE4hGotEkqEs-H84G8jE8nCg7E84Bk5J0yBguDjN4tK3sDo8gC_tNs2V3vEw6I7xCwiPvgG49M_xGo3JzvFs7BnuBo4GoqhB0yf4ovFglF0nYkiIo3d03Gs2V",
                            "transport": {
                                "mode": "bus",
                                "name": "200S",
                                "category": "Bus Service",
                                "headsign": "Buddinge St.",
                                "shortName": "200S"
                            },
                            "agency": {
                                "id": "17355_67e9c3a",
                                "name": "Movia",
                                "website": "https://www.moviatrafik.dk"
                            },
                            "attributions": [{
                                "id": "fd99ed0caca491face7b0a55acea971e",
                                "href": "http://www.rejseplanen.dk",
                                "text": "With the support of Rejseplanen",
                                "type": "disclaimer"
                            }]
                        },
                        {
                            "id": "R0-S2",
                            "type": "transit",
                            "departure": {
                                "time": "2025-07-15T11:36:00+02:00",
                                "place": {
                                    "name": "Gladsaxevej (Gladsaxe Ringvej)",
                                    "type": "station",
                                    "location": { "lat": 55.740891, "lng": 12.489281 },
                                    "id": "17355_17905"
                                }
                            },
                            "arrival": {
                                "time": "2025-07-15T11:57:00+02:00",
                                "place": {
                                    "name": "Dtu (Anker Engelunds Vej)",
                                    "type": "station",
                                    "location": { "lat": 55.785955, "lng": 12.5202 },
                                    "id": "17355_77895"
                                }
                            },
                            "polyline": "BHotxlnhBsn7muH87CgnJ0mRonvBosH0hW8kB8iCrT0hC3IkiD4N8gDkX89BgtBs7Bs2BsYwqB7G4mB3csxBv3C87C7Gs6EsY8qDgeglZkkHs3SwlG4_Lo2Cw5BssBo8JogD42Sk3Fw4Jk6BsgH8GkgnB7f8v6BjwBs4ZkIgvFnaksI7GknInasET8lNzrgB7lN0rgBo_KrJ82Cv5B8wKsJkywCwmI8jOkpCw5G4uCohe4gOoyqCo_jBongBo2lBo7CotEk1B8-Dn_F4iNrqH0xTrpF0yQ_jDs6E3wGolSv5G0wRkxDw9E4zHvxUwtCj4HwWwnFoa8sC4sI4gTw-GoxRo5Ss9yBw2FwoR81Fr2GkzCr1Ek2I7rK49Cz3B00F31Bs1E4wL0iTkkvB0lP8-mBwpE07O0pDowP88ErnBwjCr2Bo1F_qH4wGjtK02JrnVw1D7pG09DrkF4vEz7EgoGj5EgyGvkE0_Hr2GwhDn-D0rMn_P4xD3nIwjCr0HssB_oSoLngI8uG49CooE0kD4xcs6iBk1B0tB4DkD_kP_0RglPg1RkiDg1CgiEg6CwkE4kCk8U40Jw1IkqEklEo2CoGsE4jKwwI4zlBwsoBskF85Dw9EwyCglFk1BoG4yPgUsnGof0xJwWk5JjN81KztBkvJv_I4hzB",
                            "transport": {
                                "mode": "bus",
                                "name": "300S",
                                "category": "Bus Service",
                                "headsign": "DTU, Rævehøjvej",
                                "shortName": "300S"
                            },
                            "agency": {
                                "id": "17355_67e9c3a",
                                "name": "Movia",
                                "website": "https://www.moviatrafik.dk"
                            },
                            "attributions": [{
                                "id": "fd99ed0caca491face7b0a55acea971e",
                                "href": "http://www.rejseplanen.dk",
                                "text": "With the support of Rejseplanen",
                                "type": "disclaimer"
                            }]
                        },
                        {
                            "id": "R0-S3",
                            "type": "pedestrian",
                            "departure": {
                                "time": "2025-07-15T11:57:00+02:00",
                                "place": {
                                    "name": "Dtu (Anker Engelunds Vej)",
                                    "type": "station",
                                    "location": { "lat": 55.785955, "lng": 12.5202 },
                                    "id": "17355_77895"
                                }
                            },
                            "arrival": {
                                "time": "2025-07-15T12:01:00+02:00",
                                "place": {
                                    "type": "place",
                                    "location": { "lat": 55.785306, "lng": 12.52338 }
                                }
                            },
                            "polyline": "BGqg9sqD2xl8XtC6NvHwqB3I0yBjN4pC5D-U",
                            "transport": { "mode": "pedestrian" }
                        }
                    ]
                }]
            }; */
            const route = data.routes[0];
            console.log('[HERE Transit API] Selected route:', route);
            
            // Process transit route sections to extract waypoints and route data
            const processedRoute = this.processTransitRoute(route,origin, destination);
            
            console.log('[HERE Transit API] Processed route structure:', {
                hasPolyline: !!processedRoute.polyline,
                polylineLength: processedRoute.polyline?.length || 0,
                waypointsCount: processedRoute.waypoints?.length || 0,
                segmentsCount: processedRoute.segments?.length || 0,
                isTransitRoute: processedRoute.isTransitRoute,
                duration: processedRoute.duration,
                distance: processedRoute.distance
            });
            
            return processedRoute;
            
        } catch (error) {
            console.error('Transit route calculation error:', error);
            throw error;
        }
    }

    processTransitRoute(transitRoute,origin, destination) {
        const sections = transitRoute.sections || [];
        const waypoints = [];
        const routeSegments = [];
        let totalDistance = 0;
        let totalDuration = 0;
        // Don't combine polylines - each segment has its own polyline

        // Get selected source/destination from global or window.routeMapApp
        const selectedOrigin = window.routeMapApp?.state?.addressState?.origin?.fullAddress || null;
const selectedDestination = window.routeMapApp?.state?.addressState?.destination?.fullAddress || null;
        console.log('[Transit Processing] selectedOrigin:', selectedOrigin, 'selectedDestination:', selectedDestination);

        console.log('[Transit Processing] Processing', sections.length, 'sections');

        sections.forEach((section, index) => {
            // If first section (r0-s0), override departure place name
            if (section.id == "R0-S0" && selectedOrigin) {
                if (!section.departure) section.departure = {};
                if (!section.departure.place) section.departure.place = {};
                section.departure.place.name = selectedOrigin;
            }
            // If last section, override arrival place name
            if (index === sections.length - 1 && selectedDestination) {
                if (!section.arrival) section.arrival = {};
                if (!section.arrival.place) section.arrival.place = {};
                section.arrival.place.name = selectedDestination;
            }
            // Log all departure waypoint values before duplicate check
        
            
            
            // Add departure waypoint for EVERY section
            if (section.departure && section.departure.place && section.departure.place.location) {
                const departureWaypoint = {
                    lat: section.departure.place.location.lat,
                    lng: section.departure.place.location.lng,
                    type: index === 0 ? 'origin' : 'mode_transition',
                    mode: section.transport?.mode || section.type,
                    placeName: section.departure.place.name || `Location ${waypoints.length + 1}`,
                    time: section.departure.time,
                    sectionIndex: index,
                    isTransitStop: section.type === 'transit',
                    transportInfo: section.transport ? {
                        mode: section.transport.mode,
                        name: section.transport.name || section.transport.shortName,
                        shortName: section.transport.shortName,
                        category: section.transport.category,
                        headsign: section.transport.headsign,
                        agency: section.agency?.name
                    } : null
                };
                console.log(`[Transit Processing] Departure waypoint values (section ${index}):`, departureWaypoint);
                // Check for duplicates (within 10 meters)
                const isDuplicate = waypoints.some(wp => 
                    Math.abs(wp.lat - departureWaypoint.lat) < 0.0001 && 
                    Math.abs(wp.lng - departureWaypoint.lng) < 0.0001
                );
                
                if (!isDuplicate) {
                    waypoints.push(departureWaypoint);
                    console.log(`[Transit Processing] Added departure waypoint:`, departureWaypoint.placeName);
                }
            }
            
            // Add arrival waypoint for EVERY section
            if (section.arrival && section.arrival.place && section.arrival.place.location) {
                const arrivalWaypoint = {
                    lat: section.arrival.place.location.lat,
                    lng: section.arrival.place.location.lng,
                    type: index === sections.length - 1 ? 'destination' : 'mode_transition',
                    mode: section.transport?.mode || section.type,
                    placeName: section.arrival.place.name || `Location ${waypoints.length + 1}`,
                    time: section.arrival.time,
                    sectionIndex: index,
                    isTransitStop: section.type === 'transit',
                    transportInfo: section.transport ? {
                        mode: section.transport.mode,
                        name: section.transport.name || section.transport.shortName,
                        shortName: section.transport.shortName,
                        category: section.transport.category,
                        headsign: section.transport.headsign,
                        agency: section.agency?.name
                    } : null
                };
                
                // Check for duplicates (within 10 meters)
                const isDuplicate = waypoints.some(wp => 
                    Math.abs(wp.lat - arrivalWaypoint.lat) < 0.0001 && 
                    Math.abs(wp.lng - arrivalWaypoint.lng) < 0.0001
                );
                
                if (!isDuplicate) {
                    waypoints.push(arrivalWaypoint);
                    console.log(`[Transit Processing] Added arrival waypoint:`, arrivalWaypoint.placeName);
                }
            }
            
            // Calculate section duration from departure/arrival times
            if (section.departure?.time && section.arrival?.time) {
                const departureTime = new Date(section.departure.time);
                const arrivalTime = new Date(section.arrival.time);
                const sectionDuration = (arrivalTime - departureTime) / 1000; // Duration in seconds
                totalDuration += sectionDuration;
            }
            
            // Note: Distance information is not provided in HERE Transit API response
            // We could estimate distance from polyline if needed
            
            // Check for and log coordinates availability before storing segment
            const hasDepCoordinates = !!(section.departure?.place?.location?.lat || section.departure?.place?.lat || section.departure?.lat);
            const hasArrCoordinates = !!(section.arrival?.place?.location?.lat || section.arrival?.place?.lat || section.arrival?.lat);
            
            console.log(`[Transit Processing] Segment ${index} coordinates check:`, {
                type: section.type,
                mode: section.transport?.mode || section.type,
                hasDepCoordinates,
                hasArrCoordinates,
                depLoc: section.departure?.place?.location || section.departure?.place || section.departure,
                arrLoc: section.arrival?.place?.location || section.arrival?.place || section.arrival,
            });
            
            // Store section information with individual polyline and create safe coordinate reference
            const segment = {
                type: section.type,
                mode: section.transport?.mode || section.type,
                departure: section.departure,
                arrival: section.arrival,
                transport: section.transport,
                agency: section.agency,
                polyline: section.polyline, // Keep individual polyline per segment
                duration: section.departure?.time && section.arrival?.time ? 
                    (new Date(section.arrival.time) - new Date(section.departure.time)) / 1000 : 0
            };
            
            // Add safe coordinate references
            if (section.departure?.place?.location?.lat) {
                segment.departureLoc = {
                    lat: section.departure.place.location.lat,
                    lng: section.departure.place.location.lng
                };
            } else if (section.departure?.place?.lat) {
                segment.departureLoc = {
                    lat: section.departure.place.lat,
                    lng: section.departure.place.lng
                };
            }
            
            if (section.arrival?.place?.location?.lat) {
                segment.arrivalLoc = {
                    lat: section.arrival.place.location.lat,
                    lng: section.arrival.place.location.lng
                };
            } else if (section.arrival?.place?.lat) {
                segment.arrivalLoc = {
                    lat: section.arrival.place.lat,
                    lng: section.arrival.place.lng
                };
            }
            
            routeSegments.push(segment);
        });
        
        console.log(`[Transit Processing] Created ${waypoints.length} waypoints and ${routeSegments.length} segments`);
        
        return {
            polyline: null, // Don't return combined polyline - use segments instead
            summary: {
                length: totalDistance,
                duration: totalDuration
            },
            waypoints: waypoints,
            segments: routeSegments,
            instructions: this.generateTransitInstructions(routeSegments),
            distance: totalDistance,
            duration: totalDuration,
            durationMin: Math.round(totalDuration / 60),
            isTransitRoute: true
        };
    }

    generateTransitInstructions(segments) {
        const instructions = [];
        
        segments.forEach((segment, index) => {
            if (segment.type === 'pedestrian') {
                if (index === 0) {
                    instructions.push(`Walk to ${segment.arrival?.place?.name || 'transit stop'}`);
                } else if (index === segments.length - 1) {
                    instructions.push(`Walk to destination`);
                } else {
                    instructions.push(`Walk to ${segment.arrival?.place?.name || 'next transit stop'}`);
                }
            } else if (segment.type === 'transit') {
                const transport = segment.transport;
                if (transport) {
                    let instruction = `Take ${transport.category || transport.mode}`;
                    if (transport.name || transport.shortName) {
                        instruction += ` ${transport.name || transport.shortName}`;
                    }
                    if (transport.headsign) {
                        instruction += ` towards ${transport.headsign}`;
                    }
                    instruction += ` to ${segment.arrival?.place?.name || 'destination'}`;
                    instructions.push(instruction);
                }
            }
        });
        
        return instructions;
    }
}

window.APIManager = APIManager;
