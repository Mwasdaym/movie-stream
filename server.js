const express = require('express');
const axios = require('axios');
const path = require('path');
const app = express();

// Middleware - FIX CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    next();
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// FIXED SEARCH ENDPOINT
app.get('/api/search/:query', async (req, res) => {
    try {
        const { query } = req.params;
        console.log(`🔍 Searching for: ${query}`);
        
        const response = await axios.get(`https://movieapi.giftedtech.co.ke/api/search/${encodeURIComponent(query)}`, {
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        console.log('✅ Search successful, found:', response.data.results?.items?.length || 0, 'movies');
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

// FIXED MOVIE INFO ENDPOINT
app.get('/api/movie/:movieId', async (req, res) => {
    try {
        const { movieId } = req.params;
        const response = await axios.get(`https://movieapi.giftedtech.co.ke/api/info/${movieId}`);
        res.json(response.data);
    } catch (error) {
        console.error('Movie info error:', error);
        res.status(500).json({ error: 'Failed to get movie info' });
    }
});

// FIXED STREAMING ENDPOINT
app.get('/api/stream/:movieId', async (req, res) => {
    try {
        const { movieId } = req.params;
        const { quality = '720p' } = req.query;

        console.log(`🎬 Streaming: ${movieId}, quality: ${quality}`);

        // Get sources
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

        // Handle range requests
        const range = req.headers.range;
        
        if (range) {
            const headResponse = await axios.head(videoUrl);
            const fileSize = parseInt(headResponse.headers['content-length']);

            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunksize = (end - start) + 1;

            res.writeHead(206, {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Content-Length': chunksize,
            });

            const videoResponse = await axios({
                method: 'get',
                url: videoUrl,
                responseType: 'stream',
                headers: { 'Range': `bytes=${start}-${end}` }
            });

            videoResponse.data.pipe(res);
        } else {
            const videoResponse = await axios({
                method: 'get',
                url: videoUrl,
                responseType: 'stream'
            });

            videoResponse.data.pipe(res);
        }

    } catch (error) {
        console.error('Streaming error:', error);
        res.status(500).json({ error: 'Streaming failed' });
    }
});

// FIXED DOWNLOAD ENDPOINT
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

        // Get movie title
        const movieInfo = await axios.get(`https://movieapi.giftedtech.co.ke/api/info/${movieId}`);
        const movieTitle = movieInfo.data.success ? movieInfo.data.results.subject.title : `movie-${movieId}`;

        // Set download headers
        res.setHeader('Content-Disposition', `attachment; filename="${movieTitle}-${quality}.mp4"`);
        res.setHeader('Content-Type', 'video/mp4');

        // Stream for download
        const videoResponse = await axios({
            method: 'get',
            url: selectedSource.download_url,
            responseType: 'stream'
        });

        videoResponse.data.pipe(res);

    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({ error: 'Download failed' });
    }
});

// FIXED QUALITIES ENDPOINT
app.get('/api/qualities/:movieId', async (req, res) => {
    try {
        const { movieId } = req.params;
        const response = await axios.get(`https://movieapi.giftedtech.co.ke/api/sources/${movieId}`);
        
        if (response.data.success) {
            const qualities = response.data.results.map(source => ({
                quality: source.quality,
                size: source.size,
                url: source.download_url
            }));
            res.json({ success: true, qualities });
        } else {
            res.status(404).json({ error: 'No qualities found' });
        }
    } catch (error) {
        console.error('Qualities error:', error);
        res.status(500).json({ error: 'Failed to get qualities' });
    }
});

// TEST ENDPOINT - Check if API is working
app.get('/api/test', async (req, res) => {
    try {
        console.log('🧪 Testing API connection...');
        const response = await axios.get('https://movieapi.giftedtech.co.ke/api/search/avengers');
        res.json({ 
            success: true, 
            message: 'API is working!',
            moviesCount: response.data.results?.items?.length || 0
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
        message: 'StreamFlix Server Running',
        timestamp: new Date().toISOString()
    });
});

// Serve frontend
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌐 Open http://localhost:${PORT} in your browser`);
    console.log(`🔍 Test API: http://localhost:${PORT}/api/test`);
});
