// popup.js
document.addEventListener('DOMContentLoaded', function () {
    function sendMessageAndClose(actionName) {
        browser.runtime.sendMessage({ action: actionName })
            .then(() => {
                console.log(`Message for action "${actionName}" sent successfully.`);
            })
            .catch(error => {
                console.error(`Error sending message for action "${actionName}":`, error);
            });
        window.close();
    }

    const buttons = [
        { id: 'sortTabsBtn', action: 'sortTabs' },
        { id: 'clickDownloadBtn', action: 'clickDownload' },
        { id: 'copyKeywordsBtn', action: 'copyKeywords' },
        { id: 'copyNypTitlesUrlsBtn', action: 'copyNypTitlesUrls' },
        { id: 'copyPaidTitlesUrlsBtn', action: 'copyPaidTitlesUrls' },
        { id: 'downloadImagesBtn', action: 'downloadImages' }
    ];

    buttons.forEach(buttonInfo => {
        const buttonElement = document.getElementById(buttonInfo.id);
        if (buttonElement) {
            buttonElement.addEventListener('click', function() {
                sendMessageAndClose(buttonInfo.action);
            });
        } else {
            console.warn(`Button with ID "${buttonInfo.id}" not found in popup.html`);
        }
    });
});