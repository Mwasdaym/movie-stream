const express = require('express');
const axios = require('axios');
const stream = require('stream');
const router = express.Router();
const { auth } = require('../middleware/auth');

// External API
const EXTERNAL_API = 'https://movieapi.giftedtech.co.ke/api';

// ===== ADVANCED STREAMING PROXY =====
router.get('/:movieId', auth, async (req, res) => {
    try {
        const { movieId } = req.params;
        const { quality = '720p' } = req.query;
        const userId = req.user.id;

        console.log(`🎬 Streaming request from user ${userId}: ${movieId}, quality: ${quality}`);

        // Check user subscription
        if (!await checkUserSubscription(userId)) {
            return res.status(403).json({
                success: false,
                error: 'Subscription required for streaming'
            });
        }

        // Get sources
        const sources = await getMovieSources(movieId);
        const selectedSource = sources.find(source => source.quality === quality) || sources[0];

        if (!selectedSource) {
            return res.status(404).json({
                success: false,
                error: 'Requested quality not available'
            });
        }

        const videoUrl = selectedSource.download_url;
        
        // Set streaming headers
        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Headers', 'Range');

        // Handle range requests
        const range = req.headers.range;
        
        if (range) {
            await handleAdvancedRangeRequest(videoUrl, range, res, movieId, userId);
        } else {
            await streamFullVideo(videoUrl, res, movieId, userId);
        }

        // Log streaming start
        logStreamingEvent(userId, movieId, quality, 'start');

    } catch (error) {
        console.error('Streaming error:', error);
        logStreamingEvent(userId, movieId, quality, 'error', error.message);
        res.status(500).json({
            success: false,
            error: 'Streaming failed'
        });
    }
});

// ===== ADVANCED RANGE REQUEST HANDLER =====
async function handleAdvancedRangeRequest(videoUrl, range, res, movieId, userId) {
    try {
        // Get file info with timeout
        const headResponse = await axios.head(videoUrl, { timeout: 10000 });
        const fileSize = parseInt(headResponse.headers['content-length']);
        const contentType = headResponse.headers['content-type'] || 'video/mp4';

        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        
        // Validate range
        if (start >= fileSize) {
            res.status(416).setHeader('Content-Range', `bytes */${fileSize}`);
            return res.end();
        }

        const chunksize = (end - start) + 1;

        console.log(`📊 Streaming bytes ${start}-${end}/${fileSize} for user ${userId}`);

        // Set range headers
        res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize,
            'Content-Type': contentType,
            'Cache-Control': 'no-cache'
        });

        // Stream with progress tracking
        const videoResponse = await axios({
            method: 'get',
            url: videoUrl,
            responseType: 'stream',
            headers: { 'Range': `bytes=${start}-${end}` },
            timeout: 30000
        });

        let bytesStreamed = 0;
        
        videoResponse.data.on('data', (chunk) => {
            bytesStreamed += chunk.length;
            // Emit progress to socket
            const io = req.app.get('io');
            if (io) {
                io.to(`user-${userId}`).emit('stream-progress', {
                    movieId,
                    bytesStreamed,
                    totalBytes: chunksize,
                    percentage: Math.round((bytesStreamed / chunksize) * 100)
                });
            }
        });

        videoResponse.data.on('end', () => {
            logStreamingEvent(userId, movieId, 'unknown', 'chunk_complete', `${bytesStreamed} bytes`);
        });

        videoResponse.data.pipe(res);

    } catch (error) {
        console.error('Range request error:', error);
        logStreamingEvent(userId, movieId, 'unknown', 'error', error.message);
        res.status(416).send('Range Not Satisfiable');
    }
}

// ===== STREAM FULL VIDEO =====
async function streamFullVideo(videoUrl, res, movieId, userId) {
    try {
        const videoResponse = await axios({
            method: 'get',
            url: videoUrl,
            responseType: 'stream',
            timeout: 30000
        });

        // Set headers
        if (videoResponse.headers['content-length']) {
            res.setHeader('Content-Length', videoResponse.headers['content-length']);
        }
        if (videoResponse.headers['content-type']) {
            res.setHeader('Content-Type', videoResponse.headers['content-type']);
        }

        let totalBytes = 0;
        
        videoResponse.data.on('data', (chunk) => {
            totalBytes += chunk.length;
        });

        videoResponse.data.on('end', () => {
            logStreamingEvent(userId, movieId, 'unknown', 'complete', `${totalBytes} bytes streamed`);
        });

        videoResponse.data.pipe(res);

    } catch (error) {
        console.error('Full video stream error:', error);
        logStreamingEvent(userId, movieId, 'unknown', 'error', error.message);
        res.status(500).send('Streaming failed');
    }
}

// ===== DOWNLOAD ENDPOINT =====
router.get('/:movieId/download', auth, async (req, res) => {
    try {
        const { movieId } = req.params;
        const { quality = '720p' } = req.query;
        const userId = req.user.id;

        console.log(`📥 Download request from user ${userId}: ${movieId}, quality: ${quality}`);

        // Get sources
        const sources = await getMovieSources(movieId);
        const selectedSource = sources.find(source => source.quality === quality) || sources[0];

        if (!selectedSource) {
            return res.status(404).json({
                success: false,
                error: 'Requested quality not available'
            });
        }

        // Get movie info for filename
        const movieInfo = await getMovieInfo(movieId);
        const movieTitle = movieInfo?.title || `movie-${movieId}`;
        const safeTitle = movieTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase();

        // Set download headers
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}-${quality}.mp4"`);
        res.setHeader('Content-Length', selectedSource.size);
        res.setHeader('Cache-Control', 'no-cache');

        // Stream for download
        const videoResponse = await axios({
            method: 'get',
            url: selectedSource.download_url,
            responseType: 'stream',
            timeout: 60000
        });

        // Log download
        logDownloadEvent(userId, movieId, quality, selectedSource.size);

        videoResponse.data.pipe(res);

    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({
            success: false,
            error: 'Download failed'
        });
    }
});

