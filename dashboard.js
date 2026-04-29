document.addEventListener('DOMContentLoaded', () => {
    const user = JSON.parse(localStorage.getItem('user'));
    if (user?.name) document.getElementById('userName').textContent = user.name;

    const navLinks = document.querySelectorAll('#navMenu a'), sections = document.querySelectorAll('.view-section');
    navLinks.forEach(link => link.addEventListener('click', e => {
        e.preventDefault();
        navLinks.forEach(l => l.classList.remove('active'));
        sections.forEach(s => (s.style.display = 'none', s.classList.remove('active-section')));
        link.classList.add('active');
        const target = document.getElementById(link.dataset.target);
        target.style.display = 'block'; target.classList.add('active-section');
    }));

    document.getElementById('logoutBtn').addEventListener('click', () => (localStorage.removeItem('user'), window.location.href = 'login.html'));

    loadEventModule(); loadMemberModule(); loadFinanceModule();
    setTimeout(() => { fetchParticipants(); fetchColleagues(); fetchDestinations(); }, 500);
});

async function fetchAndRender(url, containerId, emptyHtml, renderCallback) {
    const c = document.getElementById(containerId);
    try {
        const data = await (await fetch(url)).json();
        if (data.error) throw new Error(data.error);
        c.innerHTML = data.length ? data.map(renderCallback).join('') : emptyHtml;
    } catch (e) {
        c.innerHTML = `<p style="color:#ef4444;padding:10px;">Error: ${e.message}</p>`;
    }
}

const formatDate = d => !d || isNaN(new Date(d)) ? 'N/A' : `${String(new Date(d).getUTCMonth()+1).padStart(2,'0')}-${String(new Date(d).getUTCDate()).padStart(2,'0')}-${new Date(d).getUTCFullYear()}`;

const showLoading = (id, type='p', cols=3) => {
    const s = `<i class="fa-solid fa-spinner fa-spin"></i> Loading data...`;
    document.getElementById(id).innerHTML = type==='tr' ? `<tr><td colspan="${cols}" class="text-orange">${s}</td></tr>` : type==='li' ? `<li class="text-orange">${s}</li>` : `<p class="text-orange">${s}</p>`;
};

function loadEventModule() {
    fetchTreks(); fetchSemesterPlanning();
    // Query 3: High Budget Events (Alert List)
    fetchAndRender('/api/events/budget/above-average', 'highBudgetList', '<li>No high budget events found.</li>', e => `
        <li><span class="item-title"><i class="fa-solid fa-circle-exclamation"></i> ${e.event_type} (${e.event_id})</span><span class="item-value" style="color:#ef4444;">৳${e.budget.toLocaleString()}</span></li>`);
}

// Query 1: Upcoming Treks (Table)
function fetchTreks() {
    const v = document.getElementById('trekDateFilter')?.value, url = v ? `/api/events/trekking?date=${encodeURIComponent(v)}` : '/api/events/trekking';
    showLoading('trekTableBody', 'tr', 3);
    fetchAndRender(url, 'trekTableBody', '<tr><td colspan="3">No treks planned.</td></tr>', t => `
        <tr><td><strong>${t.spot_name}</strong></td><td>${formatDate(t.event_date)}</td><td class="${t.budget < 50000 ? 'budget-safe' : 'budget-warn'}">৳${t.budget.toLocaleString()}</td></tr>`);
}

// Query 2: Semester Planning (Stat Cards)
function fetchSemesterPlanning() {
    const v = document.getElementById('semesterYearFilter')?.value, url = v ? `/api/events/budget/semester?year=${encodeURIComponent(v)}` : '/api/events/budget/semester';
    showLoading('semesterCards', 'p');
    fetchAndRender(url, 'semesterCards', '<p>No semester data found for this year.</p>', s => `
        <div class="stat-card"><h4>${s.semester_name} ${s.year}</h4><div class="stat-value">৳${parseInt(s.Total_Planned_Budget).toLocaleString()}</div></div>`);
}

// Query 4: Destinations (Grid)
function fetchDestinations() {
    const v = document.getElementById('districtFilter')?.value, url = v ? `/api/destinations/explore?district=${encodeURIComponent(v)}` : '/api/destinations/explore';
    showLoading('destGrid', 'p');
    fetchAndRender(url, 'destGrid', '<p>No destinations found in this district.</p>', d => `
        <div class="dest-card"><h4>${d.Spot_name}</h4><p>Est. Budget: ৳${d.estimated_budget.toLocaleString()}</p><p style="color: #f97316; font-size: 0.85rem; font-weight: bold; margin-top: 5px;"><i class="fa-solid fa-route"></i> Visited: ${d.times_visited} time(s)</p></div>`);
}

