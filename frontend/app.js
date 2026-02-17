// State
let engagements = [];
let testimonials = [];
let solicitations = [];
let agents = [];
let tasks = [];
let currentFilter = 'all';
let currentTaskFilter = 'all';

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setupNavigation();
    loadDashboard();
});

// Navigation
function setupNavigation() {
    document.querySelectorAll('.nav-links a').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const view = link.dataset.view;

            // Update active states
            document.querySelectorAll('.nav-links a').forEach(l => l.classList.remove('active'));
            link.classList.add('active');

            document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
            document.getElementById(`${view}-view`).classList.add('active');

            // Load data for view
            switch (view) {
                case 'dashboard':
                    loadDashboard();
                    break;
                case 'status-report':
                    loadStatusReport();
                    break;
                case 'engagements':
                    loadEngagements();
                    break;
                case 'tasks':
                    loadTasks();
                    break;
                case 'agents':
                    loadAgents();
                    break;
                case 'testimonials':
                    loadTestimonials();
                    break;
                case 'solicitations':
                    loadSolicitations();
                    break;
            }
        });
    });

    // Engagement filter buttons
    document.querySelectorAll('.filters .filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filters .filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.status;
            renderEngagements();
        });
    });

    // Task filter buttons
    document.querySelectorAll('.tasks-filters .filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tasks-filters .filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentTaskFilter = btn.dataset.taskStatus;
            renderTasks();
        });
    });
}

// Secure HTML escaping - prevents XSS by converting special chars to entities
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const text = String(str);
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, char => map[char]);
}

// Safe DOM element creation helper
function createElement(tag, attrs = {}, children = []) {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([key, value]) => {
        if (key === 'className') el.className = value;
        else if (key === 'onclick') el.onclick = value;
        else if (key.startsWith('data-')) el.setAttribute(key, value);
        else el[key] = value;
    });
    children.forEach(child => {
        if (typeof child === 'string') {
            el.appendChild(document.createTextNode(child));
        } else if (child) {
            el.appendChild(child);
        }
    });
    return el;
}

// Dashboard
async function loadDashboard() {
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

        // Update stats
        const activeCount = engagements.filter(e =>
            ['discovery', 'active'].includes(e.status)).length;
        const completedCount = engagements.filter(e =>
            e.status === 'closed-complete').length;
        const pendingCount = solicitations.filter(s =>
            s.status === 'pending').length;

        document.getElementById('stat-active').textContent = activeCount;
        document.getElementById('stat-completed').textContent = completedCount;
        document.getElementById('stat-testimonials').textContent = testimonials.length;
        document.getElementById('stat-pending').textContent = pendingCount;

        // Recent engagements - using safe DOM construction
        const recentEngContainer = document.getElementById('recent-engagements');
        recentEngContainer.textContent = ''; // Clear safely

        const recentEngagements = engagements.slice(0, 5);
        if (recentEngagements.length === 0) {
            recentEngContainer.textContent = 'No engagements yet';
        } else {
            recentEngagements.forEach(e => {
                const card = createElement('div', { className: 'card', onclick: () => viewEngagement(e.id) });

                const header = createElement('div', { className: 'card-header' });
                header.appendChild(createElement('span', { className: 'card-title' }, [e.name || '']));

                const badge = createElement('span', { className: `status-badge status-${escapeHtml(e.status)}` }, [formatStatus(e.status)]);
                header.appendChild(badge);
                card.appendChild(header);

                const meta = createElement('div', { className: 'card-meta' },
                    [`${e.team || 'No team'} • Updated ${formatDate(e.updatedAt)}`]);
                card.appendChild(meta);

                recentEngContainer.appendChild(card);
            });
        }

        // Recent testimonials - using safe DOM construction
        const recentTestContainer = document.getElementById('recent-testimonials');
        recentTestContainer.textContent = ''; // Clear safely

        const recentTestimonials = testimonials.slice(0, 3);
        if (recentTestimonials.length === 0) {
            recentTestContainer.textContent = 'No testimonials yet';
        } else {
            recentTestimonials.forEach(t => {
                const card = createElement('div', { className: 'card' });

                const header = createElement('div', { className: 'card-header' });
                header.appendChild(createElement('span', { className: 'card-title' }, [t.submitterName || '']));

                const ratingSpan = document.createElement('span');
                ratingSpan.innerHTML = renderRating(t.rating); // Rating is a number, safe
                header.appendChild(ratingSpan);
                card.appendChild(header);

                const text = t.testimonialText || '';
                const truncated = text.length > 150 ? text.substring(0, 150) + '...' : text;
                card.appendChild(createElement('p', { className: 'card-meta' }, [truncated]));

                recentTestContainer.appendChild(card);
            });
        }

    } catch (error) {
        console.error('Error loading dashboard:', error);
    }
}

