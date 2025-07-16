/**
 * @file Gemini Processor - Handles AI processing using Gemini CLI
 *
 * This module manages the interaction with Gemini CLI for AI-powered content
 * distillation, including prompt building, response parsing, and validation.
 */

import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { logger } from '../../utils/logger';
import { PromptBuilder } from './prompt-builder';
import { ResponseParser } from './response-parser';

export interface IGeminiProcessorOptions {
  geminiCommand: string;
  geminiModel: string;
  timeout: number;
  contentDirectory: string;
  outputDirectory: string;
}

/**
 * Gemini processor class
 */
export class GeminiProcessor {
  private promptBuilder: PromptBuilder;
  private responseParser: ResponseParser;
  options: IGeminiProcessorOptions;

  constructor(options: Partial<IGeminiProcessorOptions> = {}) {
    this.options = {
      geminiCommand: 'gemini',
      geminiModel: 'gemini-2.5-flash',
      timeout: 600_000, // 10 minutes
      contentDirectory:
        options.contentDirectory || './generated/collected-content',
      outputDirectory:
        options.outputDirectory || './generated/distilled-content',
      ...options,
    };

    this.promptBuilder = new PromptBuilder();
    this.responseParser = new ResponseParser(this.options.geminiModel);
  }

  /**
   * Verify Gemini CLI is available
   */
  verifyGeminiCLI() {
    return new Promise((resolve, reject) => {
      const testProcess = spawn(this.options.geminiCommand, ['--version'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      testProcess.on('close', (code) => {
        if (code === 0) {
          logger.info('✅ Gemini CLI verified');
          resolve(undefined);
        } else {
          reject(
            new Error(
              "Gemini CLI not found or not working. Please ensure it's installed and configured."
            )
          );
        }
      });

      testProcess.on('error', (error) => {
        reject(new Error(`Gemini CLI not found: ${error.message}`));
      });
    });
  }

  /**
   * Distill a single source using Gemini CLI
   */
  async distillSingleSource(source: any, task: any) {
    const startTime = Date.now();

    try {
      // Update status to distilling
      source.status = 'distilling';

      // Check if content file exists
      const contentPath = this._getContentPath(source.url);
      let contentExists;
      try {
        await fs.access(contentPath);
        contentExists = true;
      } catch {
        contentExists = false;
      }

      if (!contentExists) {
        throw new Error(`Content file not found: ${contentPath}`);
      }

      // Read content for checksum calculation (processed Markdown)
      const rawContent = await fs.readFile(contentPath, 'utf-8');
      const contentChecksum = crypto
        .createHash('sha256')
        .update(rawContent)
        .digest('hex');

      // Get absolute path for Gemini to read directly
      const absoluteContentPath = path.resolve(contentPath);

      task.output = 'Preparing prompt with file path...';

      // Get absolute output path for Gemini to write directly
      const outputPath = this._getOutputPath(source.url);
      const absoluteOutputPath = path.resolve(outputPath);
      await fs.mkdir(path.dirname(absoluteOutputPath), { recursive: true });

      // Prepare distillation prompt with input and output file paths
      const prompt = this.promptBuilder.buildDistillationPrompt(
        source,
        absoluteContentPath,
        absoluteOutputPath
      );

      task.output = 'Sending to Gemini (this may take several minutes)...';

      // Log which file is being processed
      logger.info(
        `🔄 Processing: ${absoluteContentPath} → ${absoluteOutputPath}`
      );

      // Process with Gemini CLI
      let geminiResult;
      try {
        geminiResult = await this._callGeminiCLI(prompt);
      } catch (error: any) {
        // Log the failed call
        await this._logGeminiCall(
          source,
          prompt,
          absoluteContentPath,
          absoluteOutputPath,
          error.result,
          error
        );
        throw error;
      }

      task.output = 'Checking for generated file...';

      // Check if Gemini created the output file
      let distilledContent;
      let parseError: Error | null = null;
      try {
        await fs.access(absoluteOutputPath);
        const fileContent = await fs.readFile(absoluteOutputPath, 'utf-8');

        task.output = 'Parsing generated file...';

        // Parse and validate the file content
        distilledContent =
          await this.responseParser.parseFileContent(fileContent);
      } catch (error: any) {
        parseError = new Error(
          `Failed to read or parse generated file: ${error.message}`
        );

        // If JSON parsing failed, move the bad file to a trash directory
        if (
          error.message.includes('parse JSON') ||
          error.message.includes('JSON')
        ) {
          try {
            const trashDir = path.join(
              path.dirname(this.options.outputDirectory),
              'trash'
            );
            await fs.mkdir(trashDir, { recursive: true });
            const trashPath = path.join(
              trashDir,
              path.basename(absoluteOutputPath)
            );
            await fs.rename(absoluteOutputPath, trashPath);
            logger.warn(
              `🗑️  Invalid JSON moved to trash for review: ${trashPath}`
            );
          } catch (moveError: any) {
            logger.warn(
              `Failed to move invalid file to trash: ${moveError.message}`
            );
          }
        }
      }

      // Log the call (successful or failed)
      await this._logGeminiCall(
        source,
        prompt,
        absoluteContentPath,
        absoluteOutputPath,
        geminiResult,
        parseError
      );

      // Throw error after logging if parsing failed - this ensures status is NOT set to distilled
      if (parseError) {
        throw parseError;
      }

      const processingDuration = (geminiResult as any).processingDuration;

      // Update source with success metadata
      const updatedSource = {
        status: 'distilled',
        distilled_at: new Date().toISOString(),
        distillation_metadata: {
          agent: `${this.options.geminiCommand} (${this.options.geminiModel})`,
          prompt_version: '2.0.0',
          processing_duration_ms: processingDuration,
          source_checksum: contentChecksum,
          output_path: absoluteOutputPath,
          token_usage: (geminiResult as any).tokenUsage,
          confidence_score:
            distilledContent.quality_metrics?.accuracy_confidence || 0.8,
          validation_passed: true,
        },
      };

      logger.info(
        {
          sourceUrl: source.url,
          processingDuration,
          outputPath: absoluteOutputPath,
        },
        '✅ Distillation successful'
      );

      logger.info(
        `✅ Completed: ${absoluteContentPath} → ${absoluteOutputPath} (${processingDuration}ms)`
      );

      return {
        success: true,
        updatedSource,
        distilledContent,
        outputPath,
        tokenUsage: (geminiResult as any).tokenUsage,
      };
    } catch (error: any) {
      const processingDuration = Date.now() - startTime;

      logger.error(
        {
          sourceUrl: source.url,
          error: error.message,
          processingDuration,
        },
        '❌ Distillation failed'
      );

      throw error;
    }
  }

  /**
   * Call Gemini CLI with the distillation prompt - output goes directly to file
   */
  _callGeminiCLI(prompt: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const geminiProcess = spawn(
        this.options.geminiCommand,
        ['--prompt', prompt, '--model', this.options.geminiModel, '--yolo'],
        {
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: this.options.timeout,
        }
      );

      let stdout = '';
      let stderr = '';

      geminiProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      geminiProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      geminiProcess.on('close', (code) => {
        const processingDuration = Date.now() - startTime;
        const result = {
          stdout,
          stderr,
          exitCode: code as number,
          processingDuration,
          tokenUsage: this._parseTokenUsage(stderr),
        };

        if (code !== 0 && code !== null) {
          // Only fail on actual error codes, not timeouts
          let errorMsg = `Gemini CLI failed with exit code ${code}`;

          if (stderr.trim()) {
            errorMsg += `\nSTDERR: ${stderr.trim()}`;
          }

          const error = new Error(errorMsg) as any;
          error.result = result;
          reject(error);
        } else {
          // Success or timeout - check if file was created
          resolve(result);
        }
      });

      geminiProcess.on('error', (error) => {
        const processingDuration = Date.now() - startTime;
        const result = {
          stdout,
          stderr,
          exitCode: null as null,
          processingDuration,
          error: error.message,
        };

        const enhancedError = new Error(
          `Failed to start Gemini CLI: ${error.message}`
        ) as any;
        enhancedError.result = result;
        reject(enhancedError);
      });
    });
  }

