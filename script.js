const parser = new DOMParser();
const electionData = JSON.parse(localStorage.getItem("election-data")) || {};
let sortBy = localStorage.getItem("sortBy") || 'margin';
let order = localStorage.getItem("order") || 'asc';
let urls, data, urlHash;
const changeSort = (e) => {
    sortBy = e.value;
    localStorage.setItem("sortBy", sortBy);
    renderContent();
}
const changeOrder = (e) => {
    order = e.value;
    localStorage.setItem("order", order);
    renderContent();
}
const getColorCode = (lastUpdated) => {
    let diff = Date.now() - lastUpdated;

    let group = Math.floor(diff / 10000);
    if (group > 15)
        group = 15;

    return "#ff" + group.toString(16);
}
const getLastUpdated = (lastUpdated) => {
    let diff = Date.now() - lastUpdated;
    diff = Math.floor(diff / 1000);
    if (diff < 60)
        return diff + ' secs';
    diff = Math.floor(diff / 60);
    if (diff < 60)
        return diff + ' mins'
    diff = Math.floor(diff / 60);
    if (diff < 24)
        return diff + ' hrs'
    diff = Math.floor(diff / 24);
    return diff + ' days'
}
const getPartyColor = (party) => {
    switch (party) {
        case 'Aam Aadmi Party': return '#0171ae';
        case 'Bharatiya Janata Party': return '#f78628';
        case 'Indian National Congress': return '#166a30';
        case 'All India Trinamool Congress': return '#51c976';
        case 'All India Anna Dravida Munnetra Kazhagam': return '#0B9421';
        case 'Dravida Munnetra Kazhagam': return '#FF0000';
        case 'Tamilaga Vettri Kazhagam': return '#aaaa3a';
        default: return 'white';
    }
}
const getRoundColor = (round) => {
    const [done, total] = round.replace("-", "").split("/");
    if (done == total)
        return 'red';
    return 'white';
}
async function getHash(message) {
    const msgUint8 = new TextEncoder().encode(message); // encode as (utf-8) Uint8Array
    const hashBuffer = await window.crypto.subtle.digest("SHA-1", msgUint8); // hash the message
    const hashHex = new Uint8Array(hashBuffer).toHex(); // Convert ArrayBuffer to hex string.
    return hashHex;
}