// Engagements
async function loadEngagements() {
    try {
        const response = await fetch(`${API_URL}/engagements`);
        const data = await response.json();
        engagements = data.engagements || [];
        renderEngagements();
    } catch (error) {
        console.error('Error loading engagements:', error);
    }
}

function renderEngagements() {
    const container = document.getElementById('engagements-list');
    container.textContent = ''; // Clear safely

    const filtered = currentFilter === 'all'
        ? engagements
        : engagements.filter(e => e.status === currentFilter);

    if (filtered.length === 0) {
        container.textContent = 'No engagements found';
        return;
    }

    filtered.forEach(e => {
        const card = createElement('div', { className: 'engagement-card', onclick: () => viewEngagement(e.id) });

        // Status badge
        card.appendChild(createElement('span',
            { className: `status-badge status-${escapeHtml(e.status)}` },
            [formatStatus(e.status)]));

        // Name
        card.appendChild(createElement('h3', { className: 'engagement-name' }, [e.name || '']));

        // Team
        card.appendChild(createElement('div', { className: 'engagement-team' }, [e.team || 'No team assigned']));

        // Description
        card.appendChild(createElement('p', { className: 'engagement-description' }, [e.description || 'No description']));

        // Footer
        const footer = createElement('div', { className: 'engagement-footer' });

        const toolsDiv = createElement('div', { className: 'engagement-tools' });
        const tools = e.tools || [];
        tools.slice(0, 3).forEach(t => {
            toolsDiv.appendChild(createElement('span', { className: 'tool-tag' }, [t]));
        });
        if (tools.length > 3) {
            toolsDiv.appendChild(createElement('span', { className: 'tool-tag' }, [`+${tools.length - 3}`]));
        }
        footer.appendChild(toolsDiv);

        footer.appendChild(createElement('span', { className: 'card-meta' }, [formatDate(e.updatedAt)]));
        card.appendChild(footer);

        container.appendChild(card);
    });
}

async function showEngagementModal(engagement = null) {
    const modal = document.getElementById('engagement-modal');
    const form = document.getElementById('engagement-form');
    const title = document.getElementById('engagement-modal-title');

    // Load agents for dropdown
    await loadAgentsForDropdown();

    if (engagement) {
        title.textContent = 'Edit Engagement';
        document.getElementById('engagement-id').value = engagement.id;
        document.getElementById('engagement-name').value = engagement.name || '';
        document.getElementById('engagement-team').value = engagement.team || '';
        document.getElementById('engagement-owner').value = engagement.owner || '';
        document.getElementById('engagement-description').value = engagement.description || '';
        document.getElementById('engagement-status').value = engagement.status || 'discovery';
        document.getElementById('engagement-objectives').value = engagement.objectives || '';
        document.getElementById('engagement-tools').value = (engagement.tools || []).join(', ');
        document.getElementById('engagement-start-date').value = engagement.startDate || '';
        document.getElementById('engagement-target-date').value = engagement.targetDate || '';
        document.getElementById('engagement-blockers').value = engagement.blockers || '';
        document.getElementById('engagement-next-steps').value = engagement.nextSteps || '';

        // Set selected agents in multi-select
        const agentSelect = document.getElementById('engagement-agents');
        const engagementAgents = engagement.agents || [];
        Array.from(agentSelect.options).forEach(option => {
            option.selected = engagementAgents.includes(option.value);
        });
    } else {
        title.textContent = 'New Engagement';
        form.reset();
        document.getElementById('engagement-id').value = '';
    }

    modal.classList.add('active');
}

