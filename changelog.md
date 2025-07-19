# Changelog

### 2025-07-18
#### Changed
 - **Discography Titles Panel**: On the "Import JSON" page, the "Discography Titles" panel has been updated. Instead of a single text area, it now displays each title as a separate entry with its own dedicated "Copy" button for easier one-click copying.

---
### 2025-07-15
#### Added
 - **Sort by Date Published**: On the "Import JSON" page, you can now sort releases by their `datePublished`.
 - **Richer JSON Cache Data**: The JSON cache now includes much more detail for each release:
    - `datePublished`: The release date from the page's metadata.
    - `about`: The full text from the "About" section.
    - `credits`: The full text from the "Credits" section.
    - `license`: The licensing information (e.g., "all rights reserved").
    - `coverUrl_0`: A direct link to the high-resolution `_0` version of the cover art.
    - `trackinfo`: Contains the `title`, `duration`, and `lyrics` (if available) for every track.
#### Changed
 - **Centralized Data Scraping**: Refactored the code to use a single, efficient helper function for extracting all data from a release page, reducing redundancy and improving maintainability.
#### Fixed
 - Settings popup not working properly.

---
### 2025-07-12
#### Added
* **Discography Titles Panel**: On the "Import JSON" page, a new panel has been added that automatically generates a list of discography category names (e.g., `Artist Discography`, `(Streaming) Artist Discography`, etc.) if the imported cache file contains a top-level artist name.
#### Changed
* **JSON Cache Structure**: The exported JSON cache file now has a new structure. It uses the main artist's name as a top-level key, which contains the list of all releases.
* **JSON Import Backward Compatibility**: The "Import JSON" page is backward compatible and can correctly read both the new cache format (with a top-level artist key) and the old format (a simple list).
* **Artist Name in Tags**: When importing a cache file with the new format, the top-level artist's name is now automatically added to the "All Tags" list.

---
### 2025-07-06
#### Added
 - **Sort Button on Import Page**: Added a "Sort" button to the "Import JSON" page, allowing users to sort the imported releases lists by **Artist**, **Title**, or **item_id**.

---
### 2025-07-04
#### Added
 - **JSON Cache Export**: Added an option in settings to automatically save the cache (including URL, classification, artist, title, and tags) to a `datools-cache/artist.json` file after a scan.
 - **Force Save JSON Button**: A new icon button was added to the main UI to allow users to scan an artist's page and save the cache to a JSON file on demand, irrespective of the setting.
 - **Import JSON Feature**:
    - Added an "Import JSON" button that opens a new, dedicated browser tab for importing `datools-cache` files.
    - The import page allows users to drag-and-drop or select a JSON file.
    - Upon import, the data is parsed and displayed in three separate panels: "NYP/Free Titles & URLs", "Paid Titles & URLs", and "All Tags", each with its own copy button.
    - **HTML Format Toggle**: On the "Import JSON" page, a new "HTML" toggle button has been added.
    - **Item ID Toggle on Import Page**: On the "Import JSON" page, a new "Add item_id" toggle button has been added. When enabled, it appends the `item_id` in brackets (e.g., `[123456789]`) to each release title in the output lists.
#### Fixed
 - **Classification Bug**: Corrected a critical bug where "Free Download" albums were being misclassified as "Paid" during both live tab analysis and background fetching.

---
### 2025-07-03
#### Added
 - New option to disable HTML escaping.

---
### 2025-06-28
#### Added
 - New HTML escaping logic for copying release titles. This ensures that special characters (`< > = " ' & @ |`) are correctly converted to their HTML entities before being copied.
 - This new logic is applied to the "Copy NYP/Free Titles & URLs", "Copy Paid Titles & URLs", and "Copy Releases Links & Titles" functions.

---
### 2025-06-26
#### Changed
 - Implemented a comprehensive caching system for artist-page functions.
 - When using "Copy Tags", "Copy NYP/Free", "Copy Paid", or "Download Album Covers", the extension now fetches all necessary data (tags, classification, title, cover URL) at once and stores it.
 - Subsequent uses of any of these functions will pull from the cache instead of re-fetching pages, improving speed and reducing network requests.

---
### 2025-06-24
#### Fixed
 - Improved filename sanitization to remove invisible characters (e.g., zero-width spaces) from titles, which previously caused downloads for certain albums to fail. This affects both "Download Album Covers" and "Download This Album's Cover" features.
#### Changed
 - Filename sanitization now collapses multiple consecutive spaces into a single space.

---
### 2025-06-16
#### Added
 - New option on album/track pages to download only that specific cover, using the same folder structure and filename formatting as the "Download All" feature.
#### Fixed
 - (Hopefully) Corrected a major bug in both "Download This Cover" and "Download Album Covers" that caused downloads to fail.
 - Enhanced filename sanitization to handle titles with problematic leading characters (e.g., ellipses), preventing download failures.

---
### 2025-06-15
#### Added
 - New feature to copy file lists from `archive.org` download pages.
 - Changelog
#### Changed
- Improved the popup menu logic to make global actions always visible while keeping page-specific buttons context-sensitive.
- Updated filename sanitization to replace invalid characters with hyphens and collapse multiple hyphens into one.
- Album cover filenames for titles longer than 50 characters are now automatically truncated to prevent errors.

---
### 2025-06-11
#### Added
- Functionality to assist with Streaming Archive.

---
### 2025-06-08
#### Added
- Feature to find and download all album covers from an artist's main page.

#### Changed
- Enhanced the "Copy Titles and URLs" feature.

---
### 2025-06-07
#### Added
- Ability to copy all release links from an artist's page.

#### Changed
- Improved data copying: The extension now fetches data for all releases in the background without needing to have them open in separate tabs.

---
### 2025-06-01
#### Added
- On-page feedback notifications for actions.
- Support for automatically filling email and zip code fields for required downloads.

#### Fixed
- Addressed and fixed issues related to the image downloading feature.

---
### 2025-05-31
#### Added
- Feature to download the artist photo, custom header, and background image from a Bandcamp page.
- Initial project setup, including the popup UI, content scripts, and background logic.