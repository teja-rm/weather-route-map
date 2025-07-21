// ai-travel-advisor.js - AI-powered travel advice using Gemini CLI

class AITravelAdvisor {
    constructor() {
        this.isGeminiAvailable = false;
        this.checkGeminiAvailability();
    }

    // Check if Gemini CLI is available (would need to be installed separately)
    async checkGeminiAvailability() {
        try {
            // Check for Gemini CLI in multiple ways
            // Method 1: Check if gemini command exists (requires actual CLI installation)
            // Method 2: Check for environment variable or config file
            // Method 3: Try a simple API call to verify connection
            
            // For development, you can set this to true if you have Gemini CLI installed
            // To install Gemini CLI: npm install -g @google/generative-ai-cli
            // Then set your API key: export GOOGLE_AI_API_KEY="your-api-key"
            
            const hasGeminiEnv = typeof process !== 'undefined' && process.env && process.env.GOOGLE_AI_API_KEY;
            const hasGeminiConfig = localStorage.getItem('gemini-api-key');
            
            // Enable Gemini if we have either environment variable or stored API key
            this.isGeminiAvailable = hasGeminiEnv || hasGeminiConfig;
            
            console.log('Gemini CLI availability check:', {
                hasEnvVar: !!hasGeminiEnv,
                hasStoredKey: !!hasGeminiConfig,
                isAvailable: this.isGeminiAvailable
            });
            
            if (this.isGeminiAvailable) {
                console.log('✅ Gemini AI integration enabled');
            } else {
                console.log('ℹ️ Gemini CLI not configured, using advanced fallback AI advice');
            }
        } catch (error) {
            console.log('Gemini CLI check failed, using fallback AI advice:', error.message);
            this.isGeminiAvailable = false;
        }
    }

    // Generate AI-powered travel advice using weather data and route information
    async generateTravelAdvice(routeData, weatherData, userPreferences = {}) {
        try {
            if (this.isGeminiAvailable) {
                return await this.getGeminiAdvice(routeData, weatherData, userPreferences);
            } else {
                return this.getFallbackAdvice(routeData, weatherData, userPreferences);
            }
        } catch (error) {
            console.error('Error generating travel advice:', error);
            return this.getBasicAdvice();
        }
    }

    // Use Gemini CLI for advanced travel advice
    async getGeminiAdvice(routeData, weatherData, userPreferences) {
        const prompt = this.buildGeminiPrompt(routeData, weatherData, userPreferences);
        
        try {
            // Try to use Gemini API directly if available
            const apiKey = localStorage.getItem('gemini-api-key') || process.env?.GOOGLE_AI_API_KEY;
            
            if (apiKey) {
                console.log('🤖 Calling Gemini API for travel advice...');
                const response = await this.callGeminiAPI(prompt, apiKey);
                if (response) {
                    return this.parseGeminiResponse(response);
                }
            }
            
            // If CLI or API is not available, try command line approach
            // This would require Gemini CLI to be installed and configured
            // Example: npm install -g @google/generative-ai-cli
            console.log('📝 Gemini prompt prepared:', prompt.substring(0, 200) + '...');
            
            // For now, return advanced fallback since actual CLI requires system setup
            console.log('ℹ️ Using advanced AI simulation (install Gemini CLI for real AI)');
            return this.getAdvancedFallbackAdvice(routeData, weatherData, userPreferences);
            
        } catch (error) {
            console.error('Gemini integration error:', error);
            return this.getFallbackAdvice(routeData, weatherData, userPreferences);
        }
    }

