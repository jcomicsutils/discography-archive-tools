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

                toast.offsetHeight; 

                requestAnimationFrame(() => {
                    toast.classList.add('show');
                });

                toast.showTimeout = setTimeout(() => {
                    toast.classList.remove('show');
                    toast.hideTimeout = setTimeout(() => {
                        if (toast && toast.parentNode && !toast.classList.contains('show')) {
                            toast.parentNode.removeChild(toast);
                        }
                    }, 550); 
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
    // Attempt to show error on the current active tab if query fails
    const [activeTabForError] = await browser.tabs.query({ active: true, currentWindow: true });
    if (activeTabForError && activeTabForError.id) {
        await showPageNotification(activeTabForError.id, "Error querying tabs for download.", "error");
    }
    return;
  }

  console.log(`INFO: ClickDownload: Initially queried ${initiallyQueriedTabs.length} tabs.`);
  const activeTabs = initiallyQueriedTabs.filter(tab => isActiveTab(tab, "ClickDownload")); // Assumes isActiveTab is defined
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
  // Show initial notification on the current active tab
  const [currentActiveTabForStartNotification] = await browser.tabs.query({ active: true, currentWindow: true });
  if (currentActiveTabForStartNotification && currentActiveTabForStartNotification.id) {
      await showPageNotification(currentActiveTabForStartNotification.id, `Starting download process for ${targetTabs.length} NYP/Free tab(s)...`, "success", 3500);
  }

  let savedSettings = {};
  try {
      savedSettings = await browser.storage.local.get(['email', 'zipcode']);
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
                  let okButtonClicked = false; // Flag to track if "OK" was clicked after email prompt

                  if (emailAddressInput && (getComputedStyle(emailAddressInput).display !== 'none' && emailAddressInput.offsetParent !== null)) {
                    // Email prompt is visible
                    console.log("INJECTED_INFO: Email input field is present for tab " + ${tabIdForInjection});
                    if (savedUserEmail) {
                        emailAddressInput.value = savedUserEmail;
                        emailAddressInput.dispatchEvent(new Event('input', { bubbles: true }));
                        console.log("INJECTED_INFO: Filled email for tab " + ${tabIdForInjection});
                    }
                    if (postalCodeInput && savedUserZipcode) {
                        postalCodeInput.value = savedUserZipcode;
                        postalCodeInput.dispatchEvent(new Event('input', { bubbles: true }));
                        console.log("INJECTED_INFO: Filled zip code for tab " + ${tabIdForInjection});
                    }
                    
                    const okButton = Array.from(document.querySelectorAll('button.download-panel-checkout-button')).find(
                        btn => btn.textContent.trim().toUpperCase() === 'OK' && (getComputedStyle(btn).display !== 'none' && btn.offsetParent !== null)
                    );
                    if (okButton) {
                        console.log("INJECTED_INFO: Clicking 'OK' button for tab " + ${tabIdForInjection});
                        okButton.click();
                        okButtonClicked = true; // Set flag indicating "OK" was clicked
                    } else {
                        console.log("INJECTED_WARN: Email prompt visible, but 'OK' button not found for tab " + ${tabIdForInjection} + ". Halting for this tab.");
                        // Halt here, user needs to manually proceed or close.
                    }
                  } else {
                    // Email prompt is NOT visible, try to click "Download Now" (or similar non-"OK" button)
                    console.log("INJECTED_INFO: Email input field NOT found/visible for tab " + ${tabIdForInjection} + ". Looking for 'Download Now' button.");
                    const finalDownloadBtn = Array.from(document.querySelectorAll('button.download-panel-checkout-button')).find(
                        btn => btn.textContent.trim().toUpperCase() !== 'OK' && (getComputedStyle(btn).display !== 'none' && btn.offsetParent !== null)
                    );
                    if (finalDownloadBtn) {
                        finalDownloadBtn.click();
                        console.log("INJECTED: Clicked 'Download Now' button in tab " + ${tabIdForInjection});
                    } else {
                        // Fallback if a specific "Download Now" isn't found but any other checkout button is
                        const anyCheckoutButton = document.querySelector('button.download-panel-checkout-button:not([style*="display:none"]):not([hidden])');
                         if(anyCheckoutButton) {
                            console.log("INJECTED_WARN: 'Download Now' not found, found a generic checkout button. Attempting click for tab " + ${tabIdForInjection});
                            anyCheckoutButton.click();
                         } else {
                            console.log("INJECTED_WARN: Could not find 'Download Now' or any other visible checkout button in tab " + ${tabIdForInjection});
                         }
                    }
                  }
                  // If okButtonClicked was true, the process for this tab effectively ended with that click.
                  // If email prompt wasn't visible, we attempted to click "Download Now".
                  // If email prompt was visible but "OK" wasn't found, we logged and did nothing further for this tab.
                }, 700); 
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

  // Final notification after iterating through all target tabs
  console.log("INFO: ClickDownload: Finished iterating through target tabs for download process.");
  const [finalActiveTabForNotification] = await browser.tabs.query({ active: true, currentWindow: true });
  if (finalActiveTabForNotification && finalActiveTabForNotification.id) {
      await showPageNotification(finalActiveTabForNotification.id, `Download process attempted for ${targetTabs.length} tab(s).`, "success", 4500);
  }
}

