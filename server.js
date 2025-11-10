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
// MOVIE DATA ENDPOINTS
// =====================

// Search Movies
app.get('/api/search/:query', async (req, res) => {
  try {
    const { query } = req.params;
    const cacheKey = `search-${query}`;
    
    // Check cache
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
    
    // Cache the results
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

// Get Movie Info
app.get('/api/info/:movieId', async (req, res) => {
  try {
    const { movieId } = req.params;
    
    const response = await axios.get(`${MOVIE_API.baseURL}/info/${movieId}`, {
      timeout: 10000
    });
    
    res.json(response.data);
    
  } catch (error) {
    console.error('Info error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to get movie info',
      message: error.message
    });
  }
});

// =====================
// VIDEO STREAMING ENDPOINTS
// =====================

// Smart Video Streaming
app.get('/api/stream/:movieId', async (req, res) => {
  try {
    const { movieId } = req.params;
    const { quality = '720p' } = req.query;
    
    console.log(`🎬 Streaming request: ${movieId} [${quality}]`);
    
    // Get available sources
    const sourcesResponse = await axios.get(`${MOVIE_API.baseURL}/sources/${movieId}`);
    
    if (!sourcesResponse.data.success || !sourcesResponse.data.results?.length) {
      return res.status(404).json({ error: 'No video sources found' });
    }
    
    const sources = sourcesResponse.data.results;
    const selectedSource = sources.find(source => source.quality === quality) || sources[0];
    const videoUrl = selectedSource.download_url;
    
    console.log(`📹 Streaming from: ${videoUrl}`);
    
    // Set video headers
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    // Handle range requests for seeking
    const range = req.headers.range;
    
    if (range) {
      try {
        const headResponse = await axios.head(videoUrl, { timeout: 5000 });
        const videoSize = parseInt(headResponse.headers['content-length']);
        
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : videoSize - 1;
        const chunkSize = (end - start) + 1;
        
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${videoSize}`,
          'Content-Length': chunkSize,
        });
        
        const videoResponse = await axios({
          method: 'get',
          url: videoUrl,
          responseType: 'stream',
          headers: { 'Range': `bytes=${start}-${end}` },
          timeout: 30000
        });
        
        videoResponse.data.pipe(res);
        return;
        
      } catch (rangeError) {
        console.log('Range request failed, falling back to full stream');
      }
    }
    
    // Full stream fallback
    const videoResponse = await axios({
      method: 'get',
      url: videoUrl,
      responseType: 'stream',
      timeout: 30000
    });
    
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

// Direct Video URL
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
    
    res.json({
      success: true,
      videoUrl: selectedSource.download_url,
      quality: selectedSource.quality,
      type: 'direct'
    });
    
  } catch (error) {
    console.error('Video URL error:', error);
    res.status(500).json({ error: 'Failed to get video URL' });
  }
});

// =====================
// ADDITIONAL FEATURES
// =====================

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
          // Add query tag to movies
          const moviesWithTag = response.data.results.items.slice(0, 4).map(movie => ({
            ...movie,
            category: query
          }));
          allMovies.push(...moviesWithTag);
        }
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`Error fetching ${query}:`, error.message);
      }
    }
    
    // Remove duplicates and shuffle
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
    
    // Get movie title for filename
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
    version: '1.0.0',
    features: [
      'Video Streaming',
      'Movie Search',
      'Quality Selection',
      'Download',
      'Trending Movies'
    ]
  });
});

// Test Streaming
app.get('/api/test', async (req, res) => {
  try {
    // Test with popular movie
    const testMovieId = '5099284245269335848';
    const sourcesResponse = await axios.get(`${MOVIE_API.baseURL}/sources/${testMovieId}`);
    
    if (sourcesResponse.data.success && sourcesResponse.data.results.length > 0) {
      const videoUrl = sourcesResponse.data.results[0].download_url;
      
      res.json({
        success: true,
        message: 'API is working!',
        testMovie: 'Available',
        videoSources: sourcesResponse.data.results.length,
        streamUrl: `/api/stream/${testMovieId}`,
        directUrl: `/api/video/${testMovieId}`,
        status: 'Ready for streaming 🎬'
      });
    } else {
      res.json({
        success: false,
        message: 'No test movie sources found'
      });
    }
  } catch (error) {
    res.json({
      success: false,
      message: 'API test failed',
      error: error.message
    });
  }
});

// Serve Frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`
  🎬 FULL STREAMING WEBSITE
  =========================
  📍 Port: ${PORT}
  🚀 Status: Running
  🌐 URL: http://localhost:${PORT}
  📊 API: ${MOVIE_API.baseURL}
  =========================
  `);
  console.log('✅ Backend ready!');
  console.log('📹 Video streaming enabled');
  console.log('🔍 Search functionality active');
  console.log(`💡 Test API: http://localhost:${PORT}/api/test`);
});
