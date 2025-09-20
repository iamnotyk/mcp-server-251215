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

// 예시 도구: 계산기
server.tool(
    'calculator',
    {
        operation: z
            .enum(['add', 'subtract', 'multiply', 'divide'])
            .describe('수행할 연산 (add, subtract, multiply, divide)'),
        a: z.number().describe('첫 번째 숫자'),
        b: z.number().describe('두 번째 숫자')
    },
    async ({ operation, a, b }) => {
        // 연산 수행
        let result: number
        switch (operation) {
            case 'add':
                result = a + b
                break
            case 'subtract':
                result = a - b
                break
            case 'multiply':
                result = a * b
                break
            case 'divide':
                if (b === 0) throw new Error('0으로 나눌 수 없습니다')
                result = a / b
                break
            default:
                throw new Error('지원하지 않는 연산입니다')
        }

        const operationSymbols = {
            add: '+',
            subtract: '-',
            multiply: '×',
            divide: '÷'
        } as const

        const operationSymbol =
            operationSymbols[operation as keyof typeof operationSymbols]

        return {
            content: [
                {
                    type: 'text',
                    text: `${a} ${operationSymbol} ${b} = ${result}`
                }
            ]
        }
    }
)

// 예시 도구: 시간 조회
server.tool(
    'get_time',
    {
        timeZone: z.string().describe('시간대')
    },
    async ({ timeZone }) => {
        return {
            content: [
                {
                    type: 'text',
                    text: new Date().toLocaleString('ko-KR', {
                        timeZone
                    })
                }
            ]
        }
    }
)

// 예시 리소스: 서버 정보
server.resource(
    'server://info',
    'server://info',
    {
        name: '서버 정보',
        description: 'TypeScript MCP Server 보일러플레이트 정보',
        mimeType: 'application/json'
    },
    async () => {
        const serverInfo = {
            name: 'typescript-mcp-server',
            version: '1.0.0',
            description: 'TypeScript MCP Server 보일러플레이트',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            nodeVersion: process.version,
            platform: process.platform
        }

        return {
            contents: [
                {
                    uri: 'server://info',
                    mimeType: 'application/json',
                    text: JSON.stringify(serverInfo, null, 2)
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
