/**
 * Utility functions for the Route Map Application
 */
class Utils {
    static debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
    
    static formatDistance(meters) {
        if (meters < 1000) {
            return Math.round(meters) + ' m';
        } else {
            return (meters / 1000).toFixed(1) + ' km';
        }
    }
    
    static formatDuration(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        
        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        } else {
            return `${minutes}m`;
        }
    }
    
    static showError(message) {
        const errorEl = document.getElementById('error-message');
        if (errorEl) {
            errorEl.textContent = message;
            errorEl.classList.remove('hidden');
        }
    }
    
    static hideError() {
        const errorEl = document.getElementById('error-message');
        if (errorEl) {
            errorEl.classList.add('hidden');
        }
    }
    
    static showLoading() {
        const loadingEl = document.getElementById('loading-overlay');
        if (loadingEl) {
            loadingEl.classList.remove('hidden');
        }
    }
    
    static hideLoading() {
        const loadingEl = document.getElementById('loading-overlay');
        if (loadingEl) {
            loadingEl.classList.add('hidden');
        }
    }
    
    static updateRouteInfo(routeData, departureTime = null) {
        const distanceEl = document.getElementById('route-distance');
        const durationEl = document.getElementById('route-duration');
        const routeInfoEl = document.getElementById('route-info');
        
        if (distanceEl) distanceEl.textContent = Utils.formatDistance(routeData.distance);
        if (durationEl) durationEl.textContent = Utils.formatDuration(routeData.duration);
        
        // Remove transit styling for regular routes
        if (routeInfoEl) {
            routeInfoEl.classList.remove('transit-route');
        }
        
        // Add departure time info if provided
        if (departureTime && routeInfoEl) {
            let departureInfoEl = document.getElementById('departure-info');
            if (!departureInfoEl) {
                // Create departure info element if it doesn't exist
                departureInfoEl = document.createElement('div');
                departureInfoEl.id = 'departure-info';
                departureInfoEl.className = 'departure-info';
                departureInfoEl.style.cssText = `
                    margin-top: 12px;
                    padding: 8px 12px;
                    background: rgba(102, 126, 234, 0.1);
                    border-radius: 8px;
                    border-left: 3px solid #667eea;
                    position: relative;
                    z-index: 2;
                `;
                
                // Insert after route stats
                const routeStats = routeInfoEl.querySelector('.route-stats');
                if (routeStats) {
                    routeStats.parentNode.insertBefore(departureInfoEl, routeStats.nextSibling);
                }
            }
            
            const now = new Date();
            const isNow = Math.abs(departureTime.getTime() - now.getTime()) < 60000; // Within 1 minute
            
            if (isNow) {
                departureInfoEl.innerHTML = `
                    <div style="color: rgba(255,255,255,0.8); font-size: 0.85rem;">
                        🕐 <strong>Departing:</strong> Now
                    </div>
                `;
            } else {
                const arrivalTime = new Date(departureTime.getTime() + routeData.duration * 1000);
                departureInfoEl.innerHTML = `
                    <div style="color: rgba(255,255,255,0.8); font-size: 0.85rem; margin-bottom: 4px;">
                        🕐 <strong>Departing:</strong> ${departureTime.toLocaleString('en-US', {
                            weekday: 'short',
                            month: 'short', 
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit'
                        })}
                    </div>
                    <div style="color: rgba(255,255,255,0.6); font-size: 0.8rem;">
                        🏁 <strong>Arriving:</strong> ${arrivalTime.toLocaleString('en-US', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric', 
                            hour: 'numeric',
                            minute: '2-digit'
                        })}
                    </div>
                `;
            }
        }
        
        if (routeInfoEl) routeInfoEl.classList.remove('hidden');
    }
}

window.Utils = Utils;
