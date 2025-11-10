// =====================
// FIXED VIDEO PLAYBACK USING STREAM URLS
// =====================
async function playMovie(movieId, movieTitle) {
    try {
        currentMovieId = movieId;
        currentMovieTitle = movieTitle;
        
        elements.nowPlaying.textContent = `Now Playing: ${movieTitle}`;
        showVideoPlayer();
        showNotification('Loading video stream...', 'info');
        
        // Load available qualities first
        await loadQualities(movieId);
        
        // Play using the stream URL directly
        await playWithStreamUrl(movieId);
        
    } catch (error) {
        console.error('Play error:', error);
        showStreamingError('Failed to play movie: ' + error.message);
    }
}

async function playWithStreamUrl(movieId) {
    const quality = elements.qualitySelect.value;
    
    console.log(`🎬 Playing: ${movieId} [${quality}]`);
    
    try {
        // Get the stream URL from our API
        const response = await fetch(`${API_BASE}/api/video/${movieId}?quality=${quality}`);
        const data = await response.json();
        
        if (!data.success) {
            throw new Error('Failed to get stream URL');
        }
        
        const streamUrl = data.streamUrl;
        console.log(`📹 Stream URL: ${streamUrl}`);
        
        // Clear previous video
        elements.videoElement.innerHTML = '';
        
        // Create video source with the stream URL
        const source = document.createElement('source');
        source.src = streamUrl;
        source.type = 'video/mp4';
        
        elements.videoElement.appendChild(source);
        elements.videoElement.load();
        
        // Wait for video to load
        await new Promise((resolve, reject) => {
            const loadedHandler = () => {
                console.log('✅ Video stream loaded successfully');
                resolve();
            };
            
            const errorHandler = () => {
                reject(new Error('Video failed to load'));
            };
            
            elements.videoElement.addEventListener('loadeddata', loadedHandler, { once: true });
            elements.videoElement.addEventListener('error', errorHandler, { once: true });
            
            // Timeout after 15 seconds
            setTimeout(() => {
                if (elements.videoElement.readyState < 2) {
                    reject(new Error('Video loading timeout'));
                }
            }, 15000);
        });
        
        // Try to play
        try {
            await elements.videoElement.play();
            console.log('✅ Video playback started');
            showNotification('Video playback started', 'success');
        } catch (playError) {
            console.log('⏸️ Auto-play prevented, click play to start');
            showNotification('Click play to start video', 'info');
        }
        
    } catch (error) {
        console.error('Stream playback error:', error);
        throw error;
    }
}

async function handleQualityChange() {
    if (currentMovieId) {
        showNotification('Changing quality...', 'info');
        await playWithStreamUrl(currentMovieId);
    }
}
