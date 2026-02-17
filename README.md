# Pulse - Engagement Tracker

Track Braintrust/AI engagements and collect testimonials from stakeholders.

**Live URL:** https://pulse.elelem.expert

## Features

- **Engagement Tracking**: Track AI/Braintrust engagements through their lifecycle (Discovery → Active → Complete)
- **Testimonial Collection**: Collect feedback from stakeholders in two ways:
  - **Ad-hoc**: Public form for anyone to submit feedback
  - **Solicited**: Generate unique links to request feedback from specific people
- **MCP Server**: Interact with the system directly via Braintrust agents in Google Chat
- **Reporting**: Dashboard with status overview, recent activity, and testimonial summaries

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENTS                                  │
├─────────────────┬─────────────────┬─────────────────────────────┤
│   Web UI (S3)   │  MCP Server     │  Direct API                 │
│   (humans)      │  (Braintrust)   │  (integrations)             │
└────────┬────────┴────────┬────────┴─────────────┬───────────────┘
         │                 │                      │
         └─────────────────┼──────────────────────┘
                           ▼
              ┌────────────────────────┐
              │   API Gateway (REST)   │
              └───────────┬────────────┘
                          ▼
              ┌────────────────────────┐
              │   Lambda Functions     │
              └───────────┬────────────┘
                          ▼
              ┌────────────────────────┐
              │      DynamoDB          │
              └────────────────────────┘
```

## Project Structure

```
engagement-tracker/
├── template.yaml          # AWS SAM infrastructure
├── samconfig.toml         # SAM deployment config
├── deploy.sh              # Deployment script
├── functions/             # Lambda functions
│   ├── engagements.py     # Engagement CRUD
│   ├── testimonials.py    # Testimonial handling
│   └── solicitations.py   # Feedback request generation
├── frontend/              # Static web UI
│   ├── index.html         # Main dashboard
│   ├── feedback.html      # Public feedback form
│   ├── styles.css         # Styling
│   ├── app.js             # Application logic
│   └── config.js          # API configuration
└── mcp-server/            # MCP server for Braintrust
    ├── package.json
    └── index.js           # MCP tool definitions
```

## Deployment

### Prerequisites

- AWS CLI configured
- SAM CLI installed (`brew install aws-sam-cli`)
- saml2aws configured for prod-aicoe-admin

### Deploy

```bash
# Login to AWS
saml2aws login -a prod-aicoe-admin --skip-prompt

# Deploy to dev
./deploy.sh

# Deploy to prod
./deploy.sh prod
```

### Local Development

```bash
# Start local API
sam local start-api

# In another terminal, serve frontend
cd frontend && python -m http.server 8080

# Open http://localhost:8080
```

## MCP Server (Braintrust Integration)

The MCP server allows Braintrust agents to interact with the engagement tracker.

### Setup

```bash
cd mcp-server
npm install
export PULSE_API_URL="https://your-api-url.execute-api.us-east-1.amazonaws.com/dev"
```

### Available Tools

| Tool | Description |
|------|-------------|
| `list_engagements` | List all engagements, optionally filtered by status |
| `get_engagement` | Get details of a specific engagement |
| `create_engagement` | Create a new engagement |
| `update_engagement` | Update engagement status, blockers, next steps |
| `list_testimonials` | List feedback received |
| `submit_testimonial` | Submit feedback via an agent |
| `list_solicitations` | List feedback requests sent |
| `create_solicitation` | Generate a feedback request link |
| `get_engagement_summary` | Get overview report of all engagements |
| `get_testimonial_summary` | Get summary of feedback with highlights |

### Example Usage in Google Chat

> "What's the status of our current AI engagements?"

Agent uses `get_engagement_summary` to provide overview.

> "Create a feedback request for John Smith about the Sales AI engagement"

Agent uses `create_solicitation` to generate a unique link.

> "The finance team says they love the new NetSuite integration"

Agent uses `submit_testimonial` to record the feedback.

## API Endpoints

### Engagements
- `GET /engagements` - List all engagements
- `GET /engagements/{id}` - Get engagement details
- `POST /engagements` - Create engagement
- `PUT /engagements/{id}` - Update engagement
- `DELETE /engagements/{id}` - Delete engagement

### Testimonials
- `GET /testimonials` - List all testimonials
- `GET /testimonials/{id}` - Get testimonial details
- `POST /testimonials` - Create testimonial (internal)
- `POST /public/testimonials` - Submit testimonial (public/solicited)
- `PUT /testimonials/{id}` - Update testimonial

### Solicitations
- `GET /solicitations` - List all solicitations
- `GET /solicitations/{token}` - Get solicitation by token (for feedback form)
- `POST /solicitations` - Create new feedback request

## Engagement Statuses

| Status | Description |
|--------|-------------|
| `discovery` | Initial exploration phase |
| `active` | Actively being worked on |
| `paused` | Temporarily on hold |
| `closed-complete` | Successfully completed |
| `closed-failed` | Did not achieve goals |

## Data Models

### Engagement
```json
{
  "id": "uuid",
  "name": "Sales AI Assistant",
  "team": "Sales",
  "description": "AI assistant for sales pipeline management",
  "status": "active",
  "owner": "David Proctor",
  "tools": ["notion", "slack"],
  "agents": ["Sales Assistant"],
  "objectives": "Automate sales data entry and reporting",
  "blockers": "Waiting on API access",
  "nextSteps": "Complete Notion integration",
  "startDate": "2026-02-01",
  "createdAt": "2026-02-01T00:00:00Z",
  "updatedAt": "2026-02-17T00:00:00Z"
}
```

### Testimonial
```json
{
  "id": "uuid",
  "engagementId": "engagement-uuid",
  "submitterName": "Jane Doe",
  "submitterRole": "Sales Manager",
  "rating": 5,
  "testimonialText": "The AI assistant has transformed our workflow...",
  "whatWorkedWell": "Automated data entry",
  "whatCouldImprove": "Faster response times",
  "wouldRecommend": true,
  "source": "solicited",
  "submittedAt": "2026-02-17T00:00:00Z"
}
```

### Solicitation
```json
{
  "token": "secure-random-token",
  "engagementId": "engagement-uuid",
  "recipientName": "Jane Doe",
  "recipientEmail": "jane@company.com",
  "message": "Would love your feedback on the Sales AI...",
  "status": "pending",
  "feedbackUrl": "https://pulse.elelem.expert/feedback.html?token=...",
  "createdAt": "2026-02-17T00:00:00Z",
  "expiresAt": "2026-03-03T00:00:00Z"
}
```

## DNS Configuration

To use the custom domain `pulse.elelem.expert`:

1. Create a CloudFront distribution pointing to the S3 bucket
2. Request an ACM certificate for `pulse.elelem.expert`
3. Add CNAME record: `pulse.elelem.expert` → CloudFront distribution

## License

Internal use - AI Center of Excellence
