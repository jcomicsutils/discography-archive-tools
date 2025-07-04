document.addEventListener('DOMContentLoaded', function () {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('fileInput');
    const resultsContainer = document.getElementById('results-container');
    const formatHtmlCheckbox = document.getElementById('format-html');
    const addItemIdCheckbox = document.getElementById('add-item-id'); // New element
    let cachedData = [];

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

    // Add event listeners for both checkboxes
    formatHtmlCheckbox.addEventListener('change', updateOutput);
    addItemIdCheckbox.addEventListener('change', updateOutput);

    function handleFile(file) {
        if (file && file.type === 'application/json') {
            const reader = new FileReader();
            reader.onload = function(event) {
                try {
                    cachedData = JSON.parse(event.target.result);
                    updateOutput();
                    resultsContainer.classList.remove('hidden-section');
                } catch (err) {
                    alert('Error: Invalid JSON file.');
                }
            };
            reader.readAsText(file);
        } else {
            alert('Please select a valid JSON file.');
        }
    }

    function updateOutput() {
        if (cachedData.length === 0) return;

        const isHtml = formatHtmlCheckbox.checked;
        const addItemId = addItemIdCheckbox.checked; // Check status of new checkbox
        const nypOutput = [];
        const paidOutput = [];
        const allOutput = [];
        const allTags = new Set();

        cachedData.forEach(item => {
            // Create the item_id suffix if the box is checked and the id exists
            const itemIdSuffix = (addItemId && item.item_id) ? ` [${item.item_id}]` : '';
            
            let entry;
            if (isHtml) {
                // Append suffix to the link text for HTML format
                const title = `${item.artist} - ${item.title}${itemIdSuffix}`;
                entry = `<a href="${item.url}">${title}</a><br>\n`;
            } else {
                // Append suffix to the title for plain text format
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