async function loadAgentsForDropdown() {
    try {
        const response = await fetch(`${API_URL}/agents`);
        const data = await response.json();
        agents = data.agents || [];

        const select = document.getElementById('engagement-agents');
        select.textContent = '';

        agents.forEach(a => {
            const option = createElement('option', { value: a.name }, [a.name]);
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading agents:', error);
    }
}

// Store engagement data for editing
let currentEngagementData = null;

async function saveEngagement(event) {
    event.preventDefault();

    const id = document.getElementById('engagement-id').value;
    const data = {
        name: document.getElementById('engagement-name').value,
        team: document.getElementById('engagement-team').value,
        owner: document.getElementById('engagement-owner').value,
        description: document.getElementById('engagement-description').value,
        status: document.getElementById('engagement-status').value,
        objectives: document.getElementById('engagement-objectives').value,
        tools: document.getElementById('engagement-tools').value.split(',').map(s => s.trim()).filter(Boolean),
        agents: Array.from(document.getElementById('engagement-agents').selectedOptions).map(o => o.value),
        startDate: document.getElementById('engagement-start-date').value,
        targetDate: document.getElementById('engagement-target-date').value,
        blockers: document.getElementById('engagement-blockers').value,
        nextSteps: document.getElementById('engagement-next-steps').value
    };

    try {
        const url = id ? `${API_URL}/engagements/${id}` : `${API_URL}/engagements`;
        const method = id ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (!response.ok) throw new Error('Failed to save engagement');

        closeModal('engagement-modal');
        loadEngagements();
        loadDashboard();
    } catch (error) {
        console.error('Error saving engagement:', error);
        alert('Failed to save engagement');
    }
}

async function viewEngagement(id) {
    try {
        const response = await fetch(`${API_URL}/engagements/${id}`);
        const engagement = await response.json();
        currentEngagementData = engagement;

        document.getElementById('view-engagement-title').textContent = engagement.name || '';

        const content = document.getElementById('view-engagement-content');
        content.textContent = ''; // Clear safely

        const grid = createElement('div', { className: 'engagement-detail-grid' });

        // Left column
        const leftCol = document.createElement('div');

        // Status section
        const statusSection = createElement('div', { className: 'detail-section' });
        statusSection.appendChild(createElement('h3', {}, ['Status']));
        statusSection.appendChild(createElement('span',
            { className: `status-badge status-${escapeHtml(engagement.status)}` },
            [formatStatus(engagement.status)]));
        leftCol.appendChild(statusSection);

        // Team section
        const teamSection = createElement('div', { className: 'detail-section' });
        teamSection.appendChild(createElement('h3', {}, ['Team']));
        teamSection.appendChild(createElement('p', {}, [engagement.team || 'Not assigned']));
        leftCol.appendChild(teamSection);

        // Owner section
        const ownerSection = createElement('div', { className: 'detail-section' });
        ownerSection.appendChild(createElement('h3', {}, ['Owner']));
        ownerSection.appendChild(createElement('p', {}, [engagement.owner || 'Not assigned']));
        leftCol.appendChild(ownerSection);

        // Description section
        const descSection = createElement('div', { className: 'detail-section' });
        descSection.appendChild(createElement('h3', {}, ['Description']));
        descSection.appendChild(createElement('p', {}, [engagement.description || 'No description']));
        leftCol.appendChild(descSection);

        // Objectives section
        const objSection = createElement('div', { className: 'detail-section' });
        objSection.appendChild(createElement('h3', {}, ['Objectives']));
        objSection.appendChild(createElement('p', {}, [engagement.objectives || 'Not defined']));
        leftCol.appendChild(objSection);

        grid.appendChild(leftCol);

        // Right column
        const rightCol = document.createElement('div');

        // Tools section
        const toolsSection = createElement('div', { className: 'detail-section' });
        toolsSection.appendChild(createElement('h3', {}, ['MCP Tools']));
        const toolsList = createElement('ul', {});
        const tools = engagement.tools || [];
        if (tools.length === 0) {
            toolsList.appendChild(createElement('li', {}, ['None']));
        } else {
            tools.forEach(t => toolsList.appendChild(createElement('li', {}, [t])));
        }
        toolsSection.appendChild(toolsList);
        rightCol.appendChild(toolsSection);

        // Agents section
        const agentsSection = createElement('div', { className: 'detail-section' });
        agentsSection.appendChild(createElement('h3', {}, ['Agents']));
        const agentsList = createElement('ul', {});
        const agents = engagement.agents || [];
        if (agents.length === 0) {
            agentsList.appendChild(createElement('li', {}, ['None']));
        } else {
            agents.forEach(a => agentsList.appendChild(createElement('li', {}, [a])));
        }
        agentsSection.appendChild(agentsList);
        rightCol.appendChild(agentsSection);

        // Blockers section
        const blockersSection = createElement('div', { className: 'detail-section' });
        blockersSection.appendChild(createElement('h3', {}, ['Blockers']));
        blockersSection.appendChild(createElement('p', {}, [engagement.blockers || 'None']));
        rightCol.appendChild(blockersSection);

        // Next steps section
        const nextSection = createElement('div', { className: 'detail-section' });
        nextSection.appendChild(createElement('h3', {}, ['Next Steps']));
        nextSection.appendChild(createElement('p', {}, [engagement.nextSteps || 'Not defined']));
        rightCol.appendChild(nextSection);

        // Dates section
        const datesSection = createElement('div', { className: 'detail-section' });
        datesSection.appendChild(createElement('h3', {}, ['Dates']));
        let datesText = `Started: ${engagement.startDate || 'N/A'}\nTarget: ${engagement.targetDate || 'N/A'}`;
        if (engagement.completedDate) {
            datesText += `\nCompleted: ${engagement.completedDate}`;
        }
        const datesP = createElement('p', {});
        datesP.style.whiteSpace = 'pre-line';
        datesP.textContent = datesText;
        datesSection.appendChild(datesP);
        rightCol.appendChild(datesSection);

        grid.appendChild(rightCol);
        content.appendChild(grid);

        // Actions
        const actions = createElement('div', { className: 'detail-actions' });

        const editBtn = createElement('button', { className: 'btn btn-primary' }, ['Edit']);
        editBtn.onclick = () => {
            closeModal('view-engagement-modal');
            showEngagementModal(currentEngagementData);
        };
        actions.appendChild(editBtn);

        const feedbackBtn = createElement('button', { className: 'btn btn-secondary' }, ['Request Feedback']);
        feedbackBtn.onclick = () => requestFeedback(engagement.id);
        actions.appendChild(feedbackBtn);

        const closeBtn = createElement('button', { className: 'btn btn-secondary' }, ['Close']);
        closeBtn.onclick = () => closeModal('view-engagement-modal');
        actions.appendChild(closeBtn);

        content.appendChild(actions);

        document.getElementById('view-engagement-modal').classList.add('active');
    } catch (error) {
        console.error('Error loading engagement:', error);
    }
}

// Testimonials
async function loadTestimonials() {
    try {
        const response = await fetch(`${API_URL}/testimonials`);
        const data = await response.json();
        testimonials = data.testimonials || [];
        renderTestimonials();
    } catch (error) {
        console.error('Error loading testimonials:', error);
    }
}

function renderTestimonials() {
    const container = document.getElementById('testimonials-list');
    container.textContent = ''; // Clear safely

    if (testimonials.length === 0) {
        container.textContent = 'No testimonials yet';
        return;
    }

    testimonials.forEach(t => {
        const card = createElement('div', { className: 'testimonial-card' });

        // Header
        const header = createElement('div', { className: 'testimonial-header' });
        const authorDiv = document.createElement('div');
        authorDiv.appendChild(createElement('div', { className: 'testimonial-author' }, [t.submitterName || '']));

        let metaText = t.submitterRole || '';
        if (t.submitterTeam) metaText += (metaText ? ' • ' : '') + t.submitterTeam;
        authorDiv.appendChild(createElement('div', { className: 'testimonial-meta' }, [metaText]));
        header.appendChild(authorDiv);

        const ratingDiv = createElement('div', { className: 'testimonial-rating' });
        // Rating is numeric, safe to use for star rendering
        for (let i = 0; i < 5; i++) {
            const star = createElement('span', { className: i < (t.rating || 0) ? 'star filled' : 'star' }, ['★']);
            ratingDiv.appendChild(star);
        }
        header.appendChild(ratingDiv);
        card.appendChild(header);

        // Testimonial text
        const textP = createElement('p', { className: 'testimonial-text' }, [`"${t.testimonialText || ''}"`]);
        card.appendChild(textP);

        // What worked well
        if (t.whatWorkedWell) {
            const workedP = createElement('p', { className: 'testimonial-meta' });
            workedP.style.marginTop = '12px';
            const strong = createElement('strong', {}, ['What worked well: ']);
            workedP.appendChild(strong);
            workedP.appendChild(document.createTextNode(t.whatWorkedWell));
            card.appendChild(workedP);
        }

        // What could improve
        if (t.whatCouldImprove) {
            const improveP = createElement('p', { className: 'testimonial-meta' });
            const strong = createElement('strong', {}, ['Could improve: ']);
            improveP.appendChild(strong);
            improveP.appendChild(document.createTextNode(t.whatCouldImprove));
            card.appendChild(improveP);
        }

        // Footer
        let footerText = '';
        if (t.engagementName) footerText += `Engagement: ${t.engagementName} • `;
        footerText += `Source: ${t.source || 'unknown'} • ${formatDate(t.submittedAt)}`;
        card.appendChild(createElement('div', { className: 'testimonial-engagement' }, [footerText]));

        container.appendChild(card);
    });
}

// Solicitations
async function loadSolicitations() {
    try {
        const [solRes, engRes] = await Promise.all([
            fetch(`${API_URL}/solicitations`),
            fetch(`${API_URL}/engagements`)
        ]);

        const solData = await solRes.json();
        const engData = await engRes.json();

        solicitations = solData.solicitations || [];
        engagements = engData.engagements || [];

        renderSolicitations();
    } catch (error) {
        console.error('Error loading solicitations:', error);
    }
}

function renderSolicitations() {
    const container = document.getElementById('solicitations-list');
    container.textContent = ''; // Clear safely

    if (solicitations.length === 0) {
        container.textContent = 'No solicitations yet';
        return;
    }

    solicitations.forEach(s => {
        const card = createElement('div', { className: 'solicitation-card' });

        // Info section
        const info = createElement('div', { className: 'solicitation-info' });
        info.appendChild(createElement('h3', {}, [s.recipientName || '']));

        let detailText = s.engagementName || '';
        detailText += ` • Created ${formatDate(s.createdAt)}`;
        if (s.recipientEmail) detailText += ` • ${s.recipientEmail}`;
        info.appendChild(createElement('div', { className: 'solicitation-details' }, [detailText]));
        card.appendChild(info);

        // Action section
        const actionDiv = document.createElement('div');
        actionDiv.appendChild(createElement('span', { className: `solicitation-status ${s.status}` }, [s.status || '']));

        if (s.status === 'pending') {
            const copyBtn = createElement('button', { className: 'btn btn-small btn-secondary' }, ['Copy Link']);
            copyBtn.style.marginLeft = '8px';
            const feedbackUrl = `${window.location.origin}/feedback.html?token=${s.token}`;
            copyBtn.onclick = () => copyToClipboard(feedbackUrl);
            actionDiv.appendChild(copyBtn);
        }
        card.appendChild(actionDiv);

        container.appendChild(card);
    });
}

function showSolicitationModal() {
    const select = document.getElementById('solicitation-engagement');
    // Clear existing options
    select.textContent = '';

    const defaultOption = createElement('option', { value: '' }, ['Select an engagement...']);
    select.appendChild(defaultOption);

    engagements
        .filter(e => !e.status.startsWith('closed'))
        .forEach(e => {
            const option = createElement('option', { value: e.id }, [e.name || '']);
            select.appendChild(option);
        });

    document.getElementById('solicitation-result').classList.add('hidden');
    document.getElementById('solicitation-form').reset();
    document.getElementById('solicitation-modal').classList.add('active');
}

async function createSolicitation(event) {
    event.preventDefault();

    const data = {
        engagementId: document.getElementById('solicitation-engagement').value,
        recipientName: document.getElementById('solicitation-recipient-name').value,
        recipientEmail: document.getElementById('solicitation-recipient-email').value,
        recipientRole: document.getElementById('solicitation-recipient-role').value,
        message: document.getElementById('solicitation-message').value,
        requestedBy: document.getElementById('solicitation-requested-by').value
    };

    try {
        const response = await fetch(`${API_URL}/solicitations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (!response.ok) throw new Error('Failed to create solicitation');

        const result = await response.json();

        // Show the generated link
        document.getElementById('generated-link').value = result.feedbackUrl;
        document.getElementById('solicitation-result').classList.remove('hidden');
        document.getElementById('solicitation-form').classList.add('hidden');

        loadSolicitations();
    } catch (error) {
        console.error('Error creating solicitation:', error);
        alert('Failed to create solicitation');
    }
}

function requestFeedback(engagementId) {
    closeModal('view-engagement-modal');
    showSolicitationModal();
    document.getElementById('solicitation-engagement').value = engagementId;
}

function copyLink() {
    const input = document.getElementById('generated-link');
    input.select();
    document.execCommand('copy');
    alert('Link copied to clipboard!');
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        alert('Link copied to clipboard!');
    });
}

// Modal helpers
function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
    if (modalId === 'solicitation-modal') {
        document.getElementById('solicitation-form').classList.remove('hidden');
    }
}

// Utility functions
function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatStatus(status) {
    const statusMap = {
        'discovery': 'Discovery',
        'active': 'Active',
        'paused': 'Paused',
        'closed-complete': 'Completed',
        'closed-failed': 'Failed'
    };
    return statusMap[status] || status || '';
}

// Render rating - returns safe HTML since it only uses numeric input
function renderRating(rating) {
    const numRating = parseInt(rating) || 0;
    return Array(5).fill(0)
        .map((_, i) => `<span class="star ${i < numRating ? 'filled' : ''}">★</span>`)
        .join('');
}

// Tasks
async function loadTasks() {
    try {
        const [taskRes, engRes] = await Promise.all([
            fetch(`${API_URL}/tasks`),
            fetch(`${API_URL}/engagements`)
        ]);

        const taskData = await taskRes.json();
        const engData = await engRes.json();

        tasks = taskData.tasks || [];
        engagements = engData.engagements || [];

        renderTasksSummary(taskData.summary);
        renderTasks();
    } catch (error) {
        console.error('Error loading tasks:', error);
    }
}

function renderTasksSummary(summary) {
    const container = document.getElementById('tasks-summary');
    container.textContent = '';

    if (!summary) return;

    const summaryEl = createElement('div', { className: 'summary-bar' });

    // Progress bar
    const progressContainer = createElement('div', { className: 'progress-container' });
    const progressText = createElement('span', { className: 'progress-text' },
        [`${summary.completed} of ${summary.total} tasks completed (${summary.percentComplete}%)`]);
    progressContainer.appendChild(progressText);

    const progressBar = createElement('div', { className: 'progress-bar' });
    const progressFill = createElement('div', { className: 'progress-fill' });
    progressFill.style.width = `${summary.percentComplete}%`;
    progressBar.appendChild(progressFill);
    progressContainer.appendChild(progressBar);

    summaryEl.appendChild(progressContainer);

    // Stats
    const stats = createElement('div', { className: 'task-stats' });
    stats.appendChild(createElement('span', { className: 'stat-item pending' }, [`${summary.pending} pending`]));
    stats.appendChild(createElement('span', { className: 'stat-item in-progress' }, [`${summary.inProgress} in progress`]));
    stats.appendChild(createElement('span', { className: 'stat-item completed' }, [`${summary.completed} completed`]));
    summaryEl.appendChild(stats);

    container.appendChild(summaryEl);
}

function renderTasks() {
    const container = document.getElementById('tasks-list');
    container.textContent = '';

    const filtered = currentTaskFilter === 'all'
        ? tasks
        : tasks.filter(t => t.status === currentTaskFilter);

    if (filtered.length === 0) {
        container.textContent = currentTaskFilter === 'all'
            ? 'No tasks yet. Create tasks to track progress on your engagements.'
            : `No ${currentTaskFilter} tasks.`;
        return;
    }

    // Group by engagement
    const grouped = {};
    filtered.forEach(t => {
        const engName = t.engagementName || 'Unknown';
        if (!grouped[engName]) grouped[engName] = [];
        grouped[engName].push(t);
    });

    Object.entries(grouped).forEach(([engName, engTasks]) => {
        const section = createElement('div', { className: 'task-section' });

        const header = createElement('div', { className: 'task-section-header' });
        header.appendChild(createElement('h3', {}, [engName]));

        const completed = engTasks.filter(t => t.status === 'completed').length;
        header.appendChild(createElement('span', { className: 'task-count' },
            [`${completed}/${engTasks.length}`]));
        section.appendChild(header);

        const taskList = createElement('div', { className: 'task-list' });
        engTasks.forEach(t => {
            const taskItem = createElement('div', { className: `task-item priority-${t.priority}` });

            // Checkbox
            const checkbox = createElement('input', { type: 'checkbox', className: 'task-checkbox' });
            checkbox.checked = t.status === 'completed';
            checkbox.onchange = () => toggleTaskStatus(t.id, checkbox.checked);
            taskItem.appendChild(checkbox);

            // Task content
            const content = createElement('div', { className: 'task-content' });

            const titleRow = createElement('div', { className: 'task-title-row' });
            const title = createElement('span', {
                className: `task-title ${t.status === 'completed' ? 'completed' : ''}`
            }, [t.title]);
            titleRow.appendChild(title);

            // Priority badge
            titleRow.appendChild(createElement('span',
                { className: `priority-badge priority-${t.priority}` },
                [t.priority]));

            // Status badge if not pending or completed
            if (t.status === 'in-progress') {
                titleRow.appendChild(createElement('span', { className: 'status-badge status-active' }, ['In Progress']));
            } else if (t.status === 'blocked') {
                titleRow.appendChild(createElement('span', { className: 'status-badge status-closed-failed' }, ['Blocked']));
            }

            content.appendChild(titleRow);

            // Meta info
            const meta = createElement('div', { className: 'task-meta' });
            if (t.assignee) meta.appendChild(createElement('span', {}, [t.assignee]));
            if (t.dueDate) meta.appendChild(createElement('span', {}, [`Due: ${formatDate(t.dueDate)}`]));
            content.appendChild(meta);

            taskItem.appendChild(content);

            // Edit button
            const editBtn = createElement('button', { className: 'btn btn-small btn-secondary' }, ['Edit']);
            editBtn.onclick = (e) => {
                e.stopPropagation();
                showTaskModal(t);
            };
            taskItem.appendChild(editBtn);

            taskList.appendChild(taskItem);
        });

        section.appendChild(taskList);
        container.appendChild(section);
    });
}

async function toggleTaskStatus(taskId, completed) {
    try {
        await fetch(`${API_URL}/tasks/${taskId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: completed ? 'completed' : 'pending' })
        });
        loadTasks();
    } catch (error) {
        console.error('Error updating task:', error);
    }
}

