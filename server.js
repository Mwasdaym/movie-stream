const express = require('express');
const axios = require('axios');
const path = require('path');
const cors = require('cors');
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Movie API Configuration
const MOVIE_API = {
  baseURL: 'https://movieapi.giftedtech.co.ke/api',
  endpoints: {
    search: '/search',
    sources: '/sources',
    info: '/info'
  }
};

// Cache for performance
const cache = new Map();
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

// =====================
// FIXED VIDEO STREAMING
// =====================

app.get('/api/stream/:movieId', async (req, res) => {
  try {
    const { movieId } = req.params;
    const { quality = '720p' } = req.query;
    
    console.log(`🎬 Streaming request: ${movieId} [${quality}]`);
    
    // Get video sources
    const sourcesResponse = await axios.get(`${MOVIE_API.baseURL}/sources/${movieId}`);
    
    if (!sourcesResponse.data.success || !sourcesResponse.data.results?.length) {
      return res.status(404).json({ error: 'No video sources found' });
    }
    
    const sources = sourcesResponse.data.results;
    const selectedSource = sources.find(source => source.quality === quality) || sources[0];
    const videoUrl = selectedSource.download_url;

    console.log(`📹 Video URL: ${videoUrl}`);
    
    // Set proper headers for video streaming
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    // Use axios to stream the video with proper headers
    const videoResponse = await axios({
      method: 'get',
      url: videoUrl,
      responseType: 'stream',
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': '*/*',
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

    // Handle response status
    if (req.headers.range && videoResponse.status === 206) {
      res.status(206);
    }

    console.log(`✅ Streaming video with headers:`, {
      'Content-Type': res.getHeader('Content-Type'),
      'Content-Length': res.getHeader('Content-Length'),
      'Accept-Ranges': res.getHeader('Accept-Ranges')
    });

    // Pipe the video stream to client
    videoResponse.data.pipe(res);

    // Handle stream errors
    videoResponse.data.on('error', (error) => {
      console.error('Stream pipe error:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Stream failed' });
      }
    });

    // Handle client disconnect
    req.on('close', () => {
      if (videoResponse.data.destroy) {
        videoResponse.data.destroy();
      }
    });

  } catch (error) {
    console.error('❌ Streaming error:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ 
        success: false,
        error: 'Streaming failed',
        message: error.message
      });
    }
  }
});

// DIRECT VIDEO ENDPOINT - Returns video URL for direct playback
app.get('/api/video/:movieId', async (req, res) => {
  try {
    const { movieId } = req.params;
    const { quality = '720p' } = req.query;

    const sourcesResponse = await axios.get(`${MOVIE_API.baseURL}/sources/${movieId}`);
    
    if (!sourcesResponse.data.success) {
      return res.status(404).json({ error: 'Movie not found' });
    }

    const sources = sourcesResponse.data.results;
    const selectedSource = sources.find(source => source.quality === quality) || sources[0];

    if (!selectedSource) {
      return res.status(404).json({ error: 'Quality not available' });
    }

    // Return the direct video URL
    res.json({
      success: true,
      videoUrl: selectedSource.download_url,
      quality: selectedSource.quality,
      type: 'direct_url'
    });

  } catch (error) {
    console.error('Video URL error:', error);
    res.status(500).json({ error: 'Failed to get video URL' });
  }
});

// TEST STREAMING ENDPOINT
app.get('/api/test-stream/:movieId?', async (req, res) => {
  try {
    const testMovieId = req.params.movieId || '5099284245269335848'; // Default test movie
    
    const sourcesResponse = await axios.get(`${MOVIE_API.baseURL}/sources/${testMovieId}`);
    
    if (sourcesResponse.data.success && sourcesResponse.data.results.length > 0) {
      const videoUrl = sourcesResponse.data.results[0].download_url;
      
      // Test if video is accessible
      const headResponse = await axios.head(videoUrl, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Range': 'bytes=0-1'
        }
      });

      res.json({
        success: true,
        movieId: testMovieId,
        videoUrl: videoUrl,
        streamUrl: `/api/stream/${testMovieId}`,
        directUrl: `/api/video/${testMovieId}`,
        contentType: headResponse.headers['content-type'],
        contentLength: headResponse.headers['content-length'],
        acceptsRange: headResponse.headers['accept-ranges'] === 'bytes',
        status: 'Video source is accessible and ready for streaming'
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
      error: error.message
    });
  }
});

// =====================
// OTHER ENDPOINTS (Keep these from previous version)
// =====================

// Search Movies
app.get('/api/search/:query', async (req, res) => {
  try {
    const { query } = req.params;
    const cacheKey = `search-${query}`;
    
    if (cache.has(cacheKey)) {
      const cached = cache.get(cacheKey);
      if (Date.now() - cached.timestamp < CACHE_DURATION) {
        return res.json(cached.data);
      }
    }
    
    console.log(`🔍 Searching: ${query}`);
    
    const response = await axios.get(`${MOVIE_API.baseURL}/search/${encodeURIComponent(query)}`, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    cache.set(cacheKey, {
      timestamp: Date.now(),
      data: response.data
    });
    
    res.json(response.data);
    
  } catch (error) {
    console.error('Search error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Search failed',
      message: error.message
    });
  }
});

// Get Movie Sources
app.get('/api/sources/:movieId', async (req, res) => {
  try {
    const { movieId } = req.params;
    
    const response = await axios.get(`${MOVIE_API.baseURL}/sources/${movieId}`, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    res.json(response.data);
    
  } catch (error) {
    console.error('Sources error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to get sources',
      message: error.message
    });
  }
});

// Trending Movies
app.get('/api/trending', async (req, res) => {
  try {
    const trendingQueries = [
      'avengers', 'spider man', 'batman', 'john wick', 
      'mission impossible', 'fast and furious', 'superman'
    ];
    
    const allMovies = [];
    
    for (const query of trendingQueries) {
      try {
        const response = await axios.get(`${MOVIE_API.baseURL}/search/${encodeURIComponent(query)}`);
        if (response.data.success && response.data.results.items) {
          const moviesWithTag = response.data.results.items.slice(0, 4).map(movie => ({
            ...movie,
            category: query
          }));
          allMovies.push(...moviesWithTag);
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`Error fetching ${query}:`, error.message);
      }
    }
    
    const uniqueMovies = [...new Map(allMovies.map(movie => [movie.subjectId, movie])).values()];
    const shuffled = uniqueMovies.sort(() => 0.5 - Math.random()).slice(0, 24);
    
    res.json({
      success: true,
      results: { items: shuffled },
      total: shuffled.length
    });
    
  } catch (error) {
    console.error('Trending error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to get trending movies' 
    });
  }
});

// Movie Qualities
app.get('/api/qualities/:movieId', async (req, res) => {
  try {
    const { movieId } = req.params;
    
    const response = await axios.get(`${MOVIE_API.baseURL}/sources/${movieId}`);
    
    if (response.data.success) {
      const qualities = response.data.results.map(source => ({
        quality: source.quality,
        size: source.size,
        format: source.format || 'mp4',
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

// Download Movie
app.get('/api/download/:movieId', async (req, res) => {
  try {
    const { movieId } = req.params;
    const { quality = '720p' } = req.query;
    
    const sourcesResponse = await axios.get(`${MOVIE_API.baseURL}/sources/${movieId}`);
    
    if (!sourcesResponse.data.success) {
      return res.status(404).json({ error: 'Movie not found' });
    }
    
    const sources = sourcesResponse.data.results;
    const selectedSource = sources.find(source => source.quality === quality) || sources[0];
    
    if (!selectedSource) {
      return res.status(404).json({ error: 'Quality not available' });
    }
    
    let movieTitle = `movie-${movieId}`;
    try {
      const infoResponse = await axios.get(`${MOVIE_API.baseURL}/info/${movieId}`);
      if (infoResponse.data.success) {
        movieTitle = infoResponse.data.results.subject.title;
      }
    } catch (infoError) {
      console.log('Could not get movie title, using default');
    }
    
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

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: '✅ Healthy',
    message: 'StreamFlix Server Running 🚀',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    features: [
      'Fixed Video Streaming',
      'Movie Search',
      'Quality Selection',
      'Download',
      'Trending Movies'
    ]
  });
});

// Serve Frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`
  🎬 STREAMFLIX SERVER (FIXED STREAMING)
  ======================================
  📍 Port: ${PORT}
  🚀 Status: Running
  🌐 URL: http://localhost:${PORT}
  📊 API: ${MOVIE_API.baseURL}
  ======================================
  `);
  console.log('✅ Backend ready with FIXED streaming!');
  console.log('📹 Video streaming should work now');
  console.log(`🔧 Test streaming: http://localhost:${PORT}/api/test-stream`);
});
