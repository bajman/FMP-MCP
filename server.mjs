#!/usr/bin/env node

// Use ES Module imports
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import axios from "axios";
import { z } from "zod";

const API_KEY = process.env.FMP_API_KEY;
if (!API_KEY) {
  console.error("FATAL ERROR: FMP_API_KEY environment variable is not set.");
  process.exit(1);
}

const BASE_URL = "https://financialmodelingprep.com/api/v3";

// Create a new server instance
const server = new McpServer(
  {
    name: "fmp",
    version: "1.0.0",
  },
  {
    capabilities: {},
  }
);

// Register tools
server.tool(
  "search_symbol",
  "Search for a stock symbol by company name or symbol. Returns top matches.",
  {
    query: z.string().describe("Company name or symbol to search for"),
    limit: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        "Number of results to fetch from API. Defaults to 10. A smaller summary will be returned."
      ),
  },
  async ({ query, limit = 10 }) => {
    try {
      const endpoint = `/search?query=${encodeURIComponent(
        query
      )}&limit=${limit}`;
      const url = `${BASE_URL}${endpoint}${
        endpoint.includes("?") ? "&" : "?"
      }apikey=${API_KEY}`;
      const response = await axios.get(url);
      const results = response.data;

      if (!results || results.length === 0) {
        return {
          content: [
            { type: "text", text: "No symbols found matching your query." },
          ],
        };
      }

      const MAX_RESULTS_TO_LLM = 5;
      const summarizedResults = results
        .slice(0, MAX_RESULTS_TO_LLM)
        .map((item) => ({
          symbol: item.symbol,
          name: item.name,
          currency: item.currency,
          exchangeShortName: item.exchangeShortName,
        }));

      let resultText = JSON.stringify(summarizedResults, null, 2);
      if (results.length > MAX_RESULTS_TO_LLM) {
        resultText = JSON.stringify(
          {
            message: `Displaying top ${MAX_RESULTS_TO_LLM} of ${results.length} symbols fetched. Be more specific if your target is not listed.`,
            matches: summarizedResults,
          },
          null,
          2
        );
      }
      return { content: [{ type: "text", text: resultText }] };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error in search_symbol: ${error.message}`,
          },
        ],
      };
    }
  }
);

server.tool(
  "company_profile",
  "Get a curated summary of the company profile by symbol.",
  {
    symbol: z.string().describe("Stock symbol"),
  },
  async ({ symbol }) => {
    try {
      const endpoint = `/profile/${encodeURIComponent(symbol)}`;
      const url = `${BASE_URL}${endpoint}${
        endpoint.includes("?") ? "&" : "?"
      }apikey=${API_KEY}`;
      const response = await axios.get(url);

      // FMP API often returns an array, even for a single profile
      const profileData = Array.isArray(response.data)
        ? response.data[0]
        : response.data;

      if (!profileData || Object.keys(profileData).length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No company profile data found for the symbol.",
            },
          ],
        };
      }

      // Curate the profile information
      const summarizedProfile = {
        symbol: profileData.symbol,
        companyName: profileData.companyName,
        price: profileData.price,
        currency: profileData.currency,
        exchangeShortName: profileData.exchangeShortName,
        industry: profileData.industry,
        sector: profileData.sector,
        website: profileData.website,
        description:
          profileData.description && profileData.description.length > 300
            ? profileData.description.substring(0, 300) + "... (truncated)"
            : profileData.description,
        ceo: profileData.ceo,
        marketCap: profileData.mktCap,
        beta: profileData.beta,
        volAvg: profileData.volAvg, // Average Volume
        lastDiv: profileData.lastDiv, // Last dividend
        range: profileData.range, // 52-week range
        isActivelyTrading: profileData.isActivelyTrading,
      };

      return {
        content: [
          { type: "text", text: JSON.stringify(summarizedProfile, null, 2) },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error in company_profile: ${error.message}`,
          },
        ],
      };
    }
  }
);

