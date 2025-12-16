import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { InferenceClient } from '@huggingface/inference'

// Smithery 설정 스키마
export const configSchema = z.object({
    hfToken: z
        .string()
        .optional()
        .describe('Hugging Face API 토큰 (이미지 생성 도구 사용 시 필요)')
})

// Smithery 배포를 위한 createServer 함수
export default function createServer({ config }: { config: z.infer<typeof configSchema> }) {
// 서버 인스턴스 생성
const server = new McpServer({
    name: 'typescript-mcp-server',
    version: '1.0.0',
    capabilities: {
        tools: {},
        resources: {},
        prompts: {}
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
        a: z.number().describe('첫 번째 숫자'),
        b: z.number().describe('두 번째 숫자'),
        operator: z
            .enum(['+', '-', '*', '/'])
            .describe('연산자 (+, -, *, /)')
    },
    async ({ a, b, operator }) => {
        // 연산 수행
        let result: number
        switch (operator) {
            case '+':
                result = a + b
                break
            case '-':
                result = a - b
                break
            case '*':
                result = a * b
                break
            case '/':
                if (b === 0) throw new Error('0으로 나눌 수 없습니다')
                result = a / b
                break
            default:
                throw new Error('지원하지 않는 연산자입니다')
        }

        return {
            content: [
                {
                    type: 'text',
                    text: `${a} ${operator} ${b} = ${result}`
                }
            ]
        }
    }
)

// TIME MCP 도구: 타임존별 현재 시간 조회
server.tool(
    'get_time',
    {
        timeZone: z
            .string()
            .describe('IANA 타임존 이름 (예: America/New_York, Europe/London, Asia/Seoul)')
    },
    async ({ timeZone }) => {
        try {
            const now = new Date()
            
            // 타임존 유효성 검사
            const formatter = new Intl.DateTimeFormat('ko-KR', {
                timeZone,
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            })

            const formattedTime = formatter.format(now)
            const utcTime = now.toISOString()
            
            // 타임존 오프셋 계산
            const utcDate = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }))
            const tzDate = new Date(now.toLocaleString('en-US', { timeZone }))
            const offset = (tzDate.getTime() - utcDate.getTime()) / (1000 * 60 * 60)
            const offsetHours = Math.floor(Math.abs(offset))
            const offsetMinutes = Math.floor((Math.abs(offset) - offsetHours) * 60)
            const offsetSign = offset >= 0 ? '+' : '-'
            const offsetString = `UTC${offsetSign}${String(offsetHours).padStart(2, '0')}:${String(offsetMinutes).padStart(2, '0')}`

            const timeInfo = {
                timezone: timeZone,
                localTime: formattedTime,
                utcTime: utcTime,
                offset: offsetString,
                timestamp: now.getTime(),
                date: formattedTime.split(' ')[0],
                time: formattedTime.split(' ')[1]
            }

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(timeInfo, null, 2)
                    }
                ]
            }
        } catch (error) {
            throw new Error(
                `유효하지 않은 타임존입니다: ${timeZone}. IANA 타임존 형식(예: America/New_York)을 사용해주세요.`
            )
        }
    }
)

// 이미지 생성 도구
server.tool(
    'generate_image',
    {
        prompt: z.string().describe('이미지 생성을 위한 프롬프트')
    },
    async ({ prompt }) => {
        try {
                // Hugging Face 토큰 확인 (config에서 가져옴)
                if (!config.hfToken) {
                    throw new Error('hfToken 설정이 필요합니다. Smithery 설정에서 Hugging Face API 토큰을 입력해주세요.')
            }

            // Hugging Face Inference 클라이언트 생성
                const client = new InferenceClient(config.hfToken)

            // 이미지 생성 요청
            const imageBlob = await client.textToImage({
                provider: 'auto',
                model: 'black-forest-labs/FLUX.1-schnell',
                inputs: prompt,
                parameters: { num_inference_steps: 5 }
            })

            // Blob을 ArrayBuffer로 변환 후 base64 인코딩
            const arrayBuffer = await (
                imageBlob as unknown as Blob
            ).arrayBuffer()
            const buffer = Buffer.from(arrayBuffer)
            const base64Data = buffer.toString('base64')

            return {
                content: [
                    {
                        type: 'image',
                        data: base64Data,
                        mimeType: 'image/png'
                    }
                ],
                annotations: {
                    audience: ['user'],
                    priority: 0.9
                }
            }
        } catch (error) {
            throw new Error(
                `이미지 생성 중 오류가 발생했습니다: ${
                    error instanceof Error ? error.message : '알 수 없는 오류'
                }`
            )
        }
    }
)

