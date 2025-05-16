const {
  Server,
} = require("@modelcontextprotocol/sdk/dist/cjs/server/index.js");
const {
  StdioServerTransport,
} = require("@modelcontextprotocol/sdk/dist/cjs/server/stdio.js");
const axios = require("axios");

const FMP_API_KEY =
  process.env.FMP_API_KEY || "e8ae18df38837f283f9bb1684f21788f";
const FMP_BASE_URL = "https://financialmodelingprep.com/api/v3";

const tools = [
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
    endpoint: (args) => `/search?query=${encodeURIComponent(args.query)}`,
  },
  {
    name: "company_profile",
    description: "Get company profile by symbol",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Stock symbol" },
      },
      required: ["symbol"],
    },
    endpoint: (args) => `/profile/${encodeURIComponent(args.symbol)}`,
  },
  {
    name: "quote",
    description: "Get real-time quote for a stock",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Stock symbol" },
      },
      required: ["symbol"],
    },
    endpoint: (args) => `/quote/${encodeURIComponent(args.symbol)}`,
  },
  {
    name: "historical_price",
    description: "Get historical price data for a stock",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Stock symbol" },
        from: { type: "string", description: "Start date (YYYY-MM-DD)" },
        to: { type: "string", description: "End date (YYYY-MM-DD)" },
      },
      required: ["symbol", "from", "to"],
    },
    endpoint: (args) =>
      `/historical-price-full/${encodeURIComponent(args.symbol)}?from=${
        args.from
      }&to=${args.to}`,
  },
  {
    name: "income_statement",
    description: "Get income statement for a stock",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Stock symbol" },
        period: {
          type: "string",
          enum: ["annual", "quarter"],
          description: "Period (annual or quarter)",
        },
      },
      required: ["symbol", "period"],
    },
    endpoint: (args) =>
      `/income-statement/${encodeURIComponent(args.symbol)}?period=${
        args.period
      }`,
  },
  {
    name: "balance_sheet",
    description: "Get balance sheet for a stock",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Stock symbol" },
        period: {
          type: "string",
          enum: ["annual", "quarter"],
          description: "Period (annual or quarter)",
        },
      },
      required: ["symbol", "period"],
    },
    endpoint: (args) =>
      `/balance-sheet-statement/${encodeURIComponent(args.symbol)}?period=${
        args.period
      }`,
  },
  {
    name: "cash_flow",
    description: "Get cash flow statement for a stock",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Stock symbol" },
        period: {
          type: "string",
          enum: ["annual", "quarter"],
          description: "Period (annual or quarter)",
        },
      },
      required: ["symbol", "period"],
    },
    endpoint: (args) =>
      `/cash-flow-statement/${encodeURIComponent(args.symbol)}?period=${
        args.period
      }`,
  },
  {
    name: "key_metrics",
    description: "Get key financial metrics for a stock",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Stock symbol" },
        period: {
          type: "string",
          enum: ["annual", "quarter"],
          description: "Period (annual or quarter)",
        },
      },
      required: ["symbol", "period"],
    },
    endpoint: (args) =>
      `/key-metrics/${encodeURIComponent(args.symbol)}?period=${args.period}`,
  },
  {
    name: "financial_ratios",
    description: "Get financial ratios for a stock",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Stock symbol" },
        period: {
          type: "string",
          enum: ["annual", "quarter"],
          description: "Period (annual or quarter)",
        },
      },
      required: ["symbol", "period"],
    },
    endpoint: (args) =>
      `/ratios/${encodeURIComponent(args.symbol)}?period=${args.period}`,
  },
  {
    name: "enterprise_value",
    description: "Get enterprise value and related metrics for a stock",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Stock symbol" },
        period: {
          type: "string",
          enum: ["annual", "quarter"],
          description: "Period (annual or quarter)",
        },
      },
      required: ["symbol", "period"],
    },
    endpoint: (args) =>
      `/enterprise-values/${encodeURIComponent(args.symbol)}?period=${
        args.period
      }`,
  },
  {
    name: "discounted_cash_flow",
    description: "Get DCF valuation for a stock",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Stock symbol" },
      },
      required: ["symbol"],
    },
    endpoint: (args) =>
      `/discounted-cash-flow/${encodeURIComponent(args.symbol)}`,
  },
  {
    name: "earnings_calendar",
    description: "Get upcoming earnings announcements",
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string", description: "Start date (YYYY-MM-DD)" },
        to: { type: "string", description: "End date (YYYY-MM-DD)" },
      },
      required: ["from", "to"],
    },
    endpoint: (args) => `/earning_calendar?from=${args.from}&to=${args.to}`,
  },
  {
    name: "ipo_calendar",
    description: "Get upcoming IPOs",
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string", description: "Start date (YYYY-MM-DD)" },
        to: { type: "string", description: "End date (YYYY-MM-DD)" },
      },
      required: ["from", "to"],
    },
    endpoint: (args) => `/ipo_calendar?from=${args.from}&to=${args.to}`,
  },
  {
    name: "stock_screener",
    description: "Screen stocks by market cap, sector, price, etc.",
    inputSchema: {
      type: "object",
      properties: {
        marketCapMoreThan: {
          type: "number",
          description: "Minimum market cap",
        },
        sector: { type: "string", description: "Sector" },
        priceMoreThan: { type: "number", description: "Minimum price" },
        priceLessThan: { type: "number", description: "Maximum price" },
        exchange: { type: "string", description: "Exchange" },
      },
      required: [],
    },
    endpoint: (args) => {
      let params = [];
      if (args.marketCapMoreThan)
        params.push(`marketCapMoreThan=${args.marketCapMoreThan}`);
      if (args.sector) params.push(`sector=${encodeURIComponent(args.sector)}`);
      if (args.priceMoreThan)
        params.push(`priceMoreThan=${args.priceMoreThan}`);
      if (args.priceLessThan)
        params.push(`priceLessThan=${args.priceLessThan}`);
      if (args.exchange)
        params.push(`exchange=${encodeURIComponent(args.exchange)}`);
      return `/stock-screener${params.length ? "?" + params.join("&") : ""}`;
    },
  },
  {
    name: "etf_list",
    description: "Get ETF tickers",
    inputSchema: { type: "object", properties: {}, required: [] },
    endpoint: () => `/etf/list`,
  },
  {
    name: "etf_holdings",
    description: "Get ETF holdings by symbol",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "ETF symbol" },
      },
      required: ["symbol"],
    },
    endpoint: (args) => `/etf-holder?symbol=${encodeURIComponent(args.symbol)}`,
  },
  {
    name: "mutual_fund_list",
    description: "Get mutual fund tickers",
    inputSchema: { type: "object", properties: {}, required: [] },
    endpoint: () => `/mutual-fund/list`,
  },
  {
    name: "mutual_fund_holdings",
    description: "Get mutual fund holdings by symbol",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Mutual fund symbol" },
      },
      required: ["symbol"],
    },
    endpoint: (args) =>
      `/mutual-fund-holder?symbol=${encodeURIComponent(args.symbol)}`,
  },
  {
    name: "forex_list",
    description: "Get forex tickers",
    inputSchema: { type: "object", properties: {}, required: [] },
    endpoint: () => `/forex`,
  },
  {
    name: "crypto_list",
    description: "Get crypto tickers",
    inputSchema: { type: "object", properties: {}, required: [] },
    endpoint: () => `/cryptocurrencies`,
  },
  {
    name: "stock_news",
    description: "Get latest news for a stock",
    inputSchema: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "Stock symbol (comma separated for multiple)",
        },
        limit: {
          type: "number",
          description: "Number of news items to return",
        },
      },
      required: ["symbol"],
    },
    endpoint: (args) =>
      `/stock_news?tickers=${encodeURIComponent(args.symbol)}${
        args.limit ? `&limit=${args.limit}` : ""
      }`,
  },
  {
    name: "insider_trades",
    description: "Get insider trading activity for a stock",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Stock symbol" },
      },
      required: ["symbol"],
    },
    endpoint: (args) =>
      `/insider-trading?symbol=${encodeURIComponent(args.symbol)}`,
  },
  {
    name: "sec_filings",
    description: "Get recent SEC filings for a company",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Stock symbol" },
      },
      required: ["symbol"],
    },
    endpoint: (args) => `/sec_filings/${encodeURIComponent(args.symbol)}`,
  },
  {
    name: "analyst_estimates",
    description: "Get analyst earnings and revenue estimates for a stock",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Stock symbol" },
      },
      required: ["symbol"],
    },
    endpoint: (args) => `/analyst-estimates/${encodeURIComponent(args.symbol)}`,
  },
  {
    name: "ratings",
    description: "Get financial health and performance ratings for a stock",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Stock symbol" },
      },
      required: ["symbol"],
    },
    endpoint: (args) => `/rating/${encodeURIComponent(args.symbol)}`,
  },
];

const server = new Server({
  name: "fmp",
  version: "1.0.0",
  capabilities: {
    tools: {},
  },
});

server.setRequestHandler("list_tools", async () => ({
  tools: tools.map(({ name, description, inputSchema }) => ({
    name,
    description,
    inputSchema,
  })),
}));

server.setRequestHandler("call_tool", async (request) => {
  const { name, arguments: args } = request.params;
  const tool = tools.find((t) => t.name === name);
  if (!tool) {
    return {
      content: [{ type: "text", text: "Unknown tool" }],
    };
  }
  try {
    let endpoint = tool.endpoint(args);
    if (!endpoint.startsWith("/")) endpoint = "/" + endpoint;
    // Always append the API key
    const url = `${FMP_BASE_URL}${endpoint}${
      endpoint.includes("?") ? "&" : "?"
    }apikey=${FMP_API_KEY}`;
    const response = await axios.get(url);
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

const transport = new StdioServerTransport();
server.connect(transport);
