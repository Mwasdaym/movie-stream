// API Configuration - Now using relative paths for our backend
const API_BASE = window.location.origin + '/api';
const EXTERNAL_API = 'https://movieapi.giftedtech.co.ke/api';

// DOM Elements
const elements = {
    // Navigation
    searchInput: document.getElementById('searchInput'),
    searchBtn: document.getElementById('searchBtn'),
    navbar: document.querySelector('.navbar'),
    
    // Auth elements
    authButtons: document.getElementById('authButtons'),
    userMenu: document.getElementById('userMenu'),
    loginBtn: document.getElementById('loginBtn'),
    registerBtn: document.getElementById('registerBtn'),
    logoutBtn: document.getElementById('logoutBtn'),
    userAvatar: document.getElementById('userAvatar'),
    
    // Auth modals
    loginModal: document.getElementById('loginModal'),
    registerModal: document.getElementById('registerModal'),
    closeLoginModal: document.getElementById('closeLoginModal'),
    closeRegisterModal: document.getElementById('closeRegisterModal'),
    loginForm: document.getElementById('loginForm'),
    registerForm: document.getElementById('registerForm'),
    
    // Video Player
    videoPlayerSection: document.getElementById('videoPlayerSection'),
    player: document.getElementById('player'),
    backToBrowse: document.getElementById('backToBrowse'),
    nowPlayingTitle: document.getElementById('nowPlayingTitle'),
    qualitySelect: document.getElementById('qualitySelect'),
    downloadBtn: document.getElementById('downloadBtn'),
    
    // Main Content
    mainContent: document.getElementById('mainContent'),
    featuredTitle: document.getElementById('featuredTitle'),
    featuredDescription: document.getElementById('featuredDescription'),
    getStartedBtn: document.getElementById('getStartedBtn'),
    heroBackground: document.getElementById('heroBackground'),
    
    // Content Grids
    trendingGrid: document.getElementById('trendingGrid'),
    popularGrid: document.getElementById('popularGrid'),
    topRatedGrid: document.getElementById('topRatedGrid'),
    searchGrid: document.getElementById('searchGrid'),
    searchResults: document.getElementById('searchResults'),
    clearSearch: document.getElementById('clearSearch'),
    
    // Movie Modal
    movieModal: document.getElementById('movieModal'),
    closeModal: document.getElementById('closeModal'),
    modalBody: document.getElementById('modalBody')
};

// Global Variables
let currentUser = null;
let currentMovies = [];
let featuredMovie = null;
let plyrPlayer = null;

// Initialize App
async function init() {
    await checkAuthStatus();
    await loadFeaturedContent();
    await loadAllSections();
    setupEventListeners();
    initializeVideoPlayer();
}

// Authentication Functions
async function checkAuthStatus() {
    try {
        const token = localStorage.getItem('streamflix_token');
        if (token) {
            const response = await fetch(`${API_BASE}/auth/me`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                currentUser = data.data.user;
                updateUIForLoggedInUser();
            } else {
                localStorage.removeItem('streamflix_token');
            }
        }
    } catch (error) {
        console.error('Auth check error:', error);
        localStorage.removeItem('streamflix_token');
    }
}

function updateUIForLoggedInUser() {
    elements.authButtons.style.display = 'none';
    elements.userMenu.style.display = 'flex';
    if (currentUser.profile?.avatar) {
        elements.userAvatar.src = currentUser.profile.avatar;
    }
}

// Login function
async function login(email, password) {
    try {
        const response = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();
        
        if (data.success) {
            localStorage.setItem('streamflix_token', data.data.token);
            currentUser = data.data.user;
            updateUIForLoggedInUser();
            closeModalById('loginModal');
            showNotification('Login successful!', 'success');
            return true;
        } else {
            showNotification(data.message, 'error');
            return false;
        }
    } catch (error) {
        console.error('Login error:', error);
        showNotification('Login failed. Please try again.', 'error');
        return false;
    }
}