    // Direct Gemini API call (if API key is available)
    async callGeminiAPI(prompt, apiKey) {
        try {
            const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=' + apiKey, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: prompt
                        }]
                    }]
                })
            });

            if (!response.ok) {
                throw new Error(`Gemini API error: ${response.status}`);
            }

            const data = await response.json();
            return data.candidates?.[0]?.content?.parts?.[0]?.text;
        } catch (error) {
            console.error('Gemini API call failed:', error);
            return null;
        }
    }

    // Parse Gemini response into structured advice
    parseGeminiResponse(geminiText) {
        try {
            // Extract verdict, recommendations, alternatives, and emergency tips from Gemini response
            const lines = geminiText.split('\n').filter(line => line.trim());
            
            let verdict = "CAUTION - AI Analysis";
            let verdictColor = "#f59e0b";
            let recommendations = [];
            let alternatives = [];
            let emergencyTips = [];
            
            let currentSection = null;
            
            for (const line of lines) {
                const trimmed = line.trim();
                
                // Detect verdict
                if (trimmed.includes('VERDICT') || trimmed.includes('GO') || trimmed.includes('AVOID') || trimmed.includes('CAUTION')) {
                    if (trimmed.includes('GO') && !trimmed.includes('AVOID')) {
                        verdict = "✅ GO - " + trimmed.replace(/.*?GO[:\-\s]*/i, '');
                        verdictColor = "#4ade80";
                    } else if (trimmed.includes('AVOID')) {
                        verdict = "🚫 AVOID - " + trimmed.replace(/.*?AVOID[:\-\s]*/i, '');
                        verdictColor = "#ef4444";
                    } else {
                        verdict = "⚠️ CAUTION - " + trimmed.replace(/.*?CAUTION[:\-\s]*/i, '');
                        verdictColor = "#f59e0b";
                    }
                    continue;
                }
                
                // Detect sections
                if (trimmed.toLowerCase().includes('recommendation')) {
                    currentSection = 'recommendations';
                    continue;
                } else if (trimmed.toLowerCase().includes('alternative')) {
                    currentSection = 'alternatives';
                    continue;
                } else if (trimmed.toLowerCase().includes('emergency') || trimmed.toLowerCase().includes('safety')) {
                    currentSection = 'emergency';
                    continue;
                }
                
                // Add content to appropriate section
                if (trimmed.length > 10) {
                    const cleanedLine = trimmed.replace(/^\d+\.\s*/, '').replace(/^[-•]\s*/, '');
                    
                    if (currentSection === 'recommendations') {
                        recommendations.push(cleanedLine);
                    } else if (currentSection === 'alternatives') {
                        alternatives.push(cleanedLine);
                    } else if (currentSection === 'emergency') {
                        emergencyTips.push(cleanedLine);
                    } else {
                        // Default to recommendations if no section is detected
                        recommendations.push(cleanedLine);
                    }
                }
            }
            
            // Ensure we have at least some content
            if (recommendations.length === 0) {
                recommendations.push("Follow weather conditions and use standard safety precautions");
            }
            if (emergencyTips.length === 0) {
                emergencyTips.push("Keep emergency contacts handy and check weather updates");
            }
            
            return {
                verdict,
                verdictColor,
                recommendations: recommendations.slice(0, 5),
                alternatives: alternatives.slice(0, 3),
                emergencyTips: emergencyTips.slice(0, 3),
                source: "🤖 Gemini AI"
            };
            
        } catch (error) {
            console.error('Error parsing Gemini response:', error);
            return this.getBasicAdvice();
        }
    }

    // Build structured prompt for Gemini
    buildGeminiPrompt(routeData, weatherData, userPreferences) {
        const routeInfo = {
            distance: routeData.distance || 0,
            duration: routeData.duration || 0,
            mode: routeData.mode || 'car',
            isMixedMode: routeData.isMixedMode || false
        };

        const weatherSummary = {
            overallScore: weatherData.analysis?.overallScore || 0,
            mainRisks: weatherData.analysis?.risks?.slice(0, 3) || [],
            avgTemp: this.calculateAverageTemp(weatherData.waypoints || []),
            maxRainProb: this.getMaxRainProbability(weatherData.waypoints || [])
        };

        return `
You are an expert travel advisor. Analyze this route and weather data to provide personalized travel advice:

ROUTE INFORMATION:
- Distance: ${(routeInfo.distance / 1000).toFixed(1)}km
- Duration: ${Math.round(routeInfo.duration / 60)} minutes
- Mode: ${routeInfo.mode}
- Mixed-mode route: ${routeInfo.isMixedMode ? 'Yes' : 'No'}

WEATHER CONDITIONS:
- Overall weather score: ${weatherSummary.overallScore}/100
- Average temperature: ${weatherSummary.avgTemp}°C
- Maximum rain probability: ${weatherSummary.maxRainProb}%
- Key risks: ${weatherSummary.mainRisks.map(r => r.type).join(', ')}

USER PREFERENCES:
- Experience level: ${userPreferences.experience || 'intermediate'}
- Risk tolerance: ${userPreferences.riskTolerance || 'moderate'}
- Time flexibility: ${userPreferences.flexible || 'moderate'}

Please provide:
1. A clear verdict (GO/CAUTION/AVOID) with reasoning
2. 3-5 specific, actionable recommendations
3. Alternative suggestions if conditions are poor
4. Emergency preparedness tips relevant to this route

Keep response concise but comprehensive, focusing on safety and comfort.
        `;
    }

    // Advanced fallback advice (simulates Gemini-quality responses)
    getAdvancedFallbackAdvice(routeData, weatherData, userPreferences) {
        const score = weatherData.analysis?.overallScore || 70;
        const risks = weatherData.analysis?.risks || [];
        const mode = routeData.mode || 'car';
        const isMixed = routeData.isMixedMode;
        
        let verdict, verdictColor, recommendations = [], alternatives = [], emergencyTips = [];

        // Determine verdict based on score and specific risks
        if (score >= 85) {
            verdict = "✅ GO - Excellent Conditions";
            verdictColor = "#4ade80";
            recommendations.push("Perfect conditions for travel - enjoy your journey!");
            recommendations.push("Consider taking scenic detours to make the most of the great weather");
        } else if (score >= 70) {
            verdict = "⚠️ CAUTION - Good with Minor Concerns";
            verdictColor = "#facc15";
            recommendations.push("Generally good conditions, but stay alert for changing weather");
            recommendations.push("Check weather updates before departure");
        } else if (score >= 55) {
            verdict = "⚠️ CAUTION - Fair Conditions";
            verdictColor = "#f97316";
            recommendations.push("Proceed with caution and extra preparation");
            recommendations.push("Consider postponing non-essential travel");
        } else if (score >= 40) {
            verdict = "❌ AVOID - Poor Conditions";
            verdictColor = "#ef4444";
            recommendations.push("Poor conditions - avoid travel if possible");
            alternatives.push("Wait for weather to improve");
            alternatives.push("Consider alternative indoor activities");
        } else {
            verdict = "🚫 AVOID - Dangerous Conditions";
            verdictColor = "#dc2626";
            recommendations.push("Dangerous conditions - do not travel");
            alternatives.push("Stay indoors until conditions improve");
            alternatives.push("Monitor weather updates closely");
        }

        // Mode-specific advice
        if (mode === 'bicycle' || isMixed) {
            if (risks.some(r => r.type.includes('rain'))) {
                recommendations.push("🚴‍♂️ Cycling gear: Waterproof jacket and pants essential");
                emergencyTips.push("Know locations of shelters along the route");
            }
            if (risks.some(r => r.type.includes('wind'))) {
                recommendations.push("🌪️ Strong winds expected - reduce speed and maintain control");
                emergencyTips.push("Be prepared to walk bike in extreme wind gusts");
            }
        }

        // Rain-specific advice
        const maxRainProb = this.getMaxRainProbability(weatherData.waypoints || []);
        if (maxRainProb > 70) {
            recommendations.push("☔ High rain probability - pack waterproof gear");
            emergencyTips.push("Identify indoor shelter options along route");
            if (score > 40) {
                alternatives.push("Consider departing earlier/later to avoid peak rain hours");
            }
        }

        // Temperature-specific advice
        const avgTemp = this.calculateAverageTemp(weatherData.waypoints || []);
        if (avgTemp < 0) {
            recommendations.push("🥶 Freezing temperatures - dress in layers, protect extremities");
            emergencyTips.push("Watch for ice on surfaces, carry emergency warm supplies");
        } else if (avgTemp > 30) {
            recommendations.push("🌡️ Hot weather - stay hydrated, take breaks in shade");
            emergencyTips.push("Know locations of water sources and air-conditioned spaces");
        }

        // Mixed-mode specific advice
        if (isMixed) {
            recommendations.push("🚶‍♂️🚴‍♂️ Mixed-mode route: Pack gear suitable for both walking and cycling");
            recommendations.push("Plan transition points carefully - weather affects both segments");
        }

        return {
            verdict,
            verdictColor,
            recommendations,
            alternatives: alternatives.length > 0 ? alternatives : ["No specific alternatives needed"],
            emergencyTips: emergencyTips.length > 0 ? emergencyTips : ["Standard safety precautions apply"],
            confidence: score >= 70 ? "High" : score >= 40 ? "Medium" : "Low",
            lastUpdated: new Date().toLocaleString()
        };
    }

    // Simple fallback advice
    getFallbackAdvice(routeData, weatherData, userPreferences) {
        const score = weatherData.analysis?.overallScore || 70;
        
        return {
            verdict: score >= 70 ? "✅ GO" : score >= 40 ? "⚠️ CAUTION" : "❌ AVOID",
            verdictColor: score >= 70 ? "#4ade80" : score >= 40 ? "#facc15" : "#ef4444",
            recommendations: [
                "Check weather conditions before departure",
                "Pack appropriate gear for the conditions",
                "Inform others of your travel plans"
            ],
            alternatives: ["Monitor weather updates", "Consider alternative routes"],
            emergencyTips: ["Carry emergency supplies", "Know emergency contact numbers"],
            confidence: "Medium",
            lastUpdated: new Date().toLocaleString()
        };
    }

    // Basic advice for error cases
    getBasicAdvice() {
        return {
            verdict: "⚠️ CHECK CONDITIONS",
            verdictColor: "#6b7280",
            recommendations: [
                "Check current weather conditions",
                "Use your best judgment for travel",
                "Pack appropriate gear"
            ],
            alternatives: ["Consider postponing if uncertain"],
            emergencyTips: ["Carry emergency supplies"],
            confidence: "Low",
            lastUpdated: new Date().toLocaleString()
        };
    }

    // Utility method to configure Gemini API key
    static configureGeminiAPI(apiKey) {
        if (apiKey && apiKey.trim()) {
            localStorage.setItem('gemini-api-key', apiKey.trim());
            console.log('✅ Gemini API key configured');
            return true;
        } else {
            localStorage.removeItem('gemini-api-key');
            console.log('🗑️ Gemini API key removed');
            return false;
        }
    }

    // Check if Gemini API is configured
    static isGeminiConfigured() {
        return !!(localStorage.getItem('gemini-api-key') || (typeof process !== 'undefined' && process.env?.GOOGLE_AI_API_KEY));
    }

    // Get configuration help message
    static getConfigurationHelp() {
        return {
            title: "Enable Real AI Travel Advice",
            instructions: [
                "1. Get a Gemini API key from Google AI Studio (https://makersuite.google.com/app/apikey)",
                "2. Call AITravelAdvisor.configureGeminiAPI('your-api-key-here')",
                "3. Refresh the page to enable real AI travel advice",
                "4. To disable, call AITravelAdvisor.configureGeminiAPI(null)"
            ],
            currentStatus: this.isGeminiConfigured() ? "✅ Configured" : "❌ Not configured",
            note: "Without API key, the app uses advanced fallback AI simulation"
        };
    }

    // Helper methods
    calculateAverageTemp(waypoints) {
        if (!waypoints || waypoints.length === 0) return 20;
        const sum = waypoints.reduce((acc, wp) => acc + (wp.temperature || 20), 0);
        return Math.round(sum / waypoints.length);
    }

    getMaxRainProbability(waypoints) {
        if (!waypoints || waypoints.length === 0) return 0;
        return Math.max(...waypoints.map(wp => wp.rainProbability || 0));
    }

    // Future method for actual Gemini CLI integration
    async callGeminiCLI(prompt) {
        // This would be implemented when Gemini CLI is properly set up
        // Example implementation:
        /*
        const { exec } = require('child_process');
        return new Promise((resolve, reject) => {
            exec(`gemini-cli "${prompt}"`, (error, stdout, stderr) => {
                if (error) reject(error);
                else resolve(stdout);
            });
        });
        */
        throw new Error('Gemini CLI not configured');
    }
}
