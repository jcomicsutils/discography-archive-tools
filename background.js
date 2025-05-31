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
    return;
  }
  
  console.log(`INFO: SortTabs: Initially queried ${initiallyQueriedTabs.length} tabs.`);
  const tabs = initiallyQueriedTabs.filter(tab => isActiveTab(tab, "SortTabs"));
  console.log(`INFO: SortTabs: After filtering, processing ${tabs.length} active tabs for sorting.`);


  if (!tabs.length) {
    console.log("INFO: SortTabs: No active Bandcamp album/track tabs found to sort.");
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

  if (tabs.length > 0) { 
    const baseIndex = Math.min(...tabs.map(t => t.index)); 

    for (let i = 0; i < paidTabs.length; i++) {
      await browser.tabs.move(paidTabs[i].id, { index: baseIndex + i });
    }
    for (let i = 0; i < nypTabs.length; i++) {
      await browser.tabs.move(nypTabs[i].id, { index: baseIndex + paidTabs.length + i });
    }
    console.log("INFO: SortTabs: Bandcamp tabs sorted.");
  } else {
    console.log("INFO: SortTabs: No tabs to sort after filtering.");
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
    return;
  }

  console.log(`INFO: ClickDownload: Initially queried ${initiallyQueriedTabs.length} tabs.`);
  const activeTabs = initiallyQueriedTabs.filter(tab => isActiveTab(tab, "ClickDownload"));
  console.log(`INFO: ClickDownload: After filtering, processing ${activeTabs.length} active tabs.`);

  if (!activeTabs.length) {
    console.log("INFO: ClickDownload: No active Bandcamp album/track tabs found for download process.");
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
    return;
  }
  
  console.log(`INFO: ClickDownload: Found ${targetTabs.length} NYP/Free active tabs to process for download.`);

  for (const tab of targetTabs) { 
    try {
      const tabIdForInjection = tab.id;
      const tabUrlForInjection = JSON.stringify(tab.url); 

      await browser.tabs.executeScript(tab.id, {
        code: `
          (function(){
            console.log("INJECTED: Processing download steps for tab: " + ${tabIdForInjection} + " (URL: " + ${tabUrlForInjection} + ")");

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
                  const finalDownloadBtn = document.querySelector('button.download-panel-checkout-button');
                  if (finalDownloadBtn) {
                    finalDownloadBtn.click();
                    console.log("INJECTED: Step 4: Clicked 'Download Now' button in tab " + ${tabIdForInjection});
                  } else {
                    console.log("INJECTED_WARN: Step 4: Could not find 'Download Now' button in tab " + ${tabIdForInjection});
                  }
                }, 700); 

              }, 700); 

            }, 700); 
          })();
        `
      });
      console.log(`INFO: ClickDownload: Injected multi-step download script into tab ${tab.id}`);
    } catch (e) {
      console.error(`ERROR: ClickDownload: Failed to inject multi-step download script into tab ${tab.id}:`, e);
    }
  }

  console.log("INFO: ClickDownload: Multi-step download process initiated for all targeted NYP/Free active tabs.");
}

