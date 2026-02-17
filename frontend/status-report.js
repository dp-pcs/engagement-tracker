// Status Report Functions

async function loadStatusReport() {
    try {
        const [engRes, testRes, solRes] = await Promise.all([
            fetch(`${API_URL}/engagements`),
            fetch(`${API_URL}/testimonials`),
            fetch(`${API_URL}/solicitations`)
        ]);

        const engData = await engRes.json();
        const testData = await testRes.json();
        const solData = await solRes.json();

        engagements = engData.engagements || [];
        testimonials = testData.testimonials || [];
        solicitations = solData.solicitations || [];

        renderStatusReport();
    } catch (error) {
        console.error('Error loading status report:', error);
    }
}

function renderStatusReport() {
    // Set report date
    const now = new Date();
    document.getElementById('report-date').textContent =
        'Generated: ' + now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    // Calculate summary stats
    const statusCounts = {
        discovery: engagements.filter(e => e.status === 'discovery').length,
        active: engagements.filter(e => e.status === 'active').length,
        paused: engagements.filter(e => e.status === 'paused').length,
        complete: engagements.filter(e => e.status === 'closed-complete').length
    };
    const pendingRequests = solicitations.filter(s => s.status === 'pending').length;

    document.getElementById('summary-active').textContent = statusCounts.active;
    document.getElementById('summary-discovery').textContent = statusCounts.discovery;
    document.getElementById('summary-paused').textContent = statusCounts.paused;
    document.getElementById('summary-complete').textContent = statusCounts.complete;
    document.getElementById('summary-feedback').textContent = testimonials.length;
    document.getElementById('summary-pending-requests').textContent = pendingRequests;

    // Build engagement feedback map
    const feedbackByEngagement = {};
    testimonials.forEach(t => {
        if (t.engagementId) {
            feedbackByEngagement[t.engagementId] = (feedbackByEngagement[t.engagementId] || 0) + 1;
        }
    });

    const solicitationsByEngagement = {};
    solicitations.forEach(s => {
        if (s.engagementId && s.status === 'pending') {
            solicitationsByEngagement[s.engagementId] = (solicitationsByEngagement[s.engagementId] || 0) + 1;
        }
    });

    // Render engagements table
    const tbody = document.getElementById('engagements-report-body');
    tbody.textContent = '';

    // Sort: active first, then by name
    const sortedEngagements = [...engagements].sort((a, b) => {
        const statusOrder = { active: 0, discovery: 1, paused: 2, 'closed-complete': 3, 'closed-failed': 4 };
        const aOrder = statusOrder[a.status] ?? 5;
        const bOrder = statusOrder[b.status] ?? 5;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return (a.name || '').localeCompare(b.name || '');
    });

    sortedEngagements.forEach(e => {
        const tr = document.createElement('tr');
        tr.onclick = () => viewEngagement(e.id);
        tr.style.cursor = 'pointer';

        // Engagement Name
        const tdName = createElement('td', { className: 'engagement-name-cell' }, [e.name || '']);
        tr.appendChild(tdName);

        // Team
        tr.appendChild(createElement('td', {}, [e.team || '-']));

        // Status
        const statusTd = document.createElement('td');
        statusTd.appendChild(createElement('span',
            { className: 'status-badge status-' + e.status },
            [formatStatus(e.status)]));
        tr.appendChild(statusTd);

        // Request/Objectives
        const objectives = e.objectives || e.description || '-';
        const truncatedObj = objectives.length > 100 ? objectives.substring(0, 100) + '...' : objectives;
        tr.appendChild(createElement('td', { className: 'objectives-cell' }, [truncatedObj]));

        // Blockers
        const blockerTd = createElement('td', {
            className: e.blockers ? 'blockers-cell has-blocker' : 'blockers-cell'
        }, [e.blockers || 'None']);
        tr.appendChild(blockerTd);

        // Target Date
        tr.appendChild(createElement('td', {}, [e.targetDate || 'TBD']));

        // Feedback counts
        const feedbackTd = document.createElement('td');
        feedbackTd.className = 'feedback-cell';
        const feedbackDiv = createElement('div', { className: 'feedback-counts' });

        const testCount = feedbackByEngagement[e.id] || 0;
        const pendCount = solicitationsByEngagement[e.id] || 0;

        const testSpan = createElement('span', { className: 'feedback-count testimonials' },
            ['\u2713 ' + testCount]);
        feedbackDiv.appendChild(testSpan);

        if (pendCount > 0) {
            const pendSpan = createElement('span', { className: 'feedback-count pending' },
                ['\u23F3 ' + pendCount]);
            feedbackDiv.appendChild(pendSpan);
        }

        feedbackTd.appendChild(feedbackDiv);
        tr.appendChild(feedbackTd);

        tbody.appendChild(tr);
    });

    // Render blockers section
    const blockersContainer = document.getElementById('blockers-list');
    blockersContainer.textContent = '';

    const engagementsWithBlockers = engagements.filter(e =>
        e.blockers && !e.status.startsWith('closed'));

    if (engagementsWithBlockers.length === 0) {
        blockersContainer.appendChild(createElement('div', { className: 'no-blockers' },
            ['No current blockers - all engagements are unblocked!']));
    } else {
        engagementsWithBlockers.forEach(e => {
            const item = createElement('div', { className: 'blocker-item' });
            item.appendChild(createElement('div', { className: 'engagement-name' }, [e.name || '']));
            item.appendChild(createElement('div', { className: 'blocker-text' }, [e.blockers]));
            blockersContainer.appendChild(item);
        });
    }

    // Render recent feedback
    const feedbackContainer = document.getElementById('recent-feedback-list');
    feedbackContainer.textContent = '';

    const recentFeedback = testimonials.slice(0, 5);
    if (recentFeedback.length === 0) {
        feedbackContainer.appendChild(createElement('div', { className: 'no-items' },
            ['No feedback received yet']));
    } else {
        recentFeedback.forEach(t => {
            const item = createElement('div', { className: 'feedback-item' });

            const header = createElement('div', { className: 'feedback-header' });

            const authorDiv = document.createElement('div');
            authorDiv.appendChild(createElement('span', { className: 'feedback-author' },
                [t.submitterName || 'Anonymous']));
            if (t.submitterRole) {
                authorDiv.appendChild(document.createTextNode(' - ' + t.submitterRole));
            }
            header.appendChild(authorDiv);

            // Rating stars
            const ratingSpan = document.createElement('span');
            for (let i = 0; i < 5; i++) {
                ratingSpan.appendChild(createElement('span',
                    { className: i < (t.rating || 0) ? 'star filled' : 'star' }, ['\u2605']));
            }
            header.appendChild(ratingSpan);

            item.appendChild(header);

            if (t.engagementName) {
                item.appendChild(createElement('div', { className: 'feedback-engagement' },
                    ['Re: ' + t.engagementName]));
            }

            const text = t.testimonialText || '';
            const truncatedText = text.length > 200 ? text.substring(0, 200) + '...' : text;
            item.appendChild(createElement('div', { className: 'feedback-text' },
                ['"' + truncatedText + '"']));

            feedbackContainer.appendChild(item);
        });
    }

    // Render pending solicitations
    const solicitationsContainer = document.getElementById('pending-solicitations-list');
    solicitationsContainer.textContent = '';

    const pendingSolicitations = solicitations.filter(s => s.status === 'pending');
    if (pendingSolicitations.length === 0) {
        solicitationsContainer.appendChild(createElement('div', { className: 'no-items' },
            ['No pending feedback requests']));
    } else {
        pendingSolicitations.forEach(s => {
            const item = createElement('div', { className: 'solicitation-item' });

            const infoDiv = createElement('div', { className: 'solicitation-info' });
            infoDiv.appendChild(createElement('div', { className: 'recipient-name' },
                [s.recipientName || 'Unknown']));
            infoDiv.appendChild(createElement('div', { className: 'solicitation-meta' },
                [(s.engagementName || 'Unknown engagement') + ' \u2022 Sent ' + formatDate(s.createdAt)]));
            item.appendChild(infoDiv);

            const copyBtn = createElement('button', { className: 'btn btn-small btn-secondary' }, ['Copy Link']);
            copyBtn.onclick = (e) => {
                e.stopPropagation();
                copyToClipboard(window.location.origin + '/feedback.html?token=' + s.token);
            };
            item.appendChild(copyBtn);

            solicitationsContainer.appendChild(item);
        });
    }
}