  /**
   * Parse token usage from Gemini CLI stderr
   */
  _parseTokenUsage(stderr: string) {
    try {
      const inputMatch = stderr.match(/Input tokens:\s*(\d+)/);
      const outputMatch = stderr.match(/Output tokens:\s*(\d+)/);

      if (inputMatch || outputMatch) {
        return {
          input_tokens: inputMatch ? Number.parseInt(inputMatch[1], 10) : 0,
          output_tokens: outputMatch ? Number.parseInt(outputMatch[1], 10) : 0,
          total_tokens:
            (inputMatch ? Number.parseInt(inputMatch[1], 10) : 0) +
            (outputMatch ? Number.parseInt(outputMatch[1], 10) : 0),
        };
      }
    } catch (error: any) {
      logger.warn({ error: error.message }, '⚠️  Failed to parse token usage');
    }

    return null;
  }

  /**
   * Get content file path for a source URL
   */
  _getContentPath(url: string): string {
    // Use the same filename generation logic as CollectionModule
    const cleaned = url
      .replace(/^https?:\/\//, '')
      .replace(/[^\w\-_.~]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');

    const filename = `${cleaned}.html`;
    return path.join(this.options.contentDirectory, filename);
  }

  /**
   * Get output file path for a source URL
   */
  _getOutputPath(url: string): string {
    const filename = `${url.replace(/[^a-zA-Z0-9]/g, '_')}.json`;
    return path.join(this.options.outputDirectory, filename);
  }

  /**
   * Generate unique log filename for Gemini call
   */
  _generateLogFilename(source: any): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const sourceType = source.source_type || 'unknown';
    const sourceId = (source.title || source.url)
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 50);

    return `${timestamp}_${sourceType}_${sourceId}.md`;
  }

