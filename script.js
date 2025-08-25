document.addEventListener('DOMContentLoaded', () => {
    const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w300';
    let allSeasons = [];
    let filteredPastAndPresentSeasons = [];
    let usSeasonsCache = [];
    let gbSeasonsCache = [];
    let usUpdateDate = '';
    let gbUpdateDate = '';
    let isUsCompleteLoaded = false;
    let isGbCompleteLoaded = false;
    let currentRegion = 'us'; // 'us' or 'gb'
    let specialFilterMode = null; // Can be 'recent_high_score'
    let selectedGenres = []; // Array to hold multiple selected genres
    let selectedNetworks = []; // Array to hold multiple selected networks

    // State variables
    const ITEMS_PER_PAGE = 18;
    let currentPage = 1;
    let isLoading = false;
    let lastRenderedMonth = null;
    let allAvailableYears = [];
    let currentActiveYear = null;
    let visibleYearCount = 3;
    let isScrollingProgrammatically = false;
    let selectedRating = '全部';
    const FUTURE_TAG = '即将上映';

    // DOM Elements
    const mainTitle = document.querySelector('h1');
    const ratingFilterContainer = document.getElementById('rating-filter-container'); // 新增：评分筛选容器
    const genreFilterContainer = document.getElementById('genre-filter-container');
    const networkFilterContainer = document.getElementById('network-filter-container');
    const loadingOverlay = document.getElementById('loading-overlay');
    const comingSoonContainer = document.getElementById('coming-soon-container');
    const interactiveTimeline = document.getElementById('interactive-timeline');
    const yearList = document.getElementById('year-list');
    const statusMessage = document.getElementById('status-message');
    const fileInput = document.getElementById('file-input');
    const resultsContainer = document.getElementById('results-container');
    const noResultsMessage = document.getElementById('no-results');
    const loader = document.getElementById('loader');
    const skeletonContainer = document.getElementById('skeleton-container');
    const regionFilterContainer = document.getElementById('region-filter-container');

    async function initialize() {
        try {
            // Step 1: Fetch and render the latest US data for a fast initial load
            const latestResponse = await fetch('json/tv_us_latest.json');
            if (!latestResponse.ok) {
                console.warn('Could not load latest.json, falling back to complete.json');
                await loadCompleteData('us', 'json/tv_us_complete.json');
            } else {
                const latestData = await latestResponse.json();
                processData(latestData, 'us'); // Initial render with latest US data

                // Step 2: Silently fetch the complete US and GB data in the background
                loadCompleteData('us', 'json/tv_us_complete.json'); // This will assimilate and cache
                loadCompleteData('gb', 'json/tv_gb_complete.json');      // This will just cache
            }

        } catch (error) {
            statusMessage.textContent = '加载数据失败或文件格式无效。';
            statusMessage.style.color = '#F44336';
            console.error("Fetch or Parse Error:", error);
            if(skeletonContainer) skeletonContainer.style.display = 'none';
        }
    }

    function processData(data, region) {
        // This function now only handles the initial processing and rendering
        if (data.metadata && data.metadata.last_updated) {
            const updateDate = data.metadata.last_updated.substring(0, 10);
            const updateDateElement = mainTitle.querySelector('.update-date');
            if (updateDateElement) {
                updateDateElement.textContent = `数据更新于：${updateDate}`;
                updateDateElement.classList.remove('skeleton');
            }
        }
        if (!data || !Array.isArray(data.shows)) {
            statusMessage.textContent = 'JSON文件格式不正确，需要包含 "shows" 数组。';
            statusMessage.style.color = '#F44336';
            return;
        }

        const flattenedSeasons = flattenSeasonsData(data);

        // Use the initial data for the first render
        allSeasons = flattenedSeasons;

        // The initial data is always US, so it populates the usSeasonsCache
        usSeasonsCache = flattenedSeasons;

        if (data.metadata && data.metadata.last_updated) {
            usUpdateDate = data.metadata.last_updated;
        }

        populateRatingFilters();
        populateGenreFilters();
        populateNetworkFilters();
        filterAndRenderShows();
    }

    function flattenSeasonsData(data) {
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
        return flattenedSeasons;
    }

    async function loadCompleteData(region, url) {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Could not load ${url}`);
            const data = await response.json();

            const flattenedData = flattenSeasonsData(data);

            if (region === 'us') {
                usSeasonsCache = flattenedData;
                if (data.metadata && data.metadata.last_updated) {
                    usUpdateDate = data.metadata.last_updated;
                }
                isUsCompleteLoaded = true;
                // If the current view is US, assimilate seamlessly
                if (currentRegion === 'us') {
                    assimilateCompleteData(flattenedData);
                }
                 console.log("US complete data loaded and cached.");
            } else if (region === 'gb') {
                gbSeasonsCache = flattenedData;
                if (data.metadata && data.metadata.last_updated) {
                    gbUpdateDate = data.metadata.last_updated;
                }
                isGbCompleteLoaded = true;
                console.log("GB data loaded and cached.");
                 // If the user happens to switch to GB while it's loading, render it.
                if (currentRegion === 'gb') {
                    allSeasons = gbSeasonsCache;
                    updateSubtitleText();
                    // No need to hide skeleton here, filterAndRenderShows will do it.
                    filterAndRenderShows();
                    populateNetworkFilters(); // Re-populate for GB
                }
            }
            checkAndNotifyCompletion(); // Check if all background tasks are done
        } catch (error) {
            console.error(`Background data load failed for ${region}:`, error);
        }
    }

    function assimilateCompleteData(completeUsData) {
        console.log("Complete US data loaded. Assimilating into the app.");

        // Replace master data source and cache
        allSeasons = completeUsData;
        usSeasonsCache = completeUsData;

        // Re-run filters with the new complete data to get an updated count for the timeline
        const { filteredPastAndPresentSeasons: newFilteredSeasons } = applyFilters();

        // Update the global list that infinite scroll uses
        filteredPastAndPresentSeasons = newFilteredSeasons;

        // Now, just update the timeline UI without a full page re-render
        const newAllAvailableYears = [...new Set(filteredPastAndPresentSeasons.map(s => s.air_date.substring(0, 4)))];
        if (comingSoonContainer.style.display === 'block') {
            newAllAvailableYears.unshift(FUTURE_TAG);
        }
        allAvailableYears = newAllAvailableYears;
        renderTimeline(currentActiveYear); // Re-render timeline with new years

        updateSubtitleText();

        // The toast notification is now handled by checkAndNotifyCompletion()
    }

    function checkAndNotifyCompletion() {
        if (isUsCompleteLoaded && isGbCompleteLoaded) {
            const toast = document.getElementById('toast-notification');
            if (toast) {
                toast.textContent = "已加载所有剧集";
                toast.classList.add('show');
                setTimeout(() => {
                    toast.classList.remove('show');
                }, 3000); // Hide after 3 seconds
            }
        }
    }

    // --- Event Listeners Setup ---
    function setupEventListeners() {
        // Region Filter
        regionFilterContainer.addEventListener('click', (e) => {
            const target = e.target.closest('.genre-tag');
            if (!target || target.classList.contains('active')) return;

            const newRegion = target.dataset.region;
            if (newRegion === currentRegion) return;

            // Update active tag UI
            regionFilterContainer.querySelector('.active').classList.remove('active');
            target.classList.add('active');

            // --- RESET ALL OTHER FILTERS ---
            // Reset state variables
            specialFilterMode = null;
            selectedRating = '全部';
            selectedGenres = [];
            selectedNetworks = [];

            // Reset UI for other filters
            // Clear all active tags from all filter containers except region filter
            document.querySelectorAll('.genre-tag.active').forEach(tag => {
                if (!tag.closest('#region-filter-container')) {
                    tag.classList.remove('active', 'multiselect-tick');
                }
            });
            document.querySelector('#rating-filter-container .genre-tag[data-rating="0"]')?.classList.add('active');
            document.querySelector('#genre-filter-container .genre-tag[data-genre="全部"]')?.classList.add('active');
            document.querySelector('#network-filter-container .genre-tag[data-network="全部"]')?.classList.add('active');
            // --- END RESET ---

            // Update state and data source
            currentRegion = newRegion;

            if (currentRegion === 'us') {
                allSeasons = usSeasonsCache;
            } else if (currentRegion === 'gb') {
                allSeasons = gbSeasonsCache;
            }

            updateSubtitleText();

            // Re-render the page with the new data source
            // check if cache is ready
            if (allSeasons.length > 0) {
                 filterAndRenderShows();
                 populateNetworkFilters(); // Re-populate network filters for the new region
            } else {
                // Clear coming soon specifically, then show skeleton
                comingSoonContainer.innerHTML = '';
                comingSoonContainer.style.display = 'none';
                showSkeletonLoader();
                populateNetworkFilters(); // Also update filters UI instantly
            }
        });

        // Other filters... (the existing click handlers are set up in their populate functions)

        // File Input
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0]; if (!file) return; const reader = new FileReader();
            reader.onload = (re) => { try { const data = JSON.parse(re.target.result); statusMessage.textContent = `已加载文件: ${file.name}`; statusMessage.style.color = 'green'; processData(data, 'us'); } catch (err) { statusMessage.textContent = `文件 "${file.name}" 不是有效的JSON格式。`; statusMessage.style.color = 'red'; } };
            reader.readAsText(file);
        });

        // Window Scroll
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
    }

    function showSkeletonLoader() {
        resultsContainer.innerHTML = ''; // Clear previous main content
        noResultsMessage.style.display = 'none';

        // Restore the "Coming Soon" skeleton
        comingSoonContainer.innerHTML = `
            <h2 class="month-group-header skeleton">即将上映</h2>
            <div class="scroller-wrapper">
                <div class="scroller-container">
                    <div class="horizontal-scroller">
                        <div class="show-card skeleton"></div>
                        <div class="show-card skeleton"></div>
                        <div class="show-card skeleton"></div>
                        <div class="show-card skeleton"></div>
                        <div class="show-card skeleton"></div>
                        <div class="show-card skeleton"></div>
                    </div>
                </div>
            </div>
        `;
        comingSoonContainer.style.display = 'block';
        
        // Restore the main content skeleton
        let skeleton = document.getElementById('skeleton-container');
        if (skeleton) {
            skeleton.style.display = 'block';
            // If the skeleton was detached, re-attach it.
            if (!skeleton.parentElement) {
                resultsContainer.appendChild(skeleton);
            }
        } else {
             // Or recreate it if it was removed
            skeleton = document.createElement('div');
            skeleton.id = 'skeleton-container';
            skeleton.innerHTML = `
                <h2 class="month-group-header skeleton">&nbsp;</h2>
                <div class="month-grid">
                    <div class="show-card skeleton"></div>
                    <div class="show-card skeleton"></div>
                    <div class="show-card skeleton"></div>
                    <div class="show-card skeleton"></div>
                    <div class="show-card skeleton"></div>
                    <div class="show-card skeleton"></div>
                </div>
                <h2 class="month-group-header skeleton">&nbsp;</h2>
                <div class="month-grid">
                    <div class="show-card skeleton"></div>
                    <div class="show-card skeleton"></div>
                    <div class="show-card skeleton"></div>
                    <div class="show-card skeleton"></div>
                    <div class="show-card skeleton"></div>
                    <div class="show-card skeleton"></div>
                </div>
            `;
            resultsContainer.appendChild(skeleton);
        }
        loader.style.display = 'none'; // Ensure the small loader is hidden
    }

    function updateSubtitleText() {
        const updateDateElement = mainTitle.querySelector('.update-date');
        if (!updateDateElement) return;

        let dateToDisplay = '';
        if (currentRegion === 'us') {
            dateToDisplay = usUpdateDate;
        } else if (currentRegion === 'gb') {
            dateToDisplay = gbUpdateDate;
        }

        if (dateToDisplay) {
            updateDateElement.textContent = `数据更新于：${dateToDisplay.substring(0, 10)}`;
            updateDateElement.classList.remove('skeleton');
        } else {
            updateDateElement.textContent = '';
            updateDateElement.classList.add('skeleton');
        }
    }


    // --- 新增：生成评分筛选器 ---
    function populateRatingFilters() {
        const ratings = {
            '全部': 0,
            '> 9分': 9,
            '> 8分': 8,
            '> 7分': 7,
            '近2年高分': 'recent_high_score'
        };
        ratingFilterContainer.innerHTML = '';
        Object.entries(ratings).forEach(([label, value]) => {
            const tag = document.createElement('div');
            tag.className = 'genre-tag';
            tag.textContent = label;
            tag.dataset.rating = value;

            // Logic to set active class
            if (specialFilterMode === 'recent_high_score' && value === 'recent_high_score') {
                tag.classList.add('active');
            } else if (!specialFilterMode && label === selectedRating) {
                tag.classList.add('active');
            }

            tag.addEventListener('click', () => {
                const isActive = tag.classList.contains('active');
                if (isActive) return;

                document.querySelector('#rating-filter-container .genre-tag.active')?.classList.remove('active');
                tag.classList.add('active');

                if (value === 'recent_high_score') {
                    specialFilterMode = 'recent_high_score';
                    // Now it doesn't de-select other filters
                } else {
                    specialFilterMode = null;
                    selectedRating = label;
                }
                
                filterAndRenderShows();
            });

            ratingFilterContainer.appendChild(tag);
        });
    }

    function createAndSetupMainFilter(container, dataKey, stateKey, onSelectCallback) {
        // A generic function to create filter tags could go here to reduce repetition
        // For now, keeping the specific implementations.
    }

    function populateGenreFilters() {
        const genreMap = { '全部': '全部', '剧情': '剧情', '喜剧': '喜剧', '悬疑': '悬疑', '科幻|奇幻': 'Sci-Fi & Fantasy', '犯罪': '犯罪', '动作冒险': '动作冒险', '儿童': '儿童', '动画': '动画' };
        const displayOrder = ['全部', '剧情', '喜剧', '悬疑', '犯罪', '动作冒险', '科幻|奇幻', '儿童', '动画'];
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
            const isActive = tag.classList.contains('active');

            if (actualValue === '全部') {
                if (isActive) return;
                genreFilterContainer.querySelectorAll('.genre-tag').forEach(t => {
                    t.classList.remove('active', 'multiselect-tick');
                });
                selectedGenres = [];
                tag.classList.add('active');
            } else {
                genreFilterContainer.querySelector('.genre-tag[data-genre="全部"]')?.classList.remove('active');

                if (isActive) {
                    tag.classList.remove('active', 'multiselect-tick');
                    const index = selectedGenres.indexOf(actualValue);
                    if (index > -1) {
                        selectedGenres.splice(index, 1);
                    }
                } else {
                    tag.classList.add('active', 'multiselect-tick');
                    selectedGenres.push(actualValue);
                }

                if (selectedGenres.length === 0) {
                    genreFilterContainer.querySelector('.genre-tag[data-genre="全部"]')?.classList.add('active');
                }
            }
            filterAndRenderShows();
            
            // Scroll the clicked tag into view if it's in a scrolling container
            if (window.innerWidth <= 900) {
                tag.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
            }
        });
        return tag;
    }

    function populateNetworkFilters() {
        const us_networks = ['全部', 'Netflix', 'Apple TV', 'Hulu', 'Prime Video', 'Disney', 'Paramount', 'HBO', 'ABC', 'FOX', 'CBS', 'NBC'];
        const gb_networks = ['全部', 'BBC', 'Netflix', 'Apple TV', 'Prime Video', 'Sky', 'ITV', 'Channel 4', 'Disney'];

        const displayOrder = currentRegion === 'gb' ? gb_networks : us_networks;

        // Reset selected network to '全部' when re-populating, to avoid inconsistent state
        selectedNetworks = [];
        
        networkFilterContainer.innerHTML = '';
        displayOrder.forEach(networkName => {
            const tag = createNetworkTag(networkName);
            if (networkName === '全部') {
                tag.classList.add('active');
            }
            networkFilterContainer.appendChild(tag);
        });
    }

    function createNetworkTag(networkName) {
        const tag = document.createElement('div');
        tag.className = 'genre-tag'; // 恢复：重新使用 genre-tag 样式
        tag.textContent = networkName;
        tag.dataset.network = networkName;
        tag.addEventListener('click', () => {
            const isActive = tag.classList.contains('active');

            if (networkName === '全部') {
                if (isActive) return;
                networkFilterContainer.querySelectorAll('.genre-tag').forEach(t => {
                    t.classList.remove('active', 'multiselect-tick');
                });
                selectedNetworks = [];
                tag.classList.add('active');
            } else {
                networkFilterContainer.querySelector('.genre-tag[data-network="全部"]')?.classList.remove('active');

                if (isActive) {
                    tag.classList.remove('active', 'multiselect-tick');
                    const index = selectedNetworks.indexOf(networkName);
                    if (index > -1) {
                        selectedNetworks.splice(index, 1);
                    }
                } else {
                    tag.classList.add('active', 'multiselect-tick');
                    selectedNetworks.push(networkName);
                }

                if (selectedNetworks.length === 0) {
                    networkFilterContainer.querySelector('.genre-tag[data-network="全部"]')?.classList.add('active');
                }
            }
            filterAndRenderShows();
            
            // Scroll the clicked tag into view if it's in a scrolling container
            if (window.innerWidth <= 900) {
                tag.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
            }
        });
        return tag;
    }

    function applyFilters() {
        let sourceData = [...allSeasons];

        // Step 1: Apply special "recent high score" as a base filter if active
        if (specialFilterMode === 'recent_high_score') {
            const twoYearsAgo = new Date();
            twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
            
            sourceData = sourceData.filter(season => {
                const airDate = new Date(season.air_date);
                return airDate >= twoYearsAgo && !!season.douban_rating;
            });
        }

        // Step 2: Apply standard filters on the (potentially pre-filtered) source data
        const ratingThresholds = { '> 9分': 9, '> 8分': 8, '> 7分': 7 };
        const ratingFiltered = selectedRating === '全部' || specialFilterMode === 'recent_high_score' // Ignore rating threshold in special mode
            ? sourceData
            : sourceData.filter(season => {
                const rating = parseFloat(season.douban_rating) || 0;
                return rating >= ratingThresholds[selectedRating];
            });

        const genreFiltered = selectedGenres.length === 0
            ? ratingFiltered
            : ratingFiltered.filter(season => 
                season.parentShow.genres.some(genre => selectedGenres.includes(genre.name))
            );

        const filteredNoRatingAnime = genreFiltered.filter(season => {
            const isAnime = season.parentShow.genres && season.parentShow.genres.some(g => g.name === '动画');
            const hasRating = season.douban_rating && Number(season.douban_rating) > 0;
            if (isAnime && !hasRating) return false;
            return true;
        });

        const networkFiltered = selectedNetworks.length === 0
            ? filteredNoRatingAnime
            : filteredNoRatingAnime.filter(season => {
                if (!season.parentShow.networks || season.parentShow.networks.length === 0) {
                    return false;
                }
                // Use .some() to check if any of the show's networks is in the selected list
                return season.parentShow.networks.some(network => 
                    // Use .some() again for the fuzzy match on each selected network
                    selectedNetworks.some(selectedNet => network.name.toLowerCase().includes(selectedNet.toLowerCase()))
                );
            });

        const now = new Date();
        now.setHours(0, 0, 0, 0);

        // In special mode, there is no "future seasons" concept
        const futureSeasons = specialFilterMode === 'recent_high_score'
            ? []
            : networkFiltered
                .filter(season => new Date(season.air_date) > now)
                .sort((a, b) => new Date(a.air_date) - new Date(b.air_date));

        const pastAndPresentResults = specialFilterMode === 'recent_high_score'
            ? networkFiltered // Already filtered and now we just need to sort
            : networkFiltered.filter(season => new Date(season.air_date) <= now);

        // Step 3: Apply final sorting
        const finalSortedSeasons = pastAndPresentResults.sort((a, b) => {
            if (specialFilterMode === 'recent_high_score') {
                const ratingA = parseFloat(a.douban_rating) || 0;
                const ratingB = parseFloat(b.douban_rating) || 0;
                return ratingB - ratingA;
            }
            // Default sort logic
            const monthA = a.air_date.substring(0, 7);
            const monthB = b.air_date.substring(0, 7);
            if (monthA !== monthB) {
                return monthB.localeCompare(monthA);
            }
            const ratingA = parseFloat(a.douban_rating) || 0;
            const ratingB = parseFloat(b.douban_rating) || 0;
            return ratingB - ratingA;
        });
        
        return { futureSeasons, filteredPastAndPresentSeasons: finalSortedSeasons };
    }

    function filterAndRenderShows() {
        const { futureSeasons, filteredPastAndPresentSeasons: newFilteredSeasons } = applyFilters();
        filteredPastAndPresentSeasons = newFilteredSeasons;

        // Initially hide coming soon container until we know if there are future seasons
        comingSoonContainer.style.display = 'none';

        renderComingSoon(futureSeasons);
        startRendering();
    }

    function renderComingSoon(futureSeasons) {
        // Clear existing skeleton or real content
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
        // Instead of clearing the whole container, just hide the skeleton.
        if (skeletonContainer) {
            skeletonContainer.style.display = 'none';
        }
        resultsContainer.innerHTML = '';
        noResultsMessage.style.display = 'none';
        
        // In special mode, the timeline is not relevant, also hide coming-soon
        if (specialFilterMode === 'recent_high_score') {
            interactiveTimeline.classList.remove('visible');
            comingSoonContainer.style.display = 'none';
        } else {
             interactiveTimeline.classList.add('visible');
        }

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
        
        if (allAvailableYears.length > 0 || specialFilterMode === 'recent_high_score') {
            if (specialFilterMode !== 'recent_high_score') {
                 renderTimeline(allAvailableYears[0]);
            }
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
        if (specialFilterMode !== 'recent_high_score') {
            updateActiveTimeline();
        }
    }
    
    function appendItems(seasonsToRender) {
        let index = 0;
        let currentGrid;
        
        // In special mode, create a single grid container
        if (specialFilterMode === 'recent_high_score' && !resultsContainer.querySelector('.month-grid')) {
            currentGrid = document.createElement('div');
            currentGrid.className = 'month-grid';
            resultsContainer.appendChild(currentGrid);
        } else {
            currentGrid = resultsContainer.querySelector('.month-grid:last-of-type');
        }

        function progressiveAppend() {
            if (index >= seasonsToRender.length) return;

            const season = seasonsToRender[index];

            // Do not create month headers in special mode
            if (specialFilterMode !== 'recent_high_score') {
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
            }

            const card = createShowCard(season);
            // Fallback for safety
            if (!currentGrid) {
                 currentGrid = resultsContainer.querySelector('.month-grid:last-of-type') || document.createElement('div');
                 if (!currentGrid.parentElement) {
                    currentGrid.className = 'month-grid';
                    resultsContainer.appendChild(currentGrid);
                 }
            }
            currentGrid.appendChild(card);

            index++;
            requestAnimationFrame(progressiveAppend);
        }

        requestAnimationFrame(progressiveAppend);
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

    // --- 新增：处理滚动容器的渐变遮罩 ---
    function setupScrollFade(container) {
        if (!container) return; // 新增：安全检查，防止容器不存在
        function updateFade() {
            // 当滚动条位置 + 容器宽度 >= 总滚动宽度时，说明滚动到了末尾
            // 增加一个小的容差值（例如 5px），以避免像素计算不精确的问题
            const isAtEnd = container.scrollLeft + container.clientWidth >= container.scrollWidth - 5;
            // 使用 toggle 简化代码，第二个参数为 true 时添加class，为 false 时移除
            container.classList.toggle('scrolled-to-end', isAtEnd);
        }

        // 首次加载时，延迟一小段时间再检查。
        // 这可以防止在浏览器完全渲染出内容前，脚本错误地计算了容器宽度，
        // 尤其是在移动端设备上。
        setTimeout(updateFade, 100);

        // 监听滚动事件，并使用 passive: true 优化性能
        container.addEventListener('scroll', updateFade, { passive: true });

        // 监听窗口大小变化（例如手机横竖屏切换），重新检查
        window.addEventListener('resize', () => {
             setTimeout(updateFade, 100);
        }, { passive: true });
    }

    initialize();
    setupEventListeners();

    // 在初始化后为两个筛选容器设置渐变逻辑
    setupScrollFade(ratingFilterContainer); // 新增：为评分容器启用效果
    setupScrollFade(genreFilterContainer);
    setupScrollFade(networkFilterContainer);
});