document.addEventListener('DOMContentLoaded', function () {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('fileInput');
    const resultsContainer = document.getElementById('results-container');
    const formatHtmlCheckbox = document.getElementById('format-html');
    const addItemIdCheckbox = document.getElementById('add-item-id');
    const sortSelect = document.getElementById('sort-select');
    let cachedData = [];
    let topLevelArtist = null; // Variable to store the top-level artist name
    let currentSort = 'artist';

    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFile(files[0]);
        }
    });
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFile(e.target.files[0]);
        }
    });

    formatHtmlCheckbox.addEventListener('change', updateOutput);
    addItemIdCheckbox.addEventListener('change', updateOutput);
    sortSelect.addEventListener('change', function() {
        currentSort = this.value;
        updateOutput();
    });

    function handleFile(file) {
        if (file && file.type === 'application/json') {
            const reader = new FileReader();
            reader.onload = function(event) {
                try {
                    topLevelArtist = null; // Reset on each new file import
                    const parsedJson = JSON.parse(event.target.result);
                    
                    // Check for new format (object with artist key) vs old format (array)
                    if (Array.isArray(parsedJson)) {
                        cachedData = parsedJson; // Old format
                    } else if (typeof parsedJson === 'object' && parsedJson !== null && Object.keys(parsedJson).length > 0) {
                        // New format: get the artist name (the key) and the release list (the value)
                        topLevelArtist = Object.keys(parsedJson)[0]; 
                        cachedData = Object.values(parsedJson)[0];
                        if (!Array.isArray(cachedData)) {
                             throw new Error("JSON object value is not an array.");
                        }
                    } else {
                        cachedData = []; // Handle empty or unrecognized JSON
                    }
                    updateOutput();
                    resultsContainer.classList.remove('hidden-section');
                } catch (err) {
                    alert('Error: Invalid JSON file. ' + err.message);
                    console.error("Import error:", err);
                }
            };
            reader.readAsText(file);
        } else {
            alert('Please select a valid JSON file.');
        }
    }

    function updateOutput() {
        const discographyTitlesOutput = document.getElementById('discography-titles-output');

        if (topLevelArtist) {
            const titles = [
                `${topLevelArtist} Streaming Discography`,
                `${topLevelArtist} Discography`,
                `(Streaming) ${topLevelArtist} Discography`,
                `(Streaming) (Netlabel) ${topLevelArtist} Discography`,
                `(Streaming) (Label) ${topLevelArtist} Discography`,
                `(Netlabel) ${topLevelArtist} Discography`,
                `(Label) ${topLevelArtist} Discography`
            ];
            discographyTitlesOutput.value = titles.join('\n');
        } else {
            discographyTitlesOutput.value = "artist not found";
        }

        cachedData.sort((a, b) => {
            if (currentSort === 'artist') {
                const artistCompare = a.artist.localeCompare(b.artist, undefined, { sensitivity: 'base' });
                if (artistCompare !== 0) {
                    return artistCompare;
                }
                return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
            }

            if (currentSort === 'title') {
                return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
            }

            if (currentSort === 'item_id') {
                return a.item_id - b.item_id;
            }

            return 0;
        });

        const isHtml = formatHtmlCheckbox.checked;
        const addItemId = addItemIdCheckbox.checked;
        const nypOutput = [];
        const paidOutput = [];
        const allOutput = [];
        const allTags = new Set();

        if (topLevelArtist) {
            allTags.add(topLevelArtist.toLowerCase());
        }

        cachedData.forEach(item => {
            const itemIdSuffix = (addItemId && item.item_id) ? ` [${item.item_id}]` : '';

            let entry;
            if (isHtml) {
                const title = `${item.artist} - ${item.title}${itemIdSuffix}`;
                entry = `<a href="${item.url}">${title}</a><br>\n`;
            } else {
                const title = `${item.title}${itemIdSuffix} | ${item.artist}`;
                entry = `${title}\n${item.url}`;
            }

            allOutput.push(entry);

            if (item.classification === 'nyp' || item.classification === 'free') {
                nypOutput.push(entry);
            } else {
                paidOutput.push(entry);
            }
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
            const targetId = this.getAttribute('data-target');
            const content = document.getElementById(targetId).value;
            navigator.clipboard.writeText(content).then(() => {
                this.textContent = 'Copied!';
                setTimeout(() => { this.textContent = 'Copy'; }, 2000);
            });
        });
    });
});