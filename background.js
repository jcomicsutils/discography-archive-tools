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

// Function to copy titles and URLs based on classification type
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
        return;
    }

    console.log(`INFO: DownloadImages: Processing tab ID ${tab.id}, URL: ${tabUrl}`);

    let imageUrls;
    try {
        const tabIdForInjection = tab.id; 
        const results = await browser.tabs.executeScript(tab.id, {
            code: `
                (function() {
                    const data = { popupImageUrl: null, customHeaderUrl: null, backgroundImageUrl: null };

                    // 1. Artist Image
                    const popupLink = document.querySelector('a.popupImage');
                    if (popupLink?.href) {
                        data.popupImageUrl = popupLink.href;
                    } else {
                        const bioPicImg = document.querySelector('#bio-container .popupImage img, .band-photo');
                        if (bioPicImg?.src) data.popupImageUrl = bioPicImg.src;
                    }

                    // 2. Custom Header
                    const headerImg = document.querySelector('#customHeader img');
                    if (headerImg?.src) {
                        data.customHeaderUrl = headerImg.src;
                    }

                    // 3. Background Image
                    const styleTag = document.querySelector('style#custom-design-rules-style');
                    if (styleTag?.textContent) {
                        const cssText = styleTag.textContent;
                        const bgImageRegex = /background-image:\\s*url\\((['"]?)(.*?)\\1\\)/i;
                        const match = cssText.match(bgImageRegex);
                        if (match && match[2]) {
                            data.backgroundImageUrl = match[2];
                        }
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
        return;
    }

    if (!imageUrls || (!imageUrls.popupImageUrl && !imageUrls.customHeaderUrl && !imageUrls.backgroundImageUrl)) {
        console.log(`INFO: DownloadImages: No target images (Artist, Header, or Background) found on tab ${tab.id} (${tabUrl}).`);
        if (!imageUrls.popupImageUrl && !imageUrls.customHeaderUrl && !imageUrls.backgroundImageUrl) {
             return;
        }
    }

    const tabOrigin = new URL(tabUrl).origin;

    if (imageUrls.popupImageUrl) {
        await downloadImagePair("Artist Image", imageUrls.popupImageUrl, tabOrigin);
    } else {
        console.log("INFO: DownloadImages: No 'Artist Image' found to download.");
    }

    if (imageUrls.customHeaderUrl) {
        await downloadImagePair("Custom Header", imageUrls.customHeaderUrl, tabOrigin);
    } else {
        console.log("INFO: DownloadImages: No 'Custom Header' image found to download.");
    }
    
    if (imageUrls.backgroundImageUrl) {
        await downloadImagePair("Background Image", imageUrls.backgroundImageUrl, tabOrigin);
    } else {
        console.log("INFO: DownloadImages: No 'Background Image' from style tag found to download.");
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
      contexts: ["page", "image"], 
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
      title: "Download (NYP/Free)", 
      contexts: ["page"],
      documentUrlPatterns: ["*://*.bandcamp.com/*"]
    });

    browser.contextMenus.create({
      id: "copy-keywords",
      parentId: "bandcamp-tools",
      title: "Copy All Tags",
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

    browser.contextMenus.create({
      id: "download-images",
      parentId: "bandcamp-tools",
      title: "Download Images (Artist, Header, Background)", 
      contexts: ["page", "image"], 
      documentUrlPatterns: [ 
          "*://*.bandcamp.com/album/*",
          "*://*.bandcamp.com/track/*",
          "*://*.bandcamp.com/music",
          "*://*.bandcamp.com/music?*",
          "*://*.bandcamp.com/" 
      ]
    });

    console.log("INFO: background.js: All context menus registration attempt complete.");
  } catch (e) {
    console.error("ERROR: background.js: Major failure during context menu creation in onInstalled:", e);
  }
});

browser.contextMenus.onClicked.addListener((info, tab) => {
  console.log(`INFO: Context menu item clicked: ${info.menuItemId}`);
  let targetTab = tab;

  switch (info.menuItemId) {
    case "sort-tabs":
      sortTabsAcrossWindow();
      break;
    case "click-download":
      clickDownloadAllNonPaid();
      break;
    case "copy-keywords":
      copyAllKeywordsToClipboard();
      break;
    case "copy-nyp-titles-urls":
      copyTitlesAndUrls('nypFree');
      break;
    case "copy-paid-titles-urls":
      copyTitlesAndUrls('paid');
      break;
    case "download-images":
      if (targetTab && targetTab.id && isActiveTab(targetTab, "DownloadImagesContext")) {
          downloadBandcampPageImage(targetTab);
      } else {
          console.warn(`WARN: DownloadImages (Context Menu): Problem with initial tab from context. Info:`, info, `Tab:`, targetTab, `Falling back to active tab.`);
          browser.tabs.query({ active: true, currentWindow: true }).then(tabs => {
                if (tabs.length > 0 && tabs[0].id && isActiveTab(tabs[0], "DownloadImagesContextFallback")) {
                    downloadBandcampPageImage(tabs[0]);
                } else {
                    console.log("INFO: DownloadImages (Context Menu Fallback): No suitable active tab found or it's not a valid Bandcamp page.");
                }
            }).catch(err => console.error("ERROR: DownloadImages (Context Menu Fallback): Error querying active tab:", err));
      }
      break;
    default:
      console.warn(`WARN: Unknown context menu item ID: ${info.menuItemId}`);
  }
});

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'classification' && sender.tab?.id != null) {
        classifications[sender.tab.id] = message.value;
        console.log(`INFO: Classification received from tab ${sender.tab.id}: ${message.value}`);
    } 
    else if (message.action) {
        console.log(`INFO: Action received from popup: ${message.action}`);
        let activeTabPromise;
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
                activeTabPromise = browser.tabs.query({ active: true, currentWindow: true });
                activeTabPromise.then(tabs => {
                    if (tabs.length > 0 && tabs[0].id) {
                         if (isActiveTab(tabs[0], "DownloadImagesPopup")) {
                            downloadBandcampPageImage(tabs[0]);
                        } else {
                            console.log("INFO: DownloadImages (Popup): Active tab is hidden/discarded or not a valid Bandcamp page.");
                        }
                    } else {
                        console.log("INFO: DownloadImages (Popup): No active tab found or active tab has no ID.");
                    }
                }).catch(err => console.error("ERROR: DownloadImages (Popup): Error querying active tab:", err));
                break;
            default:
                console.warn(`WARN: Unknown action received from popup: ${message.action}`);
        }
    }
    return false; 
});