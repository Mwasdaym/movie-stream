const express = require('express');
const axios = require('axios');
const path = require('path');
const app = express();

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Simple streaming endpoint
app.get('/api/stream/:movieId', async (req, res) => {
    try {
        const { movieId } = req.params;
        const { quality = '720p' } = req.query;

        console.log(`🎬 Streaming movie: ${movieId}, quality: ${quality}`);

        // Get download sources from API
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
        
        // Set headers for streaming
        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'no-cache');

        // Handle range requests for seeking
        const range = req.headers.range;
        
        if (range) {
            // Get file size
            const headResponse = await axios.head(videoUrl);
            const fileSize = parseInt(headResponse.headers['content-length']);

            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunksize = (end - start) + 1;

            // Set range headers
            res.writeHead(206, {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Content-Length': chunksize,
            });

            // Stream the range
            const videoResponse = await axios({
                method: 'get',
                url: videoUrl,
                responseType: 'stream',
                headers: { 'Range': `bytes=${start}-${end}` }
            });

            videoResponse.data.pipe(res);
        } else {
            // Stream full video
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

// Download endpoint
app.get('/api/download/:movieId', async (req, res) => {
    try {
        const { movieId } = req.params;
        const { quality = '720p' } = req.query;

        console.log(`📥 Downloading movie: ${movieId}, quality: ${quality}`);

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

        // Get movie title for filename
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

// Search movies
app.get('/api/search/:query', async (req, res) => {
    try {
        const { query } = req.params;
        const response = await axios.get(`https://movieapi.giftedtech.co.ke/api/search/${encodeURIComponent(query)}`);
        res.json(response.data);
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: 'Search failed' });
    }
});

// Get movie info
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

// Get available qualities
app.get('/api/qualities/:movieId', async (req, res) => {
    try {
        const { movieId } = req.params;
        const response = await axios.get(`https://movieapi.giftedtech.co.ke/api/sources/${movieId}`);
        
        if (response.data.success) {
            const qualities = response.data.results.map(source => ({
                quality: source.quality,
                size: source.size
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

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'StreamFlix Server Running' });
});

// Serve frontend
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌐 Open http://localhost:${PORT} in your browser`);
});