async function showTaskModal(task = null) {
    const modal = document.getElementById('task-modal');
    const form = document.getElementById('task-form');
    const title = document.getElementById('task-modal-title');

    // Load engagements for dropdown
    try {
        const response = await fetch(`${API_URL}/engagements`);
        const data = await response.json();
        engagements = data.engagements || [];

        const select = document.getElementById('task-engagement');
        select.textContent = '';
        select.appendChild(createElement('option', { value: '' }, ['Select an engagement...']));

        engagements
            .filter(e => !e.status.startsWith('closed'))
            .forEach(e => {
                const option = createElement('option', { value: e.id }, [e.name || '']);
                select.appendChild(option);
            });
    } catch (error) {
        console.error('Error loading engagements:', error);
    }

    if (task) {
        title.textContent = 'Edit Task';
        document.getElementById('task-id').value = task.id;
        document.getElementById('task-engagement').value = task.engagementId || '';
        document.getElementById('task-title').value = task.title || '';
        document.getElementById('task-description').value = task.description || '';
        document.getElementById('task-status').value = task.status || 'pending';
        document.getElementById('task-priority').value = task.priority || 'medium';
        document.getElementById('task-assignee').value = task.assignee || '';
        document.getElementById('task-due-date').value = task.dueDate || '';
    } else {
        title.textContent = 'New Task';
        form.reset();
        document.getElementById('task-id').value = '';
    }

    modal.classList.add('active');
}