server.tool(
  "quote",
  "Get a concise real-time quote for a stock.",
  {
    symbol: z.string().describe("Stock symbol"),
  },
  async ({ symbol }) => {
    try {
      const endpoint = `/quote/${encodeURIComponent(symbol)}`;
      const url = `${BASE_URL}${endpoint}${
        endpoint.includes("?") ? "&" : "?"
      }apikey=${API_KEY}`;
      const response = await axios.get(url);
      const quoteData = Array.isArray(response.data)
        ? response.data[0]
        : response.data;

      if (!quoteData || Object.keys(quoteData).length === 0) {
        return {
          content: [
            { type: "text", text: "No quote data found for the symbol." },
          ],
        };
      }

      // Select essential fields for the quote
      const summarizedQuote = {
        symbol: quoteData.symbol,
        name: quoteData.name,
        price: quoteData.price,
        changesPercentage: quoteData.changesPercentage,
        change: quoteData.change,
        dayLow: quoteData.dayLow,
        dayHigh: quoteData.dayHigh,
        yearHigh: quoteData.yearHigh,
        yearLow: quoteData.yearLow,
        marketCap: quoteData.marketCap,
        priceAvg50: quoteData.priceAvg50,
        priceAvg200: quoteData.priceAvg200,
        volume: quoteData.volume,
        avgVolume: quoteData.avgVolume,
        open: quoteData.open,
        previousClose: quoteData.previousClose,
        eps: quoteData.eps,
        pe: quoteData.pe,
        timestamp: quoteData.timestamp,
      };

      return {
        content: [
          { type: "text", text: JSON.stringify(summarizedQuote, null, 2) },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error in quote: ${error.message}`,
          },
        ],
      };
    }
  }
);

server.tool(
  "historical_stock_data",
  "Get historical stock data (daily or intraday) for a symbol. Supports summary or more detailed output.",
  {
    symbol: z.string().describe("Stock symbol (e.g., AAPL)"),
    interval: z
      .string()
      .optional()
      .describe(
        "Data interval (e.g., '1min', '5min', '1hour', 'daily'). Defaults to 'daily'."
      ),
    from: z
      .string()
      .optional()
      .describe(
        "Start date (YYYY-MM-DD). If not provided with 'to', defaults to a recent period."
      ),
    to: z
      .string()
      .optional()
      .describe(
        "End date (YYYY-MM-DD). If not provided with 'from', defaults to today."
      ),
    timeseries: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        "Number of past data points. Used if 'from' and 'to' are not specified. Defaults to 90 for daily."
      ),
    detail: z
      .enum(["summary", "full"])
      .optional()
      .describe(
        "Output detail: 'summary' (default if many points) or 'full' (more raw data, still managed). Capped at ~150 points for 'full'."
      ),
  },
  async ({
    symbol,
    interval = "daily",
    from,
    to,
    timeseries,
    detail = "summary",
  }) => {
    try {
      let endpoint;
      let queryParams = [];
      const isDaily = interval.toLowerCase() === "daily";

      if (isDaily) {
        endpoint = `/historical-price-full/${encodeURIComponent(symbol)}`;
        if (from) queryParams.push(`from=${from}`);
        if (to) queryParams.push(`to=${to}`);
        if (timeseries && !from && !to)
          queryParams.push(`timeseries=${timeseries}`);
        else if (!from && !to && !timeseries) queryParams.push(`timeseries=90`);
      } else {
        endpoint = `/historical-chart/${encodeURIComponent(
          interval
        )}/${encodeURIComponent(symbol)}`;
        if (from) queryParams.push(`from=${from}`);
        if (to) queryParams.push(`to=${to}`);
        if (timeseries && !from && !to) queryParams.push(`last=${timeseries}`);
        // Intraday often uses 'last' for N points
        else if (!from && !to && !timeseries && interval !== "daily")
          queryParams.push(`last=100`); // Default for intraday
      }

      if (queryParams.length > 0) {
        endpoint += `?${queryParams.join("&")}`;
      }

      const url = `${BASE_URL}${endpoint}${
        endpoint.includes("?") ? "&" : "?"
      }apikey=${API_KEY}`;
      const response = await axios.get(url);

      const history = response.data.historical || response.data;

      if (
        !history ||
        (Array.isArray(history) && history.length === 0) ||
        (typeof history === "object" && !Object.keys(history).length)
      ) {
        return {
          content: [
            {
              type: "text",
              text: "No historical data found for the given parameters.",
            },
          ],
        };
      }

      const dataPoints = (
        Array.isArray(history) ? history : Object.values(history).flat()
      ).sort((a, b) => new Date(b.date) - new Date(a.date)); // Ensure newest first for slicing

      if (dataPoints.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No historical data points found after processing.",
            },
          ],
        };
      }

      const POINTS_THRESHOLD_FOR_SUMMARY = 60;
      const RECENT_POINTS_TO_SHOW_WITH_SUMMARY = 5;
      const MAX_POINTS_FOR_FULL_DETAIL = 150; // Hard cap for 'full' detail

      if (detail === "full") {
        const limitedDetailedData = dataPoints
          .slice(0, MAX_POINTS_FOR_FULL_DETAIL)
          .map((p) => ({
            date: p.date,
            open: p.open,
            high: p.high,
            low: p.low,
            close: p.close,
            volume: p.volume,
          }));
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  message: `Showing ${limitedDetailedData.length} of ${dataPoints.length} fetched data points (full detail requested, capped at ${MAX_POINTS_FOR_FULL_DETAIL}).`,
                  data: limitedDetailedData,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // Default to summary logic if detail is not 'full' or if dataPoints exceed threshold
      if (dataPoints.length > POINTS_THRESHOLD_FOR_SUMMARY) {
        const chronologicalPoints = [...dataPoints].sort(
          (a, b) => new Date(a.date) - new Date(b.date)
        ); // Oldest first for summary stats
        const chronologicalFirst = chronologicalPoints[0];
        const chronologicalLast =
          chronologicalPoints[chronologicalPoints.length - 1];

        const highs = chronologicalPoints.map((p) => p.high);
        const lows = chronologicalPoints.map((p) => p.low);
        const summarizedHistory = {
          message: `Summarized ${dataPoints.length} data points from ${chronologicalFirst.date} to ${chronologicalLast.date}. Showing ${RECENT_POINTS_TO_SHOW_WITH_SUMMARY} most recent points. Request 'full' detail for more data points (up to ${MAX_POINTS_FOR_FULL_DETAIL}).`,
          periodStartDate: chronologicalFirst.date,
          periodEndDate: chronologicalLast.date,
          startPrice: chronologicalFirst.close,
          endPrice: chronologicalLast.close,
          periodHigh: Math.max(...highs),
          periodLow: Math.min(...lows),
          priceChangePercent:
            chronologicalLast.close && chronologicalFirst.close
              ? ((chronologicalLast.close - chronologicalFirst.close) /
                  chronologicalFirst.close) *
                100
              : null,
          recentData: dataPoints
            .slice(0, RECENT_POINTS_TO_SHOW_WITH_SUMMARY)
            .map((p) => ({
              date: p.date,
              open: p.open,
              high: p.high,
              low: p.low,
              close: p.close,
              volume: p.volume,
            })),
        };
        return {
          content: [
            { type: "text", text: JSON.stringify(summarizedHistory, null, 2) },
          ],
        };
      } else {
        const allAvailableData = dataPoints.map((p) => ({
          date: p.date,
          open: p.open,
          high: p.high,
          low: p.low,
          close: p.close,
          volume: p.volume,
        }));
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  message: `Showing all ${allAvailableData.length} fetched data points (below summary threshold).`,
                  data: allAvailableData,
                },
                null,
                2
              ),
            },
          ],
        };
      }
    } catch (error) {
      console.error(
        "Error in historical_stock_data:",
        error.message,
        error.stack
      );
      return {
        content: [
          {
            type: "text",
            text: `Error fetching historical_stock_data: ${error.message}`,
          },
        ],
      };
    }
  }
);

server.tool(
  "technical_indicator",
  "Get specific technical indicator values (e.g., SMA, RSI) for a stock symbol.",
  {
    symbol: z.string().describe("Stock symbol (e.g., AAPL)"),
    interval: z
      .string()
      .describe(
        "Data interval (e.g., '1min', '5min', '15min', '30min', '1hour', '4hour', 'daily')"
      ),
    indicator_type: z
      .string()
      .describe(
        "Type of technical indicator (e.g., 'SMA', 'EMA', 'RSI', 'MACD')"
      ),
    period: z
      .number()
      .int()
      .positive()
      .describe("Time period for the indicator (e.g., 14 for RSI, 50 for SMA)"),
  },
  async ({ symbol, interval, indicator_type, period }) => {
    try {
      const endpoint = `/technical_indicator/${encodeURIComponent(
        interval
      )}/${encodeURIComponent(symbol)}?type=${encodeURIComponent(
        indicator_type
      )}&period=${period}`;
      const url = `${BASE_URL}${endpoint}&apikey=${API_KEY}`;
      const response = await axios.get(url);
      const indicatorData = response.data;

      if (
        !indicatorData ||
        (Array.isArray(indicatorData) && indicatorData.length === 0)
      ) {
        return {
          content: [
            {
              type: "text",
              text: `No ${indicator_type} data found for ${symbol} with period ${period} on ${interval} interval.`,
            },
          ],
        };
      }

      // FMP returns an array of indicator values. Usually, for a single request, it's a list over time.
      // For LLM context, the most recent value is often most useful unless a series is explicitly desired.
      // Let's return the most recent 1-3 values if it's an array, or the direct value if not.
      let summarizedIndicator;
      if (Array.isArray(indicatorData)) {
        const RECENT_VALUES_COUNT = 3;
        const recentValues = indicatorData
          .slice(0, RECENT_VALUES_COUNT)
          .map((val) => ({
            date: val.date,
            [indicator_type.toLowerCase()]:
              val[indicator_type.toLowerCase()] ||
              val[indicator_type.toUpperCase()] ||
              val.indicatorValue ||
              val.value, // FMP field names can vary slightly
          }));
        summarizedIndicator = {
          message: `Showing ${recentValues.length} most recent ${indicator_type} values of ${indicatorData.length} fetched. Full series available via API.`,
          indicator: indicator_type,
          values: recentValues,
        };
        if (indicatorData.length <= RECENT_VALUES_COUNT) {
          summarizedIndicator = recentValues;
        }
      } else {
        summarizedIndicator = indicatorData; // Should be a single object or value if not an array
      }

      return {
        content: [
          { type: "text", text: JSON.stringify(summarizedIndicator, null, 2) },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error in technical_indicator: ${error.message}`,
          },
        ],
      };
    }
  }
);

