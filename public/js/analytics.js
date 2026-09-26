/**
 * Vercel Web Analytics initialization
 * 
 * Automatically tracks page views and provides analytics for the Regenerative Atlas.
 */

import { inject } from 'https://esm.sh/@vercel/analytics@2.0.1';

// Initialize analytics with automatic mode detection (production/development)
inject({ mode: 'auto' });