async function copyAllKeywordsToClipboard() {
    console.log("INFO: copyAllKeywordsToClipboard: Starting function execution...");
    let allKeywordsCollected = [];
    let queriedTabs;
    let notificationTabId = null;

    try {
        const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
        if (activeTab && activeTab.id) {
            notificationTabId = activeTab.id;
        }
    } catch(e) { console.error("ERROR: copyAllKeywordsToClipboard: Could not get active tab for notifications.", e); }

    try {
        queriedTabs = await browser.tabs.query({
            currentWindow: true,
            url: [
                "*://*.bandcamp.com/album/*",
                "*://*.bandcamp.com/track/*"
            ]
        });
    } catch (e) {
        console.error("ERROR: copyAllKeywordsToClipboard: Failed to query tabs:", e);
        if (notificationTabId) showPageNotification(notificationTabId, "Error querying tabs.", "error");
        return; 
    }

    console.log(`INFO: copyAllKeywordsToClipboard: tabs.query initially returned ${queriedTabs.length} tabs.`);
    const activeTabsToProcess = queriedTabs.filter(tab => isActiveTab(tab, "copyAllKeywordsToClipboard")); 
    console.log(`INFO: copyAllKeywordsToClipboard: After filtering, processing ${activeTabsToProcess.length} active, non-discarded tabs.`);

    if (activeTabsToProcess.length === 0) {
        console.log("INFO: copyAllKeywordsToClipboard: No active, non-discarded matching Bandcamp tabs found.");
        if (notificationTabId) showPageNotification(notificationTabId, "No active Bandcamp tabs found.", "error");
        return; 
    }

    activeTabsToProcess.forEach((t, index) => {
        console.log(`INFO_VERBOSE: copyAllKeywordsToClipboard: Will process Tab ${index + 1}/${activeTabsToProcess.length} - ID: ${t.id}, URL: ${t.url}, Title: ${t.title}, Status: ${t.status}`);
    });

    for (let i = 0; i < activeTabsToProcess.length; i++) {
        const tab = activeTabsToProcess[i];
        if (!tab.id) {
            console.warn(`WARN: copyAllKeywordsToClipboard: Active tab ${i + 1} (URL: ${tab.url}) unexpectedly has no ID, skipping.`);
            continue;
        }
        if (tab.url && (tab.url.startsWith('about:') || tab.url.startsWith('moz-extension:'))) {
            console.warn(`WARN: copyAllKeywordsToClipboard: Active tab ${tab.id} is a privileged URL (${tab.url}), skipping script execution.`);
            continue;
        }

        console.log(`INFO: copyAllKeywordsToClipboard: Attempting to execute script on tab ${i + 1}/${activeTabsToProcess.length} - ID: ${tab.id}, URL: ${tab.url}`);
        const tabIdForInjection = tab.id; 

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
                        } catch (e) {
                            console.error('INJECTED_SCRIPT_ERROR: Error during keyword extraction in tab ' + ${tabIdForInjection} + ':', e.toString());
                        }
                        return extractedKeywords; 
                    })();
                `
            });

            if (results && results[0] && Array.isArray(results[0]) && results[0].length > 0) {
                allKeywordsCollected.push(...results[0]);
            }
        } catch (e) {
            console.error('ERROR: copyAllKeywordsToClipboard: Failed to execute script or process results for tab ' + tab.id + ' (' + tab.title + '):', e.toString(), e.stack);
        }
    } 

    console.log("INFO: copyAllKeywordsToClipboard: Finished processing all tabs. Total keywords collected initially: " + allKeywordsCollected.length);

    if (allKeywordsCollected.length === 0) {
        console.log("INFO: copyAllKeywordsToClipboard: No keywords were collected from any tabs.");
        if (notificationTabId) showPageNotification(notificationTabId, "No keywords found to copy.", "error");
        return; 
    }

    const uniqueKeywords = Array.from(new Set(allKeywordsCollected.map(kw => kw.toLowerCase().trim()).filter(kw => kw)));
    console.log("INFO: copyAllKeywordsToClipboard: Unique keywords (normalized):", uniqueKeywords);

    if (uniqueKeywords.length === 0) {
        console.log("INFO: copyAllKeywordsToClipboard: After normalization, no valid keywords remain.");
        if (notificationTabId) showPageNotification(notificationTabId, "No valid keywords to copy.", "error");
        return; 
    }
    
    const formattedKeywords = uniqueKeywords.join('; ');
    console.log("INFO: copyAllKeywordsToClipboard: Formatted keywords string for clipboard:", formattedKeywords);
    
    const copySuccess = await copyTextToClipboard(formattedKeywords); 
    
    if (notificationTabId) {
        if (copySuccess) {
            showPageNotification(notificationTabId, "Tags copied!", "success");
        } else {
            showPageNotification(notificationTabId, "Failed to copy tags.", "error");
        }
    }
}

// Function to copy titles and URLs based on classification type
async function copyTitlesAndUrls(requestedType) { 
    console.log(`INFO: copyTitlesAndUrls: Starting for type "${requestedType}"...`);
    classifications = {}; 
    let outputLines = [];
    let notificationTabId = null;

    try {
        const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
        if (activeTab && activeTab.id) notificationTabId = activeTab.id;
    } catch(e) { console.error(`ERROR: copyTitlesAndUrls (${requestedType}): Could not get active tab for notifications.`, e); }


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
        console.error(`ERROR: copyTitlesAndUrls (${requestedType}): Failed to query tabs:`, e);
        if (notificationTabId) showPageNotification(notificationTabId, "Error querying tabs.", "error");
        return;
    }

    console.log(`INFO: copyTitlesAndUrls (${requestedType}): Initially queried ${initiallyQueriedTabs.length} tabs.`);
    const activeTabs = initiallyQueriedTabs.filter(tab => isActiveTab(tab, `copyTitlesAndUrls (${requestedType})`));
    console.log(`INFO: copyTitlesAndUrls (${requestedType}): After filtering, processing ${activeTabs.length} active tabs.`);

    if (!activeTabs.length) {
        console.log(`INFO: copyTitlesAndUrls (${requestedType}): No active Bandcamp tabs found.`);
        if (notificationTabId) showPageNotification(notificationTabId, "No active Bandcamp tabs found.", "error");
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

        if (requestedType === 'nypFree') {
            if (classification === 'nyp' || classification === 'free') {
                includeTab = true;
            }
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
            showPageNotification(notificationTabId, 
                copySuccess ? `${typeString} info copied!` : `Failed to copy ${typeString} info.`,
                copySuccess ? "success" : "error");
        }
    } else {
        console.log(`INFO: copyTitlesAndUrls (${requestedType}): No tabs matched the type "${requestedType}" or no data to copy.`);
        if (notificationTabId) showPageNotification(notificationTabId, `No ${requestedType === 'nypFree' ? 'NYP/Free' : 'Paid'} info found to copy.`, "error");
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
        // Cannot show page notification without a tab.id; main function should ensure 'tab' is valid.
        return;
    }
    
    const tabUrl = tab.url;
    let isValidPageType = false;
    // Using your existing URL validation logic
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
    await showPageNotification(tab.id, "Scanning page for images...", "success", 2000); // Initial notification

    let imageUrls;
    try {
        const tabIdForInjection = tab.id; // Not strictly needed inside code string if not used there
        const results = await browser.tabs.executeScript(tab.id, {
            code: `
                (function() {
                    const data = { popupImageUrl: null, customHeaderUrl: null, backgroundImageUrl: null };

                    // 1. Artist Image (using your selectors with optional chaining)
                    const popupLink = document.querySelector('a.popupImage');
                    if (popupLink?.href) {
                        data.popupImageUrl = popupLink.href;
                    } else {
                        const bioPicImg = document.querySelector('#bio-container .popupImage img, .band-photo');
                        if (bioPicImg?.src) data.popupImageUrl = bioPicImg.src;
                    }

                    // 2. Custom Header (using your selector)
                    const headerImg = document.querySelector('#customHeader img');
                    if (headerImg?.src) {
                        data.customHeaderUrl = headerImg.src;
                    }

                    // 3. Background Image (using your regex)
                    const styleTag = document.querySelector('style#custom-design-rules-style');
                    if (styleTag?.textContent) {
                        const cssText = styleTag.textContent;
                        // Your regex for background-image: (escaped for JS string)
                        const bgImageRegex = /background-image:\\s*url\\((['"]?)(.*?)\\1\\)/i;
                        const match = cssText.match(bgImageRegex);
                        if (match && match[2]) {
                            data.backgroundImageUrl = match[2].trim(); // Added .trim() for safety
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

    // Check if any image URLs were actually found by the script
    if (!imageUrls || (!imageUrls.popupImageUrl && !imageUrls.customHeaderUrl && !imageUrls.backgroundImageUrl)) {
        console.log(`INFO: DownloadImages: No target images (Artist, Header, or Background) found on tab ${tab.id} (${tabUrl}).`);
        await showPageNotification(tab.id, "No downloadable images found on this page.", "error");
        return; 
    }

    const tabOrigin = new URL(tabUrl).origin;
    let downloadsAttempted = 0;

    if (imageUrls.popupImageUrl) {
        await downloadImagePair("Artist Image", imageUrls.popupImageUrl, tabOrigin); // Assumes downloadImagePair is defined
        downloadsAttempted++;
    } else {
        console.log("INFO: DownloadImages: No 'Artist Image' found to download.");
    }

    if (imageUrls.customHeaderUrl) {
        await downloadImagePair("Custom Header", imageUrls.customHeaderUrl, tabOrigin); // Assumes downloadImagePair
        downloadsAttempted++;
    } else {
        console.log("INFO: DownloadImages: No 'Custom Header' image found to download.");
    }
    
    if (imageUrls.backgroundImageUrl) {
        await downloadImagePair("Background Image", imageUrls.backgroundImageUrl, tabOrigin); // Assumes downloadImagePair
        downloadsAttempted++;
    } else {
        console.log("INFO: DownloadImages: No 'Background Image' from style tag found to download.");
    }

    // Final notification based on whether any downloads were actually attempted
    if (downloadsAttempted > 0) {
        await showPageNotification(tab.id, `${downloadsAttempted} image download process(es) initiated.`, "success", 3500);
    } else if (imageUrls && (imageUrls.popupImageUrl || imageUrls.customHeaderUrl || imageUrls.backgroundImageUrl)) {
        // This case means URLs might have been found but all were skipped (e.g., "blank." images)
        await showPageNotification(tab.id, "Images found were skipped (e.g., blank images).", "success", 3000);
    }
    // The "No target images found" is handled earlier if all imageUrls.* were initially null.
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

browser.runtime.onInstalled.addListener(() => {
  console.log("INFO: background.js: onInstalled listener triggered. Attempting to create context menus.");
  try {
    browser.contextMenus.create({ id: "bandcamp-tools", title: "Bandcamp Tools", contexts: ["page", "image"], documentUrlPatterns: ["*://*.bandcamp.com/*"] });
    browser.contextMenus.create({ id: "sort-tabs", parentId: "bandcamp-tools", title: "Sort Tabs (Paid Left, Free Right)", contexts: ["page"], documentUrlPatterns: ["*://*.bandcamp.com/*"] });
    browser.contextMenus.create({ id: "click-download", parentId: "bandcamp-tools", title: "Download (NYP/Free)", contexts: ["page"], documentUrlPatterns: ["*://*.bandcamp.com/*"] });
    browser.contextMenus.create({ id: "copy-keywords", parentId: "bandcamp-tools", title: "Copy Tags", contexts: ["page"], documentUrlPatterns: ["*://*.bandcamp.com/*"] });
    browser.contextMenus.create({ id: "copy-nyp-titles-urls", parentId: "bandcamp-tools", title: "Copy NYP/Free Titles & URLs", contexts: ["page"], documentUrlPatterns: ["*://*.bandcamp.com/*"] });
    browser.contextMenus.create({ id: "copy-paid-titles-urls", parentId: "bandcamp-tools", title: "Copy Paid Titles & URLs", contexts: ["page"], documentUrlPatterns: ["*://*.bandcamp.com/*"] });
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
    case "download-images":
      if (notificationTab) { 
          downloadBandcampPageImage(notificationTab); 
      } else {
          console.log("INFO: DownloadImages (Context Menu): No suitable tab found for image download.");
          showPageNotification(null, "No suitable Bandcamp tab found.", "error");
      }
      break;
    default:
      console.warn(`WARN: Unknown context menu item ID: ${info.menuItemId}`);
  }
});

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'classification' && sender.tab?.id != null) {
        classifications[sender.tab.id] = message.value;
    } 
    else if (message.action) {
        console.log(`INFO: Action received from popup: ${message.action}`);
        switch (message.action) {
            case "sortTabs":
                sortTabsAcrossWindow(); 
                break;
            case "clickDownload":
                clickDownloadAllNonPaid(); 
                break;
            case "copyKeywords":
                copyAllKeywordsToClipboard(); 
                break;
            case "copyNypTitlesUrls":
                copyTitlesAndUrls('nypFree'); 
                break;
            case "copyPaidTitlesUrls":
                copyTitlesAndUrls('paid'); 
                break;
            case "downloadImages":
                browser.tabs.query({ active: true, currentWindow: true }).then(tabs => {
                    if (tabs.length > 0 && tabs[0].id && isActiveTab(tabs[0], "DownloadImagesPopup")) {
                        downloadBandcampPageImage(tabs[0]); 
                    } else {
                        console.log("INFO: DownloadImages (Popup): No suitable active tab found.");
                        showPageNotification(null, "No active Bandcamp tab found.", "error");
                    }
                }).catch(err => {
                     console.error("ERROR: DownloadImages (Popup): Error querying active tab:", err);
                     showPageNotification(null, "Error finding active tab.", "error");
                });
                break;
            default:
                console.warn(`WARN: Unknown action received from popup: ${message.action}`);
        }
    }
    return false; 
});