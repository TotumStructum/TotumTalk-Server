const {
  DEFAULT_TOTUM_AI_REPLY,
  generateTotumAIReply,
} = require("../services/totumAIClient");

describe("totumAIClient", () => {
  const originalFetch = global.fetch;
  const originalServiceUrl = process.env.TOTUM_AI_SERVICE_URL;

  beforeEach(() => {
    global.fetch = jest.fn();
    process.env.TOTUM_AI_SERVICE_URL = "http://localhost:8001";
  });

  afterEach(() => {
    global.fetch = originalFetch;

    if (originalServiceUrl === undefined) {
      delete process.env.TOTUM_AI_SERVICE_URL;
    } else {
      process.env.TOTUM_AI_SERVICE_URL = originalServiceUrl;
    }

    jest.clearAllMocks();
  });

  it("sends message and history to TotumAI service", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        reply: "Hello from TotumAI",
        provider: "mock",
      }),
    });

    const result = await generateTotumAIReply({
      userId: "user-1",
      message: "  Hello  ",
      history: [
        {
          role: "user",
          content: "Previous user message",
        },
        {
          role: "assistant",
          content: "Previous AI reply",
        },
        {
          role: "invalid",
          content: "Ignored",
        },
        {
          role: "user",
          content: "   ",
        },
      ],
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:8001/generate",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_id: "user-1",
          message: "Hello",
          history: [
            {
              role: "user",
              content: "Previous user message",
            },
            {
              role: "assistant",
              content: "Previous AI reply",
            },
          ],
        }),
      },
    );

    expect(result).toEqual({
      reply: "Hello from TotumAI",
      provider: "mock",
    });
  });

  it("uses fallback reply when TotumAI service is unavailable", async () => {
    global.fetch.mockRejectedValueOnce(new Error("Connection refused"));

    const result = await generateTotumAIReply({
      userId: "user-1",
      message: "Hello",
    });

    expect(result.reply).toBe(DEFAULT_TOTUM_AI_REPLY);
    expect(result.provider).toBe("fallback");
    expect(result.error).toBe("Connection refused");
  });

  it("uses fallback reply when TotumAI service returns an error status", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({
        detail: "Internal error",
      }),
    });

    const result = await generateTotumAIReply({
      userId: "user-1",
      message: "Hello",
    });

    expect(result.reply).toBe(DEFAULT_TOTUM_AI_REPLY);
    expect(result.provider).toBe("fallback");
    expect(result.error).toBe("TotumAI service responded with 500");
  });

  it("uses fallback reply when TotumAI service returns invalid response", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        provider: "mock",
      }),
    });

    const result = await generateTotumAIReply({
      userId: "user-1",
      message: "Hello",
    });

    expect(result.reply).toBe(DEFAULT_TOTUM_AI_REPLY);
    expect(result.provider).toBe("fallback");
    expect(result.error).toBe("TotumAI service returned invalid response");
  });

  it("does not call TotumAI service for empty message", async () => {
    const result = await generateTotumAIReply({
      userId: "user-1",
      message: "   ",
    });

    expect(global.fetch).not.toHaveBeenCalled();
    expect(result).toEqual({
      reply: DEFAULT_TOTUM_AI_REPLY,
      provider: "fallback",
    });
  });
});
