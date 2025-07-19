document.addEventListener('DOMContentLoaded', function () {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('fileInput');
    const resultsContainer = document.getElementById('results-container');
    const formatHtmlCheckbox = document.getElementById('format-html');
    const addItemIdCheckbox = document.getElementById('add-item-id');
    const sortSelect = document.getElementById('sort-select');
    const artistSelectorContainer = document.getElementById('artist-selector-container');
    const artistSelect = document.getElementById('artist-select');

    let allReleases = [];
    let uniqueArtists = new Set();
    let currentSort = 'artist';

    // --- Event Listeners ---
    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        handleFiles(e.dataTransfer.files);
    });
    fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

    // --- Control Listeners ---
    formatHtmlCheckbox.addEventListener('change', updateOutputPanels);
    addItemIdCheckbox.addEventListener('change', updateOutputPanels);
    sortSelect.addEventListener('change', function() {
        currentSort = this.value;
        updateOutputPanels();
    });
    artistSelect.addEventListener('change', () => updateDiscographyTitles(artistSelect.value));

    function handleFiles(files) {
        if (!files || files.length === 0) return;

        // Reset state for new file batch
        allReleases = [];
        uniqueArtists = new Set();
        artistSelect.innerHTML = '';
        artistSelectorContainer.classList.add('hidden');

        const jsonFiles = Array.from(files).filter(file => file && file.type === 'application/json');
        const processedFileCount = jsonFiles.length;

        if (processedFileCount === 0) {
            alert('No JSON files were selected.');
            return;
        }

        const fileReadPromises = jsonFiles.map(file => {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = function(event) {
                    try {
                        const parsedJson = JSON.parse(event.target.result);
                        let artistName, releaseList;

                        if (Array.isArray(parsedJson)) {
                            artistName = 'Unknown Artist';
                            releaseList = parsedJson;
                        } else if (typeof parsedJson === 'object' && parsedJson !== null && Object.keys(parsedJson).length > 0) {
                            artistName = Object.keys(parsedJson)[0].trim(); // Trim whitespace
                            releaseList = Object.values(parsedJson)[0];
                            if (!Array.isArray(releaseList)) {
                                throw new Error(`In ${file.name}, the JSON object's value is not a release list.`);
                            }
                        } else {
                            return resolve(); // Skip empty or invalid JSON structures
                        }

                        uniqueArtists.add(artistName);
                        allReleases.push(...releaseList);
                        resolve();
                    } catch (err) {
                        reject(`Error parsing ${file.name}: ${err.message}`);
                    }
                };
                reader.onerror = () => reject(`Error reading ${file.name}`);
                reader.readAsText(file);
            });
        });

        Promise.all(fileReadPromises)
            .then(() => {
                if (allReleases.length === 0) {
                    alert('No valid release data found in the selected files.');
                    resultsContainer.classList.add('hidden'); // Hide results if no data
                    return;
                }

                // Handle artist selection logic
                const artists = Array.from(uniqueArtists);
                if (processedFileCount > 1 && artists.length > 1) {
                    artists.forEach(artist => {
                        const option = document.createElement('option');
                        option.value = artist;
                        option.textContent = artist;
                        artistSelect.appendChild(option);
                    });
                    artistSelectorContainer.classList.remove('hidden');
                    updateDiscographyTitles(artists[0]);
                } else if (artists.length >= 1) {
                    updateDiscographyTitles(artists[0]);
                } else {
                    updateDiscographyTitles(null); // No artists found
                }

                // Update all output panels with combined data
                updateOutputPanels();
                resultsContainer.classList.remove('hidden');
            })
            .catch(error => {
                alert('An error occurred while processing files:\n' + error);
                console.error("Import error:", error);
            });
    }

    function updateDiscographyTitles(artistName) {
        const outputDiv = document.getElementById('discography-titles-output');
        outputDiv.innerHTML = '';

        if (!artistName || artistName === 'Unknown Artist') {
            outputDiv.innerHTML = '<span>Select an artist to see discography titles.</span>';
            return;
        }

        const titles = [
            `${artistName} Streaming Discography`, `${artistName} Discography`,
            `(Streaming) ${artistName} Discography`, `(Streaming) (Netlabel) ${artistName} Discography`,
            `(Streaming) (Label) ${artistName} Discography`, `(Netlabel) ${artistName} Discography`,
            `(Label) ${artistName} Discography`
        ];

        titles.forEach(title => {
            const entryDiv = document.createElement('div');
            entryDiv.className = 'discography-title-entry';
            const titleSpan = document.createElement('span');
            titleSpan.textContent = title;
            const copyBtn = document.createElement('button');
            copyBtn.className = 'copy-btn-small';
            copyBtn.textContent = 'Copy';
            copyBtn.onclick = () => {
                navigator.clipboard.writeText(title).then(() => {
                    copyBtn.textContent = 'Copied!';
                    setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
                });
            };
            entryDiv.append(titleSpan, copyBtn);
            outputDiv.appendChild(entryDiv);
        });
    }

    function updateOutputPanels() {
        // Sort the combined list of all releases
        allReleases.sort((a, b) => {
            if (currentSort === 'artist') {
                const artistA = a.artist || ''; const artistB = b.artist || '';
                const artistCompare = artistA.localeCompare(artistB, undefined, { sensitivity: 'base' });
                if (artistCompare !== 0) return artistCompare;
                return (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' });
            }
            if (currentSort === 'title') return (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' });
            if (currentSort === 'item_id') return (Number(a.item_id) || 0) - (Number(b.item_id) || 0);
            if (currentSort === 'datePublished') return (new Date(b.datePublished || 0)) - (new Date(a.datePublished || 0));
            return 0;
        });

        const isHtml = formatHtmlCheckbox.checked;
        const addItemId = addItemIdCheckbox.checked;
        const nypOutput = [];
        const paidOutput = [];
        const allOutput = [];
        const allTags = new Set(Array.from(uniqueArtists).filter(a => a !== 'Unknown Artist').map(a => a.toLowerCase()));

        allReleases.forEach(item => {
            if (!item || !item.artist || !item.title || !item.url) return;
            const itemIdSuffix = (addItemId && item.item_id) ? ` [${item.item_id}]` : '';
            const entry = isHtml
                ? `<a href="${item.url}">${item.artist} - ${item.title}${itemIdSuffix}</a><br>\n`
                : `${item.title}${itemIdSuffix} | ${item.artist}\n${item.url}`;

            allOutput.push(entry);
            (item.classification === 'nyp' || item.classification === 'free') ? nypOutput.push(entry) : paidOutput.push(entry);
            if (item.tags && Array.isArray(item.tags)) {
                item.tags.forEach(tag => allTags.add(tag.toLowerCase()));
            }
        });

        const joiner = isHtml ? '' : '\n';
        document.getElementById('nyp-output').value = nypOutput.join(joiner);
        document.getElementById('paid-output').value = paidOutput.join(joiner);
        document.getElementById('all-output').value = allOutput.join(joiner);
        document.getElementById('tags-output').value = Array.from(allTags).join('; ');
    }

    document.querySelectorAll('.copy-btn').forEach(button => {
        button.addEventListener('click', function() {
            const targetId = this.dataset.target;
            const content = document.getElementById(targetId).value;
            navigator.clipboard.writeText(content).then(() => {
                this.textContent = 'Copied!';
                setTimeout(() => { this.textContent = 'Copy'; }, 2000);
            });
        });
    });
});