// ===== GET AVAILABLE QUALITIES =====
router.get('/:movieId/qualities', async (req, res) => {
    try {
        const { movieId } = req.params;

        const sources = await getMovieSources(movieId);
        
        const qualities = sources.map(source => ({
            quality: source.quality,
            stream_url: `${req.protocol}://${req.get('host')}/api/stream/${movieId}?quality=${source.quality}`,
            download_url: `${req.protocol}://${req.get('host')}/api/stream/${movieId}/download?quality=${source.quality}`,
            size: source.size,
            format: source.format,
            bitrate: calculateBitrate(source.size, source.duration)
        }));

        res.json({
            success: true,
            data: { qualities }
        });

    } catch (error) {
        console.error('Qualities error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get qualities'
        });
    }
});

// ===== STREAMING STATISTICS =====
router.get('/:movieId/statistics', auth, async (req, res) => {
    try {
        const { movieId } = req.params;
        const userId = req.user.id;

        const stats = await getStreamingStatistics(userId, movieId);

        res.json({
            success: true,
            data: { statistics: stats }
        });

    } catch (error) {
        console.error('Statistics error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get statistics'
        });
    }
});

// ===== HELPER FUNCTIONS =====
async function getMovieSources(movieId) {
    try {
        const response = await axios.get(`${EXTERNAL_API}/sources/${movieId}`, { timeout: 10000 });
        return response.data.success ? response.data.results : [];
    } catch (error) {
        console.error('Error getting movie sources:', error);
        return [];
    }
}

async function getMovieInfo(movieId) {
    try {
        const response = await axios.get(`${EXTERNAL_API}/info/${movieId}`, { timeout: 10000 });
        return response.data.success ? response.data.results.subject : null;
    } catch (error) {
        console.error('Error getting movie info:', error);
        return null;
    }
}

async function checkUserSubscription(userId) {
    try {
        const User = require('../models/User');
        const user = await User.findById(userId);
        return user && user.subscription?.isActive;
    } catch (error) {
        console.error('Error checking subscription:', error);
        return false;
    }
}

function calculateBitrate(size, duration) {
    if (!size || !duration) return 'Unknown';
    const bits = size * 8;
    const kbps = Math.round(bits / (duration * 1000));
    return `${kbps} kbps`;
}

function logStreamingEvent(userId, movieId, quality, event, details = '') {
    const logEntry = {
        timestamp: new Date().toISOString(),
        userId,
        movieId,
        quality,
        event,
        details,
        ip: req?.ip || 'unknown'
    };

    console.log(`📊 Streaming Event: ${JSON.stringify(logEntry)}`);
    
    // Write to streaming log file
    const fs = require('fs');
    const path = require('path');
    fs.appendFileSync(
        path.join(__dirname, '../logs/streaming.log'),
        JSON.stringify(logEntry) + '\n'
    );
}

function logDownloadEvent(userId, movieId, quality, size) {
    const logEntry = {
        timestamp: new Date().toISOString(),
        userId,
        movieId,
        quality,
        size,
        event: 'download',
        ip: req?.ip || 'unknown'
    };

    console.log(`📥 Download Event: ${JSON.stringify(logEntry)}`);
    
    const fs = require('fs');
    const path = require('path');
    fs.appendFileSync(
        path.join(__dirname, '../logs/streaming.log'),
        JSON.stringify(logEntry) + '\n'
    );
}

async function getStreamingStatistics(userId, movieId) {
    try {
        const WatchHistory = require('../models/WatchHistory');
        const history = await WatchHistory.find({ userId, movieId }).sort({ lastWatched: -1 }).limit(10);
        
        return {
            totalWatches: history.length,
            lastWatched: history[0]?.lastWatched || null,
            averageProgress: history.reduce((acc, curr) => acc + curr.progress, 0) / history.length || 0,
            totalWatchTime: history.reduce((acc, curr) => acc + curr.duration, 0)
        };
    } catch (error) {
        console.error('Error getting statistics:', error);
        return {};
    }
}

// ===== BULK DOWNLOAD (Multiple qualities) =====
router.get('/:movieId/bulk-download', auth, async (req, res) => {
    try {
        const { movieId } = req.params;
        const userId = req.user.id;

        const sources = await getMovieSources(movieId);
        const movieInfo = await getMovieInfo(movieId);
        const safeTitle = movieInfo?.title?.replace(/[^a-z0-9]/gi, '_').toLowerCase() || `movie-${movieId}`;

        // Create download links for all qualities
        const downloadLinks = sources.map(source => ({
            quality: source.quality,
            url: `${req.protocol}://${req.get('host')}/api/stream/${movieId}/download?quality=${source.quality}`,
            size: source.size,
            filename: `${safeTitle}-${source.quality}.mp4`
        }));

        res.json({
            success: true,
            data: {
                movie: movieInfo,
                downloads: downloadLinks
            }
        });

    } catch (error) {
        console.error('Bulk download error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get bulk download links'
        });
    }
});

module.exports = router;
