
}const express = require('express');
const axios = require('axios');
const path = require('path');
const app = express();

// Middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    next();
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Cache for better performance
const cache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Enhanced search with caching
app.get('/api/search/:query', async (req, res) => {
    try {
        const { query } = req.params;
        const cacheKey = `search-${query}`;
        
        // Check cache
        if (cache.has(cacheKey)) {
            const cached = cache.get(cacheKey);
            if (Date.now() - cached.timestamp < CACHE_DURATION) {
                console.log('💾 Serving from cache:', query);
                return res.json(cached.data);
            }
        }
        
        console.log(`🔍 Searching for: ${query}`);
        
        const response = await axios.get(`https://movieapi.giftedtech.co.ke/api/search/${encodeURIComponent(query)}`, {
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        console.log('✅ Search successful, found:', response.data.results?.items?.length || 0, 'movies');
        
        // Cache the result
        cache.set(cacheKey, {
            timestamp: Date.now(),
            data: response.data
        });
        
        res.json(response.data);
        
    } catch (error) {
        console.error('❌ Search error:', error.message);
        res.status(500).json({ 
            success: false,
            error: 'Search failed',
            message: error.message 
        });
    }
});

// Get trending movies
app.get('/api/trending', async (req, res) => {
    try {
        const trendingQueries = ['avengers', 'spider man', 'batman', 'superman', 'iron man'];
        const allMovies = [];
        
        for (const query of trendingQueries) {
            try {
                const response = await axios.get(`https://movieapi.giftedtech.co.ke/api/search/${encodeURIComponent(query)}`);
                if (response.data.success && response.data.results.items) {
                    allMovies.push(...response.data.results.items.slice(0, 5));
                }
            } catch (error) {
                console.error(`Error fetching ${query}:`, error.message);
            }
        }
        
        // Remove duplicates and shuffle
        const uniqueMovies = [...new Map(allMovies.map(movie => [movie.subjectId, movie])).values()];
        const shuffled = uniqueMovies.sort(() => 0.5 - Math.random()).slice(0, 20);
        
        res.json({
            success: true,
            results: { items: shuffled }
        });
        
    } catch (error) {
        console.error('Trending error:', error);
        res.status(500).json({ error: 'Failed to get trending movies' });
    }
});

// Enhanced streaming with better error handling
app.get('/api/stream/:movieId', async (req, res) => {
    try {
        const { movieId } = req.params;
        const { quality = '720p' } = req.query;

        console.log(`🎬 Streaming: ${movieId}, quality: ${quality}`);

        const sourcesResponse = await axios.get(`https://movieapi.giftedtech.co.ke/api/sources/${movieId}`);
        
        if (!sourcesResponse.data.success) {
            return res.status(404).json({ error: 'Movie not found' });
        }

        const sources = sourcesResponse.data.results;
        const selectedSource = sources.find(source => source.quality === quality) || sources[0];

        if (!selectedSource) {
            return res.status(404).json({ error: 'Quality not available' });
        }

        const videoUrl = selectedSource.download_url;
        
        // Set streaming headers
        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // Handle range requests
        const range = req.headers.range;
        
        if (range) {
            const headResponse = await axios.head(videoUrl);
            const fileSize = parseInt(headResponse.headers['content-length']);

            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            
            if (start >= fileSize) {
                res.status(416).setHeader('Content-Range', `bytes */${fileSize}`);
                return res.end();
            }

            const chunksize = (end - start) + 1;

            res.writeHead(206, {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Content-Length': chunksize,
                'Accept-Ranges': 'bytes'
            });

            const videoResponse = await axios({
                method: 'get',
                url: videoUrl,
                responseType: 'stream',
                headers: { 'Range': `bytes=${start}-${end}` },
                timeout: 30000
            });

            videoResponse.data.pipe(res);
        } else {
            const videoResponse = await axios({
                method: 'get',
                url: videoUrl,
                responseType: 'stream',
                timeout: 30000
            });

            videoResponse.data.pipe(res);
        }

    } catch (error) {
        console.error('Streaming error:', error);
        res.status(500).json({ error: 'Streaming failed' });
    }
});

// Enhanced download endpoint
app.get('/api/download/:movieId', async (req, res) => {
    try {
        const { movieId } = req.params;
        const { quality = '720p' } = req.query;

        console.log(`📥 Downloading: ${movieId}, quality: ${quality}`);

        const sourcesResponse = await axios.get(`https://movieapi.giftedtech.co.ke/api/sources/${movieId}`);
        
        if (!sourcesResponse.data.success) {
            return res.status(404).json({ error: 'Movie not found' });
        }

        const sources = sourcesResponse.data.results;
        const selectedSource = sources.find(source => source.quality === quality) || sources[0];

        if (!selectedSource) {
            return res.status(404).json({ error: 'Quality not available' });
        }

        // Get movie info
        const movieInfo = await axios.get(`https://movieapi.giftedtech.co.ke/api/info/${movieId}`);
        const movieTitle = movieInfo.data.success ? 
            movieInfo.data.results.subject.title : `movie-${movieId}`;
        
        const safeTitle = movieTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase();

        // Set download headers
        res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}-${quality}.mp4"`);
        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Content-Length', selectedSource.size);

        // Stream for download
        const videoResponse = await axios({
            method: 'get',
            url: selectedSource.download_url,
            responseType: 'stream',
            timeout: 60000
        });

        videoResponse.data.pipe(res);

    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({ error: 'Download failed' });
    }
});

// Enhanced qualities endpoint
app.get('/api/qualities/:movieId', async (req, res) => {
    try {
        const { movieId } = req.params;
        const response = await axios.get(`https://movieapi.giftedtech.co.ke/api/sources/${movieId}`);
        
        if (response.data.success) {
            const qualities = response.data.results.map(source => ({
                quality: source.quality,
                size: source.size,
                format: source.format,
                url: `/api/stream/${movieId}?quality=${source.quality}`,
                download_url: `/api/download/${movieId}?quality=${source.quality}`
            }));
            
            res.json({ 
                success: true, 
                qualities,
                total: qualities.length
            });
        } else {
            res.status(404).json({ error: 'No qualities found' });
        }
    } catch (error) {
        console.error('Qualities error:', error);
        res.status(500).json({ error: 'Failed to get qualities' });
    }
});

// Get movie details with streaming info
app.get('/api/movie/:movieId/details', async (req, res) => {
    try {
        const { movieId } = req.params;
        
        const [infoResponse, sourcesResponse] = await Promise.all([
            axios.get(`https://movieapi.giftedtech.co.ke/api/info/${movieId}`),
            axios.get(`https://movieapi.giftedtech.co.ke/api/sources/${movieId}`)
        ]);
        
        if (!infoResponse.data.success) {
            return res.status(404).json({ error: 'Movie not found' });
        }

        const movieInfo = infoResponse.data.results.subject;
        const sources = sourcesResponse.data.success ? sourcesResponse.data.results : [];
        
        const enhancedInfo = {
            ...movieInfo,
            streaming_available: sources.length > 0,
            available_qualities: sources.map(s => s.quality),
            total_sources: sources.length
        };

        res.json({
            success: true,
            data: enhancedInfo
        });

    } catch (error) {
        console.error('Movie details error:', error);
        res.status(500).json({ error: 'Failed to get movie details' });
    }
});

// Test endpoint
app.get('/api/test', async (req, res) => {
    try {
        const response = await axios.get('https://movieapi.giftedtech.co.ke/api/search/avengers');
        res.json({ 
            success: true, 
            message: 'API is working perfectly! 🎬',
            moviesCount: response.data.results?.items?.length || 0,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.json({ 
            success: false, 
            message: 'API test failed',
            error: error.message 
        });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'StreamFlix Enhanced Server Running 🚀',
        timestamp: new Date().toISOString(),
        cacheSize: cache.size
    });
});

// Clear cache endpoint (for development)
app.delete('/api/cache', (req, res) => {
    const previousSize = cache.size;
    cache.clear();
    res.json({ 
        message: 'Cache cleared', 
        clearedEntries: previousSize 
    });
});

// Serve frontend
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`
    🚀 ENHANCED STREAMFLIX SERVER
    =============================
    📍 Port: ${PORT}
    ⏰ Started: ${new Date().toISOString()}
    💾 Caching: Enabled
    🎬 Streaming: Ready
    📥 Downloads: Ready
    =============================
    `);
    console.log(`🌐 Open http://localhost:${PORT} in your browser`);
});
