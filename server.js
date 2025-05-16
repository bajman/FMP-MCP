#!/usr/bin/env node

// Use ES Module imports
import { Server } from "@modelcontextprotocol/sdk/server";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio";
import axios from "axios";

const API_KEY = process.env.FMP_API_KEY || "e8ae18df38837f283f9bb1684f21788f";
const BASE_URL = "https://financialmodelingprep.com/api/v3";

// Create a new server instance
const server = new Server({
  name: "fmp",
  version: "1.0.0",
  capabilities: {
    tools: {},
  },
});

// List available tools
server.setRequestHandler("list_tools", async () => ({
  tools: [
    {
      name: "search_symbol",
      description: "Search for a stock symbol by company name or symbol",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Company name or symbol to search for",
          },
        },
        required: ["query"],
      },
    },
    {
      name: "company_profile",
      description: "Get company profile by symbol",
      inputSchema: {
        type: "object",
        properties: {
          symbol: {
            type: "string",
            description: "Stock symbol",
          },
        },
        required: ["symbol"],
      },
    },
    {
      name: "quote",
      description: "Get real-time quote for a stock",
      inputSchema: {
        type: "object",
        properties: {
          symbol: {
            type: "string",
            description: "Stock symbol",
          },
        },
        required: ["symbol"],
      },
    },
  ],
}));

// Handle tool calls
server.setRequestHandler("call_tool", async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let endpoint;

    // Simple endpoint mapping
    switch (name) {
      case "search_symbol":
        endpoint = `/search?query=${encodeURIComponent(args.query)}`;
        break;
      case "company_profile":
        endpoint = `/profile/${encodeURIComponent(args.symbol)}`;
        break;
      case "quote":
        endpoint = `/quote/${encodeURIComponent(args.symbol)}`;
        break;
      default:
        return {
          content: [{ type: "text", text: "Unknown tool" }],
        };
    }

    // Add API key
    const url = `${BASE_URL}${endpoint}&apikey=${API_KEY}`;

    // Make the API call
    const response = await axios.get(url);

    // Return the result
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(response.data, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error.message}`,
        },
      ],
    };
  }
});

// Connect to the server transport
const transport = new StdioServerTransport();
server.connect(transport);
