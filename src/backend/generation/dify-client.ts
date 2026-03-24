import { GenerationInput, GenerationOutput } from '@shared/types/layers';
import axios, { AxiosInstance } from 'axios';
import { Pool } from 'pg';
import { ProhibitedWordsFilter } from './prohibited-words-filter';
import { ServiceTypeControl, ReviewContext } from './service-type-control';
import { v4 as uuidv4 } from 'uuid';

interface DifyRequest {
  inputs: {
    reason_codes: string;
    locale: string;
    tier: string;
    // Ticket 16: Service type context
    service_type?: string;
    judicial_scrivener_involved?: boolean;
    immigration_ob_involved?: boolean;
  };
  response_mode: 'blocking' | 'streaming';
  user: string;
  // Ticket 06: Temperature 0 enforcement
  parameters?: {
    temperature?: number;
    max_tokens?: number;
  };
}

interface DifyResponse {
  workflow_run_id: string;
  task_id: string;
  data: {
    id: string;
    workflow_id: string;
    status: string;
    outputs: {
      headline: string;
      todoItems: string[];
      explanationText: string;
      obCommentary?: string[];
      disclaimer: string;
    };
    error?: string;
    elapsed_time: number;
    total_tokens: number;
    created_at: number;
  };
}

export class DifyClient {
  private client: AxiosInstance;
  private apiKey: string;
  private workflowId: string;
  // Ticket 06 & 16: Compliance filters
  private prohibitedWordsFilterInstance: ProhibitedWordsFilter | null = null;
  private readonly pool: Pool;
  private serviceTypeControl: ServiceTypeControl;
  // Ticket 18: Fixed knowledge version
  private readonly KNOWLEDGE_VERSION = '2023';

  constructor(pool: Pool) {
    this.pool = pool;
    this.apiKey = process.env.DIFY_API_KEY!;
    this.workflowId = process.env.DIFY_WORKFLOW_ID!;

    if (!this.apiKey || !this.workflowId) {
      throw new Error('DIFY_API_KEY and DIFY_WORKFLOW_ID must be set in environment');
    }

    this.client = axios.create({
      baseURL: process.env.DIFY_API_ENDPOINT || 'https://api.dify.ai/v1',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 60000
    });

    this.serviceTypeControl = new ServiceTypeControl();
  }

  /**
   * Lazy-initialises the prohibited words filter from the database.
   * The filter instance is cached after the first load.
   */
  private async getProhibitedWordsFilter(): Promise<ProhibitedWordsFilter> {
    if (!this.prohibitedWordsFilterInstance) {
      this.prohibitedWordsFilterInstance =
        await ProhibitedWordsFilter.fromDatabase(this.pool);
    }
    return this.prohibitedWordsFilterInstance;
  }

  async generateExplanation(input: GenerationInput): Promise<GenerationOutput> {
    const generationId = uuidv4();
    const startTime = Date.now();

    try {
      const prompt = this.buildPrompt(input);
      
      // Ticket 06: Temperature 0 fixed for deterministic output
      const request: DifyRequest = {
        inputs: {
          reason_codes: input.reasonCodes.join(', '),
          locale: input.locale,
          tier: input.tier,
          // Ticket 16: Service type context
          service_type: input.serviceType,
          judicial_scrivener_involved: input.judicialScrivenerInvolved,
          immigration_ob_involved: input.immigrationObInvolved
        },
        response_mode: 'blocking',
        user: 'system',
        parameters: {
          temperature: 0,  // Ticket 06: Fixed at 0 for reproducibility
          max_tokens: 2000
        }
      };

      console.log('[DifyClient] Calling Dify API:', {
        generationId,
        workflow: this.workflowId,
        reasonCodes: input.reasonCodes,
        locale: input.locale,
        tier: input.tier,
        temperature: 0,
        knowledgeVersion: this.KNOWLEDGE_VERSION
      });

      const response = await this.client.post<DifyResponse>(
        `/workflows/run`,
        request
      );

      if (response.data.data.status === 'failed') {
        throw new Error(`Dify workflow failed: ${response.data.data.error}`);
      }

      const rawOutput = this.parseResponse(response.data);
      
      // Ticket 06 & 16: Apply compliance filters (filter loaded from DB)
      const filteredOutput = await this.applyComplianceFilters(rawOutput, input);

      // Ticket 06: Log generation for audit trail
      const elapsedMs = Date.now() - startTime;
      this.logGeneration(generationId, input, filteredOutput, elapsedMs, response.data);

      return {
        ...filteredOutput,
        generationId,
        generatedAt: new Date().toISOString(),
        knowledgeVersion: this.KNOWLEDGE_VERSION
      };
    } catch (error) {
      console.error('[DifyClient] API error:', error);
      
      const fallback = this.getFallbackResponse(input);
      const elapsedMs = Date.now() - startTime;
      
      this.logGeneration(generationId, input, fallback, elapsedMs, null, error);

      return {
        ...fallback,
        generationId,
        generatedAt: new Date().toISOString(),
        knowledgeVersion: this.KNOWLEDGE_VERSION
      };
    }
  }

