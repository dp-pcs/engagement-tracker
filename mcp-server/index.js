#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// Configuration - set via environment variable or use default
const API_URL = process.env.PULSE_API_URL || "https://j4xell8k5a.execute-api.us-east-1.amazonaws.com/dev";

// Helper to make API calls
async function apiCall(method, path, body = null) {
  const options = {
    method,
    headers: {
      "Content-Type": "application/json",
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_URL}${path}`, options);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || `API error: ${response.status}`);
  }

  return data;
}

// Create MCP server
const server = new Server(
  {
    name: "pulse-engagement-tracker",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      // Engagement tools
      {
        name: "list_engagements",
        description: "List all engagements, optionally filtered by status. Use this to see what projects/engagements are being tracked.",
        inputSchema: {
          type: "object",
          properties: {
            status: {
              type: "string",
              description: "Filter by status: discovery, active, paused, closed-complete, closed-failed",
              enum: ["discovery", "active", "paused", "closed-complete", "closed-failed"],
            },
          },
        },
      },
      {
        name: "get_engagement",
        description: "Get details of a specific engagement by ID",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "The engagement ID",
            },
          },
          required: ["id"],
        },
      },
      {
        name: "create_engagement",
        description: "Create a new engagement to track a project or initiative",
        inputSchema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Name of the engagement",
            },
            team: {
              type: "string",
              description: "Team involved (e.g., Sales, Finance)",
            },
            description: {
              type: "string",
              description: "Description of the engagement",
            },
            owner: {
              type: "string",
              description: "Person responsible for the engagement",
            },
            tools: {
              type: "array",
              items: { type: "string" },
              description: "MCP tools/servers being used",
            },
            agents: {
              type: "array",
              items: { type: "string" },
              description: "Braintrust agents deployed",
            },
            objectives: {
              type: "string",
              description: "Goals and objectives",
            },
          },
          required: ["name"],
        },
      },
      {
        name: "update_engagement",
        description: "Update an existing engagement's details or status",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "The engagement ID",
            },
            status: {
              type: "string",
              description: "New status",
              enum: ["discovery", "active", "paused", "closed-complete", "closed-failed"],
            },
            blockers: {
              type: "string",
              description: "Current blockers or issues",
            },
            nextSteps: {
              type: "string",
              description: "Next steps to take",
            },
            notes: {
              type: "string",
              description: "Additional notes",
            },
          },
          required: ["id"],
        },
      },

      // Testimonial tools
      {
        name: "list_testimonials",
        description: "List all testimonials/feedback received, optionally for a specific engagement",
        inputSchema: {
          type: "object",
          properties: {
            engagementId: {
              type: "string",
              description: "Filter by engagement ID",
            },
          },
        },
      },
      {
        name: "submit_testimonial",
        description: "Submit a testimonial or feedback for an engagement. Use this when someone provides feedback about their experience.",
        inputSchema: {
          type: "object",
          properties: {
            engagementId: {
              type: "string",
              description: "The engagement this feedback is for",
            },
            submitterName: {
              type: "string",
              description: "Name of the person giving feedback",
            },
            submitterRole: {
              type: "string",
              description: "Role of the person giving feedback",
            },
            submitterTeam: {
              type: "string",
              description: "Team of the person giving feedback",
            },
            rating: {
              type: "number",
              description: "Rating from 1-5",
              minimum: 1,
              maximum: 5,
            },
            testimonialText: {
              type: "string",
              description: "The testimonial or feedback text",
            },
            whatWorkedWell: {
              type: "string",
              description: "What aspects worked well",
            },
            whatCouldImprove: {
              type: "string",
              description: "What could be improved",
            },
            wouldRecommend: {
              type: "boolean",
              description: "Whether they would recommend",
            },
          },
          required: ["submitterName", "testimonialText"],
        },
      },

      // Solicitation tools
      {
        name: "list_solicitations",
        description: "List all feedback requests that have been sent out",
        inputSchema: {
          type: "object",
          properties: {
            engagementId: {
              type: "string",
              description: "Filter by engagement ID",
            },
          },
        },
      },
      {
        name: "create_solicitation",
        description: "Create a feedback request to send to someone. This generates a unique link they can use to submit feedback.",
        inputSchema: {
          type: "object",
          properties: {
            engagementId: {
              type: "string",
              description: "The engagement to request feedback for",
            },
            recipientName: {
              type: "string",
              description: "Name of the person to request feedback from",
            },
            recipientEmail: {
              type: "string",
              description: "Email of the recipient",
            },
            recipientRole: {
              type: "string",
              description: "Role of the recipient",
            },
            message: {
              type: "string",
              description: "Personal message to include with the request",
            },
            requestedBy: {
              type: "string",
              description: "Name of person requesting the feedback",
            },
          },
          required: ["engagementId", "recipientName"],
        },
      },

      // Reporting tools
      {
        name: "get_engagement_summary",
        description: "Get a summary report of all engagements including counts by status and recent activity",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "get_testimonial_summary",
        description: "Get a summary of testimonials including average rating and highlights",
        inputSchema: {
          type: "object",
          properties: {
            engagementId: {
              type: "string",
              description: "Optional: limit to specific engagement",
            },
          },
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      // Engagement handlers
      case "list_engagements": {
        const query = args.status ? `?status=${args.status}` : "";
        const data = await apiCall("GET", `/engagements${query}`);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(data.engagements, null, 2),
            },
          ],
        };
      }

      case "get_engagement": {
        const data = await apiCall("GET", `/engagements/${args.id}`);
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }

      case "create_engagement": {
        const data = await apiCall("POST", "/engagements", args);
        return {
          content: [
            {
              type: "text",
              text: `Engagement created successfully!\nID: ${data.id}\nName: ${data.name}\nStatus: ${data.status}`,
            },
          ],
        };
      }

      case "update_engagement": {
        const { id, ...updateData } = args;
        const data = await apiCall("PUT", `/engagements/${id}`, updateData);
        return {
          content: [
            {
              type: "text",
              text: `Engagement updated successfully!\nName: ${data.name}\nStatus: ${data.status}`,
            },
          ],
        };
      }

      // Testimonial handlers
      case "list_testimonials": {
        const query = args.engagementId
          ? `?engagementId=${args.engagementId}`
          : "";
        const data = await apiCall("GET", `/testimonials${query}`);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(data.testimonials, null, 2),
            },
          ],
        };
      }

      case "submit_testimonial": {
        const data = await apiCall("POST", "/public/testimonials", args);
        return {
          content: [
            {
              type: "text",
              text: `Testimonial submitted successfully!\nFrom: ${data.submitterName}\nRating: ${data.rating}/5\nThank you for the feedback!`,
            },
          ],
        };
      }

      // Solicitation handlers
      case "list_solicitations": {
        const query = args.engagementId
          ? `?engagementId=${args.engagementId}`
          : "";
        const data = await apiCall("GET", `/solicitations${query}`);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(data.solicitations, null, 2),
            },
          ],
        };
      }

      case "create_solicitation": {
        const data = await apiCall("POST", "/solicitations", args);
        return {
          content: [
            {
              type: "text",
              text: `Feedback request created!\n\nRecipient: ${data.recipientName}\nEngagement: ${data.engagementName}\nExpires: ${data.expiresAt}\n\nFeedback Link:\n${data.feedbackUrl}\n\nShare this link with ${data.recipientName} to collect their feedback.`,
            },
          ],
        };
      }

      // Reporting handlers
      case "get_engagement_summary": {
        const engData = await apiCall("GET", "/engagements");
        const engagements = engData.engagements || [];

        const statusCounts = {
          discovery: 0,
          active: 0,
          paused: 0,
          "closed-complete": 0,
          "closed-failed": 0,
        };

        engagements.forEach((e) => {
          if (statusCounts[e.status] !== undefined) {
            statusCounts[e.status]++;
          }
        });

        const recent = engagements.slice(0, 5);

        const summary = `
# Engagement Summary

## Status Overview
- Discovery: ${statusCounts.discovery}
- Active: ${statusCounts.active}
- Paused: ${statusCounts.paused}
- Completed: ${statusCounts["closed-complete"]}
- Failed: ${statusCounts["closed-failed"]}
- **Total: ${engagements.length}**

## Recent Engagements
${recent
  .map(
    (e) =>
      `- **${e.name}** (${e.team || "No team"}) - ${e.status}${e.blockers ? `\n  Blockers: ${e.blockers}` : ""}`
  )
  .join("\n")}
`;

        return {
          content: [{ type: "text", text: summary }],
        };
      }

      case "get_testimonial_summary": {
        const query = args.engagementId
          ? `?engagementId=${args.engagementId}`
          : "";
        const testData = await apiCall("GET", `/testimonials${query}`);
        const testimonials = testData.testimonials || [];

        if (testimonials.length === 0) {
          return {
            content: [
              { type: "text", text: "No testimonials found for the specified criteria." },
            ],
          };
        }

        const avgRating =
          testimonials.reduce((sum, t) => sum + (t.rating || 0), 0) /
          testimonials.length;
        const wouldRecommend = testimonials.filter((t) => t.wouldRecommend).length;
        const topRated = testimonials.filter((t) => t.rating >= 4);

        const summary = `
# Testimonial Summary

## Overview
- Total Testimonials: ${testimonials.length}
- Average Rating: ${avgRating.toFixed(1)}/5
- Would Recommend: ${wouldRecommend}/${testimonials.length} (${Math.round((wouldRecommend / testimonials.length) * 100)}%)

## Highlights (${topRated.length} with 4+ rating)
${topRated
  .slice(0, 3)
  .map(
    (t) =>
      `> "${t.testimonialText?.substring(0, 150)}${t.testimonialText?.length > 150 ? "..." : ""}"\n> — ${t.submitterName}, ${t.submitterRole || "Team Member"}`
  )
  .join("\n\n")}

## What's Working Well
${[...new Set(testimonials.filter((t) => t.whatWorkedWell).map((t) => t.whatWorkedWell))]
  .slice(0, 3)
  .map((w) => `- ${w}`)
  .join("\n")}

## Areas for Improvement
${[...new Set(testimonials.filter((t) => t.whatCouldImprove).map((t) => t.whatCouldImprove))]
  .slice(0, 3)
  .map((w) => `- ${w}`)
  .join("\n")}
`;

        return {
          content: [{ type: "text", text: summary }],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Pulse Engagement Tracker MCP server running");
}

main().catch(console.error);
