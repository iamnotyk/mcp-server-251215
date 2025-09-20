import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

// 서버 인스턴스 생성
const server = new McpServer({
    name: 'typescript-mcp-server',
    version: '1.0.0',
    capabilities: {
        tools: {}
    }
})

// 예시 도구: 인사하기
server.tool(
    'greeting',
    {
        name: z.string().describe('인사할 사람의 이름'),
        language: z
            .enum(['ko', 'en'])
            .optional()
            .default('ko')
            .describe('인사 언어 (기본값: ko)')
    },
    async ({ name, language }) => {
        const greeting =
            language === 'ko'
                ? `안녕하세요, ${name}님! 😊`
                : `Hello, ${name}! 👋`

        return {
            content: [
                {
                    type: 'text',
                    text: greeting
                }
            ]
        }
    }
)

// 서버 시작
async function main() {
    const transport = new StdioServerTransport()
    await server.connect(transport)
    console.error('TypeScript MCP 서버가 시작되었습니다!')
}

main().catch(error => {
    console.error('서버 시작 중 오류 발생:', error)
    process.exit(1)
})
