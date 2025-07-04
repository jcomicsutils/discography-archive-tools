// contentScript.js (Corrected)
(function() {
  let classification = 'paid'; // Default classification

  // Find the common H4 element that contains purchase/download options
  const purchaseSectionH4 = document.querySelector('h4.ft.compound-button.main-button');

  if (purchaseSectionH4) {
    // Attempt 1: Check for the span structure for "name your price"
    const nypSpan = purchaseSectionH4.querySelector('span.buyItemExtra.buyItemNyp.secondaryText');
    if (nypSpan) {
      const txt = nypSpan.textContent.trim().toLowerCase();
      if (txt === 'name your price' || txt === 'free download' || txt === '値段を決めて下さい' || txt === '無料ダウンロード') {
        classification = 'nyp';
      }
    }

    // Attempt 2: If not classified, check for a direct "Free Download" button
    if (classification === 'paid') {
      const freeDownloadButton = purchaseSectionH4.querySelector('button.download-link.buy-link');
      if (freeDownloadButton) {
        const buttonTxt = freeDownloadButton.textContent.trim().toLowerCase();
        // It now correctly checks `buttonTxt` for both English and Japanese.
        if (buttonTxt === 'free download' || buttonTxt === '無料ダウンロード') {
          classification = 'free';
        }
      }
    }
  }

  // Send the determined classification to background.js
  browser.runtime.sendMessage({
    type: 'classification',
    value: classification
  });
})();