server.tool(
  "analyst_estimates",
  "Get a summary of analyst estimates (earnings, revenue, price targets) for a stock symbol.",
  {
    symbol: z.string().describe("Stock symbol (e.g., AAPL)"),
    period: z
      .string()
      .optional()
      .describe(
        "Fiscal period (e.g., 'quarter', 'annual'). Defaults to 'quarter' for some summaries."
      ),
  },
  async ({ symbol, period = "quarter" }) => {
    try {
      // Analyst estimates endpoint (main summary)
      const estimatesUrl = `${BASE_URL}/analyst-estimates/${encodeURIComponent(
        symbol
      )}?apikey=${API_KEY}`;
      const estimatesResponse = await axios.get(estimatesUrl);
      const estimatesData = estimatesResponse.data;

      // Price target specific endpoint for more detail
      const priceTargetUrl = `${BASE_URL}/price-target-summary/${encodeURIComponent(
        symbol
      )}?apikey=${API_KEY}`;
      const priceTargetResponse = await axios.get(priceTargetUrl);
      const priceTargetData = Array.isArray(priceTargetResponse.data)
        ? priceTargetResponse.data[0]
        : priceTargetResponse.data;

      if ((!estimatesData || estimatesData.length === 0) && !priceTargetData) {
        return {
          content: [
            {
              type: "text",
              text: "No analyst estimates or price target data found for the symbol.",
            },
          ],
        };
      }

      const summary = {
        symbol: symbol,
        sourceMessage:
          "Summarized analyst estimates. More historical/detailed data might be available via direct API.",
      };

      if (priceTargetData) {
        summary.priceTargetSummary = {
          lastUpdated: priceTargetData.lastUpdated,
          targetHigh: priceTargetData.targetHigh,
          targetLow: priceTargetData.targetLow,
          targetConsensus: priceTargetData.targetConsensus,
          targetMedian: priceTargetData.targetMedian,
          numberOfAnalysts: priceTargetData.numberOfAnalysts,
        };
      }

      if (estimatesData && estimatesData.length > 0) {
        // Summarize the most recent estimates (FMP usually returns newest first)
        const recentEstimates = estimatesData.slice(0, 2); // Look at last couple of periods/updates
        summary.recentEstimates = recentEstimates.map((est) => ({
          date: est.date,
          estimatedRevenueAvg: est.estimatedRevenueAvg,
          estimatedEpsAvg: est.estimatedEpsAvg,
          // Add other key estimate fields you want to show
        }));

        // Attempt to get overall sentiment from a different endpoint if available or infer
        // For this example, we'll just state that detailed recommendations would need another source or parsing.
        summary.recommendationInfo =
          "Detailed buy/hold/sell counts not directly available in this summary. FMP has separate recommendation endpoints.";
      }

      return {
        content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error in analyst_estimates: ${error.message}`,
          },
        ],
      };
    }
  }
);

server.tool(
  "stock_news",
  "Get recent news articles. Supports summary or more detailed (more articles) output.",
  {
    symbol: z
      .string()
      .describe(
        "Stock symbol or comma-separated symbols (e.g., AAPL or AAPL,MSFT)"
      ),
    limit: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        "Number of news articles to fetch from the API (e.g., 20). Defaults to 15."
      ),
    detail: z
      .enum(["summary", "full"])
      .optional()
      .describe(
        "Output detail: 'summary' (top 3-5 articles) or 'full' (more articles, up to fetched limit or ~10). Defaults to 'summary'."
      ),
  },
  async ({ symbol, limit = 15, detail = "summary" }) => {
    try {
      const endpoint = `/stock_news?tickers=${encodeURIComponent(
        symbol
      )}&limit=${limit}`;
      const url = `${BASE_URL}${endpoint}&apikey=${API_KEY}`;
      const response = await axios.get(url);

      const articles = response.data;
      if (!articles || articles.length === 0) {
        return {
          content: [
            { type: "text", text: "No news found for the given symbol(s)." },
          ],
        };
      }

      const ARTICLES_FOR_SUMMARY = 3;
      const ARTICLES_FOR_FULL_DETAIL = 10; // Cap for "full" detail to protect context

      let articlesToShowCount;
      if (detail === "full") {
        articlesToShowCount = Math.min(
          articles.length,
          ARTICLES_FOR_FULL_DETAIL
        );
      } else {
        // summary
        articlesToShowCount = Math.min(articles.length, ARTICLES_FOR_SUMMARY);
      }

      const summarizedArticles = articles
        .slice(0, articlesToShowCount)
        .map((article) => ({
          title: article.title,
          publishedDate: article.publishedDate,
          site: article.site,
          url: article.url,
          snippet:
            article.text && article.text.length > 200
              ? article.text.substring(0, 200) + "..."
              : article.text,
        }));

      let resultText;
      const messagePrefix =
        detail === "full"
          ? `Displaying ${summarizedArticles.length} of ${articles.length} fetched articles (full detail requested, capped at ${ARTICLES_FOR_FULL_DETAIL}):`
          : `Displaying summaries for the ${summarizedArticles.length} most recent of ${articles.length} articles fetched. Request 'full' detail for more.`;

      if (
        articles.length > summarizedArticles.length ||
        (detail === "full" && articles.length >= articlesToShowCount)
      ) {
        resultText = JSON.stringify(
          {
            message: messagePrefix,
            articles: summarizedArticles,
          },
          null,
          2
        );
      } else {
        resultText = JSON.stringify(summarizedArticles, null, 2); // No extra message if showing all fetched & summarized
      }

      return { content: [{ type: "text", text: resultText }] };
    } catch (error) {
      return {
        content: [
          { type: "text", text: `Error fetching stock_news: ${error.message}` },
        ],
      };
    }
  }
);

server.tool(
  "earnings_calendar",
  "Get earnings calendar information. Can filter by symbol, or date range. Returns summarized list if many results.",
  {
    symbol: z.string().optional().describe("Stock symbol (e.g., AAPL)."),
    from_date: z
      .string()
      .optional()
      .describe("Start date for earnings (YYYY-MM-DD)."),
    to_date: z
      .string()
      .optional()
      .describe("End date for earnings (YYYY-MM-DD)."),
    limit: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        "Max records to fetch if using date range. Default 50. Fewer will be summarized."
      ),
  },
  async ({ symbol, from_date, to_date, limit = 50 }) => {
    try {
      let queryParams = [];
      if (symbol) queryParams.push(`symbol=${encodeURIComponent(symbol)}`);
      if (from_date) queryParams.push(`from=${from_date}`);
      if (to_date) queryParams.push(`to=${to_date}`);
      // The FMP earnings calendar doesn't have a direct limit param in the typical way.
      // We'll fetch based on date range and then trim if necessary.

      const endpoint = `/earning_calendar${
        queryParams.length > 0 ? "?" + queryParams.join("&") : ""
      }`;
      const url = `${BASE_URL}${endpoint}${
        endpoint.includes("?") ? "&" : "?"
      }apikey=${API_KEY}`;
      const response = await axios.get(url);
      const earningsData = response.data;

      if (!earningsData || earningsData.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No earnings calendar data found for the given parameters.",
            },
          ],
        };
      }

      const MAX_RESULTS_TO_LLM = 10;
      if (!symbol && earningsData.length > MAX_RESULTS_TO_LLM) {
        const summarizedData = earningsData
          .slice(0, MAX_RESULTS_TO_LLM)
          .map((item) => ({
            date: item.date,
            symbol: item.symbol,
            epsEstimated: item.epsEstimated,
            time: item.time,
          }));
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  message: `Displaying first ${MAX_RESULTS_TO_LLM} of ${earningsData.length} earnings events. Specify a symbol or a tighter date range for more targeted results.`,
                  earningsEvents: summarizedData,
                },
                null,
                2
              ),
            },
          ],
        };
      } else {
        // If for a symbol, or few results, return them all (or up to a reasonable limit if it were for a single day with many companies)
        const relevantData = earningsData
          .slice(0, MAX_RESULTS_TO_LLM)
          .map((item) => ({
            date: item.date,
            symbol: item.symbol,
            eps: item.eps,
            epsEstimated: item.epsEstimated,
            revenue: item.revenue,
            revenueEstimated: item.revenueEstimated,
            time: item.time,
            fiscalDateEnding: item.fiscalDateEnding,
          }));
        return {
          content: [
            { type: "text", text: JSON.stringify(relevantData, null, 2) },
          ],
        };
      }
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error in earnings_calendar: ${error.message}`,
          },
        ],
      };
    }
  }
);

