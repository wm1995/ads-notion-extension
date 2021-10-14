// Adapted from the favourite-colour webextension example
function saveOptions(e) {
    browser.storage.sync.set({
        ads_key: document.querySelector("#ads_key").value,
        notion_key: document.querySelector("#notion_key").value,
        notion_db: document.querySelector("#notion_db").value
    });
    e.preventDefault();
}

function restoreOptions() {
    var storedVals = browser.storage.sync.get();
    storedVals.then((res) => {
        document.querySelector("#ads_key").value = res.ads_key || "";
        document.querySelector("#notion_key").value = res.notion_key || "";
        document.querySelector("#notion_db").value = res.notion_db || "";
    });
}

document.addEventListener('DOMContentLoaded', restoreOptions);
document.querySelectorAll("input").forEach((input) => {
    input.addEventListener("input", saveOptions);
});