async function saveTask(event) {
    event.preventDefault();

    const id = document.getElementById('task-id').value;
    const data = {
        engagementId: document.getElementById('task-engagement').value,
        title: document.getElementById('task-title').value,
        description: document.getElementById('task-description').value,
        status: document.getElementById('task-status').value,
        priority: document.getElementById('task-priority').value,
        assignee: document.getElementById('task-assignee').value,
        dueDate: document.getElementById('task-due-date').value
    };

    try {
        const url = id ? `${API_URL}/tasks/${id}` : `${API_URL}/tasks`;
        const method = id ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (!response.ok) throw new Error('Failed to save task');

        closeModal('task-modal');
        loadTasks();
    } catch (error) {
        console.error('Error saving task:', error);
        alert('Failed to save task');
    }
}

// Agents
async function loadAgents() {
    try {
        const response = await fetch(`${API_URL}/agents?includeEngagements=true`);
        const data = await response.json();
        agents = data.agents || [];
        renderAgents();
    } catch (error) {
        console.error('Error loading agents:', error);
    }
}

function renderAgents() {
    const container = document.getElementById('agents-list');
    container.textContent = '';

    if (agents.length === 0) {
        container.textContent = 'No agents defined yet. Add agents to track which are used in your engagements.';
        return;
    }

    agents.forEach(a => {
        const card = createElement('div', { className: 'agent-card', onclick: () => viewAgent(a.id) });

        // Status badge
        const statusClass = a.status === 'active' ? 'status-active' :
                           a.status === 'inactive' ? 'status-paused' : 'status-closed-failed';
        card.appendChild(createElement('span', { className: `status-badge ${statusClass}` },
            [a.status.charAt(0).toUpperCase() + a.status.slice(1)]));

        // Name
        card.appendChild(createElement('h3', { className: 'agent-name' }, [a.name || '']));

        // Description
        if (a.description) {
            card.appendChild(createElement('p', { className: 'agent-description' }, [a.description]));
        }

        // Platform and type badges
        const meta = createElement('div', { className: 'agent-meta' });
        meta.appendChild(createElement('span', { className: 'agent-badge' }, [a.platform || 'braintrust']));
        meta.appendChild(createElement('span', { className: 'agent-badge' }, [a.type || 'assistant']));
        card.appendChild(meta);

        // Engagement count
        const engCount = (a.engagements || []).length;
        const engText = engCount === 0 ? 'No engagements' :
                       engCount === 1 ? '1 engagement' : `${engCount} engagements`;
        card.appendChild(createElement('div', { className: 'agent-engagements' }, [engText]));

        container.appendChild(card);
    });
}

