// =====================
// FIXED VIDEO STREAMING FUNCTIONS
// =====================
async function playMovie(movieId, movieTitle) {
    try {
        currentMovieId = movieId;
        currentMovieTitle = movieTitle;
        
        elements.nowPlaying.textContent = `Now Playing: ${movieTitle}`;
        showVideoPlayer();
        showNotification('Loading movie...', 'info');
        
        // Load available qualities
        await loadQualities(movieId);
        
        // Try streaming first, then fallback to direct URL
        await tryStreamingMethods(movieId);
        
    } catch (error) {
        console.error('Play error:', error);
        showStreamingError('Failed to play movie. Please try another quality or movie.');
    }
}

async function tryStreamingMethods(movieId) {
    const quality = elements.qualitySelect.value;
    
    console.log('🔄 Trying streaming methods...');
    
    // Method 1: Use our streaming endpoint
    try {
        console.log('🎬 Method 1: Using streaming endpoint');
        await playWithStreamEndpoint(movieId, quality);
        return; // Success
    } catch (error1) {
        console.log('❌ Method 1 failed:', error1.message);
    }
    
    // Method 2: Use direct video URL
    try {
        console.log('🎬 Method 2: Using direct video URL');
        await playWithDirectUrl(movieId, quality);
        return; // Success
    } catch (error2) {
        console.log('❌ Method 2 failed:', error2.message);
    }
    
    // All methods failed
    throw new Error('All streaming methods failed');
}

async function playWithStreamEndpoint(movieId, quality) {
    return new Promise((resolve, reject) => {
        const streamUrl = `${API_BASE}/api/stream/${movieId}?quality=${quality}`;
        console.log(`📹 Streaming from: ${streamUrl}`);
        
        // Clear previous source
        elements.videoElement.innerHTML = '';
        
        // Create source element
        const source = document.createElement('source');
        source.src = streamUrl;
        source.type = 'video/mp4';
        
        elements.videoElement.appendChild(source);
        elements.videoElement.load();
        
        // Set up event listeners
        const errorHandler = () => {
            reject(new Error('Stream endpoint failed'));
        };
        
        const loadHandler = () => {
            console.log('✅ Stream loaded successfully');
            resolve();
        };
        
        elements.videoElement.addEventListener('error', errorHandler, { once: true });
        elements.videoElement.addEventListener('loadeddata', loadHandler, { once: true });
        
        // Try to play
        elements.videoElement.play().catch(playError => {
            console.log('⏸️ Auto-play prevented, waiting for user');
            // Don't reject for autoplay issues
        });
        
        // Timeout after 15 seconds
        setTimeout(() => {
            if (elements.videoElement.readyState < 2) {
                reject(new Error('Stream loading timeout'));
            }
        }, 15000);
    });
}

async function playWithDirectUrl(movieId, quality) {
    return new Promise(async (resolve, reject) => {
        try {
            // Get direct video URL from API
            const response = await fetch(`${API_BASE}/api/video/${movieId}?quality=${quality}`);
            const data = await response.json();
            
            if (!data.success) {
                reject(new Error('Failed to get direct URL'));
                return;
            }
            
            const videoUrl = data.videoUrl;
            console.log(`🔗 Direct video URL: ${videoUrl}`);
            
            // Clear previous source
            elements.videoElement.innerHTML = '';
            
            // Create source element
            const source = document.createElement('source');
            source.src = videoUrl;
            source.type = 'video/mp4';
            
            elements.videoElement.appendChild(source);
            elements.videoElement.load();
            
            // Set up event listeners
            const errorHandler = () => {
                reject(new Error('Direct URL failed'));
            };
            
            const loadHandler = () => {
                console.log('✅ Direct URL loaded successfully');
                resolve();
            };
            
            elements.videoElement.addEventListener('error', errorHandler, { once: true });
            elements.videoElement.addEventListener('loadeddata', loadHandler, { once: true });
            
            // Try to play
            elements.videoElement.play().catch(playError => {
                console.log('⏸️ Auto-play prevented for direct URL');
            });
            
            // Timeout after 15 seconds
            setTimeout(() => {
                if (elements.videoElement.readyState < 2) {
                    reject(new Error('Direct URL loading timeout'));
                }
            }, 15000);
            
        } catch (error) {
            reject(error);
        }
    });
}

async function handleQualityChange() {
    if (currentMovieId) {
        showNotification('Changing quality...', 'info');
        await tryStreamingMethods(currentMovieId);
    }
}
