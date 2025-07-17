/**
 * @file AI Processing - Enhanced error handling for AI operations
 *
 * This module provides enhanced error handling for AI processing operations,
 * including retry mechanisms, circuit breaker patterns, and graceful degradation
 * for AI model failures.
 */

import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { logger } from './logger';
import {
  EnhancedError,
  RetryManager,
  DEFAULT_BACKOFF_CONFIG,
  type BackoffConfig
} from './error-handling';
import {
  CircuitBreaker,
  globalCircuitBreakerRegistry,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
  type CircuitBreakerConfig
} from './circuit-breaker';

/**
 * AI processing configuration
 */
export interface AIProcessingConfig {
  command: string;
  model: string;
  timeout: number;
  maxRetries: number;
  retryConfig: Partial<BackoffConfig>;
  circuitBreakerConfig: Partial<CircuitBreakerConfig>;
}

/**
 * Default AI processing configuration
 */
export const DEFAULT_AI_PROCESSING_CONFIG: AIProcessingConfig = {
  command: 'gemini',
  model: 'gemini-2.5-flash',
  timeout: 600_000, // 10 minutes
  maxRetries: 3,
  retryConfig: {
    ...DEFAULT_BACKOFF_CONFIG,
    initialDelay: 5000, // 5 seconds
    maxDelay: 60000, // 1 minute
    multiplier: 2,
    maxRetries: 3
  },
  circuitBreakerConfig: {
    ...DEFAULT_CIRCUIT_BREAKER_CONFIG,
    failureThreshold: 3,
    resetTimeout: 300000, // 5 minutes
    expectedResponseTime: 120000, // 2 minutes
    slowCallThreshold: 2,
    slowCallDurationThreshold: 300000 // 5 minutes
  }
};

/**
 * AI processing result
 */
export interface AIProcessingResult {
  success: boolean;
  data?: any;
  error?: EnhancedError;
  duration: number;
  tokenUsage?: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
  metadata: {
    command: string;
    model: string;
    exitCode: number | null;
    stdout: string;
    stderr: string;
    timestamp: string;
  };
}

/**
 * Enhanced AI processor with circuit breaker and retry support
 */
export class EnhancedAIProcessor {
  private readonly config: AIProcessingConfig;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly retryManager: RetryManager;
  protected readonly name: string;

  constructor(
    name: string,
    config: Partial<AIProcessingConfig> = {}
  ) {
    this.name = name;
    this.config = { ...DEFAULT_AI_PROCESSING_CONFIG, ...config };
    
    this.circuitBreaker = globalCircuitBreakerRegistry.getOrCreate(
      `ai_${name}`,
      this.config.circuitBreakerConfig
    );
    
    this.retryManager = new RetryManager(
      this.config.retryConfig,
      `ai_${name}`
    );
  }

  /**
   * Process with AI model using enhanced error handling
   */
  async process(
    prompt: string,
    operationName: string = 'ai_processing'
  ): Promise<AIProcessingResult> {
    return this.retryManager.executeWithRetry(
      async () => {
        const result = await this.circuitBreaker.execute(
          async () => this.executeAICommand(prompt, operationName),
          operationName
        );

        if (result.success) {
          return result.data;
        } else {
          throw result.error;
        }
      },
      operationName,
      { maxRetries: this.config.maxRetries }
    );
  }

  /**
   * Verify AI CLI is available
   */
  async verifyAI(): Promise<boolean> {
    try {
      await this.retryManager.executeWithRetry(
        async () => {
          return new Promise<void>((resolve, reject) => {
            const testProcess = spawn(this.config.command, ['--version'], {
              stdio: ['ignore', 'pipe', 'pipe'],
              timeout: 10000 // 10 seconds
            });

            testProcess.on('close', (code) => {
              if (code === 0) {
                resolve();
              } else {
                reject(new Error(`AI CLI verification failed with exit code ${code}`));
              }
            });

            testProcess.on('error', (error) => {
              reject(error);
            });
          });
        },
        'ai_cli_verification',
        { maxRetries: 1 }
      );

      logger.info(`✅ AI CLI (${this.config.command}) verified successfully`);
      return true;
    } catch (error) {
      const enhancedError = error instanceof EnhancedError 
        ? error 
        : EnhancedError.aiProcessing(
            `AI CLI (${this.config.command}) verification failed: ${error instanceof Error ? error.message : String(error)}`,
            { command: this.config.command, originalError: error },
            this.name
          );

      logger.error(
        `❌ AI CLI verification failed`,
        { error: enhancedError.toLogFormat() }
      );
      return false;
    }
  }

