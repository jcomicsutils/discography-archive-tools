// background.js
console.log("INFO: background.js: Script loading...");

// Object to store classifications received from content scripts
let classifications = {};

// Helper function to check if a tab is active and not discarded
function isActiveTab(tab, functionName) {
    const isActive = !tab.hidden && !tab.discarded;
    if (!isActive) {
        console.log(`INFO_VERBOSE: ${functionName}: Filtering out tab ID: ${tab.id}, URL: ${tab.url}, Hidden: ${tab.hidden}, Discarded: ${tab.discarded}`);
    }
    return isActive;
}

// Helper function to get file extension from MIME type
function getExtensionFromMimeType(mimeType) {
    if (!mimeType) return 'jpg'; // Default extension
    switch (mimeType.toLowerCase()) {
        case 'image/jpeg':
        case 'image/jpg':
            return 'jpg';
        case 'image/png':
            return 'png';
        case 'image/gif':
            return 'gif';
        case 'image/webp':
            return 'webp';
        case 'image/bmp':
            return 'bmp';
        default:
            const parts = mimeType.split('/');
            if (parts.length === 2 && parts[0] === 'image') {
                const potentialExt = parts[1].replace(/^x-/, '');
                if (potentialExt.length > 0 && potentialExt.length < 5) return potentialExt;
            }
            return 'jpg';
    }
}

