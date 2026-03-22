import { z } from 'zod';
import { tool, generateImage } from 'ai';
import { createGateway } from '@ai-sdk/gateway';

export function createGenerateImageTool() {
  return tool({
    description:
      'Generate an AI image based on a description. Use when the user asks to see images of hotel rooms, event venues, banquet halls, conference rooms, gardens, poolside areas, or any hotel/event-related visual. Generate a professional, photorealistic image matching their request. Always add "luxury hotel photography, professional interior design, high quality" to the prompt for consistent quality.',
    inputSchema: z.object({
      prompt: z
        .string()
        .describe(
          'Detailed image generation prompt describing what to visualize. Include setting, lighting, style details. Example: "Elegant grand ballroom set up for a 200-person wedding reception with round tables, white floral centerpieces, crystal chandeliers, warm golden lighting, luxury hotel photography"',
        ),
      label: z.string().describe('Short label for the image, e.g. "Grand Ballroom Setup" or "Deluxe Suite"'),
    }),
    execute: async ({ prompt, label }) => {
      const gw = createGateway({ apiKey: process.env.AI_GATEWAY_API_KEY });

      const result = await generateImage({
        model: gw.image('openai/gpt-image-1'),
        prompt,
        n: 1,
        size: '1024x1024',
      });

      const image = result.images[0];
      if (!image) {
        return { type: 'image_result' as const, success: false, error: 'Failed to generate image' };
      }

      return {
        type: 'image_result' as const,
        success: true,
        image: {
          base64: image.base64,
          mimeType: image.mediaType || 'image/png',
          label,
        },
      };
    },
  });
}