// Geocode MCP 도구: Nominatim OpenStreetMap API를 사용한 지오코딩
server.tool(
    'geocode',
    {
        query: z
            .string()
            .describe('검색할 도시 이름 또는 주소 (예: "Seoul", "New York", "서울시 강남구")'),
        limit: z
            .number()
            .min(1)
            .max(40)
            .optional()
            .default(1)
            .describe('반환할 결과 수 (기본값: 1, 최대: 40)')
    },
    async ({ query, limit }) => {
        try {
            const url = new URL('https://nominatim.openstreetmap.org/search')
            url.searchParams.set('q', query)
            url.searchParams.set('format', 'jsonv2')
            url.searchParams.set('limit', String(limit))
            url.searchParams.set('addressdetails', '1')

            const response = await fetch(url.toString(), {
                headers: {
                    'User-Agent': 'typescript-mcp-server/1.0.0',
                    'Accept-Language': 'ko,en'
                }
            })

            if (!response.ok) {
                throw new Error(
                    `Nominatim API 오류: ${response.status} ${response.statusText}`
                )
            }

            const results = await response.json()

            if (!results || results.length === 0) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `"${query}"에 대한 검색 결과가 없습니다.`
                        }
                    ]
                }
            }

            // 위도와 경도 좌표를 명확하게 반환
            const formatted = results.map((r: any) => ({
                display_name: r.display_name,
                latitude: parseFloat(r.lat),
                longitude: parseFloat(r.lon),
                coordinates: {
                    lat: parseFloat(r.lat),
                    lon: parseFloat(r.lon)
                },
                place_id: r.place_id,
                osm_type: r.osm_type,
                osm_id: r.osm_id,
                type: r.type,
                category: r.category,
                importance: r.importance,
                address: r.address || null,
                boundingbox: r.boundingbox || null
            }))

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(formatted, null, 2)
                    }
                ]
            }
        } catch (error) {
            throw new Error(
                `지오코딩 중 오류가 발생했습니다: ${
                    error instanceof Error ? error.message : '알 수 없는 오류'
                }`
            )
        }
    }
)

// 날씨 정보 도구: Open-Meteo API 사용
server.tool(
    'get_weather',
    {
        latitude: z.number().min(-90).max(90).describe('위도 (WGS84)'),
        longitude: z.number().min(-180).max(180).describe('경도 (WGS84)'),
        timezone: z
            .string()
            .optional()
            .default('auto')
            .describe('시간대 (기본값: auto - 자동 감지)'),
        forecast_days: z
            .number()
            .min(1)
            .max(16)
            .optional()
            .default(3)
            .describe('예보 일수 (기본값: 3, 최대: 16)')
    },
    async ({ latitude, longitude, timezone, forecast_days }) => {
        const url = new URL('https://api.open-meteo.com/v1/forecast')
        url.searchParams.set('latitude', String(latitude))
        url.searchParams.set('longitude', String(longitude))
        url.searchParams.set('timezone', timezone)
        url.searchParams.set('forecast_days', String(forecast_days))
        url.searchParams.set(
            'current',
            'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m'
        )
        url.searchParams.set(
            'daily',
            'temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code'
        )

        const response = await fetch(url.toString(), {
            headers: { 'User-Agent': 'typescript-mcp-server/1.0.0' }
        })

        if (!response.ok) {
            throw new Error(`Open-Meteo API 오류: ${response.status}`)
        }

        const data = await response.json()

        if (data.error) {
            throw new Error(
                `Open-Meteo API 오류: ${data.reason || '알 수 없는 오류'}`
            )
        }

        const formatted = {
            location: {
                latitude: data.latitude,
                longitude: data.longitude,
                timezone: data.timezone,
                elevation: data.elevation
            },
            current: data.current
                ? {
                      temperature: data.current.temperature_2m,
                      humidity: data.current.relative_humidity_2m,
                      weather_code: data.current.weather_code,
                      wind_speed: data.current.wind_speed_10m,
                      time: data.current.time
                  }
                : null,
            daily: data.daily
                ? {
                      time: data.daily.time,
                      temperature_max: data.daily.temperature_2m_max,
                      temperature_min: data.daily.temperature_2m_min,
                      precipitation: data.daily.precipitation_sum,
                      weather_code: data.daily.weather_code
                  }
                : null,
            units: {
                temperature: data.current_units?.temperature_2m || '°C',
                humidity: data.current_units?.relative_humidity_2m || '%',
                wind_speed: data.current_units?.wind_speed_10m || 'km/h',
                precipitation: data.daily_units?.precipitation_sum || 'mm'
            }
        }

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(formatted, null, 2)
                }
            ]
        }
    }
)

