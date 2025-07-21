// --- Swap Origin and Destination Functionality ---
document.addEventListener('DOMContentLoaded', function () {
    const swapBtn = document.getElementById('swap-btn');
    const originInput = document.getElementById('origin-input');
    const destinationInput = document.getElementById('destination-input');
    if (swapBtn && originInput && destinationInput) {
        swapBtn.addEventListener('click', function () {
            // Swap values
            const temp = originInput.value;
            originInput.value = destinationInput.value;
            destinationInput.value = temp;
            // Optionally, trigger input events for suggestions
            originInput.dispatchEvent(new Event('input', { bubbles: true }));
            destinationInput.dispatchEvent(new Event('input', { bubbles: true }));
        });
    }
});
/**
 * Main Application Controller
 */
class RouteMapApp {
    constructor() {
        this.apiManager = new APIManager();
        this.mapManager = new MapManager();
        this.routeManager = new RouteManager(this.apiManager, this.mapManager);
        
        // Initialize WeatherManager
        if (typeof WeatherManager !== 'undefined') {
            this.weatherManager = new WeatherManager();
            window.weatherManager = this.weatherManager;
        }
        
        this.state = {
            selectedTransportMode: 'car',
            selectedRouteType: 'fast',
            debounceTimers: {},
            // Progressive address input state
            addressState: {
                origin: {
                    stage: 'initial', // 'initial', 'street_selected', 'complete'
                    streetName: '',
                    fullAddress: '',
                    coordinates: null,
                    isProgressive: false
                },
                destination: {
                    stage: 'initial',
                    streetName: '',
                    fullAddress: '',
                    coordinates: null,
                    isProgressive: false
                }
            }
        };
        
        this.init();
    }
    
