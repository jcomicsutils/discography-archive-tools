document.addEventListener('DOMContentLoaded', function () {
    function sendMessageAndClose(actionName) {
        browser.runtime.sendMessage({ action: actionName })
            .then(() => {
                // Optional: Handle response from background script if needed
            })
            .catch(error => {
                console.error(`Error sending message for action "${actionName}":`, error);
            });
        window.close(); // Close the popup after sending the message
    }

    document.getElementById('sortTabsBtn').addEventListener('click', function() {
        sendMessageAndClose("sortTabs");
    });

    document.getElementById('clickDownloadBtn').addEventListener('click', function() {
        sendMessageAndClose("clickDownload");
    });

    document.getElementById('copyKeywordsBtn').addEventListener('click', function() {
        sendMessageAndClose("copyKeywords");
    });

    document.getElementById('copyNypTitlesUrlsBtn').addEventListener('click', function() {
        sendMessageAndClose("copyNypTitlesUrls");
    });

    document.getElementById('copyPaidTitlesUrlsBtn').addEventListener('click', function() {
        sendMessageAndClose("copyPaidTitlesUrls");
    });
});