document.addEventListener('DOMContentLoaded', () => {
    const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';
    let allSeasons = [];
    let filteredPastAndPresentSeasons = [];

    // State variables
    const ITEMS_PER_PAGE = 18;
    let currentPage = 1;
    let isLoading = false;
    let lastRenderedMonth = null;
    let allAvailableYears = [];
    let currentActiveYear = null;
    let visibleYearCount = 3;
    let isScrollingProgrammatically = false;
    let selectedGenre = '全部';
    const FUTURE_TAG = '即将上映';

    // DOM Elements
    const mainTitle = document.querySelector('h1');
    const genreFilterContainer = document.getElementById('genre-filter-container');
    const loadingOverlay = document.getElementById('loading-overlay');
    const comingSoonContainer = document.getElementById('coming-soon-container');
    const interactiveTimeline = document.getElementById('interactive-timeline');
    const yearList = document.getElementById('year-list');
    const statusMessage = document.getElementById('status-message');
    const fileInput = document.getElementById('file-input');
    const resultsContainer = document.getElementById('results-container');
    const noResultsMessage = document.getElementById('no-results');
    const loader = document.getElementById('loader');

    async function initialize() {
        try {
            const response = await fetch('json/tv_us.json');
            if (!response.ok) throw new Error('Default file not found');
            const data = await response.json();
            statusMessage.textContent = '成功加载默认文件 `json/us_tv.json`。';
            statusMessage.style.color = '#4CAF50';
            processData(data);
        } catch (error) {
            statusMessage.textContent = '加载 json/us_tv.json 失败或文件格式无效。';
            statusMessage.style.color = '#F44336';
            console.error("Fetch or Parse Error:", error);
        }
    }

    function processData(data) {
        if (data.metadata && data.metadata.last_updated) {
            const updateDate = data.metadata.last_updated.substring(0, 10);
            // **修改**: 不再重写整个h1，而是填充small标签
            const updateDateElement = mainTitle.querySelector('.update-date');
            if (updateDateElement) {
                updateDateElement.textContent = updateDate;
            }
        }
        if (!data || !Array.isArray(data.shows)) {
            statusMessage.textContent = 'JSON文件格式不正确，需要包含 "shows" 数组。'; 
            statusMessage.style.color = '#F44336';
            return;
        }
        const flattenedSeasons = [];
        data.shows.forEach(show => {
            if (show.seasons && show.seasons.length > 0) {
                show.seasons.forEach(season => {
                    if (season.air_date) {
                        flattenedSeasons.push({ ...season, parentShow: show });
                    }
                });
            }
        });
        allSeasons = flattenedSeasons;
        populateGenreFilters();
        filterAndRenderShows();
    }

    function populateGenreFilters() {
        const genreMap = { '全部': '全部', '剧情': '剧情', '喜剧': '喜剧', '悬疑': '悬疑', '科幻|奇幻': 'Sci-Fi & Fantasy', '犯罪': '犯罪', '家庭': '家庭', '动作冒险': '动作冒险', '儿童': '儿童', '动画': '动画' };
        const displayOrder = ['全部', '剧情', '喜剧', '悬疑', '科幻|奇幻', '犯罪', '家庭', '动作冒险', '儿童', '动画'];
        genreFilterContainer.innerHTML = '';
        displayOrder.forEach(displayName => {
            const actualValue = genreMap[displayName];
            const tag = createGenreTag(displayName, actualValue);
            if (displayName === '全部') {
                tag.classList.add('active');
            }
            genreFilterContainer.appendChild(tag);
        });
    }
    
    function createGenreTag(displayName, actualValue) {
        const tag = document.createElement('div');
        tag.className = 'genre-tag';
        tag.textContent = displayName;
        tag.dataset.genre = actualValue;
        tag.addEventListener('click', () => {
            if (selectedGenre === actualValue) return;
            document.querySelector('.genre-tag.active')?.classList.remove('active');
            tag.classList.add('active');
            selectedGenre = actualValue;
            filterAndRenderShows();
        });
        return tag;
    }

    function filterAndRenderShows() {
        const currentlyFiltered = selectedGenre === '全部'
            ? [...allSeasons]
            : allSeasons.filter(season => 
                season.parentShow.genres.some(genre => genre.name === selectedGenre)
            );

        const now = new Date();
        now.setHours(0, 0, 0, 0);

        const futureSeasons = currentlyFiltered
            .filter(season => new Date(season.air_date) > now)
            .sort((a, b) => new Date(a.air_date) - new Date(b.air_date));

        filteredPastAndPresentSeasons = currentlyFiltered
            .filter(season => new Date(season.air_date) <= now)
            .sort((a, b) => new Date(b.air_date) - new Date(a.air_date));

        renderComingSoon(futureSeasons);
        startRendering();
    }
    
    function renderComingSoon(futureSeasons) {
        comingSoonContainer.innerHTML = '';
        if (futureSeasons.length === 0) {
            comingSoonContainer.style.display = 'none';
            return;
        }
        let cardsHTML = '';
        futureSeasons.forEach(season => {
            cardsHTML += createShowCard(season).outerHTML;
        });
        comingSoonContainer.innerHTML = `<h2 class="month-group-header">即将上映</h2><div class="scroller-wrapper"><button class="scroller-arrow left" aria-label="Scroll left">‹</button><div class="scroller-container"><div class="horizontal-scroller">${cardsHTML}</div></div><button class="scroller-arrow right" aria-label="Scroll right">›</button></div>`;
        comingSoonContainer.style.display = 'block';
        setupHorizontalScroller(comingSoonContainer);
    }

    function setupHorizontalScroller(container) {
        const scroller = container.querySelector('.scroller-container');
        const arrowLeft = container.querySelector('.scroller-arrow.left');
        const arrowRight = container.querySelector('.scroller-arrow.right');
        function updateArrowVisibility() {
            const scrollLeft = scroller.scrollLeft;
            const scrollWidth = scroller.scrollWidth;
            const clientWidth = scroller.clientWidth;
            arrowLeft.style.display = 'block';
            arrowRight.style.display = 'block';
            arrowLeft.disabled = scrollLeft < 10;
            arrowRight.disabled = scrollWidth - scrollLeft - clientWidth < 10;
        }
        arrowLeft.addEventListener('click', () => {
            scroller.scrollBy({ left: -scroller.clientWidth * 0.8, behavior: 'smooth' });
        });
        arrowRight.addEventListener('click', () => {
            scroller.scrollBy({ left: scroller.clientWidth * 0.8, behavior: 'smooth' });
        });
        scroller.addEventListener('scroll', updateArrowVisibility);
        setTimeout(updateArrowVisibility, 100);
    }
    
    function startRendering() {
        resultsContainer.innerHTML = '';
        noResultsMessage.style.display = 'none';
        interactiveTimeline.classList.remove('visible');
        currentPage = 1;
        lastRenderedMonth = null;
        
        allAvailableYears = [...new Set(filteredPastAndPresentSeasons.map(s => s.air_date.substring(0, 4)))];
        if (comingSoonContainer.style.display === 'block') {
            allAvailableYears.unshift(FUTURE_TAG);
        }
        
        visibleYearCount = Math.min(3, allAvailableYears.length);
        currentActiveYear = null;
        
        if (filteredPastAndPresentSeasons.length === 0 && comingSoonContainer.style.display === 'none') {
            noResultsMessage.style.display = 'block';
        }
        
        if (allAvailableYears.length > 0) {
            interactiveTimeline.classList.add('visible');
            renderTimeline(allAvailableYears[0]);
            loadMoreItems();
        } else {
             yearList.innerHTML = '';
             loader.style.display = 'none';
        }
    }

    function loadMoreItems() {
        if (isLoading) return;
        isLoading = true;
        
        if (!loadingOverlay.classList.contains('visible') && !isScrollingProgrammatically) {
            loader.style.display = 'block';
        }

        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        const endIndex = startIndex + ITEMS_PER_PAGE;
        const itemsToRender = filteredPastAndPresentSeasons.slice(startIndex, endIndex);
        
        if (itemsToRender.length > 0) {
            appendItems(itemsToRender);
            currentPage++;
        }
        
        isLoading = false;
        loader.style.display = 'none';
        updateActiveTimeline();
    }
    
    function appendItems(seasonsToRender) {
        let currentGrid = resultsContainer.querySelector('.month-grid:last-of-type');
        seasonsToRender.forEach(season => {
            const monthKey = season.air_date.substring(0, 7);
            if (monthKey !== lastRenderedMonth) {
                lastRenderedMonth = monthKey;
                const header = document.createElement('h2');
                header.className = 'month-group-header';
                header.id = `month-${monthKey}`;
                const date = new Date(monthKey + '-01');
                header.textContent = `${date.getFullYear()}年 ${date.getMonth() + 1}月`;
                resultsContainer.appendChild(header);
                currentGrid = document.createElement('div');
                currentGrid.className = 'month-grid';
                resultsContainer.appendChild(currentGrid);
            }
            const card = createShowCard(season);
            currentGrid.appendChild(card);
        });
    }

    // --- MODIFICATION START ---
    function createShowCard(season) {
        const show = season.parentShow;
        const posterPath = season.poster_path || show.poster_path;
        const posterUrl = posterPath ? `${TMDB_IMAGE_BASE_URL}${posterPath}` : 'https://via.placeholder.com/500x750.png?text=No+Image';
        const displayTitle = show.name !== show.original_name ? `${show.name} (${show.original_name})` : show.name;
        const fullTitle = `${displayTitle} - ${season.name}`;
        
        // Extract Douban related info and verification status
        const doubanVerified = season.douban_link_verified;
        const doubanLink = season.douban_link_google;
        const doubanRating = season.douban_rating;
        
        const tmdbLink = `https://www.themoviedb.org/tv/${show.id}/season/${season.season_number}`;
        const imdbLink = show.imdb_id ? `https://www.imdb.com/title/${show.imdb_id}/` : null;

        // Conditionally create the rating HTML based on verification
        let ratingElementHTML = '';
        if (doubanVerified && doubanRating) {
            ratingElementHTML = `<div class="card-rating"><span class="imdb-gold">★</span> <span class="douban-green">豆瓣</span> <span class="imdb-gold">${doubanRating}</span></div>`;
        } else {
            ratingElementHTML = `<div class="card-rating"><span class="imdb-gold">★</span> <span class="douban-green">豆瓣：</span><span class="no-rating-text">暂无</span></div>`;
        }
        
        const airDateInfo = season.air_date ? `<div class="card-meta-info">上映日期：${season.air_date}</div>` : '';
        const card = document.createElement('div');
        card.className = 'show-card';
        
        // Create poster HTML, wrapping it in a link if Douban link is verified
        const imageHTML = `<img src="${posterUrl}" alt="${fullTitle}" class="poster" loading="lazy">`;
        const posterContainerClass = (doubanVerified && doubanLink) ? 'card-poster-container clickable' : 'card-poster-container';
        const posterHTML = (doubanVerified && doubanLink)
            ? `<a href="${doubanLink}" target="_blank" class="poster-link">${imageHTML}</a>`
            : imageHTML;

        // Conditionally include the Douban link in the final HTML
        card.innerHTML = `<div class="${posterContainerClass}">${posterHTML}<div class="watchlist-button" role="button" aria-label="Add to Watchlist"><svg class="watchlist-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24" fill="currentColor"><path d="M18 13h-5v5c0 .55-.45 1-1 1s-1-.45-1-1v-5H6c-.55 0-1-.45-1-1s.45-1 1-1h5V6c0-.55.45-1 1-1s1 .45 1 1v5h5c.55 0 1 .45 1 1s-.45 1-1 1z"></path></svg></div></div><div class="card-content">${ratingElementHTML}<h3 class="card-title" title="${fullTitle}">${fullTitle}</h3>${airDateInfo}<div class="card-links">${(doubanVerified && doubanLink) ? `<a href="${doubanLink}" class="card-link" target="_blank">豆瓣</a>` : ''}<a href="${tmdbLink}" class="card-link" target="_blank">TMDb</a>${imdbLink ? `<a href="${imdbLink}" class="card-link" target="_blank">IMDb</a>` : ''}</div></div>`;
        return card;
    }
    // --- MODIFICATION END ---
    
    function renderTimeline(activeYear) {
        yearList.innerHTML = '';
        const yearsToShow = allAvailableYears.slice(0, visibleYearCount);
        yearsToShow.forEach((year, index) => {
            const li = document.createElement('li');
            li.className = 'year-item';
            if (year === activeYear) { li.classList.add('active'); }
            li.dataset.year = year;
            li.innerHTML = `<span class="dot"></span><span class="year-text">${year}</span>`;
            li.addEventListener('click', (e) => {
                e.stopPropagation();
                const isLastItem = index === yearsToShow.length - 1;
                handleYearClick(year, isLastItem);
            });
            yearList.appendChild(li);
        });
    }

    function handleYearClick(year, isLastItem) {
        if (isLastItem && (visibleYearCount < allAvailableYears.length)) {
            visibleYearCount = Math.min(allAvailableYears.length, visibleYearCount + 2);
        }
        scrollToYear(year);
    }
    
    function updateActiveTimeline() {
        if (isScrollingProgrammatically) return;
        let topVisibleYear = null;
        const comingSoonRect = comingSoonContainer.getBoundingClientRect();
        if (comingSoonContainer.style.display === 'block' && comingSoonRect.top >= 0 && comingSoonRect.top < window.innerHeight * 0.4) {
            topVisibleYear = FUTURE_TAG;
        } else {
            const headers = document.querySelectorAll('#results-container .month-group-header');
            if (headers.length > 0) {
                for (const header of headers) {
                    if (header.getBoundingClientRect().top < window.innerHeight * 0.4) {
                        topVisibleYear = header.id.substring(6, 10);
                    }
                }
                if (!topVisibleYear) {
                    topVisibleYear = allAvailableYears.find(y => y !== FUTURE_TAG);
                }
            } else if (allAvailableYears.includes(FUTURE_TAG)) {
                topVisibleYear = FUTURE_TAG;
            }
        }
        
        if (topVisibleYear && topVisibleYear !== currentActiveYear) {
            currentActiveYear = topVisibleYear;
            const currentIndex = allAvailableYears.indexOf(currentActiveYear);
            if (currentIndex >= visibleYearCount - 1 && visibleYearCount < allAvailableYears.length) {
                 visibleYearCount = Math.min(allAvailableYears.length, currentIndex + 2);
            }
            renderTimeline(currentActiveYear);
        }
    }
    
    async function scrollToYear(year) {
        isScrollingProgrammatically = true;
        renderTimeline(year);
        currentActiveYear = year;
        
        const currentYearIndex = allAvailableYears.indexOf(year);
        const nextYearToPreload = allAvailableYears[currentYearIndex + 1];

        const mainTask = ensureYearIsLoadedAndScroll(year, false);
        if (nextYearToPreload) {
            ensureYearIsLoadedAndScroll(nextYearToPreload, true);
        }
        await mainTask;

        setTimeout(() => {
            isScrollingProgrammatically = false;
        }, 1000); 
    }

    async function ensureYearIsLoadedAndScroll(year, preloadOnly = false) {
        let targetElement;
        if (year === FUTURE_TAG) {
            targetElement = document.body;
        } else {
            targetElement = document.querySelector(`#results-container .month-group-header[id^="month-${year}"]`);
        }
        
        if (!targetElement && year !== FUTURE_TAG) {
            if (!preloadOnly) loadingOverlay.classList.add('visible');
            while (!targetElement && (currentPage - 1) * ITEMS_PER_PAGE < filteredPastAndPresentSeasons.length) {
                await loadMoreItemsAsync();
                targetElement = document.querySelector(`#results-container .month-group-header[id^="month-${year}"]`);
            }
            if (!preloadOnly) loadingOverlay.classList.remove('visible');
        }
        
        if (targetElement && !preloadOnly) {
            setTimeout(() => {
                targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 50); 
        }
    }

    function loadMoreItemsAsync() {
        return new Promise(resolve => {
            if (isLoading) { resolve(); return; }
            isLoading = true;
            const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
            const endIndex = startIndex + ITEMS_PER_PAGE;
            const itemsToRender = filteredPastAndPresentSeasons.slice(startIndex, endIndex);
            if (itemsToRender.length > 0) {
                appendItems(itemsToRender);
                currentPage++;
            }
            isLoading = false;
            setTimeout(resolve, 50);
        });
    }

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0]; if (!file) return; const reader = new FileReader();
        reader.onload = (re) => { try { const data = JSON.parse(re.target.result); statusMessage.textContent = `已加载文件: ${file.name}`; statusMessage.style.color = 'green'; processData(data); } catch (err) { statusMessage.textContent = `文件 "${file.name}" 不是有效的JSON格式。`; statusMessage.style.color = 'red'; } };
        reader.readAsText(file);
    });

    let scrollTimeout;
    window.addEventListener('scroll', () => {
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
            updateActiveTimeline();
            if (!isLoading && (window.innerHeight + window.scrollY >= document.body.offsetHeight - 500)) {
                loadMoreItems();
            }
        }, 50);
    });

    initialize();
});