function sanitizeFilename(name) {
    if (!name) return 'untitled';
    // Replace invalid filename characters, remove trailing dots, and trim whitespace.
    // Also replacing '|' with '-' for readability.
    return name.replace(/ \| /g, ' - ').replace(/[\/\\?%*:|"<>]/g, '-').replace(/\.$/, '').trim();
}


// --- CSS for the page notification toast ---
const pageNotificationCSS = `
    #dat-page-notification-toast {
        position: fixed !important;
        bottom: 20px !important;
        right: 20px !important;
        background-color: #28a745 !important; /* Green for success */
        color: white !important;
        padding: 12px 24px !important;
        border-radius: 6px !important;
        box-shadow: 0 4px 12px rgba(0,0,0,0.25) !important;
        z-index: 2147483647 !important; /* Max z-index */
        opacity: 0 !important;
        visibility: hidden !important;
        font-family: Arial, sans-serif !important;
        font-size: 14px !important;
        line-height: 1.4 !important;
        transition: opacity 0.4s ease-in-out, transform 0.4s ease-in-out, visibility 0s linear 0.4s !important;
        transform: translateY(20px) !important;
        text-align: center !important;
    }
    #dat-page-notification-toast.show {
        opacity: 1 !important;
        visibility: visible !important;
        transform: translateY(0) !important;
        transition: opacity 0.4s ease-in-out, transform 0.4s ease-in-out, visibility 0s linear 0s !important;
    }
    #dat-page-notification-toast.error {
        background-color: #dc3545 !important; /* Red for error */
    }
`;

let cssInjectedTabs = new Set();

async function showPageNotification(tabId, message, status = 'success', duration = 3000) {
    let settings;
    try {
        // Default notificationsEnabled to true if not found in storage
        settings = await browser.storage.local.get({ notificationsEnabled: true });
    } catch (e) {
        console.error("ERROR: showPageNotification: Could not retrieve notification settings, defaulting to enabled.", e);
        settings = { notificationsEnabled: true }; // Fallback in case of error
    }

    if (!settings.notificationsEnabled) {
        console.log(`INFO: showPageNotification: Notifications are disabled. Message suppressed: "${message}" for tabId: ${tabId}`);
        return; // Do not show notification if disabled
    }

    let targetTabId = tabId;
    if (!targetTabId) {
        try {
            const [activeFallbackTab] = await browser.tabs.query({ active: true, currentWindow: true });
            if (activeFallbackTab && activeFallbackTab.id) {
                targetTabId = activeFallbackTab.id;
                console.log("INFO: showPageNotification: Using active tab as fallback for notification:", targetTabId);
            } else {
                console.error("ERROR: showPageNotification: No valid tabId to show notification.");
                return;
            }
        } catch (e) {
             console.error("ERROR: showPageNotification: Could not query active tab for notification.", e);
             return;
        }
    }

    try {
        if (!cssInjectedTabs.has(targetTabId)) {
            await browser.tabs.insertCSS(targetTabId, { code: pageNotificationCSS });
            cssInjectedTabs.add(targetTabId);
            console.log(`INFO: Injected notification CSS into tab ${targetTabId}`);
        }
    } catch (e) {
        console.error(`ERROR: Failed to inject notification CSS into tab ${targetTabId}:`, e);
    }

    try {
        const scriptToExecute = `
            (function(msg, stat, dur) {
                let toast = document.getElementById('dat-page-notification-toast');
                if (!toast) {
                    toast = document.createElement('div');
                    toast.id = 'dat-page-notification-toast';
                    if (document.body) {
                        document.body.appendChild(toast);
                    } else {
                        console.warn('INJECTED_WARN: Document body not found, cannot append toast.');
                        return;
                    }
                }

                toast.textContent = msg;
                toast.className = 'dat-page-notification-toast';
                if (stat === 'error') {
                    toast.classList.add('error');
                }

                if (toast.showTimeout) clearTimeout(toast.showTimeout);
                if (toast.hideTimeout) clearTimeout(toast.hideTimeout);

                toast.offsetHeight; // Trigger reflow

                requestAnimationFrame(() => {
                    toast.classList.add('show');
                });

                toast.showTimeout = setTimeout(() => {
                    toast.classList.remove('show');
                    toast.hideTimeout = setTimeout(() => {
                        if (toast && toast.parentNode && !toast.classList.contains('show')) {
                            toast.parentNode.removeChild(toast);
                        }
                    }, 550); // Delay removal for fade-out animation
                }, dur);
            })(${JSON.stringify(message)}, ${JSON.stringify(status)}, ${duration});
        `;
        await browser.tabs.executeScript(targetTabId, { code: scriptToExecute });
    } catch (e) {
        console.error(`ERROR: Failed to execute notification script in tab ${targetTabId}:`, e);
    }
}

// Sort tabs in current window based on classification
async function sortTabsAcrossWindow() {
  console.log("INFO: SortTabs: Starting function execution...");
  classifications = {};

  let initiallyQueriedTabs;
  try {
    initiallyQueriedTabs = await browser.tabs.query({
      currentWindow: true,
      url: [
        "*://*.bandcamp.com/album/*",
        "*://*.bandcamp.com/track/*"
      ]
    });
  } catch (e) {
    console.error("ERROR: SortTabs: Failed to query tabs:", e);
    await showPageNotification(null, "Error querying tabs for sorting.", "error");
    return;
  }

  console.log(`INFO: SortTabs: Initially queried ${initiallyQueriedTabs.length} tabs.`);
  const tabs = initiallyQueriedTabs.filter(tab => isActiveTab(tab, "SortTabs"));
  console.log(`INFO: SortTabs: After filtering, processing ${tabs.length} active tabs for sorting.`);


  if (!tabs.length) {
    console.log("INFO: SortTabs: No active Bandcamp album/track tabs found to sort.");
    await showPageNotification(null, "No Bandcamp tabs found to sort.", "error");
    return;
  }

  for (const tab of tabs) {
    try {
      await browser.tabs.executeScript(tab.id, { file: "contentScript.js" });
      console.log(`INFO: SortTabs: Injected classification script into tab ${tab.id}`);
    } catch (e) {
      console.error(`ERROR: SortTabs: Failed to inject classification script into tab ${tab.id}:`, e);
    }
  }

  await new Promise(r => setTimeout(r, 700));

  const paidTabs = [];
  const nypTabs = [];

  for (const tab of tabs) {
    const status = classifications[tab.id];
    if (status === "nyp" || status === "free") {
      nypTabs.push(tab);
    } else {
      paidTabs.push(tab);
    }
  }

  let sortPerformed = false;
  if (tabs.length > 0 && (paidTabs.length > 0 || nypTabs.length > 0) ) {
    const baseIndex = Math.min(...tabs.map(t => t.index));
    let movedCount = 0;
    for (let i = 0; i < paidTabs.length; i++) {
      if (paidTabs[i].index !== baseIndex + i) {
          await browser.tabs.move(paidTabs[i].id, { index: baseIndex + i });
          movedCount++;
      }
    }
    for (let i = 0; i < nypTabs.length; i++) {
      if (nypTabs[i].index !== baseIndex + paidTabs.length + i) {
          await browser.tabs.move(nypTabs[i].id, { index: baseIndex + paidTabs.length + i });
          movedCount++;
      }
    }
    if(movedCount > 0) {
        sortPerformed = true;
        console.log("INFO: SortTabs: Bandcamp tabs sorted.");
    }
  } else {
    console.log("INFO: SortTabs: No tabs needed sorting or no sortable tabs after classification.");
  }

  if (sortPerformed) {
    await showPageNotification(null, "Bandcamp tabs sorted!", "success");
  } else if (tabs.length > 0) {
    await showPageNotification(null, "Tabs checked, no reordering needed.", "success", 2000);
  }
}

// Click Download on NYP/Free tabs, fill 0 if NYP, and proceed
async function clickDownloadAllNonPaid() {
  console.log("INFO: ClickDownload: Starting function execution...");
  classifications = {};

  let initiallyQueriedTabs;
  try {
    initiallyQueriedTabs = await browser.tabs.query({
      currentWindow: true,
      url: [
        "*://*.bandcamp.com/album/*",
        "*://*.bandcamp.com/track/*"
      ]
    });
  } catch (e) {
    console.error("ERROR: ClickDownload: Failed to query tabs:", e);
    const [activeTabForError] = await browser.tabs.query({ active: true, currentWindow: true });
    if (activeTabForError && activeTabForError.id) {
        await showPageNotification(activeTabForError.id, "Error querying tabs for download.", "error");
    }
    return;
  }

  console.log(`INFO: ClickDownload: Initially queried ${initiallyQueriedTabs.length} tabs.`);
  const activeTabs = initiallyQueriedTabs.filter(tab => isActiveTab(tab, "ClickDownload"));
  console.log(`INFO: ClickDownload: After filtering, processing ${activeTabs.length} active tabs.`);

  if (!activeTabs.length) {
    console.log("INFO: ClickDownload: No active Bandcamp tabs found for download process.");
    const [activeTabForNotification] = await browser.tabs.query({ active: true, currentWindow: true });
    if (activeTabForNotification && activeTabForNotification.id) {
        await showPageNotification(activeTabForNotification.id, "No active Bandcamp tabs for download.", "error");
    }
    return;
  }

  for (const tab of activeTabs) {
    try {
      await browser.tabs.executeScript(tab.id, { file: "contentScript.js" });
      console.log(`INFO: ClickDownload: Injected classification script into tab ${tab.id}.`);
    } catch (e) {
      console.error(`ERROR: ClickDownload: Injection failed for classification in tab ${tab.id}:`, e);
    }
  }

  await new Promise(r => setTimeout(r, 700));

  const targetTabs = activeTabs.filter(t => {
    const cls = classifications[t.id];
    return cls === "nyp" || cls === "free";
  });

  if (!targetTabs.length) {
    console.log("INFO: ClickDownload: No NYP/Free active Bandcamp tabs found to process for download.");
    const [activeTabForNotification] = await browser.tabs.query({ active: true, currentWindow: true });
    if (activeTabForNotification && activeTabForNotification.id) {
        await showPageNotification(activeTabForNotification.id, "No NYP/Free tabs found to process.", "error");
    }
    return;
  }

  console.log(`INFO: ClickDownload: Found ${targetTabs.length} NYP/Free active tabs to process for download.`);
  const [currentActiveTabForStartNotification] = await browser.tabs.query({ active: true, currentWindow: true });
  if (currentActiveTabForStartNotification && currentActiveTabForStartNotification.id) {
      await showPageNotification(currentActiveTabForStartNotification.id, `Starting download process for ${targetTabs.length} NYP/Free tab(s)...`, "success", 3500);
  }

  let savedSettings = {};
  try {
      savedSettings = await browser.storage.local.get(['email', 'zipcode', 'notificationsEnabled']);
      if (typeof savedSettings.notificationsEnabled === 'undefined') {
          savedSettings.notificationsEnabled = true;
      }
      console.log("INFO: ClickDownload: Fetched settings from storage:", savedSettings);
  } catch (storageError) {
      console.error("ERROR: ClickDownload: Failed to retrieve settings from storage:", storageError);
  }
  const userEmailForInjection = JSON.stringify(savedSettings.email || "");
  const userZipcodeForInjection = JSON.stringify(savedSettings.zipcode || "");

  for (const tab of targetTabs) {
    try {
      const tabIdForInjection = tab.id;
      const tabUrlForInjection = JSON.stringify(tab.url);

      await browser.tabs.executeScript(tab.id, {
        code: `
          (function(savedUserEmail, savedUserZipcode){
            console.log("INJECTED: Processing download steps for tab: " + ${tabIdForInjection} + " (URL: " + ${tabUrlForInjection} + ")");
            console.log("INJECTED: Received settings - Email: " + savedUserEmail + ", Zip: " + savedUserZipcode);

            const initialDownloadBtn = document.querySelector('button.download-link.buy-link');
            if (initialDownloadBtn) {
              initialDownloadBtn.click();
              console.log("INJECTED: Step 1: Clicked initial download button in tab " + ${tabIdForInjection});
            } else {
              console.log("INJECTED_WARN: Step 1: Could not find initial download button in tab " + ${tabIdForInjection});
            }

            setTimeout(() => {
              const priceInput = document.querySelector('input#userPrice');
              if (priceInput) {
                priceInput.value = '0';
                priceInput.setAttribute('value', '0');
                priceInput.dispatchEvent(new Event('input', { bubbles: true }));
                priceInput.dispatchEvent(new Event('change', { bubbles: true }));
                console.log("INJECTED: Step 2: Set price to 0 in tab " + ${tabIdForInjection});
              } else {
                console.log("INJECTED_INFO: Step 2: No price input (input#userPrice) found in tab " + ${tabIdForInjection} + ", likely a direct free download.");
              }

              setTimeout(() => {
                const freeDownloadLink = document.querySelector('a.download-panel-free-download-link');
                if (freeDownloadLink) {
                  freeDownloadLink.click();
                  console.log("INJECTED: Step 3: Clicked 'download to your computer' link in tab " + ${tabIdForInjection});
                } else {
                  console.log("INJECTED_WARN: Step 3: Could not find 'download to your computer' link in tab " + ${tabIdForInjection});
                }

                setTimeout(() => {
                  const emailAddressInput = document.querySelector('input#fan_email_address');
                  const postalCodeInput = document.querySelector('input#fan_email_postalcode');
                  let okButtonClicked = false;

                  if (emailAddressInput && (getComputedStyle(emailAddressInput).display !== 'none' && emailAddressInput.offsetParent !== null)) {
                    console.log("INJECTED_INFO: Email input field is present for tab " + ${tabIdForInjection});
                    if (savedUserEmail) {
                        emailAddressInput.value = savedUserEmail;
                        emailAddressInput.dispatchEvent(new Event('input', { bubbles: true }));
                        emailAddressInput.dispatchEvent(new Event('change', { bubbles: true }));
                        console.log("INJECTED_INFO: Filled email and dispatched input/change events for tab " + ${tabIdForInjection});
                    }
                    if (postalCodeInput && savedUserZipcode) {
                        postalCodeInput.value = savedUserZipcode;
                        postalCodeInput.dispatchEvent(new Event('input', { bubbles: true }));
                        postalCodeInput.dispatchEvent(new Event('change', { bubbles: true }));
                        console.log("INJECTED_INFO: Filled zip code and dispatched input/change events for tab " + ${tabIdForInjection});
                    }

                    setTimeout(() => {
                        const okButton = Array.from(document.querySelectorAll('button.download-panel-checkout-button')).find(
                            btn => btn.textContent.trim().toUpperCase() === 'OK' && (getComputedStyle(btn).display !== 'none' && btn.offsetParent !== null)
                        );
                        if (okButton) {
                            console.log("INJECTED_INFO: Clicking 'OK' button for tab " + ${tabIdForInjection} + " after 1s delay.");
                            okButton.click();
                            okButtonClicked = true;
                        } else {
                            console.log("INJECTED_WARN: Email prompt visible, but 'OK' button not found after 1s delay for tab " + ${tabIdForInjection} + ". Halting for this tab.");
                        }
                    }, 1000);

                  } else {
                    console.log("INJECTED_INFO: Email input field NOT found/visible for tab " + ${tabIdForInjection} + ". Looking for 'Download Now' button.");
                    const finalDownloadBtn = Array.from(document.querySelectorAll('button.download-panel-checkout-button')).find(
                        btn => btn.textContent.trim().toUpperCase() !== 'OK' && (getComputedStyle(btn).display !== 'none' && btn.offsetParent !== null)
                    );
                    if (finalDownloadBtn) {
                        finalDownloadBtn.click();
                        console.log("INJECTED: Clicked 'Download Now' button in tab " + ${tabIdForInjection});
                    } else {
                        const anyCheckoutButton = document.querySelector('button.download-panel-checkout-button:not([style*="display:none"]):not([hidden])');
                         if(anyCheckoutButton) {
                            console.log("INJECTED_WARN: 'Download Now' not found, found a generic checkout button. Attempting click for tab " + ${tabIdForInjection});
                            anyCheckoutButton.click();
                         } else {
                            console.log("INJECTED_WARN: Could not find 'Download Now' or any other visible checkout button in tab " + ${tabIdForInjection});
                         }
                    }
                  }
                }, 1500);
              }, 700);
            }, 700);
          })(${userEmailForInjection}, ${userZipcodeForInjection});
        `
      });
      console.log(`INFO: ClickDownload: Injected multi-step download script into tab ${tab.id}`);
    } catch (e) {
      console.error(`ERROR: ClickDownload: Failed to inject multi-step download script into tab ${tab.id}:`, e);
    }
  }

  console.log("INFO: ClickDownload: Finished iterating through target tabs for download process.");
  const [finalActiveTabForNotification] = await browser.tabs.query({ active: true, currentWindow: true });
  if (finalActiveTabForNotification && finalActiveTabForNotification.id) {
      await showPageNotification(finalActiveTabForNotification.id, `Download process attempted for ${targetTabs.length} tab(s).`, "success", 4500);
  }
}

async function copyAllKeywordsToClipboard() {
    console.log("INFO: copyAllKeywordsToClipboard: Starting function execution...");
    let notificationTabId = null;
    let activeTab;

    try {
        [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
        if (activeTab && activeTab.id) {
            notificationTabId = activeTab.id;
        }
    } catch (e) {
        console.error("ERROR: copyAllKeywordsToClipboard: Could not get active tab.", e);
        return;
    }

    if (!notificationTabId || !activeTab.url) {
        console.error("ERROR: copyAllKeywordsToClipboard: No active tab or URL found.");
        return;
    }

    const artistPageRegex = /^https?:\/\/[^/.]+\.bandcamp\.com\/(music\/?|[?#]|$)/;

    if (artistPageRegex.test(activeTab.url)) {
        console.log(`INFO: copyAllKeywordsToClipboard: Detected artist page (${activeTab.url}). Starting background fetch process.`);
        await showPageNotification(notificationTabId, "Scanning artist page for releases...", "success", 2000);

        let albumUrls;
        try {
            const results = await browser.tabs.executeScript(notificationTabId, {
                code: `
                    (function() {
                        const links = new Set();
                        document.querySelectorAll('#music-grid li a, .music-grid li a, .item-grid a, .featured-releases a').forEach(a => {
                            if (a.href && (a.href.includes('/album/') || a.href.includes('/track/'))) {
                                links.add(a.href);
                            }
                        });
                        return Array.from(links);
                    })();
                `
            });
            albumUrls = (results && results[0] && Array.isArray(results[0])) ? results[0] : [];
        } catch (e) {
            console.error("ERROR: copyAllKeywordsToClipboard: Failed to inject script to scrape album links.", e);
            await showPageNotification(notificationTabId, "Error scanning page for releases.", "error");
            return;
        }

        if (albumUrls.length === 0) {
            console.log("INFO: copyAllKeywordsToClipboard: No album/track links found on the artist page.");
            await showPageNotification(notificationTabId, "No album or track links found on this page.", "error");
            return;
        }

        await showPageNotification(notificationTabId, `Found ${albumUrls.length} releases. Fetching tags in batches...`, "success", 3000);
        
        const BATCH_SIZE = 10;
        let allKeywordsCollected = [];
        let pagesScanned = 0;

        for (let i = 0; i < albumUrls.length; i += BATCH_SIZE) {
            const batchUrls = albumUrls.slice(i, i + BATCH_SIZE);
            
            const batchPromises = batchUrls.map(url => 
                fetch(url)
                    .then(response => {
                        if (!response.ok) {
                            console.warn(`WARN: Fetch failed for ${url} with status ${response.status}`);
                            return null;
                        }
                        return response.text();
                    })
                    .catch(e => {
                        console.error(`ERROR: Failed to fetch ${url}:`, e);
                        return null;
                    })
            );

            const htmlTexts = await Promise.all(batchPromises);

            for (const htmlText of htmlTexts) {
                if (!htmlText) continue;

                try {
                    const jsonMatch = htmlText.match(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/);
                    if (jsonMatch && jsonMatch[1]) {
                        const jsonData = JSON.parse(jsonMatch[1]);
                        let tempKeywords = [];
                        if (jsonData && jsonData.keywords && Array.isArray(jsonData.keywords)) {
                           tempKeywords = jsonData.keywords;
                       } else if (jsonData && jsonData.albumRelease && Array.isArray(jsonData.albumRelease) && jsonData.albumRelease.length > 0 && jsonData.albumRelease[0].keywords && Array.isArray(jsonData.albumRelease[0].keywords)) {
                           tempKeywords = jsonData.albumRelease[0].keywords;
                       } else if (jsonData && jsonData.byArtist && jsonData.byArtist.keywords && Array.isArray(jsonData.byArtist.keywords)) {
                            tempKeywords = jsonData.byArtist.keywords;
                       } else if (jsonData && jsonData.publisher && jsonData.publisher.keywords && Array.isArray(jsonData.publisher.keywords)) {
                            tempKeywords = jsonData.publisher.keywords;
                       }
                       if (tempKeywords.length > 0) {
                           allKeywordsCollected.push(...tempKeywords.filter(kw => typeof kw === 'string'));
                       }
                    }
                } catch(e) {
                    console.error("ERROR: Failed to parse page content for tags:", e);
                }
            }
            pagesScanned += batchUrls.length;
            console.log(`INFO: Finished batch. Total pages processed so far: ${pagesScanned}/${albumUrls.length}`);
            if (i + BATCH_SIZE < albumUrls.length) {
                await showPageNotification(notificationTabId, `Processed ${pagesScanned}/${albumUrls.length} releases...`, "success", 2000);
            }
            
            if (albumUrls.length > 100 && (i + BATCH_SIZE < albumUrls.length)) {
                console.log(`INFO: copyAllKeywordsToClipboard: More than 100 albums detected. Pausing for 5 seconds between batches.`);
                await showPageNotification(notificationTabId, `Pausing for 5s to avoid errors...`, "success", 4800);
                await new Promise(r => setTimeout(r, 5000));
            }
        }

        console.log(`INFO: copyAllKeywordsToClipboard: Finished all batches. Total keywords collected initially: ${allKeywordsCollected.length}`);

        if (allKeywordsCollected.length === 0) {
            await showPageNotification(notificationTabId, "No keywords found in any releases.", "error");
            return;
        }

        const uniqueKeywords = Array.from(new Set(allKeywordsCollected.map(kw => kw.toLowerCase().trim()).filter(kw => kw)));
        const formattedKeywords = uniqueKeywords.join('; ');
        const copySuccess = await copyTextToClipboard(formattedKeywords);

        if (copySuccess) {
            await showPageNotification(notificationTabId, `All tags from ${albumUrls.length} releases copied!`, "success");
        } else {
            await showPageNotification(notificationTabId, "Failed to copy tags.", "error");
        }

    } else {
        console.log("INFO: copyAllKeywordsToClipboard: Not an artist page. Falling back to method for scanning open tabs.");
        let allKeywordsCollected = [];
        let queriedTabs;
        try {
            queriedTabs = await browser.tabs.query({
                currentWindow: true,
                url: [ "*://*.bandcamp.com/album/*", "*://*.bandcamp.com/track/*" ]
            });
        } catch (e) {
            console.error("ERROR: copyAllKeywordsToClipboard: Failed to query tabs:", e);
            if (notificationTabId) await showPageNotification(notificationTabId, "Error querying tabs.", "error");
            return;
        }
        const activeTabsToProcess = queriedTabs.filter(tab => isActiveTab(tab, "copyAllKeywordsToClipboard"));
        if (activeTabsToProcess.length === 0) {
            if (notificationTabId) await showPageNotification(notificationTabId, "No active Bandcamp tabs found.", "error");
            return;
        }
        for (let tab of activeTabsToProcess) {
            try {
                const results = await browser.tabs.executeScript(tab.id, {
                    code: `
                        (function() {
                            let extractedKeywords = [];
                            try {
                                const ldJsonScript = document.querySelector('script[type="application/ld+json"]');
                                if (ldJsonScript && ldJsonScript.textContent) {
                                    const jsonData = JSON.parse(ldJsonScript.textContent);
                                    let tempKeywords = [];
                                    if (jsonData && jsonData.keywords && Array.isArray(jsonData.keywords)) {
                                        tempKeywords = jsonData.keywords;
                                    } else if (jsonData && jsonData.albumRelease && Array.isArray(jsonData.albumRelease) && jsonData.albumRelease.length > 0 && jsonData.albumRelease[0].keywords && Array.isArray(jsonData.albumRelease[0].keywords)) {
                                        tempKeywords = jsonData.albumRelease[0].keywords;
                                    } else if (jsonData && jsonData.byArtist && jsonData.byArtist.keywords && Array.isArray(jsonData.byArtist.keywords)) {
                                         tempKeywords = jsonData.byArtist.keywords;
                                    } else if (jsonData && jsonData.publisher && jsonData.publisher.keywords && Array.isArray(jsonData.publisher.keywords)) {
                                         tempKeywords = jsonData.publisher.keywords;
                                    }
                                    if (tempKeywords.length > 0) {
                                        extractedKeywords = tempKeywords.filter(kw => typeof kw === 'string');
                                    }
                                }
                            } catch (e) { console.error('INJECTED_SCRIPT_ERROR: Error during keyword extraction:', e.toString()); }
                            return extractedKeywords;
                        })();
                    `
                });
                if (results && results[0] && Array.isArray(results[0]) && results[0].length > 0) {
                    allKeywordsCollected.push(...results[0]);
                }
            } catch (e) {
                console.error('ERROR: copyAllKeywordsToClipboard: Failed to execute script for tab ' + tab.id + ':', e.toString());
            }
        }
        if (allKeywordsCollected.length === 0) {
            if (notificationTabId) await showPageNotification(notificationTabId, "No keywords found to copy.", "error");
            return;
        }
        const uniqueKeywords = Array.from(new Set(allKeywordsCollected.map(kw => kw.toLowerCase().trim()).filter(kw => kw)));
        const formattedKeywords = uniqueKeywords.join('; ');
        const copySuccess = await copyTextToClipboard(formattedKeywords);
        if (notificationTabId) {
            await showPageNotification(notificationTabId, copySuccess ? "Tags copied!" : "Failed to copy tags.", copySuccess ? "success" : "error");
        }
    }
}


// Function to copy titles and URLs based on classification type
async function copyTitlesAndUrls(requestedType) {
    console.log(`INFO: copyTitlesAndUrls: Starting for type "${requestedType}"...`);
    let notificationTabId = null;
    let activeTab;

    try {
        [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
        if (activeTab && activeTab.id) {
            notificationTabId = activeTab.id;
        }
    } catch (e) {
        console.error(`ERROR: copyTitlesAndUrls (${requestedType}): Could not get active tab.`, e);
        return;
    }

    if (!notificationTabId || !activeTab.url) {
        console.error("ERROR: copyTitlesAndUrls: No active tab or URL found.");
        return;
    }

    const artistPageRegex = /^https?:\/\/[^/.]+\.bandcamp\.com\/(music\/?|[?#]|$)/;

    if (artistPageRegex.test(activeTab.url)) {
        console.log(`INFO: copyTitlesAndUrls: Detected artist page (${activeTab.url}). Starting background fetch for type "${requestedType}".`);
        await showPageNotification(notificationTabId, "Scanning artist page for releases...", "success", 2000);

        let albumUrls;
        try {
            const results = await browser.tabs.executeScript(notificationTabId, {
                code: `
                    (function() {
                        const links = new Set();
                        document.querySelectorAll('#music-grid li a, .music-grid li a, .item-grid a, .featured-releases a').forEach(a => {
                            if (a.href && (a.href.includes('/album/') || a.href.includes('/track/'))) {
                                links.add(a.href);
                            }
                        });
                        return Array.from(links);
                    })();
                `
            });
            albumUrls = (results && results[0] && Array.isArray(results[0])) ? results[0] : [];
        } catch (e) {
            console.error(`ERROR: copyTitlesAndUrls: Failed to scrape album links.`, e);
            await showPageNotification(notificationTabId, "Error scanning page for releases.", "error");
            return;
        }

        if (albumUrls.length === 0) {
            await showPageNotification(notificationTabId, "No album or track links found on this page.", "error");
            return;
        }

        await showPageNotification(notificationTabId, `Found ${albumUrls.length} releases. Classifying in batches...`, "success", 3000);
        
        const BATCH_SIZE = 10;
        let outputLines = [];
        let pagesScanned = 0;

        for (let i = 0; i < albumUrls.length; i += BATCH_SIZE) {
            const batchUrls = albumUrls.slice(i, i + BATCH_SIZE);
            
            const batchPromises = batchUrls.map(url => 
                fetch(url)
                    .then(response => response.ok ? response.text() : null)
                    .then(htmlText => ({ url, htmlText }))
                    .catch(e => {
                        console.error(`ERROR: Failed to fetch ${url}:`, e);
                        return { url, htmlText: null };
                    })
            );

            const results = await Promise.all(batchPromises);

            for (const result of results) {
                if (!result.htmlText) continue;

                try {
                    const titleMatch = result.htmlText.match(/<title>(.*?)<\/title>/);
                    const title = titleMatch ? titleMatch[1].trim() : "Untitled";

                    let classification = 'paid';
                    const nypMatch = result.htmlText.match(/<h4[^>]*class="ft compound-button main-button"[^>]*>[\s\S]*?<span[^>]*class="buyItemExtra buyItemNyp secondaryText"[^>]*>([\s\S]*?)<\/span>/i);
                    
                    if (nypMatch && nypMatch[1]) {
                        const txt = nypMatch[1].trim().toLowerCase();
                        if (txt === 'name your price' || txt === 'free download') {
                            classification = 'nyp';
                        }
                    } else {
                        const freeButtonMatch = result.htmlText.match(/<button[^>]*class="download-link buy-link"[^>]*>([\s\S]*?)<\/button>/i);
                        if (freeButtonMatch && freeButtonMatch[1] && freeButtonMatch[1].trim().toLowerCase() === 'free download') {
                           classification = 'free';
                        }
                    }
                    
                    let includePage = false;
                    if (requestedType === 'nypFree' && (classification === 'nyp' || classification === 'free')) {
                        includePage = true;
                    } else if (requestedType === 'paid' && classification === 'paid') {
                        includePage = true;
                    }
                    
                    if (includePage) {
                        outputLines.push(title);
                        outputLines.push(result.url);
                    }
                } catch(e) {
                    console.error("ERROR: Failed to parse content for " + result.url, e);
                }
            }
            pagesScanned += batchUrls.length;
            if (i + BATCH_SIZE < albumUrls.length) {
                await showPageNotification(notificationTabId, `Processed ${pagesScanned}/${albumUrls.length} releases...`, "success", 2000);
            }
            
            if (albumUrls.length > 100 && (i + BATCH_SIZE < albumUrls.length)) {
                console.log(`INFO: copyTitlesAndUrls: More than 100 albums detected. Pausing for 5 seconds between batches.`);
                await showPageNotification(notificationTabId, `Pausing for 5s to avoid errors...`, "success", 4800);
                await new Promise(r => setTimeout(r, 5000));
            }
        }

        if (outputLines.length > 0) {
            const outputString = outputLines.join('\n');
            const copySuccess = await copyTextToClipboard(outputString);
            const typeString = requestedType === 'nypFree' ? 'NYP/Free' : 'Paid';
            await showPageNotification(notificationTabId,
                copySuccess ? `${typeString} info from ${outputLines.length / 2} releases copied!` : `Failed to copy ${typeString} info.`,
                copySuccess ? "success" : "error");
        } else {
            const typeString = requestedType === 'nypFree' ? 'NYP/Free' : 'Paid';
            await showPageNotification(notificationTabId, `No ${typeString} releases found to copy.`, "error");
        }

    } else {
        console.log(`INFO: copyTitlesAndUrls: Not an artist page. Falling back to method for scanning open tabs for type "${requestedType}".`);
        classifications = {};
        let outputLines = [];

        let initiallyQueriedTabs;
        try {
            initiallyQueriedTabs = await browser.tabs.query({
                currentWindow: true,
                url: [ "*://*.bandcamp.com/album/*", "*://*.bandcamp.com/track/*" ]
            });
        } catch (e) {
            console.error(`ERROR: copyTitlesAndUrls (${requestedType}): Failed to query tabs:`, e);
            if (notificationTabId) await showPageNotification(notificationTabId, "Error querying tabs.", "error");
            return;
        }

        const activeTabs = initiallyQueriedTabs.filter(tab => isActiveTab(tab, `copyTitlesAndUrls (${requestedType})`));
        if (!activeTabs.length) {
            if (notificationTabId) await showPageNotification(notificationTabId, "No active Bandcamp tabs found.", "error");
            return;
        }

        for (const tab of activeTabs) {
            try {
                await browser.tabs.executeScript(tab.id, { file: "contentScript.js" });
            } catch (e) {
                console.error(`ERROR: copyTitlesAndUrls (${requestedType}): Failed to inject classification script into tab ${tab.id}:`, e);
            }
        }

        await new Promise(r => setTimeout(r, 700));

        for (const tab of activeTabs) {
            const classification = classifications[tab.id];
            let includeTab = false;

            if (requestedType === 'nypFree' && (classification === 'nyp' || classification === 'free')) {
                includeTab = true;
            } else if (requestedType === 'paid') {
                if (classification !== 'nyp' && classification !== 'free') {
                    includeTab = true;
                }
            }

            if (includeTab) {
                if (tab.title && tab.url) {
                    outputLines.push(tab.title.trim());
                    outputLines.push(tab.url);
                }
            }
        }

        if (outputLines.length > 0) {
            const outputString = outputLines.join('\n');
            const copySuccess = await copyTextToClipboard(outputString);
            if (notificationTabId) {
                const typeString = requestedType === 'nypFree' ? 'NYP/Free' : 'Paid';
                await showPageNotification(notificationTabId,
                    copySuccess ? `${typeString} info copied!` : `Failed to copy ${typeString} info.`,
                    copySuccess ? "success" : "error");
            }
        } else {
            if (notificationTabId) await showPageNotification(notificationTabId, `No ${requestedType === 'nypFree' ? 'NYP/Free' : 'Paid'} info found to copy.`, "error");
        }
    }
}

// Helper function to download an image and its high-resolution (_0) variant
async function downloadImagePair(baseName, imageUrl, tabOrigin) {
    if (!imageUrl) {
        console.log(`INFO: DownloadImages: No URL provided for image type "${baseName}", skipping this pair.`);
        return;
    }

    let absoluteImageUrl = imageUrl;
    if (absoluteImageUrl.startsWith('/')) {
        absoluteImageUrl = tabOrigin + absoluteImageUrl;
    }

    const urlObjForCheck = new URL(absoluteImageUrl);
    const pathPartsForCheck = urlObjForCheck.pathname.split('/');
    const fileNameForCheck = pathPartsForCheck[pathPartsForCheck.length - 1];

    if (fileNameForCheck && fileNameForCheck.toLowerCase().startsWith('blank.')) {
        console.log(`INFO: DownloadImages: Skipping download for "${baseName}" as it appears to be a blank image: ${absoluteImageUrl}`);
        return;
    }

    console.log(`INFO: DownloadImages: Processing image pair for "${baseName}" from URL: ${absoluteImageUrl}`);

    try {
        const urlObj = new URL(absoluteImageUrl);
        const urlPathParts = urlObj.pathname.split('/');
        const originalFileNameWithExt = urlPathParts[urlPathParts.length - 1];

        let originalExtension = 'jpg';
        const dotIndex = originalFileNameWithExt.lastIndexOf('.');
        if (dotIndex > 0 && dotIndex < originalFileNameWithExt.length - 1) {
            originalExtension = originalFileNameWithExt.substring(dotIndex + 1).toLowerCase();
        }

        const filename1 = baseName + "." + originalExtension;
        console.log(`INFO: DownloadImages: Attempting to download (original) ${absoluteImageUrl} as ${filename1}`);
        browser.downloads.download({
            url: absoluteImageUrl,
            filename: filename1,
            conflictAction: 'uniquify'
        }).then(
            (downloadId) => {
                if (downloadId) {
                    console.log(`INFO: DownloadImages: Download (original ${baseName}) started with ID: ${downloadId} for ${filename1}`);
                } else {
                    const error = browser.runtime.lastError;
                    console.warn(`WARN: DownloadImages: Download (original ${baseName}) for ${filename1} did not start. Error: ${error ? error.message : 'Unknown'}`);
                }
            },
            (error) => console.error(`ERROR: DownloadImages: Download (original ${baseName}) failed for ${filename1}:`, error.toString())
        );

        const fileNameNoExt = (dotIndex > 0) ? originalFileNameWithExt.substring(0, dotIndex) : originalFileNameWithExt;
        const lastUnderscoreIdx = fileNameNoExt.lastIndexOf('_');

        if (lastUnderscoreIdx === -1 || lastUnderscoreIdx === 0 || lastUnderscoreIdx === fileNameNoExt.length - 1) {
            console.warn(`WARN: DownloadImages: For "${baseName}", filename part "${fileNameNoExt}" does not match expected 'identifier_digits' structure for a _0 version. Skipping _0 download.`);
            return;
        }

        const number1Part = fileNameNoExt.substring(0, lastUnderscoreIdx);
        const baseImgDomainPath = urlObj.protocol + '//' + urlObj.hostname + (urlObj.port ? ':' + urlObj.port : '') + urlPathParts.slice(0, -1).join('/') + '/';
        const highResImageUrl = baseImgDomainPath + number1Part + "_0";

        let detectedExtension = 'jpg';

        try {
            console.log(`INFO: DownloadImages: Fetching headers/type for ${highResImageUrl} (${baseName}_orig)`);
            let response = await fetch(highResImageUrl, { method: 'HEAD' });
            let contentType = response.headers.get('Content-Type');

            if (!response.ok || !contentType || !contentType.startsWith('image/')) {
                console.warn(`WARN: DownloadImages: HEAD request for ${highResImageUrl} (${baseName}_orig) failed (${response.status}) or no valid image Content-Type. Trying GET.`);
                response = await fetch(highResImageUrl);
                if (response.ok) {
                    const blob = await response.blob();
                    contentType = blob.type;
                } else {
                    console.error(`ERROR: DownloadImages: GET request for ${highResImageUrl} (${baseName}_orig) also failed (${response.status}). Using default extension.`);
                    contentType = null;
                }
            }

            if (contentType && contentType.startsWith('image/')) {
                detectedExtension = getExtensionFromMimeType(contentType);
                 console.log(`INFO: DownloadImages: Detected Content-Type "${contentType}", using extension ".${detectedExtension}" for ${baseName}_orig.`);
            } else {
                 console.warn(`WARN: DownloadImages: Could not determine valid Content-Type for ${highResImageUrl} (${baseName}_orig). Using default extension '.${detectedExtension}'. Found: ${contentType}`);
            }
        } catch (fetchError) {
            console.error(`ERROR: DownloadImages: Network error for ${highResImageUrl} (${baseName}_orig). Using default extension '.${detectedExtension}'. Error:`, fetchError);
        }

        const filename2 = baseName + "_orig." + detectedExtension;

        console.log(`INFO: DownloadImages: Attempting to download (_0 version) ${highResImageUrl} as ${filename2}`);
        browser.downloads.download({
            url: highResImageUrl,
            filename: filename2,
            conflictAction: 'uniquify'
        }).then(
            (downloadId) => {
                 if (downloadId) {
                    console.log(`INFO: DownloadImages: Download (_0 ${baseName}) started with ID: ${downloadId} for ${filename2}`);
                } else {
                    const error = browser.runtime.lastError;
                    console.warn(`WARN: DownloadImages: Download (_0 ${baseName}) for ${filename2} did not start. Error: ${error ? error.message : 'Unknown'}`);
                }
            },
            (error) => console.error(`ERROR: DownloadImages: Download (_0 ${baseName}) failed for ${filename2}:`, error.toString())
        );

    } catch (e) {
        console.error(`ERROR: DownloadImages: Unexpected error processing image pair for "${baseName}" from URL ${absoluteImageUrl}:`, e);
    }
}

// Main function to download images from the current Bandcamp page
async function downloadBandcampPageImage(tab) {
    if (!tab || !tab.id) {
        console.error("ERROR: DownloadImages: Invalid tab object provided.");
        return;
    }

    const tabUrl = tab.url;
    let isValidPageType = false;
    if (tabUrl) {
        const mainPagePattern = /^https?:\/\/[^/.]+\.bandcamp\.com\/?(?:[?#]|$)/;
        const musicPagePattern = /^https?:\/\/[^/.]+\.bandcamp\.com\/music(?:[?#]|$)/;
        const albumPagePattern = /bandcamp\.com\/album\//;
        const trackPagePattern = /bandcamp\.com\/track\//;

        if (albumPagePattern.test(tabUrl) || trackPagePattern.test(tabUrl) || musicPagePattern.test(tabUrl) || mainPagePattern.test(tabUrl)) {
            if (tabUrl.match(/^https?:\/\/bandcamp\.com\/?(?:[?#]|$)/) ||
                tabUrl.includes("/discover") || tabUrl.includes("/feed") ||
                tabUrl.includes("/tags") || tabUrl.includes("/artists") ||
                (mainPagePattern.test(tabUrl) && (tabUrl.includes("/followers") || tabUrl.includes("/following")))) {
                isValidPageType = false;
                if (albumPagePattern.test(tabUrl) || trackPagePattern.test(tabUrl) || musicPagePattern.test(tabUrl) ||
                    (mainPagePattern.test(tabUrl) && !tabUrl.match(/^https?:\/\/bandcamp\.com\//) && !tabUrl.includes("/followers") && !tabUrl.includes("/following"))) {
                    isValidPageType = true;
                }
            } else {
                isValidPageType = true;
            }
        }
    }

    if (!isValidPageType) {
        console.log(`INFO: DownloadImages: Tab ${tab.id} (${tabUrl}) is not a targeted Bandcamp page (specific artist page, /music, album, or track).`);
        await showPageNotification(tab.id, "Not a suitable page for image download.", "error");
        return;
    }

    console.log(`INFO: DownloadImages: Processing tab ID ${tab.id}, URL: ${tabUrl}`);
    await showPageNotification(tab.id, "Scanning page for images...", "success", 2000);

    let imageUrls;
    try {
        const results = await browser.tabs.executeScript(tab.id, {
            code: `
                (function() {
                    const data = { popupImageUrl: null, customHeaderUrl: null, backgroundImageUrl: null };
                    const popupLink = document.querySelector('a.popupImage');
                    if (popupLink?.href) {
                        data.popupImageUrl = popupLink.href;
                    } else {
                        const bioPicImg = document.querySelector('#bio-container .popupImage img, .band-photo');
                        if (bioPicImg?.src) data.popupImageUrl = bioPicImg.src;
                    }
                    const headerImg = document.querySelector('#customHeader img');
                    if (headerImg?.src) {
                        data.customHeaderUrl = headerImg.src;
                    }
                    const styleTag = document.querySelector('style#custom-design-rules-style');
                    if (styleTag?.textContent) {
                        const cssText = styleTag.textContent;
                        const bgImageRegex = /background-image:\\s*url\\((['"]?)(.*?)\\1\\)/i;
                        const match = cssText.match(bgImageRegex);
                        if (match && match[2]) {
                            data.backgroundImageUrl = match[2].trim();
                            console.log('INJECTED_SCRIPT_INFO: Found background image URL:', data.backgroundImageUrl);
                        } else {
                            console.log('INJECTED_SCRIPT_INFO: No background image URL found with your regex.');
                        }
                    } else {
                        console.log('INJECTED_SCRIPT_INFO: style#custom-design-rules-style tag not found or has no content.');
                    }
                    return data;
                })();
            `
        });
        if (results && results.length > 0 && results[0]) {
            imageUrls = results[0];
        }
    } catch (e) {
        console.error(`ERROR: DownloadImages: Failed to execute script on tab ${tab.id} to get image URLs:`, e);
        await showPageNotification(tab.id, "Error extracting image URLs from page.", "error");
        return;
    }

    if (!imageUrls || (!imageUrls.popupImageUrl && !imageUrls.customHeaderUrl && !imageUrls.backgroundImageUrl)) {
        console.log(`INFO: DownloadImages: No target images (Artist, Header, or Background) found on tab ${tab.id} (${tabUrl}).`);
        await showPageNotification(tab.id, "No downloadable images found on this page.", "error");
        return;
    }

    const tabOrigin = new URL(tabUrl).origin;
    let downloadsAttempted = 0;

    if (imageUrls.popupImageUrl) {
        await downloadImagePair("Artist Photo", imageUrls.popupImageUrl, tabOrigin);
        downloadsAttempted++;
    } else {
        console.log("INFO: DownloadImages: No 'Artist Photo' found to download.");
    }

    if (imageUrls.customHeaderUrl) {
        await downloadImagePair("Custom Header", imageUrls.customHeaderUrl, tabOrigin);
        downloadsAttempted++;
    } else {
        console.log("INFO: DownloadImages: No 'Custom Header' image found to download.");
    }

    if (imageUrls.backgroundImageUrl) {
        await downloadImagePair("Background Image", imageUrls.backgroundImageUrl, tabOrigin);
        downloadsAttempted++;
    } else {
        console.log("INFO: DownloadImages: No 'Background Image' from style tag found to download.");
    }

    if (downloadsAttempted > 0) {
        await showPageNotification(tab.id, `${downloadsAttempted} image download process(es) initiated.`, "success", 3500);
    } else if (imageUrls && (imageUrls.popupImageUrl || imageUrls.customHeaderUrl || imageUrls.backgroundImageUrl)) {
        await showPageNotification(tab.id, "Images found were skipped (e.g., blank images).", "success", 3000);
    }
}

async function downloadAllAlbumCovers() {
    console.log("INFO: downloadAllAlbumCovers: Starting function execution...");
    let activeTab;
    try {
        [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
    } catch (e) {
        console.error("ERROR: downloadAllAlbumCovers: Could not get active tab.", e);
        return;
    }

    if (!activeTab || !activeTab.id || !activeTab.url) {
        console.error("ERROR: downloadAllAlbumCovers: No active tab or URL found.");
        return;
    }

    const artistPageRegex = /^https?:\/\/([^\/]+)\.bandcamp\.com\/(music\/?|[?#]|$)/;
    const urlMatch = activeTab.url.match(artistPageRegex);

    if (!urlMatch) {
        console.log(`INFO: downloadAllAlbumCovers: Active tab (${activeTab.url}) is not a main artist page.`);
        await showPageNotification(activeTab.id, "This feature works on an artist's main or /music page.", "error");
        return;
    }

    let artistName;
    try {
        const results = await browser.tabs.executeScript(activeTab.id, {
            code: `(function() { const el = document.querySelector('.band-name, #band-name, span.title'); return el ? el.textContent.trim() : null; })();`
        });
        if (results && results[0]) {
            artistName = results[0];
            console.log(`INFO: downloadAllAlbumCovers: Found artist name from page: "${artistName}"`);
        }
    } catch (e) {
        console.error("ERROR: downloadAllAlbumCovers: Failed to inject script to get artist name.", e);
    }

    if (!artistName) {
        artistName = urlMatch[1];
        console.log(`INFO: downloadAllAlbumCovers: Falling back to subdomain for artist name: "${artistName}"`);
    }

    const folderName = sanitizeFilename(artistName) + " - Album Covers";

    await showPageNotification(activeTab.id, `Scanning artist page for covers...`, "success", 2500);

    let releaseUrls;
    try {
        const results = await browser.tabs.executeScript(activeTab.id, {
            code: `(function() { const links = new Set(); document.querySelectorAll('#music-grid li a, .music-grid li a, .item-grid a, .featured-releases a').forEach(a => { if (a.href && (a.href.includes('/album/') || a.href.includes('/track/'))) { links.add(a.href); } }); return Array.from(links); })();`
        });
        releaseUrls = (results && results[0] && Array.isArray(results[0])) ? results[0] : [];
    } catch (e) {
        console.error("ERROR: downloadAllAlbumCovers: Failed to scrape release links.", e);
        await showPageNotification(activeTab.id, "Error scanning page for releases.", "error");
        return;
    }

    if (releaseUrls.length === 0) {
        await showPageNotification(activeTab.id, "No release links found on this page.", "error");
        return;
    }

    await showPageNotification(activeTab.id, `Found ${releaseUrls.length} releases. Fetching covers...`, "success", 3000);
    
    let downloadsInitiated = 0;
    const BATCH_SIZE = 5;

    for (let i = 0; i < releaseUrls.length; i += BATCH_SIZE) {
        const batchUrls = releaseUrls.slice(i, i + BATCH_SIZE);
        
        const batchPromises = batchUrls.map(async (url) => {
            try {
                const response = await fetch(url);
                if (!response.ok) return null;
                const htmlText = await response.text();

                // Extract title
                const titleMatch = htmlText.match(/<title>(.*?)<\/title>/);
                const pageTitle = titleMatch ? titleMatch[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"') : "Untitled";
                const sanitizedAlbumTitle = sanitizeFilename(pageTitle);

                // Extract cover art URL using regex
                const coverLinkMatch = htmlText.match(/<a class="popupImage" href="([^"]+)">/);
                if (!coverLinkMatch || !coverLinkMatch[1]) {
                     console.warn(`WARN: No cover found for ${url}`);
                     return null;
                }
                const baseImageUrl = coverLinkMatch[1];

                // Construct high-res URL
                const urlObj = new URL(baseImageUrl);
                const urlPathParts = urlObj.pathname.split('/');
                const originalFileNameWithExt = urlPathParts[urlPathParts.length - 1];
                const dotIndex = originalFileNameWithExt.lastIndexOf('.');
                const fileNameNoExt = (dotIndex > 0) ? originalFileNameWithExt.substring(0, dotIndex) : originalFileNameWithExt;
                const lastUnderscoreIdx = fileNameNoExt.lastIndexOf('_');

                if (lastUnderscoreIdx === -1) {
                     console.warn(`WARN: Cannot find '_' in filename to create _0 version for ${url}. Downloading base image.`);
                     // Fallback to downloading the base image if _0 logic fails
                     const fallbackExtMatch = baseImageUrl.match(/\.([^.]+)$/);
                     const fallbackExt = fallbackExtMatch ? fallbackExtMatch[1] : 'jpg';
                     const fallbackFilename = `${folderName}/${sanitizedAlbumTitle}.${fallbackExt}`;
                      browser.downloads.download({ url: baseImageUrl, filename: fallbackFilename, conflictAction: 'uniquify' })
                        .then(id => { if (id) downloadsInitiated++; });
                     return;
                }

                const numberPart = fileNameNoExt.substring(0, lastUnderscoreIdx);
                const baseImgDomainPath = urlObj.protocol + '//' + urlObj.hostname + (urlObj.port ? ':' + urlObj.port : '') + urlPathParts.slice(0, -1).join('/') + '/';
                const highResImageUrl = baseImgDomainPath + numberPart + "_0";

                // Determine file extension
                let detectedExtension = 'jpg';
                 try {
                    let headResponse = await fetch(highResImageUrl, { method: 'HEAD' });
                    let contentType = headResponse.headers.get('Content-Type');
                    if (!headResponse.ok || !contentType || !contentType.startsWith('image/')) {
                        let getResponse = await fetch(highResImageUrl);
                        if (getResponse.ok) {
                            const blob = await getResponse.blob();
                            contentType = blob.type;
                        }
                    }
                    if (contentType && contentType.startsWith('image/')) {
                        detectedExtension = getExtensionFromMimeType(contentType);
                    }
                } catch (fetchError) {
                    console.error(`ERROR: Network error determining extension for ${highResImageUrl}. Defaulting.`, fetchError);
                }
                
                // Download
                const finalFilename = `${folderName}/${sanitizedAlbumTitle}.${detectedExtension}`;
                browser.downloads.download({
                    url: highResImageUrl,
                    filename: finalFilename,
                    conflictAction: 'uniquify'
                }).then(
                    (id) => { if (id) downloadsInitiated++; },
                    (err) => console.error(`ERROR: Download failed for ${finalFilename}:`, err)
                );

            } catch (e) {
                console.error(`ERROR: Failed processing URL ${url}:`, e);
            }
        });

        await Promise.all(batchPromises);
        await showPageNotification(activeTab.id, `Processed ${i + batchUrls.length}/${releaseUrls.length}...`, "success", 2000);

        if (releaseUrls.length > 100 && (i + BATCH_SIZE < releaseUrls.length)) {
            console.log(`INFO: downloadAllAlbumCovers: More than 100 albums detected. Pausing for 5 seconds between batches.`);
            await showPageNotification(activeTab.id, `Pausing for 5s to avoid errors...`, "success", 4800);
            await new Promise(r => setTimeout(r, 5000));
        }
    }
    
    // Final notification
    setTimeout(async () => {
         await showPageNotification(activeTab.id, `Cover download process complete. Check your downloads.`, "success", 4000);
    }, 1000);
}

async function copyDownloadPageLinks() {
    console.log("INFO: copyDownloadPageLinks: Starting function execution...");
    let collectedLinks = [];
    let notificationTabId = null;

    try {
        const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
        if (activeTab && activeTab.id) {
            notificationTabId = activeTab.id;
        }
    } catch(e) {
        console.error("ERROR: copyDownloadPageLinks: Could not get active tab for notifications.", e);
    }

    let downloadPageTabs;
    try {
        downloadPageTabs = await browser.tabs.query({
            currentWindow: true,
            url: "https://bandcamp.com/download?*" // Specific URL pattern
        });
    } catch (e) {
        console.error("ERROR: copyDownloadPageLinks: Failed to query tabs:", e);
        if (notificationTabId) await showPageNotification(notificationTabId, "Error querying download tabs.", "error");
        return;
    }

    console.log(`INFO: copyDownloadPageLinks: Initially queried ${downloadPageTabs.length} tabs matching "https://bandcamp.com/download?*".`);
    const activeDownloadPageTabs = downloadPageTabs.filter(tab => isActiveTab(tab, "copyDownloadPageLinks"));
    console.log(`INFO: copyDownloadPageLinks: After filtering, processing ${activeDownloadPageTabs.length} active tabs.`);

    if (activeDownloadPageTabs.length === 0) {
        console.log("INFO: copyDownloadPageLinks: No active Bandcamp download pages found.");
        if (notificationTabId) await showPageNotification(notificationTabId, "No Bandcamp download pages found.", "error");
        return;
    }

    for (const tab of activeDownloadPageTabs) {
        if (!tab.id) {
            console.warn(`WARN: copyDownloadPageLinks: Tab (URL: ${tab.url}) has no ID, skipping.`);
            continue;
        }
        try {
            const results = await browser.tabs.executeScript(tab.id, {
                code: `
                    (function() {
                        const downloadLinkElement = document.querySelector('a[data-bind="attr: { href: downloadUrl }, visible: downloadReady() && !downloadError()"]');
                        if (downloadLinkElement && downloadLinkElement.href) {
                            return downloadLinkElement.href;
                        }
                        const genericDownloadLink = Array.from(document.querySelectorAll('a')).find(a => a.textContent.trim().toLowerCase() === 'download' && a.href.includes('bcbits.com/download/'));
                        if (genericDownloadLink && genericDownloadLink.href) {
                             console.log("INJECTED_SCRIPT_WARN: Used fallback selector for download link in tab " + ${tab.id});
                             return genericDownloadLink.href;
                        }
                        return null;
                    })();
                `
            });

            if (results && results[0]) {
                collectedLinks.push(results[0]);
                console.log(`INFO: copyDownloadPageLinks: Extracted link ${results[0]} from tab ${tab.id}`);
            } else {
                console.log(`INFO: copyDownloadPageLinks: No download link found in tab ${tab.id}`);
            }
        } catch (e) {
            console.error(`ERROR: copyDownloadPageLinks: Failed to execute script or process results for tab ${tab.id}:`, e.toString());
        }
    }

    if (collectedLinks.length === 0) {
        console.log("INFO: copyDownloadPageLinks: No download links were collected from any tabs.");
        if (notificationTabId) await showPageNotification(notificationTabId, "No final download links found.", "error");
        return;
    }

    const formattedLinks = collectedLinks.join('\n');
    console.log("INFO: copyDownloadPageLinks: Formatted links for clipboard:\n", formattedLinks);

    const copySuccess = await copyTextToClipboard(formattedLinks);

    if (notificationTabId) {
        if (copySuccess) {
            await showPageNotification(notificationTabId, `${collectedLinks.length} final download link(s) copied!`, "success");
        } else {
            await showPageNotification(notificationTabId, "Failed to copy final download links.", "error");
        }
    }
}

async function copyReleasesLinks() {
    console.log("INFO: copyReleasesLinks: Starting function execution...");
    let activeTab;

    try {
        [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
    } catch (e) {
        console.error("ERROR: copyReleasesLinks: Could not get active tab.", e);
        return;
    }

    if (!activeTab || !activeTab.id || !activeTab.url) {
        console.error("ERROR: copyReleasesLinks: No active tab or URL found.");
        return;
    }

    const artistPageRegex = /^https?:\/\/([^\/]+)\.bandcamp\.com\/(music\/?|[?#]|$)/;
    const urlMatch = activeTab.url.match(artistPageRegex);

    if (!urlMatch) {
        console.log(`INFO: copyReleasesLinks: Active tab (${activeTab.url}) is not an artist page.`);
        await showPageNotification(activeTab.id, "This feature only works on an artist's main page.", "error");
        return;
    }

    const settings = await browser.storage.local.get({ saFormatEnabled: false });

    await showPageNotification(activeTab.id, "Scanning artist page for all release links...", "success", 2000);

    let releaseUrls;
    try {
        const results = await browser.tabs.executeScript(activeTab.id, {
            code: `
                (function() {
                    const links = new Set();
                    document.querySelectorAll('#music-grid li a, .music-grid li a, .item-grid a, .featured-releases a').forEach(a => {
                        if (a.href && (a.href.includes('/album/') || a.href.includes('/track/'))) {
                            links.add(a.href);
                        }
                    });
                    return Array.from(links);
                })();
            `
        });
        releaseUrls = (results && results[0] && Array.isArray(results[0])) ? results[0] : [];
    } catch (e) {
        console.error("ERROR: copyReleasesLinks: Failed to inject script to scrape release links.", e);
        await showPageNotification(activeTab.id, "Error scanning page for releases.", "error");
        return;
    }

    if (releaseUrls.length === 0) {
        console.log("INFO: copyReleasesLinks: No album/track links found on the artist page.");
        await showPageNotification(activeTab.id, "No release links found on this page.", "error");
        return;
    }

    let outputString;

    if (settings.saFormatEnabled) {
        let artistName;
        try {
            const results = await browser.tabs.executeScript(activeTab.id, {
                code: `(function() { const el = document.querySelector('.band-name, #band-name, span.title'); return el ? el.textContent.trim() : null; })();`
            });
            if (results && results[0]) {
                artistName = results[0];
            }
        } catch (e) { console.error("Could not get artist name for SA format", e); }
        if (!artistName) {
            artistName = urlMatch[1]; // Fallback to subdomain
        }

        const artistLine = `${artistName}:`;
        const pageLine = `\t${activeTab.url}:`;
        const releaseLines = releaseUrls.map(url => `\t\t${url}`).join('\n');
        outputString = `${artistLine}\n${pageLine}\n${releaseLines}`;

    } else {
        outputString = releaseUrls.join('\n');
    }
    
    const copySuccess = await copyTextToClipboard(outputString);

    if (copySuccess) {
        await showPageNotification(activeTab.id, `${releaseUrls.length} release link(s) copied!`, "success");
    } else {
        await showPageNotification(activeTab.id, "Failed to copy release links.", "error");
    }
}

async function copyReleasesAndTitles() {
    console.log("INFO: copyReleasesAndTitles: Starting function execution...");
    let activeTab;
    try {
        [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
    } catch (e) {
        console.error("ERROR: copyReleasesAndTitles: Could not get active tab.", e);
        return;
    }

    if (!activeTab || !activeTab.id || !activeTab.url) {
        console.error("ERROR: copyReleasesAndTitles: No active tab or URL found.");
        return;
    }

    const artistPageRegex = /^https?:\/\/[^/.]+\.bandcamp\.com\/(music\/?|[?#]|$)/;

    if (!artistPageRegex.test(activeTab.url)) {
        console.log(`INFO: copyReleasesAndTitles: Active tab (${activeTab.url}) is not an artist page.`);
        await showPageNotification(activeTab.id, "This feature only works on an artist's main page.", "error");
        return;
    }

    await showPageNotification(activeTab.id, "Scanning page for release titles and links...", "success", 2000);

    let releases;
    try {
        const results = await browser.tabs.executeScript(activeTab.id, {
            code: `
                (function() {
                    const releaseData = [];
                    const mainArtistEl = document.querySelector('#band-name-location span.title, #band-name, .band-name');
                    const mainArtist = mainArtistEl ? mainArtistEl.textContent.trim() : '';
                    
                    const links = document.querySelectorAll('#music-grid li a, .music-grid li a, .item-grid a, .featured-releases a');
                    
                    links.forEach(a => {
                        if (!a.href || !(a.href.includes('/album/') || a.href.includes('/track/'))) {
                            return;
                        }

                        const titleEl = a.querySelector('p.title, .item_link_title');
                        if (!titleEl) {
                            return;
                        }

                        let releaseTitle;
                        let releaseArtist;
                        
                        const artistOverrideEl = titleEl.querySelector('span.artist-override');

                        if (artistOverrideEl) {
                            releaseArtist = artistOverrideEl.textContent.trim();
                            const tempTitleEl = titleEl.cloneNode(true);
                            tempTitleEl.querySelector('span.artist-override').remove();
                            releaseTitle = tempTitleEl.textContent.trim();
                        } else {
                            releaseTitle = titleEl.textContent.trim();
                            releaseArtist = mainArtist;
                        }
                        
                        const formattedTitle = releaseArtist ? \`\${releaseTitle} | \${releaseArtist}\` : releaseTitle;

                        if (!releaseData.some(r => r.url === a.href)) {
                            releaseData.push({ title: formattedTitle, url: a.href });
                        }
                    });
                    return releaseData;
                })();
            `
        });
        releases = (results && results[0] && Array.isArray(results[0])) ? results[0] : [];
    } catch (e) {
        console.error("ERROR: copyReleasesAndTitles: Failed to inject script to scrape release info.", e);
        await showPageNotification(activeTab.id, "Error scanning page for releases.", "error");
        return;
    }

    if (releases.length === 0) {
        console.log("INFO: copyReleasesAndTitles: No album/track links found on the artist page.");
        await showPageNotification(activeTab.id, "No release links found on this page.", "error");
        return;
    }
    
    const outputString = releases.map(r => `${r.title}\n${r.url}`).join('\n');
    
    const copySuccess = await copyTextToClipboard(outputString);

    if (copySuccess) {
        await showPageNotification(activeTab.id, `${releases.length} release titles & links copied!`, "success");
    } else {
        await showPageNotification(activeTab.id, "Failed to copy release info.", "error");
    }
}

async function copyTextToClipboard(text) {
    try { if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') { await navigator.clipboard.writeText(text); console.log('SUCCESS: Text successfully copied to clipboard using navigator.clipboard!'); return true; } } catch (err) { console.warn('WARN: navigator.clipboard.writeText failed, trying fallback:', err); }
    console.log('INFO: Attempting to copy to clipboard using document.execCommand fallback.');
    const bgPage = browser.extension.getBackgroundPage(); if (!bgPage || !bgPage.document || !bgPage.document.body) { console.error("ERROR: Background page document context not available for execCommand fallback."); return false; }
    const textarea = bgPage.document.createElement('textarea'); textarea.style.position = 'fixed'; textarea.style.top = '-9999px'; textarea.style.left = '-9999px'; textarea.value = text;
    bgPage.document.body.appendChild(textarea); textarea.focus(); textarea.select(); let successful = false;
    try { successful = bgPage.document.execCommand('copy'); if (successful) { console.log('SUCCESS: Text successfully copied to clipboard using execCommand!'); } else { console.error('ERROR: document.execCommand("copy") was not successful.'); } } catch (err) { console.error('ERROR: Error during document.execCommand("copy"):', err); successful = false; } finally { if (textarea.parentNode === bgPage.document.body) { bgPage.document.body.removeChild(textarea); } }
    return successful;
}

browser.runtime.onInstalled.addListener(async (details) => {
  console.log("INFO: background.js: onInstalled listener triggered. Attempting to create context menus and set default settings.");

  try {
    const currentSettings = await browser.storage.local.get("notificationsEnabled");
    if (typeof currentSettings.notificationsEnabled === 'undefined') {
      await browser.storage.local.set({ notificationsEnabled: true });
      console.log("INFO: background.js: Default notification setting (enabled: true) applied.");
    }
  } catch (e) {
    console.error("ERROR: background.js: Failed to set default notification setting:", e);
  }

  try {
    browser.contextMenus.create({ id: "bandcamp-tools", title: "Bandcamp Tools", contexts: ["page", "image"], documentUrlPatterns: ["*://*.bandcamp.com/*"] });
    browser.contextMenus.create({ id: "sort-tabs", parentId: "bandcamp-tools", title: "Sort Tabs (Paid Left, Free Right)", contexts: ["page"], documentUrlPatterns: ["*://*.bandcamp.com/*"] });
    browser.contextMenus.create({ id: "click-download", parentId: "bandcamp-tools", title: "Download (NYP/Free)", contexts: ["page"], documentUrlPatterns: ["*://*.bandcamp.com/*"] });
    browser.contextMenus.create({ id: "copy-keywords", parentId: "bandcamp-tools", title: "Copy Tags", contexts: ["page"], documentUrlPatterns: ["*://*.bandcamp.com/*"] });
    browser.contextMenus.create({ id: "copy-nyp-titles-urls", parentId: "bandcamp-tools", title: "Copy NYP/Free Titles & URLs", contexts: ["page"], documentUrlPatterns: ["*://*.bandcamp.com/*"] });
    browser.contextMenus.create({ id: "copy-paid-titles-urls", parentId: "bandcamp-tools", title: "Copy Paid Titles & URLs", contexts: ["page"], documentUrlPatterns: ["*://*.bandcamp.com/*"] });
    browser.contextMenus.create({ id: "copy-releases-links", parentId: "bandcamp-tools", title: "Copy Releases Links", contexts: ["page"], documentUrlPatterns: ["*://*.bandcamp.com/*"] });
    browser.contextMenus.create({ id: "download-album-covers", parentId: "bandcamp-tools", title: "Download Album Covers", contexts: ["page"], documentUrlPatterns: ["*://*.bandcamp.com/*"] });
    browser.contextMenus.create({ id: "download-images", parentId: "bandcamp-tools", title: "Download Images (Artist, Header, BG)", contexts: ["page", "image"], documentUrlPatterns: [ "*://*.bandcamp.com/album/*", "*://*.bandcamp.com/track/*", "*://*.bandcamp.com/music", "*://*.bandcamp.com/music?*", "*://*.bandcamp.com/" ] });
    console.log("INFO: background.js: All context menus registration attempt complete.");
  } catch (e) { console.error("ERROR: background.js: Major failure during context menu creation in onInstalled:", e); }
});

browser.contextMenus.onClicked.addListener(async (info, tab) => {
  console.log(`INFO: Context menu item clicked: ${info.menuItemId}`);
  let targetTab = tab;

  async function getTargetTabForNotification(currentContextTab) {
      if (currentContextTab && currentContextTab.id && isActiveTab(currentContextTab, "ContextMenuAction")) {
          return currentContextTab;
      }
      const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (activeTab && activeTab.id && isActiveTab(activeTab, "ContextMenuActionFallback")) {
          return activeTab;
      }
      return null;
  }

  let notificationTab = await getTargetTabForNotification(targetTab);

  switch (info.menuItemId) {
    case "sort-tabs":
      await sortTabsAcrossWindow();
      break;
    case "click-download":
      await clickDownloadAllNonPaid();
      break;
    case "copy-keywords":
      await copyAllKeywordsToClipboard();
      break;
    case "copy-nyp-titles-urls":
      await copyTitlesAndUrls('nypFree');
      break;
    case "copy-paid-titles-urls":
      await copyTitlesAndUrls('paid');
      break;
    case "copy-releases-links":
        await copyReleasesLinks();
        break;
    case "download-album-covers":
        await downloadAllAlbumCovers();
        break;
    case "download-images":
      if (notificationTab) {
          downloadBandcampPageImage(notificationTab);
      } else {
          console.log("INFO: DownloadImages (Context Menu): No suitable tab found for image download.");
          await showPageNotification(null, "No suitable Bandcamp tab found.", "error");
      }
      break;
    case "copy-download-page-links":
        await copyDownloadPageLinks();
        break;      
    default:
      console.warn(`WARN: Unknown context menu item ID: ${info.menuItemId}`);
  }
});

browser.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    if (message.type === 'classification' && sender.tab?.id != null) {
        classifications[sender.tab.id] = message.value;
    }
    else if (message.action) {
        console.log(`INFO: Action received from popup: ${message.action}`);
        switch (message.action) {
            case "sortTabs":
                await sortTabsAcrossWindow();
                break;
            case "clickDownload":
                await clickDownloadAllNonPaid();
                break;
            case "copyKeywords":
                await copyAllKeywordsToClipboard();
                break;
            case "copyNypTitlesUrls":
                await copyTitlesAndUrls('nypFree');
                break;
            case "copyPaidTitlesUrls":
                await copyTitlesAndUrls('paid');
                break;
            case "downloadImages":
                try {
                    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
                    if (tabs.length > 0 && tabs[0].id && isActiveTab(tabs[0], "DownloadImagesPopup")) {
                        downloadBandcampPageImage(tabs[0]);
                    } else {
                        console.log("INFO: DownloadImages (Popup): No suitable active tab found.");
                        await showPageNotification(null, "No active Bandcamp tab found.", "error");
                    }
                } catch (err) {
                     console.error("ERROR: DownloadImages (Popup): Error querying active tab:", err);
                     await showPageNotification(null, "Error finding active tab.", "error");
                }
                break;
            case "downloadAlbumCovers":
                await downloadAllAlbumCovers();
                break;
            case "copyReleasesLinks":
                await copyReleasesLinks();
                break;
            case "copyReleasesAndTitles":
                await copyReleasesAndTitles();
                break;
            case "copyDownloadPageLinks": 
                await copyDownloadPageLinks();
                break;
            default:
                console.warn(`WARN: Unknown action received from popup: ${message.action}`);
        }
    }
    return false;
});