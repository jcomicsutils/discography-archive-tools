![Discography Archive Tools Logo](./logo.svg)
# Discography Archive Tools

A Firefox browser extension and standalone Python script designed to help the archival of music from Bandcamp. The extension features automated download assistance for "Name Your Price" (NYP) and free items, while the Python script provides comprehensive data extraction. Made with the help of the Gemini AI.

## Features (Browser Extension)

* **User Interface**: Access all tools conveniently via:
    * A **Popup Menu**: Click the "Discography Archive Tools" icon in your browser toolbar.
    * A **Context Menu**: Right-click on any Bandcamp page and find options under "Bandcamp Tools."
* **In-Popup Options Panel**:
    * Easily configure your email address and zip code via a settings panel directly within the popup menu.
    * Toggle on-page notifications.
    * Toggle HTML escaping for copied titles.
* **Smart Tab Handling**: All operations that iterate through tabs (sorting, data copying, etc.) ignore hidden or discarded tabs to ensure stability and process only active, relevant pages.
* **Rate-Limiting Prevention**: For artist-page functions that scan many releases (like copying tags or downloading covers), a delay is automatically introduced on very large discographies (>100 releases) to prevent server errors.
* **On-Page Notifications**: Receive brief, auto-fading notifications directly on your current page for instant feedback on actions like "Tabs Sorted!" or "Tags Copied!".

### Core Functions (Browser Extension)

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

## Standalone Python Scraper (`bandcamp-archiver.py`)

For a more powerful and detailed data extraction, the `bandcamp-archiver.py` script is now the recommended method for creating JSON caches.

The Python script can be run from your command line and offers several advantages:

* **Deep Scraping**: It fetches comprehensive details for each release, including publication dates, about/credits text, licensing info, high-resolution cover art URLs, and complete tracklists with durations and lyrics.
* **Cover and Artist Image Downloading**: Optionally download all album covers, track-specific art, and artist images (profile, banner, background).
* **Artist Discovery**: Provide an artist's main page, and the script will automatically discover all individual album and track URLs.
* **Resilience**: Includes request retries with exponential backoff to handle rate-limiting and network errors.

### How to Use the Python Script

1.  Make sure you have Python 3 installed along with the required libraries: `requests`, `beautifulsoup4`, `demjson3`, and `lxml`.
2.  Open your terminal or command prompt.
3.  Run the script with one or more Bandcamp URLs. The script will create a folder named after the primary artist, containing a detailed JSON file of their discography and any downloaded images.

**Basic Usage:**

```bash
python bandcamp-archiver.py [-h] [-t] [-cd] [-d] [-H] [-sl] [-dl DELAY] [-r RETRIES] [-rd RETRY_DELAY] [urls ...]
```

**Arguments:**

* `urls`: (Required) One or more Bandcamp URLs to process. Can be an artist's main page (recommended), a specific album, or a track.
* `-t`, `--track-art`: Fetch individual track cover art, "about" sections, and credits. This is slower as it requires an extra request for each track.
* `-cd`, `--cover-download`: Download album/track covers and artist images (profile, banner, background).
* `-d`, `--debug`: Enable verbose debug logging to see detailed script operations.
* `-H`, `--hash-covers`: When downloading unique track art, verify uniqueness using MD5 hashes and remove any duplicate image files.
* `-sl`, `--save-list`: Save a list of all found album/track URLs to a file named `bandcamp-dump.lst` inside the artist's output folder.
* `-dl DELAY`, `--delay DELAY`: Add a delay between requests in milliseconds. Use a single number (e.g., `2000`) for a fixed delay, or a range (e.g., `1000-5000`) for a random delay.
* `-r RETRIES`, `--retries RETRIES`: Set the maximum number of retries for a failed request (default: 5).
* `-rd RETRY_DELAY`, `--retry-delay RETRY_DELAY`: Set the initial delay in seconds before retrying a failed request. This delay is multiplied by the attempt number for exponential backoff (default: 5).

## How to Use the Extension

1.  **Installation (for Development/Local Use):**
    * Clone or download this repository.
    * Open Firefox and navigate to `about:debugging#/runtime/this-firefox`.
    * Click "Load Temporary Add-on..." and select the `manifest.json` file.
2.  **Accessing Features:**
    * Click the extension icon for the main popup menu.
    * Right-click on a relevant page (Bandcamp or Archive.org) for the context menu.

## Files Overview

* **`bandcamp-archiver.py`**: The standalone Python script for creating detailed JSON caches of artist discographies.
* **`manifest.json`**: Defines the extension's properties, permissions, and components.
* **`background.js`**: The core logic for all extension features.
* **`contentScript.js`**: Injected into Bandcamp pages to assist with feature execution.
* **`popup.html` / `popup.css` / `popup.js`**: The structure, style, and logic for the main browser action popup menu.
* **`import.html` / `import.js`**: The UI for the legacy JSON import functionality.
* **`logo.svg` / `json.svg` / `import.svg`**: Icons.

## Permissions Used

* **`tabs`**: To query, execute scripts in, and manage your open tabs.
* **`contextMenus`**: To add the "Bandcamp Tools" and "Archive.org Tools" context menus.
* **`*://*.bandcamp.com/*` / `*://archive.org/download/*`**: To allow the extension to run on these specific sites.
* **`clipboardWrite`**: To copy the collected data (tags, URLs, etc.) to your clipboard.
* **`downloads`**: To save images and album covers.
* **`storage`**: To save your settings (email, zip code, and toggles) locally.

## Known Issues & Limitations

* **Language Dependency**: The extension identifies item types (e.g., "Name Your Price," "Paid") by searching for specific English and Japanese text. If your Bandcamp interface is set to another language, you **must** manually edit the hardcoded text strings in `background.js` and `contentScript.js`.
* The automated download and data-extraction features rely on specific page structures. If Bandcamp updates its website, these parts of the extension may need to be updated.
* The timing delays (`setTimeout`) in the download automation are generalized. On very slow connections, they might occasionally be too short.
* Download Album Covers sometimes fails on specific pages for various reasons, resulting in some missing covers.

## License

This program is free software: you can redistribute it and/or modify it under the terms of the **GNU General Public License** as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.