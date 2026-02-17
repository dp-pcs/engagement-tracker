// Configuration
const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000'
    : 'https://j4xell8k5a.execute-api.us-east-1.amazonaws.com/dev';

// Google OAuth
const GOOGLE_CLIENT_ID = '608961564414-un375udmq72c4qk7fapqfcifchc0p6gl.apps.googleusercontent.com';

// Allowed email domains
const ALLOWED_DOMAINS = ['trilogy.com', 'devfactory.com', 'crossover.com'];
