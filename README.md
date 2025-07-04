![Discography Archive Tools Logo](./logo.svg)
# [Discography Archive Tools]

A Firefox browser extension designed to help the archival of music from Bandcamp, features for automated download assistance for "Name Your Price" (NYP) and free items, and convenient data extraction. Made with the help of the Gemini AI.

## Features

* **User Interface**: Access all tools conveniently via:
    * A **Popup Menu**: Click the "Discography Archive Tools" icon in your browser toolbar.
    * A **Context Menu**: Right-click on any Bandcamp page and find options under "Bandcamp Tools."

* **In-Popup Options Panel**:
    * Easily configure your email address and zip code via a settings panel directly within the popup menu.
    * Toggle on-page notifications.
    * Toggle HTML escaping for copied titles.
    * Enable or disable automatic JSON cache saving.

* **Smart Tab Handling**: All operations that iterate through tabs (sorting, data copying, etc.) ignore hidden or discarded tabs to ensure stability and process only active, relevant pages.

* **Rate-Limiting Prevention**: For artist-page functions that scan many releases (like copying tags or downloading covers), a delay is automatically introduced on very large discographies (>100 releases) to prevent server errors.

* **On-Page Notifications**: Receive brief, auto-fading notifications directly on your current page for instant feedback on actions like "Tabs Sorted!" or "Tags Copied!".

### Core Functions

* **Sort Bandcamp Tabs**: Automatically sorts your open Bandcamp album/track tabs, placing "Paid" items to the left and "Name Your Price" (NYP) / "Free" items to the right.

* **Automated Download for NYP/Free Items**: For tabs identified as NYP or Free, this feature streamlines the download process by clicking through the download prompts and automatically entering "0" for NYP items. It will also use your saved email/zip from the settings if required.
    * The [DownThemAll](https://addons.mozilla.org/en-US/firefox/addon/downthemall/) or [JDownloader](https://jdownloader.org/) (using `Copy Download Links`) extensions are recommended for managing the final downloads.

* **Download Images**: From any artist, album, or track page, this feature downloads up to three key images:
    * **Artist Image**: Saved as `Artist Photo.{ext}`.
    * **Custom Header**: Saved as `Custom Header.{ext}`.
    * **Page Background**: Saved as `Background Image.{ext}`.
    * For each, it also attempts to download a higher-resolution `_0` variant (e.g., `Artist Photo_orig.png`).

* **Download Album Covers**: From an artist's main page, this finds all releases and downloads the highest quality cover art for each into a folder named `{artist} - Album Covers`. **This can miss some covers for various reasons, please double check.**

* **Copy Data to Clipboard**:
    * **Copy All Tags/Keywords**: Scans all active tabs or fetches data from all releases on an artist's page. All tags are combined into a single, semicolon-separated list.
    * **Copy Releases Links & Titles**: A compound button on artist pages. Copies just the links, or both the links and formatted titles (`Title | Artist`).
    * **Copy NYP/Free & Paid Titles/URLs**: Separately copy the titles and URLs for releases classified as NYP/Free or Paid.
    * **Copy Download Links**: From the final Bandcamp download pages, copies all ready-to-download links.
    * **Copy Archive.org File List**: On an Archive.org download page, this copies the list of files from the main table.

### JSON Cache & Import/Export

The extension now includes a JSON workflow to save and reuse scraped data.

* **Automatic JSON Cache Export**: When enabled in settings, any function that scans an artist's page will automatically save a detailed JSON file containing the `url`, `title`, `artist`, `classification`, and `tags` for every release.
    * Files are saved to your default downloads folder under `datools-cache/artist-name.json`.

* **Force Save JSON Button**: A new icon in the popup UI allows you to scan an artist's page and save the cache file on-demand, even if the automatic setting is disabled.

* **Import JSON Feature**:
    * Clicking the import icon in the popup opens a **new, dedicated tab** for the import utility.
    * You can drag-and-drop or click to select a `datools-cache` JSON file.
    * The imported data is instantly parsed and displayed in three panels, each with its own "Copy" button:
        1.  **NYP/Free Titles & URLs**: Formatted as `Title | Artist` followed by the URL.
        2.  **Paid Titles & URLs**: Formatted identically for paid releases.
        3.  **All Tags**: A complete, de-duplicated, semicolon-separated list of all tags found in the file.

## How to Use

1.  **Installation (for Development/Local Use):**
    * Clone or download this repository.
    * Open Firefox and navigate to `about:debugging#/runtime/this-firefox`.
    * Click "Load Temporary Add-on..." and select the `manifest.json` file.

2.  **Accessing Features:**
    * Click the extension icon for the main popup menu.
    * Right-click on a relevant page (Bandcamp or Archive.org) for the context menu.
    * Use the **Import JSON** icon in the popup to open the dedicated import tool.

## Files Overview

* **`manifest.json`**: Defines the extension's properties, permissions, and components.
* **`background.js`**: The core logic for all features, including context menus, script injection, data fetching, and caching.
* **`contentScript.js`**: Injected into Bandcamp pages to determine their classification (Paid, NYP, or Free).
* **`popup.html` / `popup.css` / `popup.js`**: The structure, style, and logic for the main browser action popup menu and its settings panel.
* **`import.html` / `import.js`**: The new, dedicated page for the JSON import functionality.
* **`logo.svg` / `json.svg` / `import.svg`**: Icons.

## Permissions Used

* **`tabs`**: To query, execute scripts in, and manage your open tabs.
* **`contextMenus`**: To add the "Bandcamp Tools" and "Archive.org Tools" context menus.
* **`*://*.bandcamp.com/*` / `*://archive.org/download/*`**: To allow the extension to run on these specific sites.
* **`clipboardWrite`**: To copy the collected data (tags, URLs, etc.) to your clipboard.
* **`downloads`**: To save images, album covers, and the exported JSON cache files.
* **`storage`**: To save your settings (email, zip code, and toggles) locally.

## Known Issues & Limitations
* **Language Dependency**: The extension identifies item types (e.g., "Name Your Price," "Paid") by searching for specific English and Japanese text. If your Bandcamp interface is set to another language, you **must** manually edit the hardcoded text strings in `background.js` and `contentScript.js`.
* The automated download and data-extraction features rely on specific page structures. If Bandcamp updates its website, these parts of the extension may need to be updated.
* The timing delays (`setTimeout`) in the download automation are generalized. On very slow connections, they might occasionally be too short.
* Download Album Covers sometimes fails on specific pages for various reasons, resulting in some missing covers.

## License
This project is released into the public domain via [The Unlicense](https://unlicense.org/).