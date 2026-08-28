import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import mammoth from 'mammoth';
import { getCanvasClient } from '../canvas-client.js';

export function registerFileTools(server: McpServer) {
  const client = getCanvasClient();

  // Read the text content of a .docx file attached to Canvas (assignment
  // instructions, a submitted paper, instructor feedback documents, etc.)
  server.tool(
    'read_docx_file',
    {
      file_url: z.string().describe(
        'The Canvas file URL, e.g. the `url` field from a submission attachment or module item (from get_submission, get_discussion_entries, etc.)'
      ),
    },
    async ({ file_url }) => {
      try {
        const fileBuffer = await client.downloadFile(file_url);
        const result = await mammoth.extractRawText({ buffer: Buffer.from(fileBuffer) });

        if (result.messages.length > 0) {
          const warnings = result.messages
            .filter(m => m.type === 'warning')
            .map(m => m.message);
          if (warnings.length > 0) {
            console.error(`mammoth warnings for ${file_url}: ${warnings.join('; ')}`);
          }
        }

        return {
          content: [{
            type: 'text',
            text: result.value,
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error reading .docx file: ${error instanceof Error ? error.message : String(error)}`,
          }],
          isError: true,
        };
      }
    }
  );
}