    async init() {
        try {
            // Wait for DOM to be ready
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => {
                    this.initializeApp();
                });
            } else {
                this.initializeApp();
            }
        } catch (error) {
            console.error('App initialization error:', error);
            Utils.showError('Failed to initialize application');
        }
    }
    
    initializeApp() {
        // Initialize map
        this.mapManager.init();
        
        // Bind event listeners
        this.bindEventListeners();
        
        // Initialize route type options for default transport mode (car)
        this.updateRouteTypeOptions(this.state.selectedTransportMode);
    }
    
    bindEventListeners() {
        // Search inputs
        this.bindSearchInputs();
        
        // Transport mode buttons
        this.bindTransportModeButtons();
        
        // Route type selection
        this.bindRouteTypeSelection();
        
        // Departure time selection
        this.bindDepartureTimeSelection();
        
        // Action buttons
        this.bindActionButtons();
        
        // Global click handler for closing suggestions
        this.bindGlobalClickHandler();
        
        // Floating action buttons
        this.bindFloatingActionButtons();
        
        // Map style controls
        this.bindMapStyleControls();
    }
    
    bindSearchInputs() {
        const originInput = document.getElementById('origin-input');
        const destinationInput = document.getElementById('destination-input');
        
        if (originInput) {
            originInput.addEventListener('input', Utils.debounce((e) => {
                this.handleSearchInput(e, 'origin');
            }, 300));
        }
        
        if (destinationInput) {
            destinationInput.addEventListener('input', Utils.debounce((e) => {
                this.handleSearchInput(e, 'destination');
            }, 300));
        }
    }
    
    bindTransportModeButtons() {
        document.querySelectorAll('.transport-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                this.handleTransportModeChange(e.currentTarget);
            });
        });
    }
    
    bindRouteTypeSelection() {
        const routeTypeSelect = document.getElementById('route-type');
        if (routeTypeSelect) {
            routeTypeSelect.addEventListener('change', (e) => {
                this.state.selectedRouteType = e.target.value;
            });
        }
    }
    
    bindActionButtons() {
        const getRouteBtn = document.getElementById('get-route-btn');
        const clearRouteBtn = document.getElementById('clear-route-btn');
        
        if (getRouteBtn) {
            getRouteBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.handleGetRoute();
            });
        }
        
        if (clearRouteBtn) {
            clearRouteBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.handleClearRoute();
            });
        }
    }
    
    bindGlobalClickHandler() {
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.input-wrapper')) {
                this.hideSuggestions();
            }
        });
    }
    
    bindFloatingActionButtons() {
        // Current location button
        const currentLocationBtn = document.getElementById('current-location-btn');
        if (currentLocationBtn) {
            currentLocationBtn.addEventListener('click', () => {
                this.getCurrentLocation();
            });
        }
        
        // Fullscreen button
        const fullscreenBtn = document.getElementById('fullscreen-btn');
        if (fullscreenBtn) {
            fullscreenBtn.addEventListener('click', () => {
                this.toggleFullscreen();
            });
        }
        
        // Quick route button
        const quickRouteBtn = document.getElementById('quick-route-btn');
        if (quickRouteBtn) {
            quickRouteBtn.addEventListener('click', () => {
                this.quickRoute();
            });
        }
    }
    
    bindMapStyleControls() {
        const styleButtons = document.querySelectorAll('.map-style-btn');
        styleButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                // Remove active class from all buttons
                styleButtons.forEach(b => b.classList.remove('active'));
                // Add active class to clicked button
                btn.classList.add('active');
                
                const style = btn.dataset.style;
                this.changeMapStyle(style);
            });
        });
    }
    
    bindDepartureTimeSelection() {
        const departureOptions = document.querySelectorAll('input[name="departure-option"]');
        const datetimeContainer = document.getElementById('departure-datetime-container');
        const departureDateInput = document.getElementById('departure-date');
        const departureTimeInput = document.getElementById('departure-time-input');
        const departureTimeDisplay = document.getElementById('departure-time-display');
        
        // Initialize with current date and time
        this.initializeDepartureTime();
        
        // Handle departure option change (Now vs Later)
        departureOptions.forEach(option => {
            option.addEventListener('change', (e) => {
                if (e.target.value === 'later') {
                    datetimeContainer.style.display = 'block';
                    setTimeout(() => {
                        datetimeContainer.classList.add('show');
                    }, 10);
                } else {
                    datetimeContainer.classList.remove('show');
                    setTimeout(() => {
                        datetimeContainer.style.display = 'none';
                    }, 300);
                }
                this.updateDepartureTimeDisplay();
            });
        });
        
        // Handle date/time input changes
        if (departureDateInput) {
            departureDateInput.addEventListener('change', () => {
                this.updateDepartureTimeDisplay();
            });
        }
        
        if (departureTimeInput) {
            departureTimeInput.addEventListener('change', () => {
                this.updateDepartureTimeDisplay();
            });
        }
    }
    
    initializeDepartureTime() {
        const now = new Date();
        const departureDateInput = document.getElementById('departure-date');
        const departureTimeInput = document.getElementById('departure-time-input');
        
        if (departureDateInput) {
            departureDateInput.value = now.toISOString().split('T')[0];
            // Set minimum date to today
            departureDateInput.min = now.toISOString().split('T')[0];
            // Set maximum date to 7 days from now (OpenWeatherMap limitation)
            const maxDate = new Date(now);
            maxDate.setDate(maxDate.getDate() + 7);
            departureDateInput.max = maxDate.toISOString().split('T')[0];
        }
        
        if (departureTimeInput) {
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            departureTimeInput.value = `${hours}:${minutes}`;
        }
        
        this.updateDepartureTimeDisplay();
    }
    
    updateDepartureTimeDisplay() {
        const departureTimeDisplay = document.getElementById('departure-time-display');
        const selectedOption = document.querySelector('input[name="departure-option"]:checked');
        
        if (!departureTimeDisplay) return;
        
        if (selectedOption?.value === 'now') {
            departureTimeDisplay.textContent = 'Using current time for weather forecasts';
        } else {
            const selectedDate = this.getSelectedDepartureTime();
            if (selectedDate) {
                const now = new Date();
                const timeDiff = selectedDate.getTime() - now.getTime();
                const hoursDiff = Math.round(timeDiff / (1000 * 60 * 60));
                
                let timeText = selectedDate.toLocaleString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit'
                });
                
                if (hoursDiff > 0) {
                    timeText += ` (${hoursDiff}h from now)`;
                } else if (hoursDiff === 0) {
                    timeText += ' (within an hour)';
                } else {
                    timeText += ' (past time - using current weather)';
                }
                
                departureTimeDisplay.textContent = timeText;
            }
        }
    }
    
    getSelectedDepartureTime() {
        const selectedOption = document.querySelector('input[name="departure-option"]:checked');
        
        if (selectedOption?.value === 'now') {
            return new Date();
        } else {
            const departureDateInput = document.getElementById('departure-date');
            const departureTimeInput = document.getElementById('departure-time-input');
            
            if (departureDateInput?.value && departureTimeInput?.value) {
                const dateTimeString = `${departureDateInput.value}T${departureTimeInput.value}`;
                return new Date(dateTimeString);
            }
            
            return new Date(); // Fallback to current time
        }
    }
    
    async handleSearchInput(event, type) {
        const query = event.target.value.trim();
        const addressState = this.state.addressState[type];
        
        // Reset state if user clears the input
        if (query.length === 0) {
            this.resetAddressState(type);
            this.hideSuggestions(type);
            return;
        }
        
        if (query.length < 2) {
            this.hideSuggestions(type);
            return;
        }

        // Check if this is a continuation of a street-level selection
        if (addressState.stage === 'street_selected' && query.startsWith(addressState.streetName)) {
            // User is refining the street address (e.g., adding house number)
            const refinement = query.substring(addressState.streetName.length).trim();
            if (refinement.length > 0) {
                // Search for more specific addresses on this street
                await this.searchProgressiveAddress(query, type, true);
            } else {
                // Just the street name, hide suggestions
                this.hideSuggestions(type);
            }
            return;
        }

        // Regular search
        await this.searchProgressiveAddress(query, type, false);
    }

    async searchProgressiveAddress(query, type, isRefinement = false) {
        try {
            const mapboxResults = await this.apiManager.searchMapbox(query);
            const uniqueResults = this.deduplicateResults(mapboxResults);

            // Categorize results for progressive display
            const categorizedResults = this.categorizeSearchResults(uniqueResults, query, isRefinement);
            
            this.showProgressiveSuggestions(categorizedResults, type, isRefinement);

        } catch (error) {
            console.error('Search error:', error);
        }
    }

    categorizeSearchResults(results, query, isRefinement) {
        const streets = [];
        const completeAddresses = [];
        
        results.forEach(result => {
            // Determine if this is a street-level or complete address result
            const addressParts = result.full_address.split(',');
            const hasHouseNumber = /^\d+/.test(result.name) || /\d+/.test(addressParts[0]);
            
            if (hasHouseNumber || result.full_address.includes('Denmark') || isRefinement) {
                // Complete address with house number or country context
                completeAddresses.push({
                    ...result,
                    type: 'complete',
                    displayText: result.full_address,
                    searchText: result.name
                });
            } else {
                // Street-level result
                const streetName = result.name || addressParts[0];
                streets.push({
                    ...result,
                    type: 'street',
                    displayText: `${streetName} (street)`,
                    searchText: streetName,
                    streetName: streetName
                });
            }
        });

        return {
            streets: streets.slice(0, 3),
            completeAddresses: completeAddresses.slice(0, 5)
        };
    }
    
    deduplicateResults(results) {
        const seen = new Set();
        return results.filter(result => {
            const key = result.full_address.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }
      showProgressiveSuggestions(categorizedResults, type, isRefinement = false) {
        const suggestionsEl = document.getElementById(`${type}-suggestions`);
        if (!suggestionsEl) return;
        
        const { streets, completeAddresses } = categorizedResults;
        const allResults = [...streets, ...completeAddresses];
        
        if (allResults.length === 0) {
            suggestionsEl.classList.add('hidden');
            return;
        }
        
        let html = '';
        
        // Show street-level suggestions first (unless in refinement mode)
        if (!isRefinement && streets.length > 0) {
            html += '<div class="suggestions-section">';
            html += '<div class="suggestions-header">Streets</div>';
            streets.forEach(item => {
                html += `
                    <div class="suggestion-item street-suggestion" 
                         data-type="street" 
                         data-street-name="${item.streetName}"
                         data-coordinates="${item.coordinates ? item.coordinates.join(',') : ''}" 
                         data-address="${item.full_address}">
                        <div class="suggestion-main">
                            <span class="suggestion-icon">🛤️</span>
                            ${item.searchText}
                        </div>
                        <div class="suggestion-secondary">Select to refine with house number</div>
                    </div>
                `;
            });
            html += '</div>';
        }
        
        // Show complete addresses
        if (completeAddresses.length > 0) {
            if (!isRefinement && streets.length > 0) {
                html += '<div class="suggestions-section">';
                html += '<div class="suggestions-header">Complete Addresses</div>';
            }
            completeAddresses.forEach(item => {
                html += `
                    <div class="suggestion-item address-suggestion" 
                         data-type="complete"
                         data-coordinates="${item.coordinates ? item.coordinates.join(',') : ''}" 
                         data-address="${item.full_address}">
                        <div class="suggestion-main">
                            <span class="suggestion-icon">📍</span>
                            ${item.searchText}
                        </div>
                        <div class="suggestion-secondary">${item.full_address}</div>
                    </div>
                `;
            });
            if (!isRefinement && streets.length > 0) {
                html += '</div>';
            }
        }
        
        suggestionsEl.innerHTML = html;
        
        // Add click handlers for progressive selection
        suggestionsEl.querySelectorAll('.suggestion-item').forEach(item => {
            item.addEventListener('click', (e) => {
                this.selectProgressiveSuggestion(e.currentTarget, type);
            });
        });
        
        suggestionsEl.classList.remove('hidden');
    }

    selectProgressiveSuggestion(element, type) {
        const suggestionType = element.dataset.type;
        const address = element.dataset.address;
        const coordinates = element.dataset.coordinates;
        const inputEl = document.getElementById(`${type}-input`);
        
        if (suggestionType === 'street') {
            // Street-level selection - progressive input
            const streetName = element.dataset.streetName;
            
            if (inputEl) {
                inputEl.value = streetName + ' ';
                inputEl.focus();
                // Position cursor at the end
                setTimeout(() => {
                    inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
                }, 10);
            }
            
            // Update state for progressive input
            this.state.addressState[type] = {
                stage: 'street_selected',
                streetName: streetName,
                fullAddress: '',
                coordinates: null,
                isProgressive: true
            };
            
            this.hideSuggestions(type);
            this.updateInputStateIndicator(type);
            
            // Show a helpful message
            this.showProgressiveHint(type, 'Add house number or select from suggestions above');
            
        } else if (suggestionType === 'complete') {
            // Complete address selection - final selection
            if (inputEl) {
                inputEl.value = address;
            }
            
            // Store coordinates and complete state
            if (coordinates) {
                const [lng, lat] = coordinates.split(',').map(Number);
                this.state.addressState[type] = {
                    stage: 'complete',
                    streetName: '',
                    fullAddress: address,
                    coordinates: { lat, lng },
                    isProgressive: false
                };
                this[`${type}Location`] = { lat, lng };
            }
            
            this.hideSuggestions(type);
            this.hideProgressiveHint(type);
            this.updateInputStateIndicator(type);
        }
    }

    showProgressiveHint(type, message) {
        let hintEl = document.getElementById(`${type}-progressive-hint`);
        if (!hintEl) {
            hintEl = document.createElement('div');
            hintEl.id = `${type}-progressive-hint`;
            hintEl.className = 'progressive-hint';
            
            const inputWrapper = document.querySelector(`#${type}-input`).closest('.input-wrapper');
            inputWrapper.appendChild(hintEl);
        }
        
        hintEl.textContent = message;
        hintEl.style.display = 'block';
    }

    hideProgressiveHint(type) {
        const hintEl = document.getElementById(`${type}-progressive-hint`);
        if (hintEl) {
            hintEl.style.display = 'none';
        }
    }

    resetAddressState(type) {
        this.state.addressState[type] = {
            stage: 'initial',
            streetName: '',
            fullAddress: '',
            coordinates: null,
            isProgressive: false
        };
        this.hideProgressiveHint(type);
        this.updateInputStateIndicator(type);
        delete this[`${type}Location`];
    }
    
    hideSuggestions(type = null) {
        if (type) {
            const suggestionsEl = document.getElementById(`${type}-suggestions`);
            if (suggestionsEl) {
                suggestionsEl.classList.add('hidden');
            }
        } else {
            document.querySelectorAll('.suggestions-dropdown').forEach(el => {
                el.classList.add('hidden');
            });
        }
    }
    
    handleTransportModeChange(button) {
        // Update UI
        document.querySelectorAll('.transport-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        button.classList.add('active');
        
        // Update state
        this.state.selectedTransportMode = button.dataset.mode;
        
        // Update available route type options based on transport mode
        this.updateRouteTypeOptions(button.dataset.mode);
        // Show/hide turn-by-turn directions for transit mode only
        const transitInstructionsContainer = document.getElementById('transit-instructions-container');
        if (transitInstructionsContainer) {
            if (button.dataset.mode === 'publicTransport') {
                transitInstructionsContainer.style.display = '';
            } else {
                transitInstructionsContainer.style.display = 'none';
            }
        }
    }
    
    // Update route type options based on selected transport mode
    updateRouteTypeOptions(transportMode) {
        const routeTypeSelect = document.getElementById('route-type');
        const indicator = document.getElementById('route-type-indicator');
        if (!routeTypeSelect) return;
        
        // Define available options for each transport mode based on HERE API compatibility
        const routeTypeOptions = {
            car: [
                { value: 'fast', label: '⚡ Fastest Route', description: 'Minimize travel time' },
                { value: 'short', label: '📏 Shortest Route', description: 'Minimize distance' },
                { value: 'balanced', label: '⚖️ Balanced Route', description: 'Balance time and distance' }
            ],
            bicycle: [
                { value: 'fast', label: '⚡ Fastest Route', description: 'Minimize travel time' }
                // Note: Only 'fast' is supported for bicycle mode
            ],
            pedestrian: [
                { value: 'fast', label: '⚡ Fastest Route', description: 'Most efficient walking route' }
                // Note: only 'fast' is supported for pedestrian mode
            ],
            publicTransport: [
                { value: 'fast', label: '⚡ Fastest Route', description: 'Minimize travel time' },
                { value: 'balanced', label: '⚖️ Balanced Route', description: 'Balance time and transfers' }
            ]
        };
        
        const availableOptions = routeTypeOptions[transportMode] || routeTypeOptions.car;
        const currentValue = routeTypeSelect.value;
        
        // Add updating class for visual feedback
        routeTypeSelect.classList.add('updating');
        
        // Clear existing options
        routeTypeSelect.innerHTML = '';
        
        // Add available options
        availableOptions.forEach(option => {
            const optionElement = document.createElement('option');
            optionElement.value = option.value;
            optionElement.textContent = option.label;
            optionElement.title = option.description;
            routeTypeSelect.appendChild(optionElement);
        });
        
        // Update indicator
        if (indicator) {
            const optionCount = availableOptions.length;
            const transportModeNames = {
                car: 'Driving',
                bicycle: 'Cycling', 
                pedestrian: 'Walking',
                publicTransport: 'Transit'
            };
            
            indicator.textContent = `${optionCount} option${optionCount > 1 ? 's' : ''} for ${transportModeNames[transportMode]}`;
            indicator.style.display = 'block';
            
            // Add appropriate class based on option count
            indicator.className = 'route-type-indicator';
            if (optionCount === 1) {
                indicator.classList.add('single');
            } else if (optionCount === 2) {
                indicator.classList.add('limited');
            }
        }
        
        // Set the selected value if it's still available, otherwise select the first option
        const isCurrentValueAvailable = availableOptions.some(option => option.value === currentValue);
        if (isCurrentValueAvailable) {
            routeTypeSelect.value = currentValue;
        } else {
            routeTypeSelect.value = availableOptions[0].value;
            // Update state to reflect the new selection
            this.state.selectedRouteType = availableOptions[0].value;
        }
        
        // Remove updating class after a delay
        setTimeout(() => {
            routeTypeSelect.classList.remove('updating');
        }, 300);
        
        // Add visual feedback for users about the change
        if (!isCurrentValueAvailable && currentValue) {
            // Show a brief notification to the user
            this.showRouteTypeChangeNotification(transportMode, availableOptions.length, !isCurrentValueAvailable);
        }
    }
    
    // Show a subtle notification when route options change
    showRouteTypeChangeNotification(transportMode, optionCount, wasChanged = false) {
        const indicator = document.getElementById('route-type-indicator');
        if (!indicator) return;
        
        // Add a temporary animation to draw attention
        if (wasChanged) {
            indicator.style.animation = 'pulse 0.6s ease-in-out';
            setTimeout(() => {
                indicator.style.animation = '';
            }, 600);
        }
        
        // Enhanced logging for bicycle mode limitations
        const modeNames = {
            car: 'driving',
            bicycle: 'cycling', 
            pedestrian: 'walking',
            publicTransport: 'public transport'
        };
        
        let changeMessage = '';
        if (wasChanged) {
            if (transportMode === 'bicycle') {
                changeMessage = ' (balanced mode not supported for cycling, switched to fast)';
            } else if (transportMode === 'pedestrian') {
                changeMessage = ' (only fast route available for walking)';
            } else {
                changeMessage = ' (route type auto-adjusted)';
            }
        }
        
        // Show brief user notification for cycling mode limitations
        if (transportMode === 'bicycle' && wasChanged) {
            this.showBriefNotification('🚴‍♂️ Cycling routes: Fast & Short modes available', 'info');
        }
    }
    
    // Show brief notification to user
    showBriefNotification(message, type = 'info') {
        // Create notification element if it doesn't exist
        let notification = document.getElementById('brief-notification');
        if (!notification) {
            notification = document.createElement('div');
            notification.id = 'brief-notification';
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: rgba(255, 255, 255, 0.95);
                backdrop-filter: blur(10px);
                border-radius: 12px;
                padding: 12px 16px;
                font-size: 14px;
                font-weight: 500;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
                border: 1px solid rgba(255, 255, 255, 0.2);
                z-index: 10000;
                transform: translateX(100%);
                transition: transform 0.3s ease;
                max-width: 300px;
            `;
            document.body.appendChild(notification);
        }
        
        // Set message and style based on type
        notification.textContent = message;
        
        if (type === 'info') {
            notification.style.background = 'rgba(59, 130, 246, 0.95)';
            notification.style.color = 'white';
        } else if (type === 'warning') {
            notification.style.background = 'rgba(245, 158, 11, 0.95)';
            notification.style.color = 'white';
        } else if (type === 'success') {
            notification.style.background = 'rgba(34, 197, 94, 0.95)';
            notification.style.color = 'white';
        }
        
        // Show notification
        notification.style.transform = 'translateX(0)';
        
        // Hide after 3 seconds
        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
        }, 3000);
    }
    
    async handleGetRoute() {
        try {
            const originInput = document.getElementById('origin-input');
            const destinationInput = document.getElementById('destination-input');

            if (!originInput?.value || !destinationInput?.value) {
                Utils.showError('Please enter both origin and destination');
                return;
            }

            // Store the current input values globally for all scripts
            this.state.addressState.origin.fullAddress = originInput.value;
            this.state.addressState.destination.fullAddress = destinationInput.value;

            // Validate that addresses are complete (not in progressive state)
            const originState = this.state.addressState.origin;
            const destinationState = this.state.addressState.destination;
            
            if (originState.stage === 'street_selected') {
                Utils.showError('Please complete the origin address by adding a house number or selecting a specific address');
                document.getElementById('origin-input').focus();
                return;
            }
            
            if (destinationState.stage === 'street_selected') {
                Utils.showError('Please complete the destination address by adding a house number or selecting a specific address');
                document.getElementById('destination-input').focus();
                return;
            }
            
            // Get coordinates - prioritize stored coordinates from progressive selection
            let origin = this.getAddressCoordinates('origin');
            let destination = this.getAddressCoordinates('destination');
            
            // Fallback to geocoding if no coordinates stored
            if (!origin) {
                origin = await this.apiManager.geocodeWithOpenCage(originInput.value);
            }
            
            if (!destination) {
                destination = await this.apiManager.geocodeWithOpenCage(destinationInput.value);
            }
            
            // Get selected departure time
            const departureTime = this.getSelectedDepartureTime();

            // Calculate route (returns after drawing first route)
            await this.routeManager.calculateRoute(
                origin,
                destination,
                this.state.selectedTransportMode,
                this.state.selectedRouteType,
                departureTime
            );

            // Show alternatives UI if available
            this.showRouteAlternativesUI(origin, destination, departureTime);

        } catch (error) {
            console.error('Route calculation error:', error);
            Utils.showError('Failed to calculate route: ' + error.message);
        }
    }

    showRouteAlternativesUI(origin, destination, departureTime) {
        const altContainer = document.getElementById('route-alternatives');
        if (!altContainer || !this.routeManager.allRoutes || this.routeManager.allRoutes.length < 2) {
            if (altContainer) altContainer.style.display = 'none';
            return;
        }
        
        // Show the alternatives UI with smooth animation
        altContainer.style.display = 'flex';
        
        // Highlight the selected route (Route 1 by default)
        const btns = altContainer.querySelectorAll('.route-alt-btn');
        btns.forEach((btn, idx) => {
            btn.classList.toggle('active', idx === 0);
            btn.onclick = () => {
                // Update highlighting
                btns.forEach((b, i) => b.classList.toggle('active', i === idx));
                // Show selected route
                this.routeManager.showRouteByIndex(idx, origin, destination, this.state.selectedTransportMode, this.state.selectedRouteType, departureTime);
            };
        });
    }
    
    handleClearRoute() {
        this.routeManager.clearRoute();
        this.originLocation = null;
        this.destinationLocation = null;
        
        // Hide route alternatives UI when clearing route
        const altContainer = document.getElementById('route-alternatives');
        if (altContainer) {
            altContainer.style.display = 'none';
        }
        
        // Reset progressive address states
        this.resetAddressState('origin');
        this.resetAddressState('destination');
        
        // Clear input fields
        const originInput = document.getElementById('origin-input');
        const destinationInput = document.getElementById('destination-input');
        
        if (originInput) originInput.value = '';
        if (destinationInput) destinationInput.value = '';
        
        // Hide suggestions
        this.hideSuggestions();
        
        Utils.hideError();
    }
    
    getCurrentLocation() {
        if (!navigator.geolocation) {
            Utils.showError('Geolocation is not supported by this browser');
            return;
        }
        
        const btn = document.getElementById('current-location-btn');
        const originalText = btn.innerHTML;
        btn.innerHTML = '📡';
        btn.style.animation = 'spin 1s linear infinite';
        
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                this.mapManager.map.setView([latitude, longitude], 15);
                
                // Add a marker for current location
                if (this.mapManager.currentLocationMarker) {
                    this.mapManager.map.removeLayer(this.mapManager.currentLocationMarker);
                }
                
                this.mapManager.currentLocationMarker = L.marker([latitude, longitude], {
                    icon: L.divIcon({
                        className: 'current-location-marker',
                        html: '📍',
                        iconSize: [30, 30]
                    })
                }).addTo(this.mapManager.map);
                
                btn.innerHTML = originalText;
                btn.style.animation = '';
            },
            (error) => {
                console.error('Geolocation error:', error);
                Utils.showError('Unable to get your location');
                btn.innerHTML = originalText;
                btn.style.animation = '';
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 60000
            }
        );
    }
    
    toggleFullscreen() {
        const mapContainer = document.querySelector('.map-container');
        const btn = document.getElementById('fullscreen-btn');
        
        if (!document.fullscreenElement) {
            mapContainer.requestFullscreen().then(() => {
                btn.innerHTML = '⛶';
                btn.title = 'Exit Fullscreen';
            }).catch(err => {
                console.error('Fullscreen error:', err);
            });
        } else {
            document.exitFullscreen().then(() => {
                btn.innerHTML = '⛶';
                btn.title = 'Fullscreen';
            }).catch(err => {
                console.error('Exit fullscreen error:', err);
            });
        }
    }
    
    quickRoute() {
        const originInput = document.getElementById('origin-input');
        const destinationInput = document.getElementById('destination-input');
        
        if (!originInput.value.trim()) {
            // Try to use current location as origin
            this.getCurrentLocation();
            Utils.showError('Please set an origin location first');
            return;
        }
        
        if (!destinationInput.value.trim()) {
            Utils.showError('Please set a destination location');
            destinationInput.focus();
            return;
        }
        
        // Trigger route calculation with animation
        const btn = document.getElementById('quick-route-btn');
        const originalText = btn.innerHTML;
        btn.innerHTML = '⚡';
        btn.style.animation = 'pulse 1s ease-in-out infinite';
        
        this.calculateRoute().finally(() => {
            btn.innerHTML = originalText;
            btn.style.animation = '';
        });
    }
    
    changeMapStyle(style) {
        // This would integrate with different map tile providers
        
        // For now, just show a notification
        const styles = {
            'default': '🗺️ Switched to Default view',
            'satellite': '🛰️ Switched to Satellite view',
            'terrain': '🏔️ Switched to Terrain view'
        };
        
        if (styles[style]) {
            this.showStyleNotification(styles[style]);
        }
    }
    
    showStyleNotification(message) {
        // Create a temporary notification
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 80px;
            right: 24px;
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 12px 20px;
            border-radius: 12px;
            font-size: 0.9rem;
            z-index: 10000;
            backdrop-filter: blur(10px);
            animation: slideInRight 0.3s ease;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOutRight 0.3s ease forwards';
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 2000);
    }
    
    getAddressCoordinates(type) {
        const addressState = this.state.addressState[type];
        
        // If we have coordinates from progressive selection, use them
        if (addressState.coordinates) {
            return addressState.coordinates;
        }
        
        // Fallback to stored location coordinates (backward compatibility)
        return this[`${type}Location`] || null;
    }
    
    updateInputStateIndicator(type) {
        const inputEl = document.getElementById(`${type}-input`);
        const addressState = this.state.addressState[type];
        
        if (!inputEl) return;
        
        // Remove existing state classes
        inputEl.classList.remove('progressive-state', 'complete-state');
        
        // Add appropriate state class
        if (addressState.stage === 'street_selected') {
            inputEl.classList.add('progressive-state');
        } else if (addressState.stage === 'complete') {
            inputEl.classList.add('complete-state');
        }
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.routeMapApp = new RouteMapApp();

    // Floating panel minimize/maximize logic
    const floatingPanel = document.getElementById('floating-panel');
    const minimizeBtn = document.getElementById('minimize-panel-btn');
    const restoreFab = document.getElementById('restore-panel-fab');

    function minimizePanel() {
        if (!floatingPanel) return;
        floatingPanel.classList.add('minimized');
        // Show restore FAB immediately
        restoreFab.classList.remove('hidden');
        // Optional: Add a subtle notification
        if (window.routeMapApp) {
            window.routeMapApp.showBriefNotification('Panel minimized. Click the 🗺️ button to restore.', 'info');
        }
    }

    function maximizePanel() {
        if (!floatingPanel) return;
        floatingPanel.classList.remove('minimized');
        // Hide restore FAB
        restoreFab.classList.add('hidden');
        // Hide and remove the brief notification if visible
        const notification = document.getElementById('brief-notification');
        if (notification) {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (notification.parentNode) notification.parentNode.removeChild(notification);
            }, 350);
        }
        // Focus first input for accessibility
        setTimeout(() => {
            const firstInput = floatingPanel.querySelector('input, select, textarea, button');
            if (firstInput) firstInput.focus();
        }, 200);
    }

    if (minimizeBtn && restoreFab && floatingPanel) {
        minimizeBtn.addEventListener('click', () => {
            minimizePanel();
        });
        restoreFab.addEventListener('click', () => {
            maximizePanel();
        });
        // Optional: ESC key to minimize panel
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !floatingPanel.classList.contains('minimized')) {
                minimizePanel();
            }
        });
    }
});