async function copyAllKeywordsToClipboard() {
    console.log("INFO: copyAllKeywordsToClipboard: Starting function execution...");
    let allKeywordsCollected = [];
    let queriedTabs;

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
        return;
    }

    console.log(`INFO: copyAllKeywordsToClipboard: tabs.query initially returned ${queriedTabs.length} tabs.`);
    
    const activeTabs = queriedTabs.filter(tab => isActiveTab(tab, "copyAllKeywordsToClipboard"));
    
    console.log(`INFO: copyAllKeywordsToClipboard: After filtering, processing ${activeTabs.length} active, non-discarded tabs.`);

    if (activeTabs.length === 0) {
        console.log("INFO: copyAllKeywordsToClipboard: No active, non-discarded matching Bandcamp tabs found.");
        return;
    }

    activeTabs.forEach((t, index) => {
        console.log(`INFO_VERBOSE: copyAllKeywordsToClipboard: Will process Tab ${index + 1}/${activeTabs.length} - ID: ${t.id}, URL: ${t.url}, Title: ${t.title}, Status: ${t.status}`);
    });

    for (let i = 0; i < activeTabs.length; i++) {
        const tab = activeTabs[i];
        if (!tab.id) {
            console.warn(`WARN: copyAllKeywordsToClipboard: Active tab ${i + 1} (URL: ${tab.url}) unexpectedly has no ID, skipping.`);
            continue;
        }
        if (tab.url && (tab.url.startsWith('about:') || tab.url.startsWith('moz-extension:'))) {
            console.warn(`WARN: copyAllKeywordsToClipboard: Active tab ${tab.id} is a privileged URL (${tab.url}), skipping script execution.`);
            continue;
        }

        console.log(`INFO: copyAllKeywordsToClipboard: Attempting to execute script on tab ${i + 1}/${activeTabs.length} - ID: ${tab.id}, URL: ${tab.url}`);
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

            console.log('INFO: copyAllKeywordsToClipboard: Script execution result for tab ' + tab.id + ':', results);

            if (results && results[0] && Array.isArray(results[0])) {
                if (results[0].length > 0) {
                    allKeywordsCollected.push(...results[0]);
                    console.log('INFO: copyAllKeywordsToClipboard: Extracted keywords from tab ' + tab.id + ' (' + tab.title + '):', results[0]);
                } else {
                    console.log('INFO: copyAllKeywordsToClipboard: No keywords found in ld+json for tab ' + tab.id + ' (' + tab.title + ').');
                }
            } else {
                 console.log('WARN: copyAllKeywordsToClipboard: Script executed on tab ' + tab.id + ' (' + tab.title + ') but returned no result or unexpected format. Result:', results);
            }
        } catch (e) {
            console.error('ERROR: copyAllKeywordsToClipboard: Failed to execute script or process results for tab ' + tab.id + ' (' + tab.title + '):', e.toString(), e.stack);
        }
    } 

    console.log("INFO: copyAllKeywordsToClipboard: Finished processing all tabs. Total keywords collected initially: " + allKeywordsCollected.length);

    if (allKeywordsCollected.length === 0) {
        console.log("INFO: copyAllKeywordsToClipboard: No keywords were collected from any tabs.");
        return;
    }

    const uniqueKeywords = Array.from(new Set(allKeywordsCollected.map(kw => kw.toLowerCase().trim()).filter(kw => kw)));
    console.log("INFO: copyAllKeywordsToClipboard: Unique keywords (normalized):", uniqueKeywords);

    if (uniqueKeywords.length === 0) {
        console.log("INFO: copyAllKeywordsToClipboard: After normalization, no valid keywords remain.");
        return;
    }
    
    const formattedKeywords = uniqueKeywords.join('; ');
    console.log("INFO: copyAllKeywordsToClipboard: Formatted keywords string for clipboard:", formattedKeywords);

    await copyTextToClipboard(formattedKeywords); 
}

// New function to copy titles and URLs based on classification type
async function copyTitlesAndUrls(requestedType) { 
    console.log(`INFO: copyTitlesAndUrls: Starting for type "${requestedType}"...`);
    classifications = {}; 
    let outputLines = [];

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
        return;
    }

    console.log(`INFO: copyTitlesAndUrls (${requestedType}): Initially queried ${initiallyQueriedTabs.length} tabs.`);
    const activeTabs = initiallyQueriedTabs.filter(tab => isActiveTab(tab, `copyTitlesAndUrls (${requestedType})`));
    console.log(`INFO: copyTitlesAndUrls (${requestedType}): After filtering, processing ${activeTabs.length} active tabs.`);

    if (!activeTabs.length) {
        console.log(`INFO: copyTitlesAndUrls (${requestedType}): No active Bandcamp tabs found.`);
        return;
    }

    for (const tab of activeTabs) {
        try {
            await browser.tabs.executeScript(tab.id, { file: "contentScript.js" });
            console.log(`INFO: copyTitlesAndUrls (${requestedType}): Injected classification script into tab ${tab.id}`);
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
                console.log(`INFO: copyTitlesAndUrls (${requestedType}): Added tab - Title: ${tab.title.trim()}, URL: ${tab.url}`);
            } else {
                console.warn(`WARN: copyTitlesAndUrls (${requestedType}): Tab ID ${tab.id} missing title or URL. Title: ${tab.title}, URL: ${tab.url}`);
            }
        }
    }

    if (outputLines.length > 0) {
        const outputString = outputLines.join('\n');
        console.log(`INFO: copyTitlesAndUrls (${requestedType}): Final string for clipboard:\n${outputString}`);
        await copyTextToClipboard(outputString);
    } else {
        console.log(`INFO: copyTitlesAndUrls (${requestedType}): No tabs matched the type "${requestedType}" or no data to copy.`);
    }
}


