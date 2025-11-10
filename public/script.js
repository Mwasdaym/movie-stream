// API Configuration - USING YOUR API BRO!
const API_BASE = 'https://movieapi.giftedtech.co.ke/api';

// DOM Elements
const elements = {
    // Navigation
    searchInput: document.getElementById('searchInput'),
    searchBtn: document.getElementById('searchBtn'),
    navbar: document.querySelector('.navbar'),
    
    // Sections
    videoPlayerSection: document.getElementById('videoPlayerSection'),
    mainContent: document.getElementById('mainContent'),
    
    // Video Player
    player: document.getElementById('player'),
    backToBrowse: document.getElementById('backToBrowse'),
    nowPlayingTitle: document.getElementById('nowPlayingTitle'),
    qualitySelect: document.getElementById('qualitySelect'),
    downloadBtn: document.getElementById('downloadBtn'),
    
    // Hero Section
    featuredTitle: document.getElementById('featuredTitle'),
    featuredDescription: document.getElementById('featuredDescription'),
    featuredMeta: document.getElementById('featuredMeta'),
    heroBackground: document.getElementById('heroBackground'),
    playFeaturedBtn: document.getElementById('playFeaturedBtn'),
    featuredInfoBtn: document.getElementById('featuredInfoBtn'),
    
    // Content Grids
    trendingGrid: document.getElementById('trendingGrid'),
    popularGrid: document.getElementById('popularGrid'),
    actionGrid: document.getElementById('actionGrid'),
    searchGrid: document.getElementById('searchGrid'),
    searchResults: document.getElementById('searchResults'),
    
    // Modal
    movieModal: document.getElementById('movieModal'),
    closeModal: document.getElementById('closeModal'),
    modalBody: document.getElementById('modalBody')
};

// Global Variables
let currentMovies = [];
let featuredMovie = null;
let plyrPlayer = null;

// Initialize App
async function init() {
    await loadFeaturedMovie();
    await loadAllSections();
    setupEventListeners();
    initializeVideoPlayer();
}

// Load Featured Movie for Hero Section
async function loadFeaturedMovie() {
    try {
        // Get a popular movie for featured section
        const response = await fetch(`${API_BASE}/search/avengers`);
        const data = await response.json();
        
        if (data.success && data.results.items.length > 0) {
            featuredMovie = data.results.items[0];
            updateHeroSection(featuredMovie);
        }
    } catch (error) {
        console.error('Error loading featured movie:', error);
    }
}

// Update Hero Section with Movie Data
function updateHeroSection(movie) {
    elements.featuredTitle.textContent = movie.title;
    elements.featuredDescription.textContent = movie.description || 'An amazing movie experience awaits...';
    
    // Update hero background
    if (movie.cover && movie.cover.url) {
        elements.heroBackground.style.background = 
            `linear-gradient(45deg, #000, #e50914), url('${movie.cover.url}') center/cover`;
    }
    
    // Update metadata
    elements.featuredMeta.innerHTML = `
        <span class="rating"><i class="fas fa-star"></i> ${movie.imdbRatingValue || '7.0'}/10</span>
        <span class="year">${movie.releaseDate ? movie.releaseDate.split('-')[0] : '2020'}</span>
        <span class="duration">${formatDuration(movie.duration)}</span>
        <span class="quality">HD</span>
    `;
}

// Load All Content Sections
async function loadAllSections() {
    await loadSection('trending', 'avengers', elements.trendingGrid);
    await loadSection('popular', 'spider man', elements.popularGrid);
    await loadSection('action', 'action', elements.actionGrid);
}

// Load Specific Section
async function loadSection(section, query, gridElement) {
    try {
        showLoading(gridElement);
        
        const response = await fetch(`${API_BASE}/search/${encodeURIComponent(query)}`);
        const data = await response.json();
        
        if (data.success) {
            displayMovies(data.results.items, gridElement, true); // true = show play buttons
        } else {
            gridElement.innerHTML = '<div class="error">Failed to load content</div>';
        }
    } catch (error) {
        console.error(`Error loading ${section}:`, error);
        gridElement.innerHTML = '<div class="error">Error loading content</div>';
    }
}

// Display Movies in Grid
function displayMovies(movies, gridElement, showPlayButton = false) {
    gridElement.innerHTML = movies.map(movie => `
        <div class="movie-card" data-id="${movie.subjectId}">
            <img src="${movie.cover.url}" alt="${movie.title}" class="movie-poster" 
                 onerror="this.src='https://via.placeholder.com/200x300/333/fff?text=No+Image'">
            ${showPlayButton ? `
            <div class="play-overlay">
                <button class="play-btn" onclick="playMovie('${movie.subjectId}', '${movie.title}')">
                    <i class="fas fa-play"></i>
                </button>
            </div>
            ` : ''}
            <div class="movie-info">
                <h3 class="movie-title">${movie.title}</h3>
                <div class="movie-meta">
                    <span>${movie.releaseDate ? movie.releaseDate.split('-')[0] : 'N/A'}</span>
                    <span>⭐ ${movie.imdbRatingValue || 'N/A'}</span>
                </div>
            </div>
        </div>
    `).join('');
    
    // Add click event for movie info
    if (!showPlayButton) {
        document.querySelectorAll('.movie-card').forEach(card => {
            card.addEventListener('click', () => {
                const movieId = card.getAttribute('data-id');
                showMovieDetails(movieId);
            });
        });
    }
}

