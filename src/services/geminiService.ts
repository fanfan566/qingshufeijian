interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export async function chatWithGemini(message: string, history: Message[] = []) {
  const apiKey = process.env.ALIBASA_API_KEY || process.env.GEMINI_API_KEY || "";
  const model = process.env.ALIBASA_MODEL || "qwen-plus";
  
  if (!apiKey) {
    throw new Error("未配置 API 密钥，请在 .env 文件中设置 ALIBASA_API_KEY 或 GEMINI_API_KEY");
  }

  // 使用通义千问 API
  const messages: Message[] = [
    ...history,
    { role: 'user', content: message }
  ];

  try {
    const response = await fetch("https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model,
        messages: messages.map(m => ({
          role: m.role === 'user' ? 'user' : 'assistant',
          content: m.content
        })),
        system: "你是一个专业的肺部健康助手，名叫'肺管家'。你擅长回答关于肺部疾病、营养建议、健康管理和用药咨询的问题。请用专业、亲切且易懂的语言回答。如果问题与肺部健康无关，请礼貌地引导用户回到肺部健康话题。",
      })
    });

    if (!response.ok) {
      throw new Error(`API 错误: ${response.status}`);
    }

    const data = await response.json() as any;
    return data.output?.text || "抱歉，无法生成回复";
  } catch (error) {
    throw new Error(`通义千问 API 调用失败: ${error}`);
  }
}
