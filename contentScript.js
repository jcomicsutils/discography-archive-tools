// contentScript.js (Revised)
(function() {
  let classification = 'paid'; // Default classification

  // Find the common H4 element that contains purchase/download options
  const purchaseSectionH4 = document.querySelector('h4.ft.compound-button.main-button');

  if (purchaseSectionH4) {
    // Attempt 1: Check for the span structure (this handles "name your price" and potentially some "free download" cases)
    const nypSpan = purchaseSectionH4.querySelector('span.buyItemExtra.buyItemNyp.secondaryText');
    if (nypSpan) {
      const txt = nypSpan.textContent.trim().toLowerCase();
      // If this span contains "name your price" or "free download", classify as 'nyp'
      // ('nyp' is treated as non-paid by your background.js script)
      if (txt === 'name your price' || txt === 'free download') {
        classification = 'nyp';
      }
    }

    // Attempt 2: If not classified by the span, check for a direct "Free Download" button
    // This block will only execute if the item wasn't classified as 'nyp' above
    if (classification === 'paid') {
      const freeDownloadButton = purchaseSectionH4.querySelector('button.download-link.buy-link');
      if (freeDownloadButton) {
        const buttonTxt = freeDownloadButton.textContent.trim().toLowerCase();
        // If the button text is "free download", classify as 'free'
        // ('free' is also treated as non-paid by your background.js script)
        if (buttonTxt === 'free download') {
          classification = 'free';
        }
        // Other button texts like "Buy Now" would not change the classification from 'paid'
      }
    }
  }

  // Send the determined classification to background.js
  browser.runtime.sendMessage({
    type: 'classification',
    value: classification
  });
})();