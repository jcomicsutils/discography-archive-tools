document.addEventListener('DOMContentLoaded', function () {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('fileInput');
    const resultsContainer = document.getElementById('results-container');

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

    function handleFile(file) {
        if (file && file.type === 'application/json') {
            const reader = new FileReader();
            reader.onload = function(event) {
                try {
                    const data = JSON.parse(event.target.result);
                    processJsonData(data);
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

    function processJsonData(data) {
        const nypOutput = [];
        const paidOutput = [];
        const allTags = new Set();

        data.forEach(item => {
            const formattedTitle = `${item.title} | ${item.artist}`;
            const entry = `${formattedTitle}\n${item.url}`;

            if (item.classification === 'nyp' || item.classification === 'free') {
                nypOutput.push(entry);
            } else {
                paidOutput.push(entry);
            }
            if (item.tags && Array.isArray(item.tags)) {
                item.tags.forEach(tag => allTags.add(tag.toLowerCase()));
            }
        });
        
        document.getElementById('nyp-output').value = nypOutput.join('\n');
        document.getElementById('paid-output').value = paidOutput.join('\n');
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