server.tool(
  "financial_ratios_ttm",
  "Get a curated list of key Trailing Twelve Months (TTM) financial ratios for a stock symbol.",
  {
    symbol: z.string().describe("Stock symbol (e.g., AAPL)"),
  },
  async ({ symbol }) => {
    try {
      const endpoint = `/ratios-ttm/${encodeURIComponent(symbol)}`;
      const url = `${BASE_URL}${endpoint}?apikey=${API_KEY}`;
      const response = await axios.get(url);
      // FMP returns an array with one object containing all TTM ratios
      const allRatios = Array.isArray(response.data)
        ? response.data[0]
        : response.data;

      if (!allRatios || Object.keys(allRatios).length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No TTM financial ratios found for the symbol.",
            },
          ],
        };
      }

      // Define a list of key ratios to extract for conciseness
      const keyRatioNames = [
        "peRatioTTM",
        "priceToSalesRatioTTM",
        "priceToBookRatioTTM",
        "priceEarningsToGrowthRatioTTM",
        "currentRatioTTM",
        "quickRatioTTM",
        "debtToEquityTTM",
        "debtToAssetsTTM",
        "returnOnEquityTTM",
        "returnOnAssetsTTM",
        "grossProfitMarginTTM",
        "operatingProfitMarginTTM",
        "netProfitMarginTTM",
        "dividendYieldTTM",
        "payoutRatioTTM",
        "assetTurnoverTTM",
        "inventoryTurnoverTTM",
      ];

      const summarizedRatios = {
        symbol: allRatios.symbol || symbol,
        date: allRatios.date, // FMP might not always provide date in TTM ratios, but include if it does
        sourceMessage: `Showing a curated list of TTM financial ratios. ${
          Object.keys(allRatios).length
        } total ratios fetched.`,
        ratios: {},
      };

      for (const key of keyRatioNames) {
        if (
          allRatios.hasOwnProperty(key) &&
          allRatios[key] !== null &&
          allRatios[key] !== undefined
        ) {
          summarizedRatios.ratios[key] = allRatios[key];
        }
      }
      // Add a few more general ones if they exist
      if (allRatios.priceFairValueTTM)
        summarizedRatios.ratios.priceFairValueTTM = allRatios.priceFairValueTTM;

      return {
        content: [
          { type: "text", text: JSON.stringify(summarizedRatios, null, 2) },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error in financial_ratios_ttm: ${error.message}`,
          },
        ],
      };
    }
  }
);

server.tool(
  "key_metrics_ttm",
  "Get a curated list of key Trailing Twelve Months (TTM) financial metrics for a stock symbol.",
  {
    symbol: z.string().describe("Stock symbol (e.g., AAPL)"),
  },
  async ({ symbol }) => {
    try {
      const endpoint = `/key-metrics-ttm/${encodeURIComponent(symbol)}`;
      const url = `${BASE_URL}${endpoint}?apikey=${API_KEY}`;
      const response = await axios.get(url);
      // FMP returns an array with one object containing all TTM metrics
      const allMetrics = Array.isArray(response.data)
        ? response.data[0]
        : response.data;

      if (!allMetrics || Object.keys(allMetrics).length === 0) {
        return {
          content: [
            { type: "text", text: "No TTM key metrics found for the symbol." },
          ],
        };
      }

      // Define a list of key metrics to extract
      const keyMetricNames = [
        "revenuePerShareTTM",
        "netIncomePerShareTTM",
        "operatingCashFlowPerShareTTM",
        "freeCashFlowPerShareTTM",
        "marketCapTTM",
        "enterpriseValueTTM",
        "peRatioTTM",
        "priceToSalesRatioTTM",
        "pocfratioTTM",
        "pfcfRatioTTM",
        "pbRatioTTM",
        "ptbRatioTTM",
        "evToSalesTTM",
        "enterpriseValueOverEBITDATTM",
        "debtToEquityTTM",
        "debtToAssetsTTM",
        "netDebtToEBITDATTM",
        "currentRatioTTM",
        "dividendYieldTTM",
        "payoutRatioTTM",
        "roeTTM",
        "roicTTM",
      ];

      const summarizedMetrics = {
        symbol: allMetrics.symbol || symbol,
        date: allMetrics.date, // Include if FMP provides it
        sourceMessage: `Showing a curated list of TTM key metrics. ${
          Object.keys(allMetrics).length
        } total metrics fetched.`,
        metrics: {},
      };

      for (const key of keyMetricNames) {
        if (
          allMetrics.hasOwnProperty(key) &&
          allMetrics[key] !== null &&
          allMetrics[key] !== undefined
        ) {
          summarizedMetrics.metrics[key] = allMetrics[key];
        }
      }
      // Add a few more general ones like bookValuePerShare if they exist
      if (allMetrics.bookValuePerShareTTM)
        summarizedMetrics.metrics.bookValuePerShareTTM =
          allMetrics.bookValuePerShareTTM;

      return {
        content: [
          { type: "text", text: JSON.stringify(summarizedMetrics, null, 2) },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error in key_metrics_ttm: ${error.message}`,
          },
        ],
      };
    }
  }
);

