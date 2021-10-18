const fields = [
    "first_author", 
    "year", 
    "author", 
    "title", 
    "bibcode", 
    "first_author_norm", 
    "author_norm"
];

function resetMessages(){
    document.getElementById("failure").style.display = "none";
    document.getElementById("warning").style.display = "none";
    document.getElementById("success").style.display = "none";
    document.getElementById("citename").disabled = false;
    document.getElementById("addbtn").disabled = false;
}

function displayError(msg = "An unknown error occurred"){
    resetMessages();    
    document.getElementById("failure").style.display = "block";
    document.getElementById("failure").innerText = msg;
}

function displaySuccess(){
    resetMessages();
    document.getElementById("citename").disabled = true;
    document.getElementById("addbtn").disabled = true;
    document.getElementById("success").style.display = "block";
    setTimeout(window.close, 2000);
}

function displayWarning(msg = "An unknown error occurred"){
    resetMessages();
    document.getElementById("warning").style.display = "block";
    document.getElementById("warning").innerText = msg;
    setTimeout(window.close, 5000);
}

function getAuthorStr(author){
    // Convert name from "Last, First I." to "First I. Last" 
    return author.split(",").reverse().join(" ").trim()
}

function getDefaultCitename(data){
    let first_author = data.first_author.split(",")[0];
    return first_author + ":" + data.year;
}

function getAuthorOptions(authors){
    var optionList = new Array();
    authors.forEach(author => optionList.push({"name": getAuthorStr(author)}))
    return optionList;
}

async function getADSBibcode(){
    // Get URL of current tab
    const url = await browser.tabs.query(
        {active: true, currentWindow: true}
    ).then(tabs => new URL(tabs[0].url));

    // Split URL path
    const urlpath = url.pathname.split("/");

    // Test for valid URL
    if(url.hostname == "ui.adsabs.harvard.edu" && urlpath[1] == "abs"){
        // URL is an ADS paper link, so we can isolate the bibcode
        const bibcode = urlpath[2];
        return bibcode;
    } else {
        throw new Error("invalid URL");
    }
}

async function lookupRef(bibcode){
    // Load ADS API key from storage
    const storedCreds = await browser.storage.sync.get("ads_key");

    // Make a request to the NASA API, return a JSON of data
    // Construct request URL
    const url = "https://api.adsabs.harvard.edu/v1/search/query?q=bibcode:"
        + bibcode + "&fl=" + fields.join(",");

    // Make request
    const response = await fetch(url, {
        headers:{"Authorization": "Bearer:" + storedCreds.ads_key}
    });

    // Test if response is OK (could come back as a 400/429 code for too many requests)
    if(!response.ok){
        throw new Error("ADS network response error")
    } else {
        // Response is OK, return the data
        return response.json().then(data => data.response.docs[0]);
    }
}

async function addToNotion(adsData, citekey){
    // Load Notion API key and db id from storage
    const storedCreds = await browser.storage.sync.get(["notion_key", "notion_db"]);

    // Add data to Notion by making an API request
    const headers = {
        "Authorization": "Bearer " + storedCreds.notion_key,
        "Content-Type": "application/json",
        "Notion-Version": "2021-08-16"
    };

    const notionData = {
        parent: {
            "database_id": storedCreds.notion_db
        },
        properties: {
            "ID": {
                "title": [
                    {
                        "text": {
                            "content": citekey
                        }
                    }
                ]
            },
            "First Author": {
                "select": {
                    "name": adsData.first_author.split(",")[0]
                }
            },
            "Year": {"number": Number(adsData.year)},
            "Authors": {
                "multi_select": getAuthorOptions(adsData.author)
            },
            "Title": {
                "rich_text": [
                    {
                        "text": {
                            "content": adsData.title[0]
                        }
                    }
                ]
            },
            // "Tags",
            "ADS Bibcode": {
                "rich_text": [
                    {
                        "text":{
                            "content": adsData.bibcode
                        }
                    }
                ]
            },
            "ADS Link": {
                "url": "https://ui.adsabs.harvard.edu/abs/" + adsData.bibcode
            },
            "Authors (norm)": {
                "multi_select": getAuthorOptions(adsData.author_norm)
            },
            "First Author (norm)": {
                "select": {
                    "name": getAuthorStr(adsData.first_author_norm)
                }
            }
        } 
    };

    // Make request
    const response = await fetch("https://api.notion.com/v1/pages", {
        method: "POST",
        headers: headers,
        body: JSON.stringify(notionData),
    });

    // Test if response is OK
    if(!response.ok){
        throw new Error("Notion network response error")
    } else {
        // Response is OK, return 
        return response;
    }
}

async function updateADSBibcode(){
    // Update the current ADS Bibcode text
    const bibcode = await getADSBibcode().catch((e) => {
        displayError("Error: could not find ADS bibcode");
        console.log(e);
        document.getElementById("citename").disabled = true;
        document.getElementById("addbtn").disabled = true;
    });
    document.getElementById("ads_bibcode").innerText = bibcode;
}

async function addRef(){
    if (document.activeElement instanceof HTMLElement)
        document.activeElement.blur();
    document.getElementById("citename").disabled = true;
    document.getElementById("addbtn").disabled = true;

    // Get ADS Bibcode, lookup corresponding reference, save to Notion
    try {
        const citekey = document.getElementById("citename").value;
        const bibcode = await getADSBibcode().catch((e) => {
            displayError("Error: could not find ADS bibcode");
            document.getElementById("citename").disabled = true;
            document.getElementById("addbtn").disabled = true;
            throw e;
        });
        const adsData = await lookupRef(bibcode).catch((e) => {
            displayError("Error: could not access ADS API");
            throw e;
        });
        await addToNotion(adsData, citekey).catch((e) => {
            displayError("Error: could not access Notion API");
            throw e;
        });
        displaySuccess();
    } catch (e) {
        console.log(e);
    }
}

async function setupPage(){
    resetMessages();

    // Check that credentials are saved
    browser.storage.sync.get().then((res) => {
        if(!(res.ads_key && res.notion_key && res.notion_db)){
            displayError("Error: no saved credentials");
            document.getElementById("citename").disabled = true;
            document.getElementById("addbtn").disabled = true;
        }
    });

    // Find and update the ADS Bibcode
    updateADSBibcode();

    // Construct default citename from ADS data
    const bibcode = await getADSBibcode();
    const adsData = await lookupRef(bibcode).catch((e) => {
        displayError("Error: could not access ADS API");
        console.error(e);
    });
    document.querySelector("#citename").value = getDefaultCitename(adsData);

    // Add event listeners
    document.getElementById("addbtn").addEventListener("click", addRef)
    document.querySelector("#citename").addEventListener("keyup", (e) => {
        if (e.keyCode === 13){
            e.preventDefault();
            addRef();
        }
    });

    // Set focus to input field
    document.querySelector("#citename").focus();
}

window.addEventListener("load", setupPage);