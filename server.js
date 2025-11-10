const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const cluster = require('cluster');
const os = require('os');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const socketIo = require('socket.io');
require('dotenv').config();

// Cluster mode for multi-core performance
if (cluster.isMaster && process.env.NODE_ENV === 'production') {
    const numCPUs = os.cpus().length;
    console.log(`🚀 Master ${process.pid} is running`);
    console.log(`🔧 Forking ${numCPUs} workers...`);

    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }

    cluster.on('exit', (worker, code, signal) => {
        console.log(`❌ Worker ${worker.process.pid} died`);
        console.log('🔄 Starting a new worker...');
        cluster.fork();
    });
} else {
    const app = express();

    // ===== SECURITY MIDDLEWARE =====
    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com"],
                scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://cdn.plyr.io"],
                imgSrc: ["'self'", "data:", "https:", "blob:", "https://image.tmdb.org"],
                connectSrc: ["'self'", "https://movieapi.giftedtech.co.ke", "wss:"],
                mediaSrc: ["'self'", "https:", "blob:"],
                fontSrc: ["'self'", "https://cdnjs.cloudflare.com", "https://fonts.gstatic.com"],
            },
        },
        crossOriginEmbedderPolicy: false
    }));

    // ===== PERFORMANCE MIDDLEWARE =====
    app.use(compression({
        level: 6,
        threshold: 100 * 1024,
    }));

    // Advanced CORS
    app.use(cors({
        origin: function (origin, callback) {
            const allowedOrigins = [
                'http://localhost:3000',
                'http://127.0.0.1:3000',
                'http://localhost:5000',
                'https://yourdomain.com',
                'https://www.yourdomain.com'
            ];
            
            if (!origin || allowedOrigins.indexOf(origin) !== -1) {
                callback(null, true);
            } else {
                callback(new Error('Not allowed by CORS'), false);
            }
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-API-Key']
    }));

    // Rate limiting
    const createRateLimit = (windowMs, max, message) => rateLimit({
        windowMs,
        max,
        message: { success: false, message },
        standardHeaders: true,
        legacyHeaders: false,
    });

    app.use(createRateLimit(15 * 60 * 1000, 1000)); // General limit
    app.use('/api/auth', createRateLimit(15 * 60 * 1000, 50, 'Too many authentication attempts'));
    app.use('/api/stream', createRateLimit(60 * 1000, 100, 'Too many streaming requests'));

    // Body parsing with limits
    app.use(express.json({ limit: '50mb' }));
    app.use(express.urlencoded({ extended: true, limit: '50mb' }));

    // Advanced logging
    const accessLogStream = fs.createWriteStream(path.join(__dirname, 'logs', 'access.log'), { flags: 'a' });
    app.use(morgan('combined', { stream: accessLogStream }));

    if (process.env.NODE_ENV === 'development') {
        app.use(morgan('dev'));
    }

    // ===== DATABASE CONNECTION =====
    mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/streamflix-pro', {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        maxPoolSize: 10,
        minPoolSize: 5,
    })
    .then(() => {
        console.log('✅ MongoDB Connected Successfully');
        console.log(`📊 Database: ${mongoose.connection.db.databaseName}`);
    })
    .catch(err => {
        console.error('❌ MongoDB Connection Error:', err);
        process.exit(1);
    });

    // MongoDB event handlers
    mongoose.connection.on('connected', () => console.log('🔄 Mongoose connected to MongoDB'));
    mongoose.connection.on('error', (err) => console.error('❌ Mongoose connection error:', err));
    mongoose.connection.on('disconnected', () => console.log('⚠️ Mongoose disconnected'));

    // ===== SERVE STATIC FILES =====
    app.use(express.static(path.join(__dirname, 'public'), {
        maxAge: process.env.NODE_ENV === 'production' ? '7d' : '0',
        etag: true,
        lastModified: true,
        setHeaders: (res, filePath) => {
            if (filePath.endsWith('.html')) {
                res.setHeader('Cache-Control', 'no-cache');
            } else if (filePath.endsWith('.css') || filePath.endsWith('.js')) {
                res.setHeader('Cache-Control', 'public, max-age=31536000');
            }
        }
    }));

    // ===== API ROUTES =====
    app.use('/api/auth', require('./routes/auth'));
    app.use('/api/users', require('./routes/users'));
    app.use('/api/movies', require('./routes/movies'));
    app.use('/api/watchlist', require('./routes/watchlist'));
    app.use('/api/stream', require('./routes/streaming'));
    app.use('/api/payment', require('./routes/payment'));
    app.use('/api/admin', require('./routes/admin'));

    // ===== HEALTH CHECK WITH SYSTEM INFO =====
    app.get('/api/health', (req, res) => {
        const healthCheck = {
            status: 'OK',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            environment: process.env.NODE_ENV || 'development',
            worker: cluster.worker ? cluster.worker.id : 'Master',
            database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
            loadAverage: os.loadavg(),
            freeMemory: os.freemem(),
            totalMemory: os.totalmem()
        };

        res.json({ success: true, data: healthCheck });
    });

    // ===== REAL-TIME WITH SOCKET.IO =====
    const server = process.env.NODE_ENV === 'production' && process.env.SSL_ENABLED === 'true' 
        ? https.createServer({
              key: fs.readFileSync(process.env.SSL_KEY_PATH),
              cert: fs.readFileSync(process.env.SSL_CERT_PATH)
          }, app)
        : http.createServer(app);

    const io = socketIo(server, {
        cors: {
            origin: process.env.CLIENT_URL || "http://localhost:3000",
            methods: ["GET", "POST"],
            credentials: true
        },
        pingTimeout: 60000,
        pingInterval: 25000
    });

    // Socket.io real-time features
    io.on('connection', (socket) => {
        console.log(`🔌 New socket connection: ${socket.id}`);
        
        // User joins their room
        socket.on('join-user', (userId) => {
            socket.join(`user-${userId}`);
            console.log(`👤 User ${userId} joined their room`);
        });

        // Video watching tracking
        socket.on('video-watch', (data) => {
            const { movieId, userId, progress, duration } = data;
            console.log(`🎬 User ${userId} watching movie ${movieId} at ${progress}%`);
            
            // Broadcast to admin dashboard
            socket.to('admin-room').emit('user-watching', data);
            
            // Update watch history in database
            updateWatchHistory(userId, movieId, progress, duration);
        });

        // Real-time chat for movies
        socket.on('send-message', (data) => {
            const { movieId, message, user } = data;
            io.to(`movie-${movieId}`).emit('new-message', {
                user,
                message,
                timestamp: new Date(),
                id: Math.random().toString(36).substr(2, 9)
            });
        });

        // Live viewer count
        socket.on('join-movie', (movieId) => {
            socket.join(`movie-${movieId}`);
            const viewerCount = io.sockets.adapter.rooms.get(`movie-${movieId}`)?.size || 0;
            io.to(`movie-${movieId}`).emit('viewer-count', viewerCount);
        });

        socket.on('disconnect', (reason) => {
            console.log(`🔌 Socket disconnected: ${socket.id} - Reason: ${reason}`);
        });

        socket.on('error', (error) => {
            console.error(`❌ Socket error for ${socket.id}:`, error);
        });
    });

    // Make io available to routes
    app.set('io', io);

    // ===== CACHE SYSTEM =====
    const cache = new Map();
    const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

    // Cache middleware
    const cacheMiddleware = (duration = CACHE_DURATION) => {
        return (req, res, next) => {
            if (req.method !== 'GET') return next();

            const key = req.originalUrl;
            const cached = cache.get(key);

            if (cached && Date.now() - cached.timestamp < duration) {
                console.log(`💾 Cache hit for: ${key}`);
                return res.json(cached.data);
            }

            const originalJson = res.json;
            res.json = function(data) {
                cache.set(key, { timestamp: Date.now(), data });
                originalJson.call(this, data);
            };

            next();
        };
    };

    // Apply caching
    app.use('/api/movies/trending', cacheMiddleware());
    app.use('/api/movies/popular', cacheMiddleware(10 * 60 * 1000));

    // ===== ERROR HANDLING =====
    app.use('*', (req, res) => {
        res.status(404).json({
            success: false,
            message: `Route ${req.originalUrl} not found`,
            error: 'NOT_FOUND',
            timestamp: new Date().toISOString()
        });
    });

    app.use((err, req, res, next) => {
        console.error('💥 Global Error Handler:', err);

        // Log error to file
        const errorLog = `
        ===== ERROR =====
        Time: ${new Date().toISOString()}
        URL: ${req.method} ${req.originalUrl}
        IP: ${req.ip}
        Error: ${err.message}
        Stack: ${err.stack}
        =================
        `;

        fs.appendFileSync(path.join(__dirname, 'logs', 'errors.log'), errorLog);

        let statusCode = err.status || 500;
        let message = err.message || 'Internal Server Error';

        // Handle specific errors
        if (err.name === 'ValidationError') statusCode = 400;
        if (err.code === 11000) { statusCode = 409; message = 'Duplicate entry'; }
        if (err.name === 'JsonWebTokenError') { statusCode = 401; message = 'Invalid token'; }
        if (err.name === 'TokenExpiredError') { statusCode = 401; message = 'Token expired'; }

        res.status(statusCode).json({
            success: false,
            message,
            error: process.env.NODE_ENV === 'development' ? err.stack : {},
            timestamp: new Date().toISOString()
        });
    });

    // ===== GRACEFUL SHUTDOWN =====
    process.on('SIGTERM', () => {
        console.log('🛑 SIGTERM received. Starting graceful shutdown...');
        
        server.close(() => {
            console.log('✅ HTTP server closed');
            mongoose.connection.close(false, () => {
                console.log('✅ MongoDB connection closed');
                process.exit(0);
            });
        });
    });

    process.on('SIGINT', async () => {
        await mongoose.connection.close();
        console.log('🛑 MongoDB connection closed through app termination');
        process.exit(0);
    });

    // ===== START SERVER =====
    const PORT = process.env.PORT || 5000;
    
    server.listen(PORT, '0.0.0.0', () => {
        console.log(`
        🚀 STREAMFLIX PRO - ENTERPRISE STREAMING PLATFORM
        ================================================
        ✅ Server is running!
        📍 Port: ${PORT}
        🌍 Environment: ${process.env.NODE_ENV || 'development'}
        🔧 Worker: ${cluster.worker ? `Worker ${cluster.worker.id}` : 'Master'}
        🗄️ Database: ${mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'}
        ⏰ Started: ${new Date().toISOString()}
        ================================================
        `);

        // System information
        console.log(`
        📊 SYSTEM INFORMATION:
        ----------------------
        Platform: ${process.platform}
        Architecture: ${process.arch}
        Node.js: ${process.version}
        Memory: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB
        CPU Cores: ${os.cpus().length}
        Total Memory: ${(os.totalmem() / 1024 / 1024 / 1024).toFixed(2)} GB
        Free Memory: ${(os.freemem() / 1024 / 1024 / 1024).toFixed(2)} GB
        ----------------------
        `);
    });

    // Server error handling
    server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
            console.error(`❌ Port ${PORT} is already in use`);
            process.exit(1);
        } else {
            console.error('❌ Server error:', error);
            process.exit(1);
        }
    });

    // Unhandled rejections
    process.on('unhandledRejection', (reason, promise) => {
        console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
        server.close(() => process.exit(1));
    });

    process.on('uncaughtException', (error) => {
        console.error('💥 Uncaught Exception:', error);
        server.close(() => process.exit(1));
    });
}

// Helper function for watch history
async function updateWatchHistory(userId, movieId, progress, duration) {
    try {
        const WatchHistory = require('./models/WatchHistory');
        await WatchHistory.findOneAndUpdate(
            { userId, movieId },
            { 
                userId, 
                movieId, 
                progress, 
                duration,
                lastWatched: new Date()
            },
            { upsert: true, new: true }
        );
    } catch (error) {
        console.error('Error updating watch history:', error);
    }
}
