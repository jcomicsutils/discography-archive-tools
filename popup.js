document.addEventListener('DOMContentLoaded', function () {
    // --- Page Context Setup ---
    browser.tabs.query({ active: true, currentWindow: true }).then(tabs => {
        const currentUrl = (tabs && tabs.length > 0) ? tabs[0].url : '';
        const onBandcampAny = currentUrl.includes('bandcamp.com');
        const onBandcampArtist = onBandcampAny && (/^https?:\/\/([^\/]+)\.bandcamp\.com\/(music\/?|[?#]|$)/.test(currentUrl) || currentUrl.includes('/artists'));
        const onBandcampAlbumTrack = onBandcampAny && /bandcamp\.com\/(album|track)\//.test(currentUrl);
        const onArchive = currentUrl.includes('archive.org/download/');

        // Hide all context-specific buttons initially
        document.querySelectorAll('[data-context]').forEach(el => el.style.display = 'none');

        // Show buttons based on context
        document.querySelectorAll('[data-context="global"]').forEach(el => el.style.display = '');
        if (onBandcampAny) {
            document.querySelectorAll('[data-context="bandcamp-any"]').forEach(el => el.style.display = '');
        }
        if (onBandcampArtist) {
            document.querySelectorAll('[data-context="bandcamp-artist"]').forEach(el => el.style.display = 'flex'); // Use flex for compound button
            document.getElementById('forceSaveJsonBtn').style.display = '';
        }
        if (onBandcampAlbumTrack) {
            document.querySelectorAll('[data-context="bandcamp-album-track"]').forEach(el => el.style.display = '');
        }
        if (onArchive) {
            document.querySelectorAll('[data-context="archive"]').forEach(el => el.style.display = '');
        }

    }).catch(error => console.error("Error setting up popup UI:", error));
    
    // --- Global Elements ---
    const mainMenu = document.getElementById('mainMenuSection');
    const optionsMenu = document.getElementById('optionsSection');

    // --- View Switching Logic ---
    function showMainMenu() {
        mainMenu.classList.remove('hidden');
        optionsMenu.classList.add('hidden');
    }

    document.getElementById('toggleOptionsBtn').addEventListener('click', function() {
        loadSettings();
        mainMenu.classList.add('hidden');
        optionsMenu.classList.remove('hidden');
    });

    document.getElementById('backToMainMenuFromOptionsBtn').addEventListener('click', showMainMenu);
    
    // --- New "Import JSON" Button Logic ---
    document.getElementById('importJsonBtn').addEventListener('click', function() {
        browser.tabs.create({ url: browser.runtime.getURL("import.html") });
        window.close();
    });

    // --- Main Menu Action Buttons ---
    function sendAction(actionName) {
        browser.runtime.sendMessage({ action: actionName })
            .catch(error => console.error(`Error sending message for action "${actionName}":`, error));
        window.close();
    }
    const actionButtons = {
        'sortTabsBtn': 'sortTabs', 'clickDownloadBtn': 'clickDownload', 'copyKeywordsBtn': 'copyKeywords',
        'copyNypTitlesUrlsBtn': 'copyNypTitlesUrls', 'copyPaidTitlesUrlsBtn': 'copyPaidTitlesUrls',
        'downloadImagesBtn': 'downloadImages', 'downloadSingleCoverBtn': 'downloadSingleCover',
        'downloadAlbumCoversBtn': 'downloadAlbumCovers', 'copyReleasesLinksBtn': 'copyReleasesLinks',
        'copyReleasesAndTitlesBtn': 'copyReleasesAndTitles', 'copyDownloadPageLinksBtn': 'copyDownloadPageLinks',
        'copyArchiveTableFilesBtn': 'copyArchiveTableFiles', 'forceSaveJsonBtn': 'forceSaveJson'
    };
    for (const [id, action] of Object.entries(actionButtons)) {
        const button = document.getElementById(id);
        if (button) {
            button.addEventListener('click', () => sendAction(action));
        }
    }

    // --- Settings Logic ---
    const emailInput = document.getElementById('emailInput');
    const zipcodeInput = document.getElementById('zipcodeInput');
    const batchSizeInput = document.getElementById('batchSizeInput');
    const pauseTimeInput = document.getElementById('pauseTimeInput');
    const notificationsEnabledInput = document.getElementById('notificationsEnabledInput');
    const saFormatEnabledInput = document.getElementById('saFormatEnabledInput');
    const disableHtmlEscapingInput = document.getElementById('disableHtmlEscapingInput');
    const saveCacheToJsonInput = document.getElementById('saveCacheToJsonInput');
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    const statusMessage = document.getElementById('statusMessage');

    function loadSettings() {
        const defaults = { email: '', zipcode: '', batchSize: 10, pauseTime: 5, notificationsEnabled: true, saFormatEnabled: false, disableHtmlEscaping: false, saveCacheToJson: true };
        browser.storage.local.get(defaults).then(settings => {
            emailInput.value = settings.email;
            zipcodeInput.value = settings.zipcode;
            batchSizeInput.value = settings.batchSize;
            pauseTimeInput.value = settings.pauseTime;
            notificationsEnabledInput.checked = settings.notificationsEnabled;
            saFormatEnabledInput.checked = settings.saFormatEnabled;
            disableHtmlEscapingInput.checked = settings.disableHtmlEscaping;
            saveCacheToJsonInput.checked = settings.saveCacheToJson;
        }).catch(error => console.error('Popup: Error loading settings:', error));
    }

    saveSettingsBtn.addEventListener('click', function() {
        const settingsToSave = {
            email: emailInput.value.trim(),
            zipcode: zipcodeInput.value.trim(),
            batchSize: parseInt(batchSizeInput.value, 10) || 10,
            pauseTime: parseInt(pauseTimeInput.value, 10) || 5,
            notificationsEnabled: notificationsEnabledInput.checked,
            saFormatEnabled: saFormatEnabledInput.checked,
            disableHtmlEscaping: disableHtmlEscapingInput.checked,
            saveCacheToJson: saveCacheToJsonInput.checked
        };
        browser.storage.local.set(settingsToSave).then(() => {
            statusMessage.textContent = 'Settings saved!';
            statusMessage.className = 'success';
            setTimeout(() => { statusMessage.textContent = ''; statusMessage.className = ''; }, 2500);
        }).catch(error => {
            statusMessage.textContent = 'Error saving settings.';
            statusMessage.className = 'error';
            console.error('Popup: Error saving settings:', error);
        });
    });
});