async function viewAgent(id) {
    try {
        const response = await fetch(`${API_URL}/agents/${id}`);
        const agent = await response.json();

        document.getElementById('view-agent-title').textContent = agent.name || '';

        const content = document.getElementById('view-agent-content');
        content.textContent = '';

        // Agent details
        const details = createElement('div', { className: 'agent-detail-section' });

        if (agent.description) {
            const descP = createElement('p', { className: 'agent-detail-description' }, [agent.description]);
            details.appendChild(descP);
        }

        const metaGrid = createElement('div', { className: 'detail-grid' });

        // Type
        const typeDiv = createElement('div', { className: 'detail-item' });
        typeDiv.appendChild(createElement('label', {}, ['Type']));
        typeDiv.appendChild(createElement('span', {}, [agent.type || 'assistant']));
        metaGrid.appendChild(typeDiv);

        // Platform
        const platformDiv = createElement('div', { className: 'detail-item' });
        platformDiv.appendChild(createElement('label', {}, ['Platform']));
        platformDiv.appendChild(createElement('span', {}, [agent.platform || 'braintrust']));
        metaGrid.appendChild(platformDiv);

        // Status
        const statusDiv = createElement('div', { className: 'detail-item' });
        statusDiv.appendChild(createElement('label', {}, ['Status']));
        statusDiv.appendChild(createElement('span', {}, [agent.status || 'active']));
        metaGrid.appendChild(statusDiv);

        details.appendChild(metaGrid);
        content.appendChild(details);

        // Engagements using this agent
        const engSection = createElement('div', { className: 'agent-engagements-section' });
        engSection.appendChild(createElement('h3', {}, ['Engagements Using This Agent']));

        const engagementsList = agent.engagements || [];
        if (engagementsList.length === 0) {
            engSection.appendChild(createElement('p', { className: 'no-data' }, ['No engagements are currently using this agent.']));
        } else {
            const engList = createElement('div', { className: 'engagement-list' });
            engagementsList.forEach(eng => {
                const engCard = createElement('div', { className: 'mini-engagement-card', onclick: () => {
                    closeModal('view-agent-modal');
                    viewEngagement(eng.id);
                }});

                const engHeader = createElement('div', { className: 'mini-eng-header' });
                engHeader.appendChild(createElement('span', { className: 'mini-eng-name' }, [eng.name]));

                const statusClass = `status-${eng.status}`;
                engHeader.appendChild(createElement('span', { className: `status-badge ${statusClass}` }, [formatStatus(eng.status)]));
                engCard.appendChild(engHeader);

                if (eng.team) {
                    engCard.appendChild(createElement('div', { className: 'mini-eng-team' }, [eng.team]));
                }

                engList.appendChild(engCard);
            });
            engSection.appendChild(engList);
        }
        content.appendChild(engSection);

        // Actions
        const actions = createElement('div', { className: 'detail-actions' });

        const editBtn = createElement('button', { className: 'btn btn-primary' }, ['Edit']);
        editBtn.onclick = () => {
            closeModal('view-agent-modal');
            showAgentModal(agent);
        };
        actions.appendChild(editBtn);

        const closeBtn = createElement('button', { className: 'btn btn-secondary' }, ['Close']);
        closeBtn.onclick = () => closeModal('view-agent-modal');
        actions.appendChild(closeBtn);

        content.appendChild(actions);

        document.getElementById('view-agent-modal').classList.add('active');
    } catch (error) {
        console.error('Error loading agent:', error);
    }
}