server.tool(
  "dcf_valuation",
  "Get Discounted Cash Flow (DCF) valuation for a stock symbol to estimate its intrinsic value.",
  {
    symbol: z.string().describe("Stock symbol (e.g., AAPL)"),
  },
  async ({ symbol }) => {
    try {
      const endpoint = `/dcf/${encodeURIComponent(symbol)}`;
      const url = `${BASE_URL}${endpoint}?apikey=${API_KEY}`;
      const response = await axios.get(url);

      // FMP API for DCF usually returns a single object directly, or an array with one object
      const dcfData = Array.isArray(response.data)
        ? response.data[0]
        : response.data;

      if (!dcfData || Object.keys(dcfData).length === 0 || !dcfData.dcf) {
        return {
          content: [
            {
              type: "text",
              text: `No DCF valuation data found for ${symbol}. This might be due to data availability or the company type.`,
            },
          ],
        };
      }

      const stockPrice = dcfData["Stock Price"] || dcfData.stockPrice; // FMP uses "Stock Price" with a space sometimes
      const dcfValue = dcfData.dcf;
      let potentialUpsidePercent = null;

      if (stockPrice && dcfValue && stockPrice > 0) {
        potentialUpsidePercent = ((dcfValue - stockPrice) / stockPrice) * 100;
      }

      const summarizedDcf = {
        symbol: dcfData.symbol || symbol,
        date: dcfData.date,
        stockPrice: stockPrice,
        dcfValue: dcfValue,
        currency: "USD", // Assuming USD, FMP DCF endpoint is typically for US stocks or doesn't specify currency
        potentialUpsidePercent: potentialUpsidePercent
          ? parseFloat(potentialUpsidePercent.toFixed(2))
          : null,
        message:
          potentialUpsidePercent !== null
            ? potentialUpsidePercent > 0
              ? `DCF suggests a potential upside of ${potentialUpsidePercent.toFixed(
                  2
                )}%.`
              : `DCF suggests a potential downside of ${Math.abs(
                  potentialUpsidePercent
                ).toFixed(2)}%.`
            : "Could not calculate potential upside.",
      };

      return {
        content: [
          { type: "text", text: JSON.stringify(summarizedDcf, null, 2) },
        ],
      };
    } catch (error) {
      console.error(`Error in dcf_valuation for ${symbol}:`, error.message);
      // Check if FMP returned a specific error message in its response
      if (
        error.response &&
        error.response.data &&
        error.response.data["Error Message"]
      ) {
        return {
          content: [
            {
              type: "text",
              text: `Error fetching DCF for ${symbol}: ${error.response.data["Error Message"]}`,
            },
          ],
        };
      }
      return {
        content: [
          {
            type: "text",
            text: `Error in dcf_valuation for ${symbol}: ${error.message}. This could be due to data unavailability for the symbol (e.g., non-US stock, financial institution, or new IPO).`,
          },
        ],
      };
    }
  }
);