// Register function
async function register(username, email, password) {
    try {
        const response = await fetch(`${API_BASE}/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, email, password })
        });

        const data = await response.json();
        
        if (data.success) {
            localStorage.setItem('streamflix_token', data.data.token);
            currentUser = data.data.user;
            updateUIForLoggedInUser();
            closeModalById('registerModal');
            showNotification('Registration successful!', 'success');
            return true;
        } else {
            showNotification(data.message, 'error');
            return false;
        }
    } catch (error) {
        console.error('Registration error:', error);
        showNotification('Registration failed. Please try again.', 'error');
        return false;
    }
}

// Logout function
function logout() {
    localStorage.removeItem('streamflix_token');
    currentUser = null;
    elements.authButtons.style.display = 'flex';
    elements.userMenu.style.display = 'none';
    showNotification('Logged out successfully', 'success');
}

// Load Featured Content
async function loadFeaturedContent() {
    try {
        // Try to get featured content from our backend first
        const response = await fetch(`${API_BASE}/movies/trending`);
        if (response.ok) {
            const data = await response.json();
            if (data.success && data.data.movies.length > 0) {
                featuredMovie = data.data.movies[0];
                updateHeroSection(featuredMovie);
                return;
            }
        }
        
        // Fallback to external API
        const externalResponse = await fetch(`${EXTERNAL_API}/search/avengers`);
        const externalData = await externalResponse.json();
        
        if (externalData.success && externalData.results.items.length > 0) {
            featuredMovie = externalData.results.items[0];
            updateHeroSection(featuredMovie);
        }
    } catch (error) {
        console.error('Error loading featured content:', error);
    }
}

// Update Hero Section
function updateHeroSection(movie) {
    if (movie) {
        elements.featuredTitle.textContent = movie.title;
        elements.featuredDescription.textContent = movie.description || 'An amazing movie experience awaits...';
        
        if (movie.cover && movie.cover.url) {
            elements.heroBackground.style.background = 
                `linear-gradient(45deg, #000, #e50914), url('${movie.cover.url}') center/cover`;
        }
    }
}

// Load All Content Sections
async function loadAllSections() {
    await loadSection('trending', 'avengers', elements.trendingGrid);
    await loadSection('popular', 'spider man', elements.popularGrid);
    await loadSection('top rated', 'action', elements.topRatedGrid);
}

// Load Specific Section
async function loadSection(section, query, gridElement) {
    try {
        showLoading(gridElement);
        
        // Try our backend first
        const response = await fetch(`${API_BASE}/movies/search?q=${encodeURIComponent(query)}`);
        
        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                displayMovies(data.data.movies, gridElement, true);
                return;
            }
        }
        
        // Fallback to external API
        const externalResponse = await fetch(`${EXTERNAL_API}/search/${encodeURIComponent(query)}`);
        const externalData = await externalResponse.json();
        
        if (externalData.success) {
            displayMovies(externalData.results.items, gridElement, true);
        } else {
            gridElement.innerHTML = '<div class="error">Failed to load content</div>';
        }
    } catch (error) {
        console.error(`Error loading ${section}:`, error);
        gridElement.innerHTML = '<div class="error">Error loading content</div>';
    }
}

// Display Movies in Grid (same as before)
function displayMovies(movies, gridElement, showPlayButton = false) {
    gridElement.innerHTML = movies.map(movie => `
        <div class="movie-card" data-id="${movie.subjectId || movie._id}">
            <img src="${movie.cover?.url || movie.poster}" alt="${movie.title}" class="movie-poster" 
                 onerror="this.src='/assets/placeholder-movie.jpg'">
            ${showPlayButton ? `
            <div class="play-overlay">
                <button class="play-btn" onclick="playMovie('${movie.subjectId || movie._id}', '${movie.title}')">
                    <i class="fas fa-play"></i>
                </button>
            </div>
            ` : ''}
            <div class="movie-info">
                <h3 class="movie-title">${movie.title}</h3>
                <div class="movie-meta">
                    <span>${movie.releaseDate ? movie.releaseDate.split('-')[0] : 'N/A'}</span>
                    <span>⭐ ${movie.imdbRatingValue || movie.rating || 'N/A'}</span>
                </div>
            </div>
        </div>
    `).join('');
    
    // Add click event for movie info
    document.querySelectorAll('.movie-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (!e.target.closest('.play-btn')) {
                const movieId = card.getAttribute('data-id');
                showMovieDetails(movieId);
            }
        });
    });
}