// 서버 정보 및 도구 목록 리소스
server.resource(
    'server://info',
    'server://info',
    {
        name: '서버 정보 및 도구 목록',
        description: '현재 서버 정보와 사용 가능한 모든 도구 정보를 반환합니다',
        mimeType: 'application/json'
    },
    async () => {
        // 사용 가능한 도구 정보
        const availableTools = [
            {
                name: 'greeting',
                description: '인사하기 - 이름과 언어를 입력받아 인사 메시지를 반환합니다',
                parameters: {
                    name: {
                        type: 'string',
                        description: '인사할 사람의 이름',
                        required: true
                    },
                    language: {
                        type: 'enum',
                        values: ['ko', 'en'],
                        description: '인사 언어 (기본값: ko)',
                        required: false,
                        default: 'ko'
                    }
                }
            },
            {
                name: 'calculator',
                description: '계산기 - 두 개의 숫자와 연산자를 입력받아 사칙연산 결과를 반환합니다',
                parameters: {
                    a: {
                        type: 'number',
                        description: '첫 번째 숫자',
                        required: true
                    },
                    b: {
                        type: 'number',
                        description: '두 번째 숫자',
                        required: true
                    },
                    operator: {
                        type: 'enum',
                        values: ['+', '-', '*', '/'],
                        description: '연산자 (+, -, *, /)',
                        required: true
                    }
                }
            },
            {
                name: 'get_time',
                description: 'TIME MCP - 타임존을 입력받아 해당 지역의 현재 시간 정보를 반환합니다',
                parameters: {
                    timeZone: {
                        type: 'string',
                        description: 'IANA 타임존 이름 (예: America/New_York, Europe/London, Asia/Seoul)',
                        required: true
                    }
                }
            },
            {
                name: 'generate_image',
                description: '이미지 생성 - 프롬프트를 입력받아 AI로 생성한 이미지를 반환합니다 (Hugging Face API 사용)',
                parameters: {
                    prompt: {
                        type: 'string',
                        description: '이미지 생성을 위한 프롬프트',
                        required: true
                    }
                }
            },
            {
                name: 'geocode',
                description: 'Geocode MCP - 도시 이름이나 주소를 입력받아 위도/경도 좌표를 반환합니다 (Nominatim OpenStreetMap API 사용)',
                parameters: {
                    query: {
                        type: 'string',
                        description: '검색할 도시 이름 또는 주소 (예: "Seoul", "New York", "서울시 강남구")',
                        required: true
                    },
                    limit: {
                        type: 'number',
                        description: '반환할 결과 수 (기본값: 1, 최대: 40)',
                        required: false,
                        default: 1,
                        min: 1,
                        max: 40
                    }
                }
            },
            {
                name: 'get_weather',
                description: '날씨 정보 - 위도/경도 좌표를 입력받아 해당 지역의 날씨 정보를 반환합니다 (Open-Meteo API 사용)',
                parameters: {
                    latitude: {
                        type: 'number',
                        description: '위도 (WGS84)',
                        required: true,
                        min: -90,
                        max: 90
                    },
                    longitude: {
                        type: 'number',
                        description: '경도 (WGS84)',
                        required: true,
                        min: -180,
                        max: 180
                    },
                    timezone: {
                        type: 'string',
                        description: '시간대 (기본값: auto - 자동 감지)',
                        required: false,
                        default: 'auto'
                    },
                    forecast_days: {
                        type: 'number',
                        description: '예보 일수 (기본값: 3, 최대: 16)',
                        required: false,
                        default: 3,
                        min: 1,
                        max: 16
                    }
                }
            }
        ]

        const serverInfo = {
            server: {
                name: 'typescript-mcp-server',
                version: '1.0.0',
                description: 'TypeScript MCP Server 보일러플레이트',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                nodeVersion: process.version,
                platform: process.platform,
                architecture: process.arch
            },
            capabilities: {
                tools: availableTools.length,
                resources: 1,
                prompts: 1
            },
            tools: availableTools,
            resources: [
                {
                    uri: 'server://info',
                    name: '서버 정보 및 도구 목록',
                    description: '현재 서버 정보와 사용 가능한 모든 도구 정보를 반환합니다'
                }
            ],
            prompts: [
                {
                    name: 'code_review',
                    description: 'Code Review MCP - 코드를 입력받아 미리 정의된 프롬프트 템플릿을 결합하여 상세한 코드 리뷰를 제공합니다',
                    parameters: {
                        code: {
                            type: 'string',
                            description: '리뷰할 코드',
                            required: true
                        },
                        language: {
                            type: 'string',
                            description: '코드 언어 (예: typescript, javascript, python, java 등, 기본값: auto)',
                            required: false,
                            default: 'auto'
                        },
                        focus_areas: {
                            type: 'string',
                            description: '리뷰에 집중할 영역 (쉼표로 구분: quality,performance,security,maintainability,best_practices,all, 기본값: all)',
                            required: false,
                            default: 'all'
                        },
                        include_suggestions: {
                            type: 'string',
                            description: '개선 제안 포함 여부 (true/false, 기본값: true)',
                            required: false,
                            default: 'true'
                        }
                    }
                }
            ]
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

// Code Review MCP 프롬프트: 코드 리뷰를 위한 상세한 프롬프트 템플릿
server.prompt(
    'code_review',
    'Code Review Request',
    {
        code: z
            .string()
            .describe('리뷰할 코드'),
        language: z
            .string()
            .optional()
            .describe('코드 언어 (예: typescript, javascript, python, java 등, 기본값: auto - 자동 감지)'),
        focus_areas: z
            .string()
            .optional()
            .describe('리뷰에 집중할 영역 (쉼표로 구분: quality,performance,security,maintainability,best_practices,all, 기본값: all)'),
        include_suggestions: z
            .string()
            .optional()
            .describe('개선 제안 포함 여부 (true/false, 기본값: true)')
    },
    async ({ code, language, focus_areas, include_suggestions }) => {
        // 기본값 설정 및 파싱
        const finalLanguage = language ?? 'auto'
        const finalFocusAreas = focus_areas
            ? focus_areas.split(',').map(area => area.trim())
            : ['all']
        const finalIncludeSuggestions = include_suggestions
            ? include_suggestions.toLowerCase() === 'true'
            : true
        // 미리 정의된 프롬프트 템플릿
        const reviewTemplate = {
            header: '다음 코드를 상세히 분석하고 리뷰해주세요.',
            sections: [] as string[],
            footer: finalIncludeSuggestions
                ? '\n각 항목에 대해 구체적인 개선 제안과 예시 코드를 포함해주세요.'
                : ''
        }

        // 집중 영역에 따라 섹션 추가
        if (finalFocusAreas.includes('all') || finalFocusAreas.includes('quality')) {
            reviewTemplate.sections.push(
                '## 1. 코드 품질 평가\n' +
                '- 코드 가독성 및 명확성\n' +
                '- 네이밍 컨벤션 준수 여부\n' +
                '- 코드 구조 및 조직화\n' +
                '- 중복 코드 존재 여부'
            )
        }

        if (finalFocusAreas.includes('all') || finalFocusAreas.includes('performance')) {
            reviewTemplate.sections.push(
                '## 2. 성능 최적화\n' +
                '- 알고리즘 효율성\n' +
                '- 불필요한 연산 또는 메모리 사용\n' +
                '- 비동기 처리 최적화 (해당되는 경우)\n' +
                '- 데이터베이스 쿼리 최적화 (해당되는 경우)'
            )
        }

        if (finalFocusAreas.includes('all') || finalFocusAreas.includes('security')) {
            reviewTemplate.sections.push(
                '## 3. 보안 고려사항\n' +
                '- 입력 검증 및 sanitization\n' +
                '- SQL Injection, XSS 등 취약점\n' +
                '- 인증 및 권한 관리\n' +
                '- 민감한 정보 처리 (API 키, 비밀번호 등)\n' +
                '- 에러 처리 및 정보 노출 방지'
            )
        }

        if (finalFocusAreas.includes('all') || finalFocusAreas.includes('maintainability')) {
            reviewTemplate.sections.push(
                '## 4. 유지보수성\n' +
                '- 코드 모듈화 및 재사용성\n' +
                '- 테스트 가능성\n' +
                '- 문서화 및 주석\n' +
                '- 의존성 관리'
            )
        }

        if (finalFocusAreas.includes('all') || finalFocusAreas.includes('best_practices')) {
            reviewTemplate.sections.push(
                '## 5. 모범 사례 및 표준 준수\n' +
                '- 언어별 코딩 표준 준수\n' +
                '- 디자인 패턴 적용 (해당되는 경우)\n' +
                '- SOLID 원칙 준수 (해당되는 경우)\n' +
                '- 에러 핸들링 패턴'
            )
        }

        // 언어 정보 추가
        const languageInfo = finalLanguage !== 'auto' 
            ? `\n**코드 언어**: ${finalLanguage}\n`
            : '\n**코드 언어**: 자동 감지\n'

        // 최종 프롬프트 구성
        const promptText = 
            reviewTemplate.header +
            languageInfo +
            '\n' +
            reviewTemplate.sections.join('\n\n') +
            '\n\n' +
            '---\n\n' +
            '**리뷰할 코드:**\n\n' +
            '```' + (finalLanguage !== 'auto' ? finalLanguage : '') + '\n' +
            code +
            '\n```' +
            reviewTemplate.footer

        return {
            messages: [
                {
                    role: 'user',
                    content: {
                        type: 'text',
                        text: promptText
                    }
                }
            ]
        }
    }
)

    // Smithery 배포를 위해 MCP 서버 객체 반환
    return server.server
}
