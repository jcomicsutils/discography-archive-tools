// popup.js
document.addEventListener('DOMContentLoaded', function () {
    // This logic runs first to set the visibility of menu items based on the current page context.
    browser.tabs.query({ active: true, currentWindow: true }).then(tabs => {
        const currentUrl = (tabs && tabs.length > 0) ? tabs[0].url : '';

        const onArchive = currentUrl.includes('archive.org/download/');
        const onBandcampAny = currentUrl.includes('bandcamp.com');
        // Regex for artist/main music page, which is required for certain actions.
        const onBandcampArtist = onBandcampAny && /^https?:\/\/([^\/]+)\.bandcamp\.com\/(music\/?|[?#]|$)/.test(currentUrl);
        // Regex for album or track pages.
        const onBandcampAlbumTrack = onBandcampAny && /bandcamp\.com\/(album|track)\//.test(currentUrl);

        const menuItems = document.querySelectorAll('#popup-menu li');

        menuItems.forEach(li => {
            const context = li.getAttribute('data-context');
            let shouldShow = false;

            switch (context) {
                case 'global': // These buttons work regardless of the current page.
                    shouldShow = true;
                    break;
                case 'bandcamp-any': // These buttons require being on any Bandcamp page.
                    if (onBandcampAny) shouldShow = true;
                    break;
                case 'bandcamp-artist': // These buttons require being on a specific Bandcamp artist page.
                    if (onBandcampArtist) shouldShow = true;
                    break;
                case 'bandcamp-album-track': // This button requires being on a Bandcamp album or track page.
                    if (onBandcampAlbumTrack) shouldShow = true;
                    break;
                case 'archive': // This button requires being on an Archive.org download page.
                    if (onArchive) shouldShow = true;
                    break;
            }

            // Set the display style. The default is handled by the stylesheet.
            li.style.display = shouldShow ? '' : 'none';
        });

    }).catch(error => {
        console.error("Error setting up popup UI:", error);
    });


    // Generic message sender for actions
    function sendActionAndClose(actionName) {
        browser.runtime.sendMessage({ action: actionName })
            .catch(error => console.error(`Error sending message for action "${actionName}":`, error));
        window.close(); // Close popup immediately
    }

    // Button Mappings
    const actionButtonMappings = [
        { id: 'sortTabsBtn', action: 'sortTabs' },
        { id: 'clickDownloadBtn', action: 'clickDownload' },
        { id: 'copyKeywordsBtn', action: 'copyKeywords' },
        { id: 'copyNypTitlesUrlsBtn', action: 'copyNypTitlesUrls' },
        { id: 'copyPaidTitlesUrlsBtn', action: 'copyPaidTitlesUrls' },
        { id: 'downloadImagesBtn', action: 'downloadImages' },
        { id: 'downloadSingleCoverBtn', action: 'downloadSingleCover' },
        { id: 'downloadAlbumCoversBtn', action: 'downloadAlbumCovers' },
        { id: 'copyReleasesLinksBtn', action: 'copyReleasesLinks' },
        { id: 'copyReleasesAndTitlesBtn', action: 'copyReleasesAndTitles' },
        { id: 'copyDownloadPageLinksBtn', action: 'copyDownloadPageLinks' },
        { id: 'copyArchiveTableFilesBtn', action: 'copyArchiveTableFiles' }
    ];

    actionButtonMappings.forEach(buttonInfo => {
        const buttonElement = document.getElementById(buttonInfo.id);
        if (buttonElement) {
            buttonElement.addEventListener('click', function() {
                sendActionAndClose(buttonInfo.action);
            });
        }
    });

    // --- Options UI Logic ---
    const toggleOptionsBtn = document.getElementById('toggleOptionsBtn');
    const mainMenuSection = document.getElementById('mainMenuSection');
    const optionsSection = document.getElementById('optionsSection');
    const emailInput = document.getElementById('emailInput');
    const zipcodeInput = document.getElementById('zipcodeInput');
    const notificationsEnabledInput = document.getElementById('notificationsEnabledInput');
    const saFormatEnabledInput = document.getElementById('saFormatEnabledInput');
    const disableHtmlEscapingInput = document.getElementById('disableHtmlEscapingInput');
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    const statusMessage = document.getElementById('statusMessage');
    let optionsAreVisible = false;

    function loadSettings() {
        if (!emailInput || !zipcodeInput || !notificationsEnabledInput || !saFormatEnabledInput || !disableHtmlEscapingInput) return; 

        const defaultSettings = {
            email: '',
            zipcode: '',
            notificationsEnabled: true,
            saFormatEnabled: false,
            disableHtmlEscaping: false 
        };

        browser.storage.local.get(defaultSettings).then(result => {
            emailInput.value = result.email;
            zipcodeInput.value = result.zipcode;
            notificationsEnabledInput.checked = result.notificationsEnabled;
            saFormatEnabledInput.checked = result.saFormatEnabled;
            disableHtmlEscapingInput.checked = result.disableHtmlEscaping; 
        }).catch(error => {
            console.error('Popup: Error loading settings:', error);
            emailInput.value = defaultSettings.email;
            safetyInput.value = defaultSettings.zipcode;
            notificationsEnabledInput.checked = defaultSettings.notificationsEnabled;
            saFormatEnabledInput.checked = defaultSettings.saFormatEnabled;
            disableHtmlEscapingInput.checked = defaultSettings.disableHtmlEscaping; 
        });
    }

    if (toggleOptionsBtn && mainMenuSection && optionsSection) {
        toggleOptionsBtn.addEventListener('click', function() {
            optionsAreVisible = !optionsAreVisible;
            if (optionsAreVisible) {
                mainMenuSection.classList.remove('active-section');
                mainMenuSection.classList.add('hidden-section');
                optionsSection.classList.remove('hidden-section');
                optionsSection.classList.add('active-section');
                loadSettings();
                toggleOptionsBtn.textContent = '← Back';
            } else {
                mainMenuSection.classList.remove('hidden-section');
                mainMenuSection.classList.add('active-section');
                optionsSection.classList.remove('active-section');
                optionsSection.classList.add('hidden-section');
                if (statusMessage) statusMessage.textContent = '';
                toggleOptionsBtn.textContent = '⚙️';
            }
        });
    }

    if (saveSettingsBtn && emailInput && zipcodeInput && notificationsEnabledInput && statusMessage && saFormatEnabledInput && disableHtmlEscapingInput) { 
        saveSettingsBtn.addEventListener('click', function() {
            const userEmail = emailInput.value.trim();
            const userZipcode = zipcodeInput.value.trim();
            const notificationsEnabled = notificationsEnabledInput.checked;
            const saFormatEnabled = saFormatEnabledInput.checked;
            const disableHtmlEscaping = disableHtmlEscapingInput.checked; 

            browser.storage.local.set({
                email: userEmail,
                zipcode: userZipcode,
                notificationsEnabled: notificationsEnabled,
                saFormatEnabled: saFormatEnabled,
                disableHtmlEscaping: disableHtmlEscaping 
            })
                .then(() => {
                    statusMessage.textContent = 'Settings saved!';
                    statusMessage.className = 'success';
                    setTimeout(() => { statusMessage.textContent = ''; statusMessage.className = ''; }, 2500);
                })
                .catch(error => {
                    statusMessage.textContent = 'Error saving settings.';
                    statusMessage.className = 'error';
                    console.error('Popup: Error saving settings:', error);
                });
        });
    }
});