  /**
   * Create detailed log of Gemini CLI call
   */
  async _logGeminiCall(
    source: any,
    prompt: string,
    absoluteContentPath: string,
    absoluteOutputPath: string,
    result: any,
    error: Error | null = null
  ) {
    try {
      const logDir = './logs/gemini-calls';
      await fs.mkdir(logDir, { recursive: true });

      const logFilename = this._generateLogFilename(source);
      const logPath = path.join(logDir, logFilename);

      // Check if output file was actually created
      let outputFileExists = false;
      try {
        await fs.access(absoluteOutputPath);
        outputFileExists = true;
      } catch {
        outputFileExists = false;
      }

      const logContent = `# Gemini Call Log

**Source**: ${source.source_type}: ${source.title || source.url}
**URL**: ${source.url}
**Timestamp**: ${new Date().toISOString()}
**Input File**: ${absoluteContentPath}
**Output File**: ${absoluteOutputPath}
**Duration**: ${result?.processingDuration || 'N/A'}ms
**Exit Code**: ${result?.exitCode !== undefined ? result.exitCode : 'N/A'}
**Output File Created**: ${outputFileExists}
**Success**: ${!error}
${error ? `**Error**: ${error.message}` : ''}

## Prompt

\`\`\`
${prompt}
\`\`\`

## Output

### STDOUT
\`\`\`
${result?.stdout || 'No stdout captured'}
\`\`\`

### STDERR
\`\`\`
${result?.stderr || 'No stderr captured'}
\`\`\`
`;

      await fs.writeFile(logPath, logContent, 'utf-8');
      logger.info(`📝 Gemini call logged to: ${logPath}`);
    } catch (error: any) {
      logger.error(`Failed to write Gemini call log: ${error.message}`);
    }
  }
}

export default GeminiProcessor;