  private buildPrompt(input: GenerationInput): string {
    const complianceGuidelines = {
      ja: '評価的・推測的表現を使用しない、判定や推薦を行わない、事実の説明のみ',
      en: 'No evaluative or speculative expressions, no judgments or recommendations, factual descriptions only',
      zh: '不使用评价性或预测性表述，不进行判断或推荐，仅陈述事实'
    };

    return `
理由コード: ${input.reasonCodes.join(', ')}
ロケール: ${input.locale}
ティア: ${input.tier}

上記に基づき、VISA申請に関する説明文を生成してください。

制約:
1. コンプライアンス方針: ${complianceGuidelines[input.locale]}
2. 事実の説明のみ
3. 専門家への相談を促す表現は可

JSON形式で以下を返してください:
{
  "headline": "...",
  "todoItems": ["...", "..."],
  "explanationText": "...",
  "disclaimer": "..."
}
`;
  }

  private parseResponse(response: DifyResponse): GenerationOutput {
    const outputs = response.data.outputs;

    return {
      headline: outputs.headline || 'Assessment Results',
      todoItems: outputs.todoItems || [],
      explanationText: outputs.explanationText || '',
      obCommentary: outputs.obCommentary,
      disclaimer: outputs.disclaimer || this.getDefaultDisclaimer(),
      __llmGenerated: true as const
    };
  }

  private getFallbackResponse(input: GenerationInput): GenerationOutput {
    const disclaimers = {
      ja: '本診断結果は参考情報です。最終的な判断は入国管理局が行います。',
      en: 'This assessment is for reference only. Final decisions are made by the Immigration Bureau.',
      zh: '本评估结果仅供参考。最终决定由入国管理局做出。'
    };

    const headlines = {
      ja: '診断結果',
      en: 'Assessment Results',
      zh: '评估结果'
    };

    const todoItems = {
      ja: ['フラグされた項目を確認してください', '専門家に相談してください', '必要な書類を準備してください'],
      en: ['Review flagged items carefully', 'Consult with a professional', 'Prepare required documents'],
      zh: ['请仔细检查标记的项目', '请咨询专业人士', '请准备所需文件']
    };

    const explanationTexts = {
      ja: '診断結果をご確認いただき、入国在留に詳しい専門家への相談をご検討ください。',
      en: 'Please review the assessment carefully and consider consulting with an immigration professional.',
      zh: '请仔细审阅评估结果，并考虑咨询移民专业人士。'
    };

    return {
      headline: headlines[input.locale],
      todoItems: todoItems[input.locale],
      explanationText: explanationTexts[input.locale],
      disclaimer: disclaimers[input.locale],
      __llmGenerated: true as const
    };
  }

  private getDefaultDisclaimer(): string {
    return 'This assessment is for reference only. Final decisions are made by the Immigration Bureau.';
  }

  /**
   * Ticket 06 & 16: Apply all compliance filters
   */
  private async applyComplianceFilters(
    output: Omit<GenerationOutput, 'generationId' | 'generatedAt' | 'knowledgeVersion'>,
    input: GenerationInput
  ): Promise<Omit<GenerationOutput, 'generationId' | 'generatedAt' | 'knowledgeVersion'>> {
    let filtered = { ...output };

    // Ticket 06: Prohibited words filter (terms loaded from DB, not from source files)
    const prohibitedFilter = await this.getProhibitedWordsFilter();
    filtered = prohibitedFilter.filterOutput(filtered, input.locale);

    // Check for residual violations (log warnings)
    const violations = prohibitedFilter.detect(JSON.stringify(filtered), input.locale);
    if (violations.length > 0) {
      console.warn('[DifyClient] Prohibited words detected and filtered:', violations);
    }

    // Ticket 16: Service type control (if context provided)
    if (input.serviceType && 
        input.judicialScrivenerInvolved !== undefined && 
        input.immigrationObInvolved !== undefined) {
      const reviewContext: ReviewContext = {
        serviceType: input.serviceType,
        judicialScrivenerInvolved: input.judicialScrivenerInvolved,
        immigrationObInvolved: input.immigrationObInvolved
      };

      filtered = this.serviceTypeControl.filterOutput(filtered, input.locale, reviewContext);

      // Validate context compliance
      const contextViolations = this.serviceTypeControl.validate(filtered, input.locale, reviewContext);
      if (contextViolations.length > 0) {
        console.warn('[DifyClient] Service type violations detected:', contextViolations);
      }
    }

    return filtered;
  }

  /**
   * Ticket 06: Generation logging for audit trail
   */
  private logGeneration(
    generationId: string,
    input: GenerationInput,
    output: Omit<GenerationOutput, 'generationId' | 'generatedAt' | 'knowledgeVersion'>,
    elapsedMs: number,
    difyResponse: DifyResponse | null,
    error?: any
  ): void {
    const logEntry = {
      generationId,
      timestamp: new Date().toISOString(),
      input: {
        reasonCodes: input.reasonCodes,
        locale: input.locale,
        tier: input.tier,
        serviceType: input.serviceType,
        judicialScrivenerInvolved: input.judicialScrivenerInvolved,
        immigrationObInvolved: input.immigrationObInvolved
      },
      output: {
        headline: output.headline,
        todoItemsCount: output.todoItems.length,
        hasObCommentary: !!output.obCommentary,
        obCommentaryCount: output.obCommentary?.length || 0
      },
      metadata: {
        knowledgeVersion: this.KNOWLEDGE_VERSION,
        temperature: 0,
        elapsedMs,
        success: !error,
        difyWorkflowId: this.workflowId,
        difyRunId: difyResponse?.workflow_run_id,
        difyTaskId: difyResponse?.task_id,
        errorMessage: error?.message
      }
    };

    // Log to console (in production, this should go to a logging service)
    console.log('[DifyClient] Generation log:', JSON.stringify(logEntry, null, 2));

    // TODO: Store in database or logging service for compliance audit
    // This is critical for Ticket 06 acceptance criteria
  }
}