  /**
   * Get circuit breaker status
   */
  getCircuitBreakerStatus() {
    return this.circuitBreaker.getStatus();
  }

  /**
   * Reset circuit breaker
   */
  resetCircuitBreaker() {
    this.circuitBreaker.reset();
  }

  /**
   * Get health check
   */
  async getHealthCheck(): Promise<{
    healthy: boolean;
    component: string;
    message: string;
    timestamp: string;
    responseTime: number;
    details?: Record<string, any>;
  }> {
    const startTime = Date.now();
    const component = `ai_${this.name}`;

    try {
      const isHealthy = await this.verifyAI();
      const responseTime = Date.now() - startTime;

      return {
        healthy: isHealthy,
        component,
        message: isHealthy
          ? `AI processor ${this.name} is healthy`
          : `AI processor ${this.name} is unhealthy`,
        timestamp: new Date().toISOString(),
        responseTime,
        details: {
          command: this.config.command,
          model: this.config.model,
          circuitBreakerStatus: this.getCircuitBreakerStatus()
        }
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const enhancedError = error instanceof EnhancedError 
        ? error 
        : EnhancedError.aiProcessing(
            `Health check failed: ${error instanceof Error ? error.message : String(error)}`,
            { originalError: error },
            component
          );

      return {
        healthy: false,
        component,
        message: `AI processor ${this.name} health check failed: ${enhancedError.message}`,
        timestamp: new Date().toISOString(),
        responseTime,
        details: {
          command: this.config.command,
          model: this.config.model,
          error: enhancedError.toLogFormat(),
          circuitBreakerStatus: this.getCircuitBreakerStatus()
        }
      };
    }
  }

  // Private methods

  private async executeAICommand(
    prompt: string,
    operationName: string
  ): Promise<AIProcessingResult> {
    const startTime = Date.now();
    
    return new Promise((resolve, reject) => {
      const aiProcess = spawn(
        this.config.command,
        ['--prompt', prompt, '--model', this.config.model, '--yolo'],
        {
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: this.config.timeout,
        }
      );

      let stdout = '';
      let stderr = '';

      aiProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      aiProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      aiProcess.on('close', (code) => {
        const duration = Date.now() - startTime;
        const tokenUsage = this.parseTokenUsage(stderr);

        const result: AIProcessingResult = {
          success: code === 0,
          duration,
          tokenUsage,
          metadata: {
            command: this.config.command,
            model: this.config.model,
            exitCode: code,
            stdout,
            stderr,
            timestamp: new Date().toISOString()
          }
        };

        if (code === 0) {
          logger.info(
            `✅ AI processing completed successfully`,
            {
              operationName,
              duration,
              tokenUsage,
              command: this.config.command,
              model: this.config.model
            }
          );
          resolve(result);
        } else {
          const error = this.createAIProcessingError(
            `AI processing failed with exit code ${code}`,
            { code, stdout, stderr, duration, operationName }
          );
          
          result.error = error;
          
          logger.error(
            `❌ AI processing failed`,
            {
              operationName,
              error: error.toLogFormat(),
              duration,
              command: this.config.command,
              model: this.config.model
            }
          );
          
          reject(error);
        }
      });

      aiProcess.on('error', (error) => {
        const duration = Date.now() - startTime;
        const enhancedError = this.createAIProcessingError(
          `Failed to start AI process: ${error.message}`,
          { originalError: error, duration, operationName }
        );

        // result not used, just reject with the error

        logger.error(
          `❌ AI process failed to start`,
          {
            operationName,
            error: enhancedError.toLogFormat(),
            duration,
            command: this.config.command,
            model: this.config.model
          }
        );

        reject(enhancedError);
      });
    });
  }

  private parseTokenUsage(stderr: string): {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  } | undefined {
    try {
      const inputMatch = stderr.match(/Input tokens:\s*(\d+)/);
      const outputMatch = stderr.match(/Output tokens:\s*(\d+)/);

      if (inputMatch || outputMatch) {
        const inputTokens = inputMatch ? parseInt(inputMatch[1], 10) : 0;
        const outputTokens = outputMatch ? parseInt(outputMatch[1], 10) : 0;

        return {
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          total_tokens: inputTokens + outputTokens
        };
      }
    } catch (error) {
      logger.warn(
        `⚠️ Failed to parse token usage from stderr`,
        { error: error instanceof Error ? error.message : String(error) }
      );
    }

    return undefined;
  }

  private createAIProcessingError(
    message: string,
    context: Record<string, any> = {}
  ): EnhancedError {
    // Categorize AI errors based on common patterns
    const messageLC = message.toLowerCase();
    
    if (messageLC.includes('timeout') || messageLC.includes('timed out')) {
      return EnhancedError.timeout(
        message,
        { ...context, command: this.config.command, model: this.config.model },
        this.name
      );
    }
    
    if (messageLC.includes('rate limit') || messageLC.includes('quota')) {
      return EnhancedError.rateLimit(
        message,
        { ...context, command: this.config.command, model: this.config.model },
        this.name
      );
    }
    
    if (messageLC.includes('authentication') || messageLC.includes('unauthorized')) {
      return EnhancedError.authentication(
        message,
        { ...context, command: this.config.command, model: this.config.model },
        this.name
      );
    }
    
    if (messageLC.includes('validation') || messageLC.includes('invalid')) {
      return EnhancedError.validation(
        message,
        { ...context, command: this.config.command, model: this.config.model },
        this.name
      );
    }
    
    if (messageLC.includes('network') || messageLC.includes('connection')) {
      return EnhancedError.network(
        message,
        { ...context, command: this.config.command, model: this.config.model },
        this.name
      );
    }
    
    // Default to AI processing error
    return EnhancedError.aiProcessing(
      message,
      { ...context, command: this.config.command, model: this.config.model },
      this.name
    );
  }
}

/**
 * Enhanced AI processor with file-based processing
 */
export class EnhancedFileAIProcessor extends EnhancedAIProcessor {
  private readonly contentDirectory: string; // Used for configuration
  private readonly outputDirectory: string; // Used for configuration