async function copyTextToClipboard(text) {
    try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            await navigator.clipboard.writeText(text);
            console.log('SUCCESS: Text successfully copied to clipboard using navigator.clipboard!');
            return; 
        }
    } catch (err) {
        console.warn('WARN: navigator.clipboard.writeText failed. This might be due to permissions (requires "clipboardWrite" in manifest) or browser context. Falling back. Error:', err);
    }

    console.log('INFO: Attempting to copy text to clipboard using document.execCommand fallback.');
    const bgPage = browser.extension.getBackgroundPage(); 
    if (!bgPage || !bgPage.document || !bgPage.document.body) {
        console.error("ERROR: Background page document context not available for execCommand fallback.");
        return;
    }

    const textarea = bgPage.document.createElement('textarea');
    textarea.style.position = 'fixed'; 
    textarea.style.top = '-9999px';   
    textarea.style.left = '-9999px';
    textarea.value = text;

    bgPage.document.body.appendChild(textarea);
    textarea.focus(); 
    textarea.select(); 

    try {
        const successful = bgPage.document.execCommand('copy');
        if (successful) {
            console.log('SUCCESS: Text successfully copied to clipboard using execCommand!');
        } else {
            console.error('ERROR: document.execCommand("copy") was not successful. The clipboard API might be blocked or the document might not be focused.');
        }
    } catch (err) {
        console.error('ERROR: Error during document.execCommand("copy"):', err);
    } finally {
        if (textarea.parentNode === bgPage.document.body) { 
            bgPage.document.body.removeChild(textarea); 
        }
    }
}

browser.runtime.onInstalled.addListener(() => {
  console.log("INFO: background.js: onInstalled listener triggered. Attempting to create context menus.");
  try {
    browser.contextMenus.create({
      id: "bandcamp-tools",
      title: "Bandcamp Tools",
      contexts: ["page"],
      documentUrlPatterns: ["*://*.bandcamp.com/*"] 
    });

    browser.contextMenus.create({
      id: "sort-tabs",
      parentId: "bandcamp-tools",
      title: "Sort Tabs (Paid Left, Free Right)",
      contexts: ["page"],
      documentUrlPatterns: ["*://*.bandcamp.com/*"]
    });

    browser.contextMenus.create({
      id: "click-download",
      parentId: "bandcamp-tools",
      title: "Download (NYP/Free & Process Steps)", 
      contexts: ["page"],
      documentUrlPatterns: ["*://*.bandcamp.com/*"]
    });

    browser.contextMenus.create({
      id: "copy-keywords",
      parentId: "bandcamp-tools",
      title: "Copy All Tags to Clipboard",
      contexts: ["page"],
      documentUrlPatterns: ["*://*.bandcamp.com/*"] 
    });

    browser.contextMenus.create({
      id: "copy-nyp-titles-urls",
      parentId: "bandcamp-tools",
      title: "Copy NYP/Free Titles & URLs",
      contexts: ["page"],
      documentUrlPatterns: ["*://*.bandcamp.com/*"]
    });

    browser.contextMenus.create({
      id: "copy-paid-titles-urls",
      parentId: "bandcamp-tools",
      title: "Copy Paid Titles & URLs",
      contexts: ["page"],
      documentUrlPatterns: ["*://*.bandcamp.com/*"]
    });

    console.log("INFO: background.js: All context menus registration attempt complete.");
  } catch (e) {
    console.error("ERROR: background.js: Major failure during context menu creation in onInstalled:", e);
  }
});

browser.contextMenus.onClicked.addListener((info, tab) => {
  console.log(`INFO: Context menu item clicked: ${info.menuItemId}`);
  if (info.menuItemId === "sort-tabs") {
    sortTabsAcrossWindow();
  } else if (info.menuItemId === "click-download") {
    clickDownloadAllNonPaid();
  } else if (info.menuItemId === "copy-keywords") {
    copyAllKeywordsToClipboard();
  } else if (info.menuItemId === "copy-nyp-titles-urls") {
    copyTitlesAndUrls('nypFree');
  } else if (info.menuItemId === "copy-paid-titles-urls") {
    copyTitlesAndUrls('paid');
  }
});

// REMOVE the old browserAction.onClicked listener:
// browser.browserAction.onClicked.addListener(sortTabsAcrossWindow); 
// This line is now removed or commented out because the popup handles the browser action.

// Update browser.runtime.onMessage listener to handle both classification and popup actions
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Handle messages from content script for classification
    if (message.type === 'classification' && sender.tab?.id != null) {
        classifications[sender.tab.id] = message.value;
        console.log(`INFO: Classification received from tab ${sender.tab.id}: ${message.value}`);
    } 
    // Handle messages from popup.js
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
            default:
                console.warn(`WARN: Unknown action received: ${message.action}`);
        }
    }
    // Return true if you intend to send a response asynchronously,
    // otherwise, it's not strictly necessary if sendResponse is not called.
    // For this case, we are not sending a response back to the popup from these actions.
    return false; 
});