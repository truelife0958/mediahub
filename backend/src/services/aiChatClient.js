function extractContentPart(part) {
  if (typeof part === 'string') return part;
  if (!part || typeof part !== 'object') return '';
  return part.text || part.output_text || part.content || '';
}

function extractMessageContent(message) {
  if (!message || typeof message !== 'object') return '';
  if (typeof message.content === 'string') return message.content;
  if (Array.isArray(message.content)) {
    return message.content.map(extractContentPart).filter(Boolean).join('\n');
  }
  return '';
}

function extractAiOutputText(payload) {
  if (!payload || typeof payload !== 'object') return '';

  const chatText = Array.isArray(payload.choices)
    ? payload.choices
      .map(choice => extractMessageContent(choice?.message) || String(choice?.text || choice?.delta?.content || ''))
      .filter(Boolean)
      .join('\n')
    : '';
  if (chatText.trim()) return chatText.trim();

  if (typeof payload.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const responseChunks = Array.isArray(payload.output)
    ? payload.output.flatMap(item => Array.isArray(item?.content) ? item.content : [])
    : [];

  return responseChunks
    .map(extractContentPart)
    .filter(Boolean)
    .join('\n')
    .trim();
}

function buildChatCompletionBody({ model, prompt, systemPrompt, temperature = 0.2 }) {
  return {
    model,
    messages: [
      {
        role: 'system',
        content: systemPrompt || '你是 MediaHub 的内容数据助手。请严格按用户要求输出，不要添加无关说明。',
      },
      { role: 'user', content: prompt },
    ],
    temperature,
  };
}

function readAiRequestTimeoutMs(value = process.env.MEDIAHUB_AI_REQUEST_TIMEOUT_MS) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 60_000;
  return Math.min(180_000, Math.max(5_000, parsed));
}

function isAbortError(error) {
  return error?.name === 'AbortError';
}

async function postAiChatCompletion({ config, prompt, systemPrompt, temperature, timeoutMs } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), readAiRequestTimeoutMs(timeoutMs));

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify(buildChatCompletionBody({
        model: config.model,
        prompt,
        systemPrompt,
        temperature,
      })),
    });

    const payload = await response.json().catch(() => null);
    return { response, payload };
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error('AI 模型请求超时，请稍后重试。', { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export { buildChatCompletionBody, extractAiOutputText, postAiChatCompletion, readAiRequestTimeoutMs };