function loadMemberModule() {
    // Query 4: Top Performers (Leaderboard)
    const l = document.getElementById('leaderboardList');
    fetch('/api/members/top-performers').then(r=>r.json()).then(t => {
        if (t.error) throw new Error(t.error);
        l.innerHTML = t.length ? t.slice(0,5).map((m, i) => {
            let med = i===0 ? '<i class="fa-solid fa-medal" style="color:#fbbf24;"></i> ' : i===1 ? '<i class="fa-solid fa-medal" style="color:#94a3b8;"></i> ' : i===2 ? '<i class="fa-solid fa-medal" style="color:#b45309;"></i> ' : `<span style="color:#64748b;font-weight:bold;width:20px;display:inline-block;">${i+1}.</span> `;
            return `<li><span class="item-title">${med} ${m.Name}</span><span class="item-value">${m.Total_Points} pts</span></li>`;
        }).join('') : '<li>No performers found.</li>';
    }).catch(e => l.innerHTML = `<li>Error: ${e.message}</li>`);

    // Query 2: Active Members (Contact Roster Table)
    fetchAndRender('/api/members/active', 'activeMembersTable', '<tr><td colspan="3">No active members.</td></tr>', m => `
        <tr><td><strong>${m.Name}</strong></td><td>${m.E_mail}</td><td style="color:#94a3b8;">${formatDate(m.Join_Date)}</td></tr>`);
}

// Query 1: Event Participation (Search & Detail List)
function fetchParticipants() {
    showLoading('partResults', 'li');
    fetchAndRender(`/api/events/${document.getElementById('partEventId').value}/participants`, 'partResults', '<li>No participants found.</li>', p => `
        <li><span class="item-title">${p.Name} <span class="badge" style="background:${p.role.toLowerCase() === 'organizer' ? '#f9731622; color: #f97316' : '#94a3b822; color: #94a3b8'};">${p.role}</span></span><span class="item-value">${p.points} pts</span></li>`);
}

// Query 3: Peer Discovery (Profile Cards)
function fetchColleagues() {
    const n = document.getElementById('colleagueName').value;
    showLoading('colleagueResultsGrid', 'p');
    fetchAndRender(`/api/members/colleagues?name=${encodeURIComponent(n)}`, 'colleagueResultsGrid', '<p>No peers found.</p>', p => p.Name.toLowerCase() === n.toLowerCase() ? '' : `
        <div class="dest-card" style="border-color: rgba(249,115,22,0.2);"><h4><i class="fa-solid fa-user"></i> ${p.Name}</h4><p style="color: #94a3b8; font-weight: normal; margin-top: 5px;">${p.Department_name}</p><p style="color: #94a3b8; font-weight: normal; font-size: 0.8rem;">${p.Position_name}</p></div>`);
}

function loadFinanceModule() {
    // Query 1: Budget Variance (Progress Bars)
    fetchAndRender('/api/events/budget/compare', 'budgetVarianceContainer', '<p>No budget data.</p>', v => `
        <div class="progress-container"><div class="progress-header"><span>Event ${v.event_id}</span><span>৳${Number(v.Actual_Expenses).toLocaleString()} / ৳${Number(v.Planned_Budget).toLocaleString()}</span></div>
        <div class="progress-bar-bg"><div class="progress-bar-fill ${Number(v.Actual_Expenses) > Number(v.Planned_Budget) ? 'over-budget' : ''}" style="width: ${Number(v.Planned_Budget) > 0 ? Math.min((Number(v.Actual_Expenses) / Number(v.Planned_Budget)) * 100, 100) : 0}%;"></div></div></div>`);

    fetchIncomeLedger();

    // Query 3: Sponsor Contribution (Showcase Cards)
    fetchAndRender('/api/finance/sponsors', 'sponsorCards', '<p>No sponsors found.</p>', s => `
        <div class="stat-card" style="border-color: rgba(74, 222, 128, 0.2);"><h4><i class="fa-solid fa-handshake"></i> ${s.brand_name}</h4><div class="stat-value" style="color: #4ade80;">৳${parseInt(s.Total_Contribution).toLocaleString()}</div></div>`);

    // Query 4: Inactive Members (Actionable List)
    fetchAndRender('/api/members/inactive', 'inactiveMembersList', '<li>All members are active!</li>', m => `
        <li><div><span class="item-title">${m.Name}</span><br><small style="color: #94a3b8;">${m.E_mail}</small></div><button class="action-btn"><i class="fa-solid fa-paper-plane"></i> Send Invite</button></li>`);
}

// Query 2: Income Statement (Ledger Table)
function fetchIncomeLedger() {
    const v = document.getElementById('incomeYearFilter')?.value, url = v ? `/api/finance/income?year=${encodeURIComponent(v)}` : '/api/finance/income';
    showLoading('incomeLedgerTable', 'tr', 3);
    fetchAndRender(url, 'incomeLedgerTable', '<tr><td colspan="3">No income records found for this year.</td></tr>', i => `
        <tr><td>${formatDate(i.date)}</td><td><strong>${i.source_type}</strong><br><small style="color:#94a3b8;">${i.description}</small></td><td class="text-income">+৳${i.amount.toLocaleString()}</td></tr>`);
}
