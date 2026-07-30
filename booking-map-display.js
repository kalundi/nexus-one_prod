/**
 * Booking Map Display Helper
 * Ensures the route map displays properly and route calculation is triggered
 */

(function() {
  'use strict';
  
  // Helper to find calculate button by text content
  function findCalculateButton() {
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
      if (btn.textContent.toLowerCase().includes('calculate') ||
          btn.getAttribute('data-calculate-route') ||
          btn.getAttribute('data-testid') === 'calculate-route') {
        return btn;
      }
    }
    return null;
  }
  
  // Helper to trigger route calculation when both pickup and destination are filled
  function setupRouteCalculation() {
    const observer = new MutationObserver(function(mutations) {
      // Look for the booking form inputs
      const pickupInput = document.querySelector(
        'input[placeholder*="Pickup"], ' +
        'input[placeholder*="pickup"], ' +
        'input[name="pickup"], ' +
        '.bookingForm input[data-field="pickup"]'
      );
      
      const destinationInput = document.querySelector(
        'input[placeholder*="Destination"], ' +
        'input[placeholder*="destination"], ' +
        'input[name="destination"], ' +
        '.bookingForm input[data-field="destination"]'
      );
      
      if (!pickupInput || !destinationInput) return;
      
      // When both fields have values, trigger route calculation
      const checkAndCalculate = () => {
        if (pickupInput.value.trim() && destinationInput.value.trim()) {
          // Look for the calculate route button
          const calculateBtn = findCalculateButton();
          
          // If button found, click it; otherwise try to find and trigger the function
          if (calculateBtn && !calculateBtn.disabled) {
            calculateBtn.click();
          } else {
            // Try to trigger via custom event
            const event = new CustomEvent('nexus:calculateRoute', {
              detail: { pickup: pickupInput.value, destination: destinationInput.value }
            });
            document.dispatchEvent(event);
          }
        }

      };
      
      // Trigger on blur of destination input
      if (!destinationInput._routeCalcSetup) {
        destinationInput._routeCalcSetup = true;
        destinationInput.addEventListener('blur', checkAndCalculate);
        
        // Also trigger if Enter is pressed
        destinationInput.addEventListener('keypress', (e) => {
          if (e.key === 'Enter') {
            checkAndCalculate();
          }
        });
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: false
    });
  }
  
  // Ensure map containers have proper dimensions
  function ensureMapDimensions() {
    const mapContainers = document.querySelectorAll(
      '[id*="map"], [class*="map"], [data-testid*="map"]'
    );
    
    mapContainers.forEach(container => {
      // Skip if already processed
      if (container._mapDimsSet) return;
      
      // Check if it's an actual map container (has google-maps markers, controls, etc.)
      const hasMapContent = container.querySelector(
        '.gm-style, [role="button"][title], .gm-control-active'
      ) || container.classList.contains('mapContainer') ||
          container.id.includes('map') || container.className.includes('map');
      
      if (hasMapContent || container.style.position === 'absolute') {
        // Make sure it has dimensions
        if (!container.style.height || parseInt(container.style.height) < 200) {
          container.style.height = '350px';
          container.style.width = '100%';
          container.style.minHeight = '300px';
          container.style.borderRadius = '12px';
          container.style.overflow = 'hidden';
        }
        
        container._mapDimsSet = true;
      }
    });
  }
  
  // Monitor the DOM for map containers and ensure they have proper display
  function monitorMapDisplay() {
    // Initial setup
    ensureMapDimensions();
    setupRouteCalculation();
    
    // Re-check periodically and on mutations
    const intervalId = setInterval(ensureMapDimensions, 1000);
    
    // Also observe for new map containers being added
    const observer = new MutationObserver(() => {
      ensureMapDimensions();
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class', 'id']
    });
    
    // Clean up after reasonable time
    setTimeout(() => {
      clearInterval(intervalId);
      observer.disconnect();
    }, 60000); // Run for 1 minute max
  }
  
  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', monitorMapDisplay);
  } else {
    // If already loaded (async script), run immediately
    setTimeout(monitorMapDisplay, 100);
  }
  
  // Also provide a global function to manually ensure map display
  window.__nexusEnsureMapDisplay = function() {
    ensureMapDimensions();
    setupRouteCalculation();
    console.log('[Nexus] Map display ensured');
  };
  
  console.log('[Nexus] Booking map display monitor loaded');
})();
