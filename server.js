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

// Cache
const cache = new Map();

// PROPER VIDEO PROXY STREAMING - FIXED!
app.get('/api/stream/:movieId', async (req, res) => {
    try {
        const { movieId } = req.params;
        const { quality = '720p' } = req.query;

        console.log(`🎬 Streaming request: ${movieId}, quality: ${quality}`);

        // Get video sources from API
        const sourcesResponse = await axios.get(`https://movieapi.giftedtech.co.ke/api/sources/${movieId}`);
        
        if (!sourcesResponse.data.success || !sourcesResponse.data.results.length) {
            return res.status(404).json({ error: 'Movie sources not found' });
        }

        const sources = sourcesResponse.data.results;
        const selectedSource = sources.find(source => source.quality === quality) || sources[0];
        const videoUrl = selectedSource.download_url;

        console.log(`📹 Streaming from: ${videoUrl}`);

        // Set proper video headers
        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range');

        // Proxy the video stream
        const videoResponse = await axios({
            method: 'get',
            url: videoUrl,
            responseType: 'stream',
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'video/mp4,video/*;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'identity',
                'Range': req.headers.range || 'bytes=0-'
            }
        });

        // Forward content headers
        if (videoResponse.headers['content-length']) {
            res.setHeader('Content-Length', videoResponse.headers['content-length']);
        }
        if (videoResponse.headers['content-range']) {
            res.setHeader('Content-Range', videoResponse.headers['content-range']);
        }
        if (videoResponse.headers['content-type']) {
            res.setHeader('Content-Type', videoResponse.headers['content-type']);
        }

        // Handle response status for range requests
        if (req.headers.range && videoResponse.status === 206) {
            res.status(206);
        }

        console.log(`✅ Streaming video with Content-Type: ${res.getHeader('Content-Type')}`);

        // Pipe the video stream to client
        videoResponse.data.pipe(res);

        // Handle stream errors
        videoResponse.data.on('error', (error) => {
            console.error('Stream error:', error);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Stream failed' });
            }
        });

    } catch (error) {
        console.error('❌ Streaming error:', error.message);
        if (!res.headersSent) {
            res.status(500).json({ 
                success: false,
                error: 'Streaming failed',
                message: error.message,
                tip: 'The video source might be blocked or unavailable'
            });
        }
    }
});

// DIRECT VIDEO URL ENDPOINT (for testing)
app.get('/api/video/:movieId', async (req, res) => {
    try {
        const { movieId } = req.params;
        const { quality = '720p' } = req.query;

        const sourcesResponse = await axios.get(`https://movieapi.giftedtech.co.ke/api/sources/${movieId}`);
        
        if (!sourcesResponse.data.success) {
            return res.status(404).json({ error: 'Movie not found' });
        }

        const sources = sourcesResponse.data.results;
        const selectedSource = sources.find(source => source.quality === quality) || sources[0];

        if (!selectedSource) {
            return res.status(404).json({ error: 'Quality not available' });
        }

        // Return the direct video URL for frontend to use
        res.json({
            success: true,
            videoUrl: selectedSource.download_url,
            quality: selectedSource.quality,
            directLink: selectedSource.download_url
        });

    } catch (error) {
        console.error('Video URL error:', error);
        res.status(500).json({ error: 'Failed to get video URL' });
    }
});

// TEST VIDEO STREAMING ENDPOINT
app.get('/api/test-stream', async (req, res) => {
    try {
        // Test with a known movie
        const testMovieId = '5099284245269335848';
        const sourcesResponse = await axios.get(`https://movieapi.giftedtech.co.ke/api/sources/${testMovieId}`);
        
        if (sourcesResponse.data.success && sourcesResponse.data.results.length > 0) {
            const videoUrl = sourcesResponse.data.results[0].download_url;
            
            // Test if we can access the video
            const headResponse = await axios.head(videoUrl, {
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Range': 'bytes=0-1'
                }
            });

            res.json({
                success: true,
                videoUrl: videoUrl,
                streamUrl: `/api/stream/${testMovieId}`,
                contentType: headResponse.headers['content-type'],
                contentLength: headResponse.headers['content-length'],
                acceptsRange: headResponse.headers['accept-ranges'] === 'bytes',
                status: 'Video source is accessible'
            });
        } else {
            res.json({
                success: false,
                message: 'No video sources found for test movie'
            });
        }
    } catch (error) {
        res.json({
            success: false,
            message: 'Video test failed',
            error: error.message,
            tip: 'The video source might be blocked by CORS or require specific headers'
        });
    }
});

// Search endpoint
app.get('/api/search/:query', async (req, res) => {
    try {
        const { query } = req.params;
        
        console.log(`🔍 Searching: ${query}`);
        const response = await axios.get(`https://movieapi.giftedtech.co.ke/api/search/${encodeURIComponent(query)}`);
        
        res.json(response.data);
        
    } catch (error) {
        console.error('Search error:', error.message);
        res.status(500).json({ error: 'Search failed' });
    }
});

// Trending movies
app.get('/api/trending', async (req, res) => {
    try {
        const trendingQueries = ['avengers', 'spider man', 'batman', 'john wick', 'mission impossible'];
        const allMovies = [];
        
        for (const query of trendingQueries) {
            try {
                const response = await axios.get(`https://movieapi.giftedtech.co.ke/api/search/${encodeURIComponent(query)}`);
                if (response.data.success && response.data.results.items) {
                    allMovies.push(...response.data.results.items.slice(0, 4));
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

// Qualities endpoint
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
                video_url: `/api/video/${movieId}?quality=${source.quality}`,
                direct_url: source.download_url
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

        res.setHeader('Content-Disposition', `attachment; filename="movie-${movieId}-${quality}.mp4"`);
        res.setHeader('Content-Type', 'video/mp4');

        const videoResponse = await axios({
            method: 'get',
            url: videoUrl,
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
        features: ['Video Streaming', 'Search', 'Download', 'Quality Selection']
    });
});

// Serve frontend
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`
    🚀 STREAMFLIX SERVER (FIXED STREAMING)
    ======================================
    📍 Port: ${PORT}
    🎬 Streaming: PROPER PROXY
    📹 Video Headers: FIXED
    🔧 Test: http://localhost:${PORT}/api/test-stream
    ======================================
    `);
    console.log(`🌐 Open http://localhost:${PORT} in your browser`);
});
