const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const morgan = require('morgan');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();

// ===== SECURITY & PERFORMANCE MIDDLEWARE =====
app.use(helmet({
    contentSecurityPolicy: false // We'll set this specifically for frontend
}));

app.use(compression());
app.use(cors());

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000
});
app.use(limiter);

// Body parsing
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging
app.use(morgan('combined'));

// ===== DATABASE CONNECTION =====
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/streamflix', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => console.log('✅ MongoDB Connected'))
.catch(err => console.log('❌ MongoDB Error:', err));

// ===== SERVE STATIC FILES FROM PUBLIC FOLDER =====

// Serve static files with proper caching
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: '1d',
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
        // Different cache strategies for different file types
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache');
        } else if (filePath.endsWith('.css') || filePath.endsWith('.js')) {
            res.setHeader('Cache-Control', 'public, max-age=86400'); // 1 day
        } else if (filePath.match(/\.(jpg|jpeg|png|gif|ico)$/)) {
            res.setHeader('Cache-Control', 'public, max-age=604800'); // 1 week
        }
    }
}));

// Specific CSP for HTML files
app.use((req, res, next) => {
    if (req.path.endsWith('.html') || req.path === '/') {
        res.setHeader(
            'Content-Security-Policy',
            "default-src 'self'; " +
            "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.plyr.io; " +
            "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.plyr.io; " +
            "img-src 'self' data: https: blob:; " +
            "connect-src 'self' https://movieapi.giftedtech.co.ke https://api.streamflix.com; " +
            "media-src 'self' https: blob:; " +
            "font-src 'self' https://cdnjs.cloudflare.com;"
        );
    }
    next();
});

// ===== API ROUTES =====
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/movies', require('./routes/movies'));
app.use('/api/watchlist', require('./routes/watchlist'));

// ===== CATCH ALL ROUTE - SERVE INDEX.HTML FOR SPA =====
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ===== ERROR HANDLING =====
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ 
        success: false, 
        message: 'Something went wrong!',
        error: process.env.NODE_ENV === 'development' ? err.message : {}
    });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`
    🚀 STREAMFLIX SERVER RUNNING
    ============================
    📍 Port: ${PORT}
    🌍 Environment: ${process.env.NODE_ENV || 'development'}
    📁 Serving from: ${path.join(__dirname, 'public')}
    ⏰ Started: ${new Date().toISOString()}
    ============================
    `);
});
