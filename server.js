const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
require('dotenv').config();

const app = express();

// Middleware
app.use(helmet());
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/streamflix', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => console.log('✅ MongoDB Connected'))
.catch(err => console.log('❌ MongoDB Error:', err));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// ===== PROPER STREAMING ENDPOINTS =====

// Stream video with proper byte-range handling
app.get('/api/stream/:movieId', async (req, res) => {
    try {
        const { movieId } = req.params;
        const { quality = '720p' } = req.query;

        console.log(`🎬 Streaming request: ${movieId}, quality: ${quality}`);

        // Get download sources
        const sourcesResponse = await axios.get(`https://movieapi.giftedtech.co.ke/api/sources/${movieId}`);
        
        if (!sourcesResponse.data.success) {
            return res.status(404).json({ error: 'Movie sources not found' });
        }

        const sources = sourcesResponse.data.results;
        const selectedSource = sources.find(source => source.quality === quality) || sources[0];

        if (!selectedSource) {
            return res.status(404).json({ error: 'Quality not available' });
        }

        const videoUrl = selectedSource.download_url;
        
        // PROPER STREAMING HEADERS
        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Headers', 'Range');

        // Handle byte range requests (CRITICAL FOR STREAMING)
        const range = req.headers.range;
        
        if (range) {
            await handleByteRangeRequest(videoUrl, range, res);
        } else {
            await streamFullVideo(videoUrl, res);
        }

    } catch (error) {
        console.error('Streaming error:', error);
        res.status(500).json({ error: 'Streaming failed' });
    }
});

// Handle byte range requests for seeking
async function handleByteRangeRequest(videoUrl, range, res) {
    try {
        // Get file size first
        const headResponse = await axios.head(videoUrl);
        const fileSize = parseInt(headResponse.headers['content-length']);

        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

        // Validate range
        if (start >= fileSize || end >= fileSize) {
            res.status(416).setHeader('Content-Range', `bytes */${fileSize}`);
            return res.end();
        }

        const chunksize = (end - start) + 1;

        console.log(`📊 Streaming bytes ${start}-${end}/${fileSize}`);

        // Set proper range headers
        res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize,
            'Content-Type': 'video/mp4',
            'Cache-Control': 'no-cache'
        });

        // Stream the specific byte range
        const videoResponse = await axios({
            method: 'get',
            url: videoUrl,
            responseType: 'stream',
            headers: {
                'Range': `bytes=${start}-${end}`
            },
            timeout: 30000
        });

        videoResponse.data.pipe(res);

    } catch (error) {
        console.error('Range request error:', error);
        res.status(416).send('Range Not Satisfiable');
    }
}

// Stream full video
async function streamFullVideo(videoUrl, res) {
    try {
        const videoResponse = await axios({
            method: 'get',
            url: videoUrl,
            responseType: 'stream',
            timeout: 30000
        });

        // Set content headers
        if (videoResponse.headers['content-length']) {
            res.setHeader('Content-Length', videoResponse.headers['content-length']);
        }
        if (videoResponse.headers['content-type']) {
            res.setHeader('Content-Type', videoResponse.headers['content-type']);
        }

        videoResponse.data.pipe(res);

    } catch (error) {
        console.error('Full video stream error:', error);
        res.status(500).send('Streaming failed');
    }
}

// Get available qualities
app.get('/api/stream/:movieId/qualities', async (req, res) => {
    try {
        const { movieId } = req.params;

        const sourcesResponse = await axios.get(`https://movieapi.giftedtech.co.ke/api/sources/${movieId}`);
        
        if (!sourcesResponse.data.success) {
            return res.status(404).json({ error: 'Movie sources not found' });
        }

        const qualities = sourcesResponse.data.results.map(source => ({
            quality: source.quality,
            url: `/api/stream/${movieId}?quality=${source.quality}`,
            size: source.size
        }));

        res.json({
            success: true,
            data: { qualities }
        });

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

        console.log(`📥 Download request: ${movieId}, quality: ${quality}`);

        // Get sources
        const sourcesResponse = await axios.get(`https://movieapi.giftedtech.co.ke/api/sources/${movieId}`);
        
        if (!sourcesResponse.data.success) {
            return res.status(404).json({ error: 'Movie sources not found' });
        }

        const sources = sourcesResponse.data.results;
        const selectedSource = sources.find(source => source.quality === quality) || sources[0];

        if (!selectedSource) {
            return res.status(404).json({ error: 'Quality not available' });
        }

        // Get movie info for filename
        const movieInfoResponse = await axios.get(`https://movieapi.giftedtech.co.ke/api/info/${movieId}`);
        const movieTitle = movieInfoResponse.data.success 
            ? movieInfoResponse.data.results.subject.title 
            : `movie-${movieId}`;

        // Set download headers
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${movieTitle}-${quality}.mp4"`);
        res.setHeader('Content-Length', selectedSource.size);
        res.setHeader('Cache-Control', 'no-cache');

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

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        service: 'StreamFlix Streaming Server'
    });
});

// Catch all route - serve frontend
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`
    🚀 STREAMFLIX STREAMING SERVER
    ==============================
    📍 Port: ${PORT}
    🌍 Environment: ${process.env.NODE_ENV || 'development'}
    ⏰ Started: ${new Date().toISOString()}
    ==============================
    `);
});