// PLAY MOVIE FUNCTION - THE MAIN FEATURE!
async function playMovie(movieId, movieTitle = 'Movie') {
    try {
        showVideoPlayer();
        elements.nowPlayingTitle.textContent = `Now Playing: ${movieTitle}`;
        
        // Get download sources from YOUR API
        const response = await fetch(`${API_BASE}/sources/${movieId}`);
        const data = await response.json();
        
        if (data.success && data.results.length > 0) {
            const sources = data.results;
            
            // Populate quality selector
            elements.qualitySelect.innerHTML = sources.map(source => 
                `<option value="${source.download_url}">${source.quality}</option>`
            ).join('');
            
            // Play the highest quality by default
            const bestQuality = sources[0];
            await playVideoStream(bestQuality.download_url);
            
            // Set download button
            elements.downloadBtn.onclick = () => downloadFile(bestQuality.download_url, movieTitle);
            
        } else {
            alert('No video sources available for this movie');
            hideVideoPlayer();
        }
    } catch (error) {
        console.error('Error playing movie:', error);
        alert('Error loading movie. Please try again.');
        hideVideoPlayer();
    }
}

// Play Video Stream
async function playVideoStream(videoUrl) {
    try {
        // Set video source
        elements.player.innerHTML = `
            <source src="${videoUrl}" type="video/mp4">
        `;
        
        // Initialize or update Plyr player
        if (plyrPlayer) {
            plyrPlayer.destroy();
        }
        
        plyrPlayer = new Plyr('#player', {
            controls: ['play', 'progress', 'current-time', 'mute', 'volume', 'fullscreen'],
            ratio: '16:9'
        });
        
        // Load and play video
        await elements.player.load();
        await plyrPlayer.play();
        
    } catch (error) {
        console.error('Error playing video:', error);
        alert('Error playing video stream');
    }
}

// Show Video Player
function showVideoPlayer() {
    elements.videoPlayerSection.style.display = 'flex';
    elements.mainContent.style.display = 'none';
    document.body.style.overflow = 'hidden';
}

// Hide Video Player
function hideVideoPlayer() {
    elements.videoPlayerSection.style.display = 'none';
    elements.mainContent.style.display = 'block';
    document.body.style.overflow = 'auto';
    
    if (plyrPlayer) {
        plyrPlayer.stop();
    }
}

// Initialize Video Player
function initializeVideoPlayer() {
    // Quality change handler
    elements.qualitySelect.addEventListener('change', async (e) => {
        const selectedUrl = e.target.value;
        const quality = e.target.options[e.target.selectedIndex].text;
        
        try {
            await playVideoStream(selectedUrl);
            // Update download button for new quality
            elements.downloadBtn.onclick = () => downloadFile(selectedUrl, elements.nowPlayingTitle.textContent.replace('Now Playing: ', ''));
        } catch (error) {
            console.error('Error changing quality:', error);
        }
    });
}

// Download File
function downloadFile(url, filename) {
    // Create a temporary link for download
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}.mp4`;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Show Movie Details Modal
async function showMovieDetails(movieId) {
    try {
        showLoadingModal();
        
        const response = await fetch(`${API_BASE}/info/${movieId}`);
        const data = await response.json();
        
        if (data.success) {
            const movie = data.results.subject;
            displayMovieModal(movie);
        } else {
            showErrorModal('Failed to load movie details');
        }
    } catch (error) {
        console.error('Error loading movie details:', error);
        showErrorModal('Error loading movie details');
    }
}

// Display Movie in Modal
function displayMovieModal(movie) {
    elements.modalBody.innerHTML = `
        <div class="modal-movie">
            <div class="modal-hero" style="background: linear-gradient(rgba(0,0,0,0.7), rgba(0,0,0,0.7)), url('${movie.cover.url}') center/cover;">
                <div class="modal-hero-content">
                    <h2>${movie.title}</h2>
                    <p class="modal-description">${movie.description || 'No description available.'}</p>
                    <div class="modal-meta">
                        <span><strong>Release:</strong> ${movie.releaseDate || 'N/A'}</span>
                        <span><strong>Rating:</strong> ⭐ ${movie.imdbRatingValue || 'N/A'}</span>
                        <span><strong>Genre:</strong> ${movie.genre || 'N/A'}</span>
                        <span><strong>Duration:</strong> ${formatDuration(movie.duration)}</span>
                    </div>
                    <div class="modal-actions">
                        <button class="btn btn-primary" onclick="playMovie('${movie.subjectId}', '${movie.title}')">
                            <i class="fas fa-play"></i> Play Movie
                        </button>
                        <button class="btn btn-info" onclick="showDownloadOptions('${movie.subjectId}')">
                            <i class="fas fa-download"></i> Download Options
                        </button>
                    </div>
                </div>
            </div>
            
            <div class="download-options" id="downloadOptionsSection" style="display: none;">
                <h3>Download Options</h3>
                <div id="downloadOptionsList"></div>
            </div>
            
            ${movie.stars && movie.stars.length > 0 ? `
            <div class="modal-cast">
                <h3>Cast</h3>
                <div class="cast-grid">
                    ${movie.stars.slice(0, 6).map(star => `
                        <div class="cast-member">
                            <img src="${star.avatarUrl || 'https://via.placeholder.com/80x80/333/fff?text=?'}" 
                                 alt="${star.name}"
                                 onerror="this.src='https://via.placeholder.com/80x80/333/fff?text=?'">
                            <span class="cast-name">${star.name}</span>
                            <span class="cast-character">${star.character}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
            ` : ''}
        </div>
    `;
    
    elements.movieModal.style.display = 'block';
}