// PLAY MOVIE FUNCTION
async function playMovie(movieId, movieTitle = 'Movie') {
    try {
        showVideoPlayer();
        elements.nowPlayingTitle.textContent = `Now Playing: ${movieTitle}`;
        
        // Get download sources
        const response = await fetch(`${API_BASE}/movies/${movieId}/sources`);
        
        if (response.ok) {
            const data = await response.json();
            if (data.success && data.data.sources.length > 0) {
                const sources = data.data.sources;
                setupVideoPlayer(sources, movieTitle);
                return;
            }
        }
        
        // Fallback to external API
        const externalResponse = await fetch(`${EXTERNAL_API}/sources/${movieId}`);
        const externalData = await externalResponse.json();
        
        if (externalData.success && externalData.results.length > 0) {
            const sources = externalData.results;
            setupVideoPlayer(sources, movieTitle);
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

// Setup Video Player
function setupVideoPlayer(sources, movieTitle) {
    // Populate quality selector
    elements.qualitySelect.innerHTML = sources.map(source => 
        `<option value="${source.download_url}">${source.quality}</option>`
    ).join('');

    // Play the highest quality by default
    const bestQuality = sources[0];
    playVideoStream(bestQuality.download_url);
    
    // Set download button
    elements.downloadBtn.onclick = () => downloadFile(bestQuality.download_url, movieTitle);
    
    // Quality change handler
    elements.qualitySelect.onchange = (e) => {
        const selectedUrl = e.target.value;
        playVideoStream(selectedUrl);
    };
}

// Play Video Stream (same as before)
async function playVideoStream(videoUrl) {
    try {
        elements.player.innerHTML = `
            <source src="${videoUrl}" type="video/mp4">
        `;
        
        if (plyrPlayer) {
            plyrPlayer.destroy();
        }
        
        plyrPlayer = new Plyr('#player', {
            controls: ['play', 'progress', 'current-time', 'mute', 'volume', 'fullscreen'],
            ratio: '16:9'
        });
        
        await elements.player.load();
        await plyrPlayer.play();
        
    } catch (error) {
        console.error('Error playing video:', error);
        alert('Error playing video stream');
    }
}

// Show/Hide Video Player (same as before)
function showVideoPlayer() {
    elements.videoPlayerSection.style.display = 'flex';
    elements.mainContent.style.display = 'none';
    document.body.style.overflow = 'hidden';
}

function hideVideoPlayer() {
    elements.videoPlayerSection.style.display = 'none';
    elements.mainContent.style.display = 'block';
    document.body.style.overflow = 'auto';
    if (plyrPlayer) {
        plyrPlayer.stop();
    }
}

// Search Movies
async function searchMovies(query) {
    try {
        showLoading(elements.searchGrid);
        elements.searchResults.style.display = 'block';
        
        const response = await fetch(`${API_BASE}/movies/search?q=${encodeURIComponent(query)}`);
        
        if (response.ok) {
            const data = await response.json();
            if (data.success && data.data.movies.length > 0) {
                displayMovies(data.data.movies, elements.searchGrid, true);
                elements.searchResults.scrollIntoView({ behavior: 'smooth' });
                return;
            }
        }
        
        // Fallback to external API
        const externalResponse = await fetch(`${EXTERNAL_API}/search/${encodeURIComponent(query)}`);
        const externalData = await externalResponse.json();
        
        if (externalData.success && externalData.results.items.length > 0) {
            displayMovies(externalData.results.items, elements.searchGrid, true);
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
function showLoading(element) {
    element.innerHTML = '<div class="loading">Loading...</div>';
}

function closeModalById(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

function showNotification(message, type = 'info') {
    // Simple notification implementation
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 1rem 2rem;
        background: ${type === 'error' ? '#e50914' : '#2ecc71'};
        color: white;
        border-radius: var(--border-radius);
        z-index: 10000;
        animation: slideInRight 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Event Listeners Setup
function setupEventListeners() {
    // Search functionality
    elements.searchBtn.addEventListener('click', handleSearch);
    elements.searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSearch();
    });
    elements.clearSearch.addEventListener('click', () => {
        elements.searchResults.style.display = 'none';
        elements.searchInput.value = '';
    });

    // Auth functionality
    elements.loginBtn.addEventListener('click', () => {
        elements.loginModal.style.display = 'block';
    });
    elements.registerBtn.addEventListener('click', () => {
        elements.registerModal.style.display = 'block';
    });
    elements.logoutBtn.addEventListener('click', logout);
    elements.closeLoginModal.addEventListener('click', () => {
        elements.loginModal.style.display = 'none';
    });
    elements.closeRegisterModal.addEventListener('click', () => {
        elements.registerModal.style.display = 'none';
    });

    // Auth forms
    elements.loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(elements.loginForm);
        const email = formData.get('email') || elements.loginForm.querySelector('input[type="email"]').value;
        const password = formData.get('password') || elements.loginForm.querySelector('input[type="password"]').value;
        await login(email, password);
    });

    elements.registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(elements.registerForm);
        const username = formData.get('username') || elements.registerForm.querySelector('input[type="text"]').value;
        const email = formData.get('email') || elements.registerForm.querySelector('input[type="email"]').value;
        const password = formData.get('password') || elements.registerForm.querySelector('input[type="password"]').value;
        await register(username, email, password);
    });

    // Video player back button
    elements.backToBrowse.addEventListener('click', hideVideoPlayer);

    // Modal close events
    elements.closeModal.addEventListener('click', () => {
        elements.movieModal.style.display = 'none';
    });

    // Close modals when clicking outside
    [elements.movieModal, elements.loginModal, elements.registerModal].forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    });

    // Get started button
    elements.getStartedBtn.addEventListener('click', () => {
        elements.registerModal.style.display = 'block';
    });

    // Navbar scroll effect
    window.addEventListener('scroll', () => {
        if (window.scrollY > 100) {
            elements.navbar.classList.add('scrolled');
        } else {
            elements.navbar.classList.remove('scrolled');
        }
    });
}

function handleSearch() {
    const query = elements.searchInput.value.trim();
    if (query) {
        searchMovies(query);
    }
}

// Initialize Video Player
function initializeVideoPlayer() {
    // Quality change handler
    elements.qualitySelect.addEventListener('change', async (e) => {
        const selectedUrl = e.target.value;
        try {
            await playVideoStream(selectedUrl);
        } catch (error) {
            console.error('Error changing quality:', error);
        }
    });
}

// Download File
function downloadFile(url, filename) {
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}.mp4`;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', init);
