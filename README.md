![Discography Archive Tools Logo](./logo.svg)
# [Discography Archive Tools]

A Firefox browser extension designed to help the archival of music from Bandcamp, features for tab management, automated download assistance for "Name Your Price" (NYP) and free items, and convenient data extraction. Made with the help of the Gemini AI.

## Features

* **User Interface**: Access all tools conveniently via:
    * A **Popup Menu**: Click the "Discography Archive Tools" icon in your browser toolbar.
    * A **Context Menu**: Right-click on any Bandcamp page and find options under "Bandcamp Tools."

* **In-Popup Options Panel**:
    * Easily configure your email address and zip code via a settings panel directly within the popup menu.
    * These saved settings are then used by the "Automated Download" feature to help fill in required fields for some albums.

* **Smart Tab Handling**: All operations that iterate through tabs (sorting, data copying, etc.) ignore hidden or discarded tabs to ensure stability and process only active, relevant pages.

* **On-Page Notifications**:
    * Receive brief, auto-fading notifications directly on your current Bandcamp page (typically in the bottom-right corner) for feedback on actions like "Tabs Sorted!" or "Tags Copied!".

* **Sort Bandcamp Tabs**: Automatically sorts your open Bandcamp album/track tabs in the current window, placing "Paid" items to the left and "Name Your Price" (NYP) / "Free" items to the right.

* **Automated Download for NYP/Free Items**: For tabs identified as NYP or Free, this feature streamlines the download process:
    * Clicks the initial download button.
    * Automatically sets the price to "0" for "Name Your Price" items.
    * Proceeding through subsequent confirmation steps. If an email address and zip code is required during the download process, the extension will automatically fill these fields using the values you've saved in the options panel.
    * The [DownThemAll](https://addons.mozilla.org/en-US/firefox/addon/downthemall/) extension is recommended for downloading everything at once.

* **Download Page Images**: From the active Bandcamp page, this feature attempts to download up to three key images:
    * **Artist/Album Art**: The primary artwork or artist photo (typically from `a.popupImage` or identified fallbacks). Saved as `Artist Image.{original_extension}`.
    * **Custom Header**: The banner image usually found at the top of artist pages. Saved as `Custom Header.{original_extension}`.
    * **Page Background**: The full-page background image defined in the page's custom styles. Saved as `Background Image.{original_extension}`.
    * For each of these images, it also attempts to download a higher-resolution or original version (often a `_0` variant), saved with an `_orig` suffix and an automatically detected file extension (e.g., `Artist Image_orig.png`).
    * The feature skips downloading common placeholder "blank" images.

* **Copy All Tags/Keywords**: Scans all active Bandcamp album/track tabs, extracts the associated keywords or tags from their page metadata, removes duplicates, formats them into a single semicolon-separated list (e.g., `tag1; tag2; tag3`), and copies this list to your clipboard.

* **Copy NYP/Free Titles & URLs**: Identifies all active Bandcamp tabs classified as NYP or Free, then collects their page titles and URLs. This information is formatted as a list (title on one line, URL on the next, then the next title, etc.) and copied to your clipboard.

* **Copy Paid Titles & URLs**: Similar to the above, but specifically targets tabs classified as "Paid," collecting and formatting their titles and URLs for clipboard copying.

## How to Use

1.  **Installation (for Development/Local Use):**
    * Clone or download this repository to your local machine.
    * Open Firefox and navigate to `about:debugging#/runtime/this-firefox`.
    * Click the "Load Temporary Add-on..." button.
    * Browse to the directory where you saved the extension files and select the `manifest.json` file.

2.  **Accessing Features:**
    * Click the extension icon and select desired feature; Or
    * Navigate to any Bandcamp album page (`*.bandcamp.com/album/*`) or track page (`*.bandcamp.com/track/*`).
    * Right-click anywhere on the page to open the context menu.
    * Look for the "Bandcamp Tools" submenu.
    * Select the desired action (e.g., "Sort Tabs," "Copy All Tags to Clipboard," etc.).

## Files Overview

* **`manifest.json`**: Defines the extension's properties, permissions, and components. It specifies the background script, content scripts, and the browser action popup.
* **`background.js`**: Contains the core logic for all features. It handles context menu creation and actions, browser action popup messages, tab querying and management, classification orchestration via script injection, and clipboard operations.
* **`contentScript.js`**: Injected into Bandcamp album and track pages to analyze page content and determine if an item is "Paid," "Name Your Price" (NYP), or "Free." It communicates this classification back to `background.js`.
* **`popup.html`**: Provides the HTML structure for the dropdown menu that appears when the extension's toolbar icon is clicked. This menu lists the available actions.
* **`popup.js`**: The JavaScript file for `popup.html`. It listens for clicks on the menu items in the popup and sends messages to `background.js` to trigger the corresponding actions.
* **`popup.css`**: Contains the CSS styles for `popup.html`, defining the appearance of the browser action popup menu (e.g., dark mode, button styling).

## Permissions Used

This extension requests the following permissions, with explanations for why each is needed:

* **`tabs`**:
    * To query your open Bandcamp tabs (get their ID, URL, title, hidden/discarded state).
    * To execute scripts within these tabs (e.g., `contentScript.js` for classification, or other scripts for download automation and data extraction).
    * To reorder (sort) tabs.
* **`contextMenus`**:
    * To add the "Bandcamp Tools" menu and its sub-options to the right-click context menu on web pages.
* **`*://*.bandcamp.com/*`**:
    * To allow the extension to run its `contentScript.js` specifically on Bandcamp pages.
    * To enable `executeScript` calls to target Bandcamp pages for various functions.
    * To ensure context menu items appear only on Bandcamp domains.
* **`clipboardWrite`**:
    * To allow the extension to copy the collected tags, titles, and URLs directly to your system clipboard for easy pasting into other applications.
* **`downloads`**:
    * To allow the extension to download images.

## Known Issues & Limitations
* The automated download feature relies on specific CSS selectors on Bandcamp pages. If Bandcamp updates its website structure, these selectors might need to be updated in `background.js`.
* The timing delays (`setTimeout`) in the download automation are generalized. On very slow connections or machines, they might occasionally be too short, potentially missing an element that hasn't loaded yet.

## Future Ideas & Enhancements
* User-configurable settings (e.g., for delays, output formats).
* Option to specify download locations (if browser APIs ever permit this level of control for extensions easily).
* A popup UI for more complex interactions or status display.

## License
This project is released into the public domain via [The Unlicense](https://unlicense.org/).

This means it is free and unencumbered software released into the public domain. Anyone is free to copy, modify, publish, use, compile, sell, or distribute this software, either in source code form or as a compiled binary, for any purpose, commercial or non-commercial, and by any means.

For the full license text, please see the `LICENSE` file in this repository.
