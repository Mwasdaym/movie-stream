const express = require('express');
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
const SEARCH_CACHE_DURATION = 10 * 60 * 1000;

// SIMPLIFIED STREAMING ENDPOINT - FIXED!
app.get('/api/stream/:movieId', async (req, res) => {
    try {
        const { movieId } = req.params;
        const { quality = '720p' } = req.query;

        console.log(`🎬 Streaming: ${movieId}, quality: ${quality}`);

        // Get video sources
        const sourcesResponse = await axios.get(`https://movieapi.giftedtech.co.ke/api/sources/${movieId}`, {
            timeout: 8000
        });
        
        if (!sourcesResponse.data.success) {
            return res.status(404).json({ error: 'Movie not found' });
        }

        const sources = sourcesResponse.data.results;
        const selectedSource = sources.find(source => source.quality === quality) || sources[0];

        if (!selectedSource) {
            return res.status(404).json({ error: 'Quality not available' });
        }

        const videoUrl = selectedSource.download_url;
        
        console.log(`📹 Proxying video: ${videoUrl}`);
        
        // SIMPLE PROXY APPROACH - Just pipe the video through
        const videoResponse = await axios({
            method: 'get',
            url: videoUrl,
            responseType: 'stream',
            timeout: 30000
        });

        // Set proper video headers
        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Access-Control-Allow-Origin', '*');

        // Copy important headers from the source
        if (videoResponse.headers['content-length']) {
            res.setHeader('Content-Length', videoResponse.headers['content-length']);
        }

        // Pipe the video directly to the client
        videoResponse.data.pipe(res);

    } catch (error) {
        console.error('❌ Streaming error:', error.message);
        res.status(500).json({ 
            success: false,
            error: 'Streaming failed',
            message: error.message 
        });
    }
});

// DIRECT VIDEO REDIRECT (Simple alternative)
app.get('/api/video/:movieId', async (req, res) => {
    try {
        const { movieId } = req.params;
        const { quality = '720p' } = req.query;

        console.log(`🎬 Direct video redirect: ${movieId}`);

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
        
        console.log(`🔗 Redirecting to: ${videoUrl}`);
        
        // Simple redirect - let the browser handle the video directly
        res.redirect(videoUrl);

    } catch (error) {
        console.error('Direct video error:', error);
        res.status(500).json({ error: 'Video failed' });
    }
});

// TEST VIDEO ENDPOINT - UPDATED
app.get('/api/test-video', async (req, res) => {
    try {
        // Test with a known working movie
        const testMovieId = '5099284245269335848'; // Black Panther
        const sourcesResponse = await axios.get(`https://movieapi.giftedtech.co.ke/api/sources/${testMovieId}`);
        
        if (sourcesResponse.data.success && sourcesResponse.data.results.length > 0) {
            const videoUrl = sourcesResponse.data.results[0].download_url;
            
            res.json({
                success: true,
                videoUrl: videoUrl,
                streamUrl: `/api/stream/${testMovieId}`,
                directUrl: `/api/video/${testMovieId}`,
                message: 'Video test successful - try both endpoints'
            });
        } else {
            res.json({
                success: false,
                message: 'No video sources found'
            });
        }
    } catch (error) {
        res.json({
            success: false,
            message: 'Video test failed',
            error: error.message
        });
    }
});

// Enhanced search with caching
app.get('/api/search/:query', async (req, res) => {
    try {
        const { query } = req.params;
        const cacheKey = `search-${query}`;
        
        if (cache.has(cacheKey)) {
            const cached = cache.get(cacheKey);
            if (Date.now() - cached.timestamp < SEARCH_CACHE_DURATION) {
                console.log('💾 Serving from cache:', query);
                return res.json(cached.data);
            }
        }
        
        console.log(`🔍 Searching for: ${query}`);
        
        const response = await axios.get(`https://movieapi.giftedtech.co.ke/api/search/${encodeURIComponent(query)}`, {
            timeout: 10000
        });
        
        console.log('✅ Search successful, found:', response.data.results?.items?.length || 0, 'movies');
        
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
                stream_url: `/api/stream/${movieId}?quality=${source.quality}`,
                direct_url: `/api/video/${movieId}?quality=${source.quality}`,
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

// Download endpoint
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

        const movieInfo = await axios.get(`https://movieapi.giftedtech.co.ke/api/info/${movieId}`);
        const movieTitle = movieInfo.data.success ? 
            movieInfo.data.results.subject.title : `movie-${movieId}`;
        
        const safeTitle = movieTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase();

        res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}-${quality}.mp4"`);
        res.setHeader('Content-Type', 'video/mp4');

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

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'StreamFlix Server Running 🚀',
        timestamp: new Date().toISOString(),
        cacheSize: cache.size
    });
});

// Serve frontend
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`
    🚀 STREAMFLIX SERVER (SIMPLIFIED STREAMING)
    ==========================================
    📍 Port: ${PORT}
    ⏰ Started: ${new Date().toISOString()}
    🎬 Streaming: SIMPLIFIED & FIXED
    📹 Direct Video: ENABLED
    ==========================================
    `);
    console.log(`🌐 Open http://localhost:${PORT} in your browser`);
    console.log(`🔧 Test video: http://localhost:${PORT}/api/test-video`);
});
