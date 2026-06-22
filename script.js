// Полная изоляция аудиосистемы NDSL music внутри события загрузки окна
window.addEventListener('load', function() {

    // 1. СТАБИЛЬНАЯ БАЗА ДАННЫХ ТРЕКОВ
    var trackDatabase = {
        house: [
            { title: "Моя медиатека пуста", artist: "Нажмите 'ОТКРЫТЬ ПАПКУ'", src: "" }
        ],
        cyberpunk: [
            { title: "Neon Tokyo Drive", artist: "CyberCorp", src: "https://soundhelix.com" },
            { title: "Glitch in the System", artist: "NetRunner", src: "https://soundhelix.com" }
        ],
        techno: [
            { title: "Subversive Beats", artist: "Berlin Underground", src: "https://soundhelix.com" }
        ],
        synthwave: [
            { title: "Retro Highway 1984", artist: "LaserHawk", src: "https://soundhelix.com" }
        ]
    };

    // Внутреннее состояние приложения
    var currentGenre = "house";
    var currentTracks = trackDatabase[currentGenre].slice();
    var originalTracks = trackDatabase[currentGenre].slice();
    var songIndex = 0;
    var isPlaying = false;
    var isShuffleActive = false;
    var isLoopActive = false;

    // Переменные эквалайзера частот звука и ГРОМКОСТИ (Web Audio API)
    var audioContext = null;
    var analyser = null;
    var gainNode = null; 
    var dataArray = null;
    var animationFrameId = null;

    // Кеширование DOM-элементов HTML
    var audio = document.getElementById('audio-element');
    var playBtn = document.getElementById('play-btn');
    var prevBtn = document.getElementById('prev-btn');
    var nextBtn = document.getElementById('next-btn');
    var shuffleBtn = document.getElementById('shuffle-btn');
    var loopBtn = document.getElementById('loop-btn');
    var title = document.getElementById('title');
    var artist = document.getElementById('artist');
    var coverBox = document.querySelector('.cover-box');
    var progressBar = document.getElementById('progress-bar');
    var progressContainer = document.getElementById('progress-container');
    var currentTimeEl = document.getElementById('current-time');
    var durationTimeEl = document.getElementById('duration-time');
    var playlistContainer = document.getElementById('playlist-container');
    var genreCards = document.querySelectorAll('.genre-card');
    var fileUpload = document.getElementById('file-upload');
    var splashScreen = document.getElementById('splash-screen');
    var eqBars = document.querySelectorAll('.eq-bar');
    var volumeSlider = document.getElementById('volume-slider');
    var volumeProgress = document.getElementById('volume-progress');

    // 2. ЯДРО УПРАВЛЕНИЯ ЗВУКОВЫМ ПОТОКОМ
    function loadSong(song) {
        if (!song || !title || !artist || !audio) return;
        
        var maxTitleLength = 26;
        if (song.title.length > maxTitleLength) {
            title.innerText = song.title.substring(0, maxTitleLength) + "...";
        } else {
            title.innerText = song.title;
        }
        artist.innerText = song.artist;
        audio.src = song.src;
        
        // Аппаратное зацикливание тега audio
        audio.loop = isLoopActive;
        
        updatePlaylistHighlight();
        updateMediaSession(song);
    }

    function togglePlay() {
        if (!audio || !audio.src || audio.src === window.location.href || currentTracks[songIndex].src === "") return;
        
        initWebAudioAPI();
        if (audioContext && audioContext.state === 'suspended') {
            audioContext.resume();
        }

        if (isPlaying) {
            isPlaying = false;
            if (playBtn) playBtn.innerText = '▶';
            if (coverBox) coverBox.classList.remove('playing');
            document.body.classList.remove('audio-playing');
            audio.pause();
        } else {
            isPlaying = true;
            if (playBtn) playBtn.innerText = '⏸';
            if (coverBox) coverBox.classList.add('playing');
            document.body.classList.add('audio-playing');
            audio.play().then(renderEqualizer).catch(function(e) { console.log(e); });
        }
    }

    function prevSong() {
        if (currentTracks.length <= 1 && currentTracks[0].src === "") return;
        songIndex = (songIndex - 1 + currentTracks.length) % currentTracks.length;
        loadSong(currentTracks[songIndex]);
        if (isPlaying && audio) audio.play().then(renderEqualizer).catch(function() {});
    }

    function nextSong() {
        if (currentTracks.length <= 1 && currentTracks[0].src === "") return;
        songIndex = (songIndex + 1) % currentTracks.length;
        loadSong(currentTracks[songIndex]);
        if (isPlaying && audio) audio.play().then(renderEqualizer).catch(function() {});
    }

    function toggleShuffle(e) {
        if (e) e.preventDefault();
        if (currentTracks.length <= 1 && currentTracks[0].src === "") return;
        if (!shuffleBtn) return;
        
        isShuffleActive = !isShuffleActive;
        var currentPlayingTrack = currentTracks[songIndex];

        if (isShuffleActive) {
            shuffleBtn.classList.add('active');
            for (var i = currentTracks.length - 1; i > 0; i--) {
                var j = Math.floor(Math.random() * (i + 1));
                var temp = currentTracks[i];
                currentTracks[i] = currentTracks[j];
                currentTracks[j] = temp;
            }
        } else {
            shuffleBtn.classList.remove('active');
            currentTracks = originalTracks.slice();
        }
        
        songIndex = currentTracks.findIndex(function(track) { return track.src === currentPlayingTrack.src; });
        buildPlaylist();
        updatePlaylistHighlight();
    }

    function toggleLoop(e) {
        if (e) e.preventDefault();
        if (!loopBtn || !audio) return;
        
        isLoopActive = !isLoopActive;
        audio.loop = isLoopActive; 
        
        if (isLoopActive) {
            loopBtn.classList.add('active');
        } else {
            loopBtn.classList.remove('active');
        }
    }

    function updateProgress(e) {
        var duration = e.srcElement.duration;
        var currentTime = e.srcElement.currentTime;
        if (!duration || !progressBar || !currentTimeEl || !durationTimeEl) return;
        
        progressBar.style.width = ((currentTime / duration) * 100) + "%";
        currentTimeEl.innerText = formatTime(currentTime);
        durationTimeEl.innerText = formatTime(duration);
    }

    function setProgress(e) {
        if (!audio || !audio.duration) return;
        var width = this.clientWidth;
        var clickX = e.offsetX || (e.touches ? e.touches[0].clientX - this.getBoundingClientRect().left : 0);
        audio.currentTime = (clickX / width) * audio.duration;
    }

    function formatTime(time) {
        var min = Math.floor(time / 60);
        var sec = Math.floor(time % 60);
        return min + ":" + (sec < 10 ? '0' : '') + sec;
    }

    // 3. УПРАВЛЕНИЕ ИНТЕРФЕЙСОМ И ПЛЕЙЛИСТАМИ
    function buildPlaylist() {
        if (!playlistContainer) return;
        playlistContainer.innerHTML = "";
        
        currentTracks.forEach(function(track, idx) {
            if (track.src === "") return;
            var item = document.createElement('div');
            item.classList.add('playlist-item');
            item.innerHTML = '<div class="pl-idx">' + (idx + 1) + '</div><div class="pl-meta"><div class="pl-title">' + track.title + '</div><div class="pl-artist">' + track.artist + '</div></div>';
            
            item.addEventListener('click', function(e) { 
                if (e) e.preventDefault();
                songIndex = idx; 
                loadSong(currentTracks[songIndex]); 
                if (!isPlaying) togglePlay(); else if (audio) audio.play().then(renderEqualizer); 
            });
            
            playlistContainer.appendChild(item);
        });
    }

    function updatePlaylistHighlight() {
        if (!playlistContainer) return;
        var items = playlistContainer.querySelectorAll('.playlist-item');
        items.forEach(function(item, idx) {
            if (idx === songIndex) {
                item.classList.add('active');
                var containerHeight = playlistContainer.clientHeight;
                var itemTop = item.offsetTop;
                var itemHeight = item.clientHeight;
                playlistContainer.scrollTop = itemTop - (containerHeight / 2) + (itemHeight / 2);
            } else {
                item.classList.remove('active');
            }
        });
    }

    function setActiveGenreCard() {
        genreCards.forEach(function(card) {
            if (card.getAttribute('data-genre') === currentGenre) {
                card.classList.add('active');
            } else {
                card.classList.remove('active');
            }
        });
    }

    function updateBackgroundTheme() {
        document.body.classList.remove('theme-house', 'theme-cyberpunk', 'theme-techno', 'theme-synthwave');
        document.body.classList.add('theme-' + currentGenre);
    }

    function handleGenreChange() {
        currentGenre = this.getAttribute('data-genre');
        trackDatabase[currentGenre] = trackDatabase[currentGenre] || [];
        currentTracks = trackDatabase[currentGenre].slice();
        originalTracks = currentTracks.slice();
        songIndex = 0;
        
        if (isShuffleActive && currentTracks.length > 0 && currentTracks[0].src !== "") {
            for (var i = currentTracks.length - 1; i > 0; i--) {
                var j = Math.floor(Math.random() * (i + 1));
                var temp = currentTracks[i];
                currentTracks[i] = currentTracks[j];
                currentTracks[j] = temp;
            }
        }
        setActiveGenreCard();
        buildPlaylist();
if (currentTracks.length > 0) loadSong(currentTracks[songIndex]);updateBackgroundTheme();if (isPlaying && currentTracks.length > 0 && currentTracks[songIndex].src !== "" && audio) {audio.play().then(renderEqualizer);} else if (isPlaying) {togglePlay();}}// ИСПРАВЛЕННАЯ СИСТЕМНАЯ МОБИЛЬНАЯ ЗАГРУЗКА ФАЙЛОВ
function handleFolderUpload(e) {var files = Array.from(e.target.files);if (files.length === 0) return;trackDatabase.house = [];files.forEach(function(file) {// Пропускаем только аудиофайлы
if (file.name.toLowerCase().endsWith('.mp3') || file.type.indexOf('audio') !== -1) {trackDatabase.house.push({title: file.name.replace(/.[^/.]+$/, ""),artist: "Локальный файл",src: URL.createObjectURL(file)});}});if (trackDatabase.house.length === 0) {trackDatabase.house.push({ title: "В папке нет MP3 треков", artist: "Попробуйте выбрать другую", src: "" });}currentGenre = "house";currentTracks = trackDatabase["house"].slice();originalTracks = currentTracks.slice();songIndex = 0;if (isShuffleActive && currentTracks[0].src !== "") {for (var i = currentTracks.length - 1; i > 0; i--) {var j = Math.floor(Math.random() * (i + 1));var temp = currentTracks[i];currentTracks[i] = currentTracks[j];currentTracks[j] = temp;}}setActiveGenreCard();buildPlaylist();loadSong(currentTracks[songIndex]);updateBackgroundTheme();if (currentTracks[0].src !== "") {if (!isPlaying) togglePlay();
 else if (audio) audio.play().then(renderEqualizer);}}

 // 4. МАРШРУТИЗАЦИЯ ЦИФРОВОГО ЗВУКА И НАСТОЯЩИЙ ЭКВАЛАЙЗЕР (WEB AUDIO API)

function initWebAudioAPI() {if (audioContext || !audio) return;try {audioContext = new (window.AudioContext || window.webkitAudioContext)();var source = audioContext.createMediaElementSource(audio);analyser = audioContext.createAnalyser();gainNode = audioContext.createGain();source.connect(analyser);analyser.connect(gainNode);gainNode.connect(audioContext.destination);analyser.fftSize = 32;dataArray = new Uint8Array(analyser.frequencyBinCount);if (volumeSlider) {gainNode.gain.setValueAtTime(volumeSlider.value, audioContext.currentTime);}} catch (err) {console.log(err);}}function renderEqualizer() {if (!isPlaying || !analyser || !eqBars) {if (eqBars) {eqBars.forEach(function(bar) { bar.style.height = '8px'; });}cancelAnimationFrame(animationFrameId);return;}animationFrameId = requestAnimationFrame(renderEqualizer);analyser.getByteFrequencyData(dataArray);eqBars.forEach(function(bar, i) {var val = ((dataArray[i * 2] || 0) / 255) * 52;bar.style.height = (val < 8 ? 8 : val) + "px";});}// 5. ИНТЕРАКТИВНОЕ ОБНОВЛЕНИЕ СЛАЙДЕРА ГРОМКОСТИ С ПОЛОСОЙ ЗАПОЛНЕНИЯ
function updateVolumeProgress() {if (volumeSlider && volumeProgress) {var valPercent = volumeSlider.value * 100;volumeProgress.style.height = valPercent + "%";if (gainNode && audioContext) {gainNode.gain.setValueAtTime(volumeSlider.value, audioContext.currentTime);} else if (audio) {audio.volume = volumeSlider.value;}}}function updateMediaSession(song) {if ('mediaSession' in navigator) {navigator.mediaSession.metadata = new MediaMetadata({title: song.title,artist: song.artist,album: "NDSL music System",artwork: [{ src: 'picsum.photos', sizes: '300x300', type: 'image/png' }]});navigator.mediaSession.setActionHandler('play', togglePlay);navigator.mediaSession.setActionHandler('pause', togglePlay);navigator.mediaSession.setActionHandler('previoustrack', prevSong);navigator.mediaSession.setActionHandler('nexttrack', nextSong);}}// 6. НАВЕШИВАНИЕ ОБРАБОТЧИКОВ И СТАРТ СИСТЕМЫ NDSL
if (playBtn) playBtn.addEventListener('click', togglePlay);if (prevBtn) prevBtn.addEventListener('click', prevSong);if (nextBtn) nextBtn.addEventListener('click', nextSong);if (shuffleBtn) shuffleBtn.addEventListener('click', toggleShuffle);if (loopBtn) loopBtn.addEventListener('click', toggleLoop);if (audio) audio.addEventListener('timeupdate', updateProgress);if (progressContainer) progressContainer.addEventListener('click', setProgress);if (fileUpload) fileUpload.addEventListener('change', handleFolderUpload);if (audio) {audio.addEventListener('ended', function() {if (!isLoopActive) {nextSong();}});}genreCards.forEach(function(card) {card.addEventListener('click', handleGenreChange);});if (volumeSlider) {volumeSlider.value = 0.7;updateVolumeProgress();volumeSlider.addEventListener('input', updateVolumeProgress);}// Первичная сборка и запуск плеера
setActiveGenreCard();buildPlaylist();loadSong(currentTracks[songIndex]);updateBackgroundTheme();
// Плавный запуск интерфейса после 3 секунд заставки
setTimeout(function() {if (splashScreen) {splashScreen.classList.add('hidden');}}, 3000);});