const fetchData = async (url) => {
    const response = await fetch(url, { credentials: "include" });
    const responseText = await response.text();
    const doc = parser.parseFromString(responseText, "text/html");
    const tbody = doc.querySelector(".table>tbody");
    Array.from(tbody.children).forEach(row => {
        const cols = Array.from(row.children);
        const constituency = cols[0].innerText;
        const id = cols[1].innerText;
        const leadingCandidate = cols[2].innerText;

        const leadingParty = cols[3].querySelector("table td").innerText;
        const trailingCandidate = cols[4].innerText;
        const trailingParty = cols[5].querySelector("table td").innerText;
        const margin = cols[6].innerText;
        const round = cols[7].innerText;
        let record = data.find(i => i.id == id);
        if (record) {
            let json = JSON.stringify(record);
            record.leadingCandidate = leadingCandidate;
            record.leadingParty = leadingParty;
            record.trailingCandidate = trailingCandidate;
            record.trailingParty = trailingParty;
            record.margin = Number(margin);
            record.round = round;
            if (json != JSON.stringify(record)) {
                record.lastUpdated = Date.now();
            }
        }
        else {
            data.push({ id, constituency, leadingCandidate, leadingParty, trailingCandidate, trailingParty, margin, round, lastUpdated: Date.now() });
        }
    });

    electionData[urlHash] = data;
    localStorage.setItem("election-data", JSON.stringify(electionData));
    console.log("Saved", electionData, JSON.stringify(electionData), localStorage.getItem("election-data"));
}
const getPartyStatus = () => {
    const partyStatus = {};
    data.forEach(i => {
        let party = partyStatus[i.leadingParty];
        const margin1K = i.margin < 1000 ? 1 : 0;
        const margin5K = i.margin < 5000 ? 1 : 0;
        const [done, total] = i.round.replace("-", "").split("/");
        let won = 0;
        if (done == total)
            won++;
        if (party) {
            party.leading++;
            party.margin1K += margin1K;
            party.margin5K += margin5K;
            party.won = party.won ? party.won + won : won;
        }
        else {
            partyStatus[i.leadingParty] = { leading: 1, trailing: 0, margin1K, margin5K, won };
        }
        party = partyStatus[i.trailingParty];
        if (party) {
            party.trailing++;
        }
        else {
            partyStatus[i.trailingParty] = { leading: 0, trailing: 1, margin1K: 0, margin5K: 0, won: 0 };
        }

    })
    return partyStatus;
}
const renderContent = async () => {
    await Promise.all(urls.map(async url => await fetchData(url)));

    const partyStatus = getPartyStatus();


    let renderHTML = `Last Updated: ${new Date()}`;

    renderHTML += (`
            <h3>Party Status</h3>
            <table>
                <tr>
                    <th>Party</th>
                    <th>Won+Leading</th>
                    <th>Won</th>
                    <th>Leading</th>
                    <th>Trailing</th>
                    <th>Margin 1K</th>
                    <th>Margin 5K</th>
                </tr>
                ${Object.keys(partyStatus).sort().map(party => `<tr>
                    <td>${party}</td>
                    <td>${partyStatus[party].leading}</td>
                    <td>${partyStatus[party].won}</td>
                    <td>${partyStatus[party].leading - partyStatus[party].won}</td>
                    <td>${partyStatus[party].trailing}</td>
                    <td>${partyStatus[party].margin1K}</td>
                    <td>${partyStatus[party].margin5K}</td>
                </tr>`).join("")}
            </table>
            `);

    let rounds = { done: 0, total: 0 };
    let updated = 0;
    data.forEach(i => {
        const [done, total] = i.round.replace("-", "").split("/");
        rounds.done += Number(done);
        rounds.total += Number(total);
        if (Date.now() - i.lastUpdated < 1000)
            updated++;
    })
    renderHTML += (`<br><br><h3>Progress: ${rounds.done}/${rounds.total}  ${Math.floor(rounds.done * 100 / rounds.total)}%</h3>`)

    renderHTML += `${updated > 0 ? `${updated} constituencies updated` : ''}`
    const stringSortOptions = ["constituency", "leadingParty"];
    data.sort((a, b) => {
        if (order == "asc") {
            if (stringSortOptions.includes(sortBy)) {
                return a[sortBy] < b[sortBy] ? -1 : 1;
            }
            else
                return a[sortBy] - b[sortBy];
        }
        else {
            if (stringSortOptions.includes(sortBy))
                return b[sortBy] < a[sortBy] ? -1 : 1;
            else
                return b[sortBy] - a[sortBy];
        }
    });




    renderHTML += (`
            <h3>Constituency wise data</h3>
            <div><b>Sort by</b><select onchange="changeSort(this)">
                <option value="constituency" ${sortBy == "constituency" ? "selected" : ""} >Constituency</option>
                <option value="margin" ${sortBy == "margin" ? "selected" : ""} >Margin</option>
                <option value="lastUpdated" ${sortBy == "lastUpdated" ? "selected" : ""} >Last Updated</option>
                <option value="leadingParty" ${sortBy == "leadingParty" ? "selected" : ""} >Leading Party</option>
                </select>
                <b>Order</b><select onchange="changeOrder(this)">
                <option value="asc" ${order == "asc" ? "selected" : ""}>asc</option>
                <option value="desc" ${order == "desc" ? "selected" : ""}>desc</option>
                </select>
            </div>

            <table>
                <tr>
                    <th>Constituency</th>
                    <th>Leading Party</th>
                    <th>Trailing Party</th>
                    <th>Margin</th>
                    <th>Round</th>
                    <th>Last Updated</th>
                </tr>
                ${data.map(i => `<tr style="background-color:${getColorCode(i.lastUpdated)}" >
                    <td>${i.constituency}</td>
                    <td style="background-color:${getPartyColor(i.leadingParty)}">${i.leadingParty}<br><small>${i.leadingCandidate}</small></td>
                    <td style="background-color:${getPartyColor(i.trailingParty)}">${i.trailingParty}<br><small>${i.trailingCandidate}</small></td>
                    <td>${i.margin}</td>
                    <td style="background-color:${getRoundColor(i.round)}">${i.round}</td>
                    <td>${getLastUpdated(i.lastUpdated)} ago</td>
                </tr>`).join("")}
            </table>



            `);

    document.body.innerHTML = renderHTML;
}
const start = async (baseUrl, pages) => {
    urlHash = await getHash(baseUrl);
    urls = Array(pages).fill(0).map((_, i) => `${baseUrl}${i + 1}.htm`);
    data = electionData[urlHash] || [];
    setInterval(renderContent, 10000);
    renderContent();
}