server.tool(
  "dividend_calendar",
  "Get historical dividend payment information for a stock symbol.",
  {
    symbol: z.string().describe("Stock symbol (e.g., AAPL)"),
    limit: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        "Max number of recent dividend records to return. Defaults to 10."
      ),
  },
  async ({ symbol, limit = 10 }) => {
    try {
      const endpoint = `/historical-price-full/stock_dividend/${encodeURIComponent(
        symbol
      )}`;
      const url = `${BASE_URL}${endpoint}?apikey=${API_KEY}`;
      const response = await axios.get(url);

      // The FMP API wraps the dividend list in a "historical" key
      const dividends = response.data.historical;

      if (!dividends || dividends.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No dividend data found for ${symbol}. The company may not pay dividends or data may be unavailable.`,
            },
          ],
        };
      }

      // Dividends are usually returned oldest to newest by FMP, so we might want to reverse for "most recent"
      // However, for a calendar/history, chronological might be fine, then slice the end.
      // For consistency, let's sort by date descending to get most recent if the order isn't guaranteed.
      const sortedDividends = [...dividends].sort(
        (a, b) => new Date(b.date) - new Date(a.date)
      );

      const recentDividends = sortedDividends.slice(0, limit).map((div) => ({
        date: div.date, // This is often the payment date in FMP's dividend history
        label: div.label,
        dividend: div.dividend,
        adjDividend: div.adjDividend,
        recordDate: div.recordDate,
        paymentDate: div.paymentDate,
        declarationDate: div.declarationDate,
      }));
      let resultText;
      const message = `Displaying ${recentDividends.length} most recent of ${dividends.length} dividend records fetched for ${symbol}.`;

      if (dividends.length > recentDividends.length) {
        resultText = JSON.stringify(
          { message, dividends: recentDividends },
          null,
          2
        );
      } else {
        resultText = JSON.stringify(
          {
            message: `Found ${dividends.length} dividend records for ${symbol}.`,
            dividends: recentDividends,
          },
          null,
          2
        );
      }

      return { content: [{ type: "text", text: resultText }] };
    } catch (error) {
      console.error(`Error in dividend_calendar for ${symbol}:`, error.message);
      if (
        error.response &&
        error.response.data &&
        error.response.data["Error Message"]
      ) {
        return {
          content: [
            {
              type: "text",
              text: `Error fetching dividend data for ${symbol}: ${error.response.data["Error Message"]}`,
            },
          ],
        };
      }
      return {
        content: [
          {
            type: "text",
            text: `Error fetching dividend data for ${symbol}: ${error.message}`,
          },
        ],
      };
    }
  }
);

// Connect to the server transport
const transport = new StdioServerTransport();
await server.connect(transport);
