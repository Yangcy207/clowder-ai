import type { ITtsProvider, TtsSynthesizeRequest, TtsSynthesizeResult } from '@cat-cafe/shared';

export interface MiMoTtsProviderOptions {
  readonly baseUrl?: string;
  readonly apiKey?: string;
  readonly model?: string;
  readonly timeoutMs?: number;
}

export class MiMoTtsProvider implements ITtsProvider {
  readonly id = 'mimo-tts';
  readonly model: string;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(options?: MiMoTtsProviderOptions) {
    this.baseUrl = (options?.baseUrl ?? process.env.MIMO_TTS_BASE_URL ?? 'https://token-plan-cn.xiaomimimo.com/v1').replace(/\/+$/, '');
    this.apiKey = options?.apiKey ?? process.env.MIMO_TTS_API_KEY ?? '';
    this.model = options?.model ?? process.env.MIMO_TTS_MODEL ?? 'mimo-v2.5-tts';
    this.timeoutMs = options?.timeoutMs ?? 60_000;
  }

  async synthesize(request: TtsSynthesizeRequest): Promise<TtsSynthesizeResult> {
    const url = `${this.baseUrl}/chat/completions`;

    const body = JSON.stringify({
      model: this.model,
      messages: [
        { role: 'user', content: request.instruct ?? '请朗读以下内容' },
        { role: 'assistant', content: request.text },
      ],
      modalities: ['text', 'audio'],
      audio: {
        voice: request.voice ?? 'mimo_default',
        format: request.format ?? 'wav',
      },
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body,
        signal: controller.signal,
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => 'unknown');
        throw new Error(`MiMo TTS returned ${response.status}: ${detail}`);
      }

      const json = await response.json() as {
        choices?: Array<{
          message?: {
            audio?: {
              data?: string;
            };
          };
        }>;
      };

      const audioData = json.choices?.[0]?.message?.audio?.data;
      if (!audioData) {
        throw new Error('MiMo TTS: no audio data in response');
      }

      const audio = Uint8Array.from(Buffer.from(audioData, 'base64'));

      return {
        audio,
        format: request.format ?? 'wav',
        metadata: {
          provider: this.id,
          model: this.model,
          voice: request.voice ?? 'mimo_default',
        },
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
