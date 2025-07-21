/**
 * Map Manager for handling all map-related operations
 */
class MapManager {
    constructor() {
        this.map = null;
        this.routeLayer = null;
        this.markersLayer = null;
        this.waypointMarkersLayer = null; // New layer for waypoint markers
        this.initialized = false;
    }
    
    init() {
        try {
            const mapContainer = document.getElementById('map');
            if (!mapContainer) {
                throw new Error('Map container not found');
            }
            
            // Initialize Leaflet map
            this.map = L.map('map', {
                center: [55.6761, 12.5683], // Copenhagen default
                zoom: 10,
                zoomControl: true,
                scrollWheelZoom: true
            });
            
            // Add OpenStreetMap tiles
            L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors',
                maxZoom: 19
            }).addTo(this.map);
            
            // Initialize layers
            this.routeLayer = L.layerGroup().addTo(this.map);
            this.markersLayer = L.layerGroup().addTo(this.map);
            this.waypointMarkersLayer = L.layerGroup().addTo(this.map); // New waypoint markers layer
            
            this.initialized = true;
            
            // Force map refresh
            setTimeout(() => {
                this.map.invalidateSize();
            }, 100);
            
            // Add resize handler for mobile
            window.addEventListener('resize', () => {
                if (this.map) {
                    setTimeout(() => {
                        this.map.invalidateSize();
                    }, 250);
                }
            });
            
        } catch (error) {
            console.error('Map initialization error:', error);
            throw error;
        }
    }
    
    // Method to refresh map size (useful for mobile layout changes)
    refreshMapSize() {
        if (this.map) {
            setTimeout(() => {
                this.map.invalidateSize();
            }, 100);
        }
    }
    
    addMarker(lat, lng, type = 'default', popup = null, transportInfo = null) {
        if (!this.initialized) return;
        
        let markerOptions, markerIcon;
        
        // Handle different marker types including transit-specific ones
        switch (type) {
            case 'origin':
                markerOptions = {
                    color: '#22c55e',
                    fillColor: '#22c55e',
                    fillOpacity: 0.8,
                    radius: 10,
                    weight: 3
                };
                break;
            case 'destination':
                markerOptions = {
                    color: '#ef4444',
                    fillColor: '#ef4444',
                    fillOpacity: 0.8,
                    radius: 10,
                    weight: 3
                };
                break;
            case 'transit-stop':
                markerOptions = {
                    color: '#8b5cf6',
                    fillColor: '#8b5cf6',
                    fillOpacity: 0.9,
                    radius: 8,
                    weight: 2
                };
                break;
            case 'waypoint':
                markerOptions = {
                    color: '#f59e0b',
                    fillColor: '#f59e0b',
                    fillOpacity: 0.8,
                    radius: 6,
                    weight: 2
                };
                break;
            default:
                markerOptions = {
                    color: '#3b82f6',
                    fillColor: '#3b82f6',
                    fillOpacity: 0.8,
                    radius: 8,
                    weight: 2
                };
        }
        
        const marker = L.circleMarker([lat, lng], markerOptions).addTo(this.markersLayer);
        
        // Enhanced popup for transit stops
        if (popup || transportInfo) {
            let popupContent = popup || '';
            
            if (transportInfo) {
                popupContent += `<div class="transit-info">`;
                if (transportInfo.mode) {
                    popupContent += `<div><strong>Mode:</strong> ${transportInfo.mode}</div>`;
                }
                if (transportInfo.name) {
                    popupContent += `<div><strong>Line:</strong> ${transportInfo.name}</div>`;
                }
                if (transportInfo.headsign) {
                    popupContent += `<div><strong>Direction:</strong> ${transportInfo.headsign}</div>`;
                }
                if (transportInfo.agency) {
                    popupContent += `<div><strong>Operator:</strong> ${transportInfo.agency}</div>`;
                }
                popupContent += `</div>`;
            }
            
            marker.bindPopup(popupContent);
        }
        
        return marker;
    }
    
    drawRoute(coordinates, color = '#3b82f6', options = {}) {
        if (!this.initialized || !coordinates || coordinates.length === 0) {
            console.error('Cannot draw route: invalid coordinates');
            return;
        }
        
        // Default options
        const routeOptions = {
            color: color,
            weight: options.weight || 5,
            opacity: options.opacity || 0.8,
            smoothFactor: 1,
            dashArray: options.dashArray || null
        };
        
        // Draw route polyline
        const routeLine = L.polyline(coordinates, routeOptions).addTo(this.routeLayer);
        
        return routeLine;
    }
    
    clearRoute() {
        if (this.routeLayer) {
            this.routeLayer.clearLayers();
        }
    }
    
    clearMarkers() {
        if (this.markersLayer) {
            this.markersLayer.clearLayers();
        }
    }
    
    clearAll() {
        this.clearRoute();
        this.clearMarkers();
        this.clearWeatherWaypoints();
    }
    
    fitBounds(bounds) {
        if (this.map && bounds) {
            this.map.fitBounds(bounds);
        }
    }
    
    setView(lat, lng, zoom = 13) {
        if (this.map) {
            this.map.setView([lat, lng], zoom);
        }
    }
    
    // Create weather icon based on weather description
    getWeatherIcon(description) {
        const desc = description.toLowerCase();
        if (desc.includes('clear') || desc.includes('sunny')) return '☀️';
        if (desc.includes('cloud')) return '☁️';
        if (desc.includes('rain') || desc.includes('drizzle')) return '🌧️';
        if (desc.includes('snow')) return '❄️';
        if (desc.includes('storm') || desc.includes('thunder')) return '⛈️';
        if (desc.includes('fog') || desc.includes('mist')) return '🌫️';
        if (desc.includes('wind')) return '💨';
        return '🌤️'; // Partly cloudy default
    }
    
    // Get temperature color based on value
    getTemperatureColor(temp) {
        if (temp < 0) return '#1e40af'; // Dark blue for freezing
        if (temp < 10) return '#3b82f6'; // Blue for cold
        if (temp < 20) return '#22c55e'; // Green for mild
        if (temp < 30) return '#f59e0b'; // Orange for warm
        return '#ef4444'; // Red for hot
    }
    
    // Create a weather waypoint marker
    addWeatherWaypoint(weatherData, type = 'waypoint') {
        if (!this.initialized) return;
        
        const { waypoint, temperature, description, humidity, windSpeed, precipitation, rainProbability, location } = weatherData;
        // Try to get the best available arrival time
        let arrivalTime = weatherData.estimatedArrivalTimeFormatted
            || weatherData.arrivalTimeFormatted
            || (waypoint && (waypoint.estimatedArrivalTimeFormatted || waypoint.arrivalTimeFormatted))
            || weatherData.time
            || (waypoint && waypoint.time)
            || '';
        
        // Check if we have valid waypoint data
        if (!waypoint || !waypoint.lat || !waypoint.lng) {
            console.warn('Invalid waypoint data:', waypoint);
            return null;
        }
        
        const lat = waypoint.lat;
        const lng = waypoint.lng;
        
        // Determine marker style based on type
        let markerColor, markerSize, iconText;
        
        if (type === 'origin') {
            markerColor = '#22c55e';
            markerSize = 12;
            iconText = '🚩';
        } else if (type === 'destination') {
            markerColor = '#ef4444';
            markerSize = 12;
            iconText = '🏁';
        } else if (type === 'transit-point') {
            // Special styling for transit segment points
            markerColor = '#3b82f6'; // Blue color
            markerSize = 10;
            iconText = '🚆';
            
            // Try to determine transit icon based on mode if available
            if (weatherData.mode) {
                switch (weatherData.mode.toLowerCase()) {
                    case 'walk': iconText = '🚶'; break;
                    case 'bicycle': iconText = '🚲'; break;
                    case 'bus': iconText = '🚌'; break;
                    case 'subway': case 'metro': iconText = '🚇'; break;
                    case 'tram': iconText = '🚊'; break;
                    case 'train': iconText = '🚆'; break;
                    case 'ferry': iconText = '⛴️'; break;
                    case 'airplane': case 'flight': iconText = '✈️'; break;
                    default: iconText = '🚆';
                }
            }
        } else {
            markerColor = this.getTemperatureColor(temperature);
            markerSize = 8;
            iconText = this.getWeatherIcon(description);
        }
        
        // Create custom divIcon with weather emoji
        const customIcon = L.divIcon({
            html: `<div style="
                background-color: ${markerColor};
                width: ${markerSize * 2}px;
                height: ${markerSize * 2}px;
                border-radius: 50%;
                border: 2px solid white;
                box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: ${markerSize}px;
                position: relative;
            ">${iconText}</div>`,
            className: 'weather-waypoint-marker',
            iconSize: [markerSize * 2, markerSize * 2],
            iconAnchor: [markerSize, markerSize]
        });
        
        // Create detailed popup content
        const popupContent = `
            <div style="min-width: 200px; font-family: 'Inter', sans-serif;">
                <div style="border-bottom: 1px solid #e5e7eb; padding-bottom: 8px; margin-bottom: 8px;">
                    <h3 style="margin: 0 0 4px 0; font-size: 14px; font-weight: 600; color: #111827;">
                        ${location || `Waypoint ${(weatherData.waypoint?.index ?? 0) + 1}`}
                    </h3>
                    <p style="margin: 0; font-size: 12px; color: #6b7280;">
                        Arrival: ${arrivalTime || 'N/A'}
                    </p>
                </div>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px;">
                    <div style="text-align: center; padding: 6px; background: #f3f4f6; border-radius: 6px;">
                        <div style="font-size: 18px; margin-bottom: 2px;">${this.getWeatherIcon(description)}</div>
                        <div style="font-size: 14px; font-weight: 600; color: #111827;">${Math.round(temperature)}°C</div>
                        <div style="font-size: 10px; color: #6b7280; text-transform: capitalize;">${description}</div>
                    </div>
                    
                    <div style="font-size: 11px; color: #374151; line-height: 1.3;">
                        <div style="margin-bottom: 2px;"><strong>Humidity:</strong> ${humidity}%</div>
                        <div style="margin-bottom: 2px;"><strong>Wind:</strong> ${Math.round(windSpeed)} km/h</div>
                        <div style="margin-bottom: 2px;"><strong>Rain:</strong> ${rainProbability}%</div>
                        ${precipitation > 0 ? `<div style="margin-bottom: 2px;"><strong>Precip:</strong> ${precipitation.toFixed(1)}mm</div>` : ''}
                        ${weatherData.windGust ? `<div style="margin-bottom: 2px;"><strong>Gust:</strong> ${weatherData.windGust.toFixed(1)} km/h</div>` : ''}
                        ${weatherData.windDeg !== undefined ? `<div><strong>Dir:</strong> ${weatherData.windDeg}°</div>` : ''}
                    </div>
                </div>
                
                ${rainProbability > 60 ? `
                    <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 4px; padding: 6px; font-size: 11px; color: #92400e;">
                        ⚠️ High chance of rain (${rainProbability}%)
                    </div>
                ` : ''}
                
                ${temperature < 0 ? `
                    <div style="background: #dbeafe; border: 1px solid #3b82f6; border-radius: 4px; padding: 6px; font-size: 11px; color: #1e40af;">
                        ❄️ Freezing conditions - drive carefully
                    </div>
                ` : ''}
            </div>
        `;
        
        // Create marker and add to waypoints layer
        const marker = L.marker([lat, lng], { icon: customIcon }).addTo(this.waypointMarkersLayer);
        marker.bindPopup(popupContent, {
            maxWidth: 250,
            className: 'weather-popup'
        });
        
        // Add hover effect
        marker.on('mouseover', function() {
            this.openPopup();
        });
        
        return marker;
    }
    
    // Clear all waypoint markers
    clearWeatherWaypoints() {
        if (this.waypointMarkersLayer) {
            this.waypointMarkersLayer.clearLayers();
        }
    }
    
    // Add multiple weather waypoints from weather data array
    addWeatherWaypoints(weatherDataArray) {
        if (!this.initialized || !weatherDataArray || weatherDataArray.length === 0) return;
        
        weatherDataArray.forEach((weatherData, index) => {
            let type = 'waypoint';
            
            // Determine waypoint type based on position or waypoint data
            if (weatherData.waypoint && weatherData.waypoint.type) {
                type = weatherData.waypoint.type;
            } else if (index === 0) {
                type = 'origin';
            } else if (index === weatherDataArray.length - 1) {
                type = 'destination';
            }
            
            this.addWeatherWaypoint(weatherData, type);
        });
    }
    
    // Add transit segment weather markers (for departure and arrival points)
    addTransitSegmentWeatherMarkers(segments) {
        if (!this.initialized || !segments || segments.length === 0) return;
        
        // Clear existing weather waypoints
        this.clearWeatherWaypoints();
        
        segments.forEach((segment, segmentIndex) => {
            const isFirstSegment = segmentIndex === 0;
            const isLastSegment = segmentIndex === segments.length - 1;
            
            // Add departure point marker
            if (segment.departure?.weather && segment.departure?.point) {
                const depWeather = segment.departure.weather;
                // Add mode information to help with marker display
                depWeather.mode = segment.mode;
                
                // Ensure waypoint data is available
                depWeather.waypoint = {
                    lat: segment.departure.point.lat,
                    lng: segment.departure.point.lng,
                    type: isFirstSegment ? 'origin' : 'waypoint',
                    index: segmentIndex * 2
                };
                
                // Create custom icon for segment markers
                const markerType = isFirstSegment ? 'origin' : 'transit-point';
                this.addWeatherWaypoint(depWeather, markerType);
            }
            
            // Add arrival point marker
            if (segment.arrival?.weather && segment.arrival?.point) {
                const arrWeather = segment.arrival.weather;
                // Add mode information to help with marker display
                arrWeather.mode = segment.mode;
                
                // Ensure waypoint data is available
                arrWeather.waypoint = {
                    lat: segment.arrival.point.lat,
                    lng: segment.arrival.point.lng,
                    type: isLastSegment ? 'destination' : 'waypoint',
                    index: segmentIndex * 2 + 1
                };
                
                // Create custom icon for segment markers
                const markerType = isLastSegment ? 'destination' : 'transit-point';
                this.addWeatherWaypoint(arrWeather, markerType);
            }
        });
    }
}

window.MapManager = MapManager;
