// popup.js
document.addEventListener('DOMContentLoaded', function () {
    // Generic message sender for actions - now all actions will just close the popup
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
        { id: 'downloadImagesBtn', action: 'downloadImages' }
    ];

    actionButtonMappings.forEach(buttonInfo => {
        const buttonElement = document.getElementById(buttonInfo.id);
        if (buttonElement) {
            buttonElement.addEventListener('click', function() {
                sendActionAndClose(buttonInfo.action);
            });
        } else {
            console.warn(`Action button with ID "${buttonInfo.id}" not found in popup.html`);
        }
    });

    // --- Options UI Logic (remains the same as previous version) ---
    const toggleOptionsBtn = document.getElementById('toggleOptionsBtn');
    const mainMenuSection = document.getElementById('mainMenuSection');
    const optionsSection = document.getElementById('optionsSection');
    const emailInput = document.getElementById('emailInput');
    const zipcodeInput = document.getElementById('zipcodeInput');
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    const statusMessage = document.getElementById('statusMessage'); 
    let optionsAreVisible = false;

    function loadSettings() {
        if (!emailInput || !zipcodeInput) return;
        browser.storage.local.get(['email', 'zipcode']).then(result => {
            emailInput.value = result.email || '';
            zipcodeInput.value = result.zipcode || '';
        }).catch(error => console.error('Popup: Error loading settings:', error));
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

    if (saveSettingsBtn && emailInput && zipcodeInput && statusMessage) {
        saveSettingsBtn.addEventListener('click', function() {
            const userEmail = emailInput.value.trim();
            const userZipcode = zipcodeInput.value.trim();
            browser.storage.local.set({ email: userEmail, zipcode: userZipcode })
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
    if (mainMenuSection && optionsSection && !optionsAreVisible) {
        mainMenuSection.classList.add('active-section');
        optionsSection.classList.add('hidden-section');
    }
});