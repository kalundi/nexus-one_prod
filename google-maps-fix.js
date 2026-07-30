(function(){
  'use strict';
  
  // Fetch Google Maps API key from config and inject it into window
  // This runs before React tries to use Google Maps
  
  async function injectGoogleMapsKey() {
    try {
      const response = await fetch('/api/integrations/config');
      const config = await response.json();
      
      if (config.googleMapsEnabled && config.googleMapsBrowserKey) {
        // Store the key globally so React can access it
        window.__NEXUS_GOOGLE_MAPS_KEY = config.googleMapsBrowserKey;
        console.log('[Nexus] Google Maps API key configured');
      } else {
        console.warn('[Nexus] Google Maps not configured - route calculation will be unavailable');
        window.__NEXUS_GOOGLE_MAPS_KEY = null;
      }
    } catch (err) {
      console.error('[Nexus] Failed to fetch Google Maps config:', err);
      window.__NEXUS_GOOGLE_MAPS_KEY = null;
    }
  }
  
  // Load the key immediately
  injectGoogleMapsKey();
})();