  constructor(
    name: string,
    contentDirectory: string,
    outputDirectory: string,
    config: Partial<AIProcessingConfig> = {}
  ) {
    super(name, config);
    this.contentDirectory = contentDirectory; // Store for potential future use
    this.outputDirectory = outputDirectory; // Store for potential future use
  }

  /**
   * Process file with AI model
   */
  async processFile(
    inputPath: string,
    outputPath: string,
    prompt: string,
    operationName: string = 'ai_file_processing'
  ): Promise<AIProcessingResult> {
    try {
      // Verify input file exists
      await fs.access(inputPath);
      
      // Ensure output directory exists
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      
      // Build prompt with file paths
      const enhancedPrompt = this.buildFilePrompt(prompt, inputPath, outputPath);
      
      // Process with AI
      const result = await this.process(enhancedPrompt, operationName);
      
      // Verify output file was created
      try {
        await fs.access(outputPath);
        logger.info(
          `✅ AI file processing completed`,
          {
            operationName,
            inputPath,
            outputPath,
            duration: result.duration
          }
        );
      } catch (error) {
        throw EnhancedError.aiProcessing(
          `AI processing completed but output file was not created: ${outputPath}`,
          { inputPath, outputPath, originalError: error },
          this.name
        );
      }
      
      return result;
    } catch (error) {
      if (error instanceof EnhancedError) {
        throw error;
      }
      
      throw EnhancedError.aiProcessing(
        `File processing failed: ${error instanceof Error ? error.message : String(error)}`,
        { inputPath, outputPath, originalError: error },
        this.name
      );
    }
  }

  private buildFilePrompt(
    prompt: string,
    inputPath: string,
    outputPath: string
  ): string {
    const absoluteInputPath = path.resolve(inputPath);
    const absoluteOutputPath = path.resolve(outputPath);
    
    return `${prompt}

Input file: ${absoluteInputPath}
Output file: ${absoluteOutputPath}

Please read the input file, process it according to the instructions, and write the result to the output file.`;
  }
}

/**
 * Convenience function to create enhanced AI processor
 */
export function createEnhancedAIProcessor(
  name: string,
  config: Partial<AIProcessingConfig> = {}
): EnhancedAIProcessor {
  return new EnhancedAIProcessor(name, config);
}

/**
 * Convenience function to create enhanced file AI processor
 */
export function createEnhancedFileAIProcessor(
  name: string,
  contentDirectory: string,
  outputDirectory: string,
  config: Partial<AIProcessingConfig> = {}
): EnhancedFileAIProcessor {
  return new EnhancedFileAIProcessor(name, contentDirectory, outputDirectory, config);
}