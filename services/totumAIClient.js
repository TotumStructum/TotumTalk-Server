const DEFAULT_TOTUM_AI_REPLY =
  "TotumAI is temporarily unavailable. Please try again later.";

const getTotumAIServiceUrl = () => {
  return (process.env.TOTUM_AI_SERVICE_URL || "http://localhost:8001").replace(
    /\/$/,
    "",
  );
};

const normalizeHistory = (history = []) => {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .filter((item) => {
      return (
        item &&
        ["user", "assistant"].includes(item.role) &&
        typeof item.content === "string" &&
        item.content.trim()
      );
    })
    .map((item) => ({
      role: item.role,
      content: item.content.trim(),
    }));
};

exports.generateTotumAIReply = async ({ userId, message, history = [] }) => {
  const trimmedMessage = typeof message === "string" ? message.trim() : "";

  if (!trimmedMessage) {
    return {
      reply: DEFAULT_TOTUM_AI_REPLY,
      provider: "fallback",
    };
  }

  try {
    const response = await fetch(`${getTotumAIServiceUrl()}/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_id: userId?.toString(),
        message: trimmedMessage,
        history: normalizeHistory(history),
      }),
    });

    if (!response.ok) {
      throw new Error(`TotumAI service responded with ${response.status}`);
    }

    const data = await response.json();

    if (!data?.reply || typeof data.reply !== "string") {
      throw new Error("TotumAI service returned invalid response");
    }

    return {
      reply: data.reply.trim(),
      provider: data.provider || "unknown",
    };
  } catch (error) {
    return {
      reply: DEFAULT_TOTUM_AI_REPLY,
      provider: "fallback",
      error: error.message,
    };
  }
};

exports.DEFAULT_TOTUM_AI_REPLY = DEFAULT_TOTUM_AI_REPLY;