// Show Download Options in Modal
async function showDownloadOptions(movieId) {
    try {
        const response = await fetch(`${API_BASE}/sources/${movieId}`);
        const data = await response.json();
        
        if (data.success) {
            const sources = data.results;
            const downloadHTML = sources.map(source => `
                <div class="download-option">
                    <div>
                        <span class="quality">${source.quality}</span>
                        <span class="size">${formatFileSize(source.size)}</span>
                    </div>
                    <button class="btn btn-primary btn-sm" 
                            onclick="downloadFile('${source.download_url}', '${movieId}-${source.quality}')">
                        <i class="fas fa-download"></i> Download
                    </button>
                </div>
            `).join('');
            
            document.getElementById('downloadOptionsList').innerHTML = downloadHTML;
            document.getElementById('downloadOptionsSection').style.display = 'block';
        }
    } catch (error) {
        console.error('Error loading download sources:', error);
        alert('Error loading download options');
    }
}

// Search Movies
async function searchMovies(query) {
    try {
        showLoading(elements.searchGrid);
        elements.searchResults.style.display = 'block';
        
        const response = await fetch(`${API_BASE}/search/${encodeURIComponent(query)}`);
        const data = await response.json();
        
        if (data.success && data.results.items.length > 0) {
            displayMovies(data.results.items, elements.searchGrid, true);
            currentMovies = data.results.items;
            
            // Scroll to search results
            elements.searchResults.scrollIntoView({ behavior: 'smooth' });
        } else {
            elements.searchGrid.innerHTML = '<div class="no-results">No movies found. Try another search!</div>';
        }
    } catch (error) {
        console.error('Error searching movies:', error);
        elements.searchGrid.innerHTML = '<div class="error">Error searching movies</div>';
    }
}

// Utility Functions
function formatDuration(seconds) {
    if (!seconds) return 'N/A';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
}

function formatFileSize(bytes) {
    if (!bytes) return 'N/A';
    const mb = Math.round(bytes / 1024 / 1024);
    return `${mb} MB`;
}

function showLoading(element) {
    element.innerHTML = '<div class="loading">Loading...</div>';
}

function showLoadingModal() {
    elements.modalBody.innerHTML = '<div class="loading">Loading movie details...</div>';
    elements.movieModal.style.display = 'block';
}

function showErrorModal(message) {
    elements.modalBody.innerHTML = `<div class="error">${message}</div>`;
}

// Event Listeners Setup
function setupEventListeners() {
    // Search functionality
    elements.searchBtn.addEventListener('click', handleSearch);
    elements.searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSearch();
    });

    // Video player back button
    elements.backToBrowse.addEventListener('click', hideVideoPlayer);

    // Modal close
    elements.closeModal.addEventListener('click', () => {
        elements.movieModal.style.display = 'none';
    });

    // Close modal when clicking outside
    elements.movieModal.addEventListener('click', (e) => {
        if (e.target === elements.movieModal) {
            elements.movieModal.style.display = 'none';
        }
    });

    // Featured movie buttons
    elements.playFeaturedBtn.addEventListener('click', () => {
        if (featuredMovie) {
            playMovie(featuredMovie.subjectId, featuredMovie.title);
        }
    });

    elements.featuredInfoBtn.addEventListener('click', () => {
        if (featuredMovie) {
            showMovieDetails(featuredMovie.subjectId);
        }
    });

    // Navbar scroll effect
    window.addEventListener('scroll', () => {
        if (window.scrollY > 100) {
            elements.navbar.classList.add('scrolled');
        } else {
            elements.navbar.classList.remove('scrolled');
        }
    });

    // Category navigation
    document.querySelectorAll('.nav-link, .footer-section a[data-category]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const category = link.getAttribute('data-category');
            if (category) {
                loadSection(category, category, elements.trendingGrid);
                elements.searchResults.style.display = 'none';
            }
        });
    });
}

function handleSearch() {
    const query = elements.searchInput.value.trim();
    if (query) {
        searchMovies(query);
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', init);
