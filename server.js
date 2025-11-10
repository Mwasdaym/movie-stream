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
const CACHE_DURATION = 10 * 60 * 1000;

// =====================
// PROPER VIDEO STREAMING USING API'S OWN STREAM URLS
// =====================

// Get video stream URL - returns the API's own stream URL
app.get('/api/video/:movieId', async (req, res) => {
  try {
    const { movieId } = req.params;
    const { quality = '720p' } = req.query;

    console.log(`🎬 Getting video stream for: ${movieId} [${quality}]`);

    const sourcesResponse = await axios.get(`${MOVIE_API.baseURL}/sources/${movieId}`);
    
    if (!sourcesResponse.data.success) {
      return res.status(404).json({ error: 'Movie not found' });
    }

    const sources = sourcesResponse.data.results;
    const selectedSource = sources.find(source => source.quality === quality) || sources[0];

    if (!selectedSource) {
      return res.status(404).json({ error: 'Quality not available' });
    }

    // Use the API's own stream_url directly
    const streamUrl = selectedSource.stream_url;
    
    console.log(`📹 Using API stream URL: ${streamUrl}`);
    
    // Return the stream URL for frontend to use directly
    res.json({
      success: true,
      streamUrl: streamUrl,
      quality: selectedSource.quality,
      size: selectedSource.size,
      type: 'direct_stream'
    });

  } catch (error) {
    console.error('Video stream error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to get video stream',
      message: error.message 
    });
  }
});

// Direct download URL
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

    // Use the API's own download_url
    const downloadUrl = selectedSource.download_url;
    
    // Redirect to the API's download endpoint
    res.redirect(downloadUrl);

  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: 'Download failed' });
  }
});

// Test video streaming
app.get('/api/test/:movieId?', async (req, res) => {
  try {
    const testMovieId = req.params.movieId || '5154075108704669480'; // The Avengers
    
    const sourcesResponse = await axios.get(`${MOVIE_API.baseURL}/sources/${testMovieId}`);
    
    if (sourcesResponse.data.success && sourcesResponse.data.results.length > 0) {
      const streamUrl = sourcesResponse.data.results[0].stream_url;
      const downloadUrl = sourcesResponse.data.results[0].download_url;
      
      res.json({
        success: true,
        movieId: testMovieId,
        title: 'The Avengers',
        qualities: sourcesResponse.data.results.map(s => s.quality),
        streamUrl: streamUrl,
        downloadUrl: downloadUrl,
        instructions: 'Use streamUrl directly in video element src',
        status: 'READY - Video streaming should work now!'
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
      message: 'Test failed',
      error: error.message
    });
  }
});

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
      timeout: 10000
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

// Trending Movies
app.get('/api/trending', async (req, res) => {
  try {
    const trendingQueries = [
      'avengers', 'spider man', 'batman', 'john wick', 
      'mission impossible', 'fast and furious'
    ];
    
    const allMovies = [];
    
    for (const query of trendingQueries) {
      try {
        const response = await axios.get(`${MOVIE_API.baseURL}/search/${encodeURIComponent(query)}`);
        if (response.data.success && response.data.results.items) {
          allMovies.push(...response.data.results.items.slice(0, 4));
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`Error fetching ${query}:`, error.message);
      }
    }
    
    const uniqueMovies = [...new Map(allMovies.map(movie => [movie.subjectId, movie])).values()];
    const shuffled = uniqueMovies.sort(() => 0.5 - Math.random()).slice(0, 20);
    
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
        format: source.format,
        stream_url: source.stream_url, // Use the API's stream_url directly
        download_url: source.download_url
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

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: '✅ Healthy',
    message: 'StreamFlix Server - Using API Stream URLs',
    timestamp: new Date().toISOString(),
    version: '4.0.0'
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
  🎬 STREAMFLIX - FIXED STREAMING
  ================================
  📍 Port: ${PORT}
  🚀 Status: Running
  🌐 URL: http://localhost:${PORT}
  📊 Approach: Using API's stream URLs directly
  ================================
  `);
  console.log('✅ Server ready with FIXED streaming!');
  console.log('📹 Using movie API stream URLs directly');
  console.log(`🔧 Test: http://localhost:${PORT}/api/test`);
});