function showAgentModal(agent = null) {
    const modal = document.getElementById('agent-modal');
    const form = document.getElementById('agent-form');
    const title = document.getElementById('agent-modal-title');

    if (agent) {
        title.textContent = 'Edit Agent';
        document.getElementById('agent-id').value = agent.id;
        document.getElementById('agent-name').value = agent.name || '';
        document.getElementById('agent-description').value = agent.description || '';
        document.getElementById('agent-type').value = agent.type || 'assistant';
        document.getElementById('agent-platform').value = agent.platform || 'braintrust';
        document.getElementById('agent-status').value = agent.status || 'active';
    } else {
        title.textContent = 'New Agent';
        form.reset();
        document.getElementById('agent-id').value = '';
    }

    modal.classList.add('active');
}

async function saveAgent(event) {
    event.preventDefault();

    const id = document.getElementById('agent-id').value;
    const data = {
        name: document.getElementById('agent-name').value,
        description: document.getElementById('agent-description').value,
        type: document.getElementById('agent-type').value,
        platform: document.getElementById('agent-platform').value,
        status: document.getElementById('agent-status').value
    };

    try {
        const url = id ? `${API_URL}/agents/${id}` : `${API_URL}/agents`;
        const method = id ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Failed to save agent');
        }

        closeModal('agent-modal');
        loadAgents();
    } catch (error) {
        console.error('Error saving agent:', error);
        alert(error.message || 'Failed to save agent');
    }
}

function showQuickAgentModal() {
    document.getElementById('quick-agent-form').reset();
    document.getElementById('quick-agent-modal').classList.add('active');
}

async function saveQuickAgent(event) {
    event.preventDefault();

    const data = {
        name: document.getElementById('quick-agent-name').value,
        description: document.getElementById('quick-agent-description').value
    };

    try {
        const response = await fetch(`${API_URL}/agents`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Failed to create agent');
        }

        closeModal('quick-agent-modal');
        // Refresh the agents dropdown
        await loadAgentsForDropdown();

        // Select the newly created agent
        const agentSelect = document.getElementById('engagement-agents');
        const newOption = Array.from(agentSelect.options).find(o => o.value === data.name);
        if (newOption) newOption.selected = true;

    } catch (error) {
        console.error('Error creating agent:', error);
        alert(error.message || 'Failed to create agent');
    }
}

// Close modals on outside click
document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
        }
    });
});

// Close modals on Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal.active').forEach(modal => {
            modal.classList.remove('active');
        });
    }
});
