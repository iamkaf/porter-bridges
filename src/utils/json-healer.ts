/**
 * JSON Healer - Comprehensive JSON repair utility
 * 
 * Repairs broken JSON from AI-generated content using multiple strategies:
 * 1. jsonrepair - handles quick wins and trivial fixes
 * 2. dirty-json - swallows ugliness including newlines & stray quotes
 * 3. jsonc-parser - tolerant mode for complex cases
 * 4. Custom fallback - multiline-first approach as last resort
 */

import { jsonrepair } from 'jsonrepair';
import * as dJSON from 'dirty-json';
import { parse as parseJsonC } from 'jsonc-parser';
import strip from 'strip-json-comments';
import { logger } from './logger';

export interface RepairResult {
  valid: boolean;
  repaired?: string;
  error?: string;
  strategy?: string;
}

/**
 * Statistics tracker for JSON healing operations
 */
class JSONHealingStats {
  private stats = {
    totalAttempts: 0,
    alreadyValid: 0,
    successfulHealing: 0,
    failedHealing: 0,
    strategyUsage: {
      'already-valid': 0,
      'jsonrepair': 0,
      'dirty-json': 0,
      'jsonc-parser': 0,
      'custom-newline': 0,
      'custom-full': 0,
    },
    errorTypes: new Map<string, number>(),
  };

  recordAttempt(result: RepairResult, originalError?: string) {
    this.stats.totalAttempts++;
    
    if (result.valid) {
      if (result.strategy === 'already-valid') {
        this.stats.alreadyValid++;
      } else {
        this.stats.successfulHealing++;
      }
      
      if (result.strategy) {
        this.stats.strategyUsage[result.strategy as keyof typeof this.stats.strategyUsage]++;
      }
    } else {
      this.stats.failedHealing++;
      
      // Track error types
      const errorKey = this.categorizeError(originalError || result.error || 'unknown');
      this.stats.errorTypes.set(errorKey, (this.stats.errorTypes.get(errorKey) || 0) + 1);
    }
  }

  private categorizeError(error: string): string {
    const errorLower = error.toLowerCase();
    
    if (errorLower.includes('unexpected token')) return 'unexpected-token';
    if (errorLower.includes('unexpected end')) return 'unexpected-end';
    if (errorLower.includes('unterminated string')) return 'unterminated-string';
    if (errorLower.includes('unterminated comment')) return 'unterminated-comment';
    if (errorLower.includes('invalid character')) return 'invalid-character';
    if (errorLower.includes('expected')) return 'expected-element';
    if (errorLower.includes('newline')) return 'newline-issue';
    if (errorLower.includes('quote')) return 'quote-issue';
    
    return 'other';
  }

  getStats() {
    return {
      ...this.stats,
      errorTypes: Object.fromEntries(this.stats.errorTypes),
    };
  }

  getSummary() {
    const total = this.stats.totalAttempts;
    if (total === 0) return { message: 'No JSON healing attempts recorded' };

    const successRate = Math.round(((this.stats.alreadyValid + this.stats.successfulHealing) / total) * 100);
    const healingSuccessRate = this.stats.successfulHealing > 0 
      ? Math.round((this.stats.successfulHealing / (this.stats.successfulHealing + this.stats.failedHealing)) * 100)
      : 0;

    // Find most effective strategy (excluding already-valid)
    const healingStrategies = Object.entries(this.stats.strategyUsage)
      .filter(([strategy]) => strategy !== 'already-valid')
      .sort(([, a], [, b]) => b - a);
    
    const mostEffectiveStrategy = healingStrategies[0]?.[0] || 'none';
    const mostEffectiveCount = healingStrategies[0]?.[1] || 0;

    // Find most common error type
    const errorEntries = Array.from(this.stats.errorTypes.entries()).sort(([, a], [, b]) => b - a);
    const mostCommonError = errorEntries[0]?.[0] || 'none';
    const mostCommonErrorCount = errorEntries[0]?.[1] || 0;

    return {
      totalAttempts: total,
      overallSuccessRate: successRate,
      alreadyValidRate: Math.round((this.stats.alreadyValid / total) * 100),
      healingNeededRate: Math.round(((this.stats.successfulHealing + this.stats.failedHealing) / total) * 100),
      healingSuccessRate,
      mostEffectiveStrategy,
      mostEffectiveStrategyCount: mostEffectiveCount,
      mostCommonError,
      mostCommonErrorCount,
      strategyBreakdown: this.stats.strategyUsage,
    };
  }

  logPeriodicSummary() {
    const summary = this.getSummary();
    
    if (this.stats.totalAttempts === 0) {
      logger.debug('📊 JSON Healing: No attempts recorded yet');
      return;
    }

    logger.info('📊 JSON Healing Statistics Summary', {
      totalAttempts: summary.totalAttempts,
      overallSuccessRate: `${summary.overallSuccessRate}%`,
      alreadyValidRate: `${summary.alreadyValidRate}%`,
      healingNeededRate: `${summary.healingNeededRate}%`,
      healingSuccessRate: `${summary.healingSuccessRate}%`,
      mostEffectiveStrategy: summary.mostEffectiveStrategy,
      mostEffectiveStrategyUsage: summary.mostEffectiveStrategyCount,
      mostCommonError: summary.mostCommonError,
      mostCommonErrorOccurrences: summary.mostCommonErrorCount,
    });

    // Log detailed strategy breakdown if we have enough data
    if (this.stats.totalAttempts >= 10) {
      logger.debug('📊 Detailed JSON Healing Strategy Breakdown', summary.strategyBreakdown);
    }
  }
}

// Global stats instance
const healingStats = new JSONHealingStats();

/**
 * Validates if a string is valid JSON
 */
function validateJSON(jsonString: string): { valid: boolean; error?: string } {
  try {
    JSON.parse(jsonString);
    return { valid: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return { valid: false, error: errorMsg };
  }
}

/**
 * Attempts to repair broken JSON using multiple strategies
 * @param jsonString The potentially broken JSON string
 * @returns RepairResult with the repaired JSON if successful
 */
export function healJSON(jsonString: string): RepairResult {
  // Check if already valid
  const originalValidation = validateJSON(jsonString);
  if (originalValidation.valid) {
    const result = { 
      valid: true, 
      repaired: jsonString,
      strategy: 'already-valid'
    };
    
    // Record statistics
    healingStats.recordAttempt(result);
    
    return result;
  }

  // Log the original error
  logger.debug(`JSON validation failed: ${originalValidation.error}`);

  // 0️⃣ Remove comments first
  const withoutComments = strip(jsonString);

  // 1️⃣ Try jsonrepair for quick wins
  try {
    const primary = jsonrepair(withoutComments);
    if (validateJSON(primary).valid) {
      logger.debug('JSON healed using jsonrepair strategy');
      const result = { 
        valid: true, 
        repaired: primary,
        strategy: 'jsonrepair'
      };
      
      // Record statistics
      healingStats.recordAttempt(result, originalValidation.error);
      
      return result;
    }
  } catch (error) {
    logger.debug(`jsonrepair failed: ${error}`);
  }

  // 2️⃣ Try dirty-json for ugliness handling
  try {
    const obj = (dJSON as any).parse(withoutComments);
    const repaired = JSON.stringify(obj, null, 2);
    if (validateJSON(repaired).valid) {
      logger.debug('JSON healed using dirty-json strategy');
      const result = { 
        valid: true, 
        repaired,
        strategy: 'dirty-json'
      };
      
      // Record statistics
      healingStats.recordAttempt(result, originalValidation.error);
      
      return result;
    }
  } catch (error) {
    logger.debug(`dirty-json failed: ${error}`);
  }

  // 3️⃣ Try jsonc-parser's tolerant mode
  try {
    const maybe = parseJsonC(withoutComments);
    if (maybe !== void 0) {
      const repaired = JSON.stringify(maybe, null, 2);
      if (validateJSON(repaired).valid) {
        logger.debug('JSON healed using jsonc-parser strategy');
        const result = { 
          valid: true, 
          repaired,
          strategy: 'jsonc-parser'
        };
        
        // Record statistics
        healingStats.recordAttempt(result, originalValidation.error);
        
        return result;
      }
    }
  } catch (error) {
    logger.debug(`jsonc-parser failed: ${error}`);
  }

  // 4️⃣ Last-ditch: Custom multiline-first approach
  let result = withoutComments;
  
  // Fix unescaped newlines first
  result = fixUnescapedNewlines(result);
  if (validateJSON(result).valid) {
    logger.debug('JSON healed using custom newline fix');
    const healResult = { 
      valid: true, 
      repaired: result,
      strategy: 'custom-newline'
    };
    
    // Record statistics
    healingStats.recordAttempt(healResult, originalValidation.error);
    
    return healResult;
  }
  
  // Then fix unescaped quotes
  result = fixUnescapedQuotes(result);
  if (validateJSON(result).valid) {
    logger.debug('JSON healed using custom quote fix');
    const healResult = { 
      valid: true, 
      repaired: result,
      strategy: 'custom-full'
    };
    
    // Record statistics
    healingStats.recordAttempt(healResult, originalValidation.error);
    
    return healResult;
  }

  // All strategies failed
  const finalValidation = validateJSON(result);
  logger.warn(`JSON healing failed - all strategies exhausted. Final error: ${finalValidation.error}`);
  
  const failedResult = {
    valid: false,
    error: finalValidation.error || originalValidation.error,
    repaired: result // Return best attempt
  };
  
  // Record failed attempt statistics
  healingStats.recordAttempt(failedResult, originalValidation.error);
  
  return failedResult;
}

/**
 * Fix unescaped newlines in ALL strings
 */
function fixUnescapedNewlines(source: string): string {
  let inString = false;
  let escape = false;
  let out = '';

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];

    if (!inString) {
      if (ch === '"') { inString = true; }
      out += ch;
    } else { // inside quoted string
      if (escape) { 
        out += ch; 
        escape = false; 
        continue; 
      }

      if (ch === '\\') { 
        out += ch; 
        escape = true; 
      }
      else if (ch === '"') {
        inString = false; 
        out += ch;
      }
      else if (ch === '\n') { 
        out += '\\n'; // escape newline
      }
      else if (ch === '\r') { 
        out += '\\r'; // escape carriage return
      }
      else if (ch === '\t') { 
        out += '\\t'; // escape tab
      }
      else { 
        out += ch; 
      }
    }
  }
  return out;
}

/**
 * Fix unescaped quotes in ALL strings
 */
function fixUnescapedQuotes(source: string): string {
  let inString = false;
  let escape = false;
  let out = '';

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];

    if (!inString) {
      if (ch === '"') { inString = true; }
      out += ch;
    } else { // inside quoted string
      if (escape) { 
        out += ch; 
        escape = false; 
        continue; 
      }

      if (ch === '\\') { 
        out += ch; 
        escape = true; 
      }
      else if (ch === '"') {
        // heuristically decide whether this " should be escaped
        const next = source[i + 1] ?? '';
        if (!/[,:}\]\s]/.test(next)) { 
          out += '\\"'; // internal quote - escape it
        }
        else { 
          inString = false; 
          out += ch; // end of string
        }
      }
      else { 
        out += ch; 
      }
    }
  }
  return out;
}

/**
 * Export functions for accessing JSON healing statistics
 */

/**
 * Get current JSON healing statistics
 */
export function getHealingStats() {
  return healingStats.getStats();
}

/**
 * Get a formatted summary of JSON healing statistics
 */
export function getHealingSummary() {
  return healingStats.getSummary();
}

/**
 * Log a comprehensive statistics summary
 */
export function logHealingStatsSummary() {
  healingStats.logPeriodicSummary();
}

/**
 * Get individual stats for detailed analysis
 */
export function getDetailedHealingStats() {
  const stats = healingStats.getStats();
  const summary = healingStats.getSummary();
  
  return {
    detailedStats: stats,
    summary,
    recommendations: generateRecommendations(summary),
  };
}

/**
 * Generate recommendations based on healing statistics
 */
function generateRecommendations(summary: any): string[] {
  const recommendations: string[] = [];
  
  if (summary.totalAttempts === 0) {
    return ['No JSON healing attempts recorded yet'];
  }

  // Overall success rate recommendations
  if (summary.overallSuccessRate < 80) {
    recommendations.push('Overall success rate is low - consider improving AI prompt quality or output format');
  }

  // Strategy effectiveness recommendations
  if (summary.mostEffectiveStrategy === 'jsonrepair' && summary.mostEffectiveStrategyCount > summary.totalAttempts * 0.4) {
    recommendations.push('jsonrepair is highly effective - most JSON issues are minor formatting problems');
  } else if (summary.mostEffectiveStrategy === 'dirty-json') {
    recommendations.push('dirty-json is most effective - AI output has significant formatting issues that need tolerance');
  } else if (summary.mostEffectiveStrategy === 'custom-newline' || summary.mostEffectiveStrategy === 'custom-full') {
    recommendations.push('Custom strategies are most needed - consider improving AI prompts to reduce complex JSON issues');
  }

  // Error pattern recommendations
  if (summary.mostCommonError === 'unexpected-token') {
    recommendations.push('Most failures due to unexpected tokens - review AI output for malformed JSON structure');
  } else if (summary.mostCommonError === 'unterminated-string') {
    recommendations.push('Most failures due to unterminated strings - AI may be generating incomplete responses');
  } else if (summary.mostCommonError === 'newline-issue') {
    recommendations.push('Newline issues are common - consider updating AI prompts to avoid unescaped newlines');
  }

  // Healing frequency recommendations
  if (summary.healingNeededRate > 50) {
    recommendations.push('High healing rate indicates AI output quality could be improved with better prompts');
  } else if (summary.healingNeededRate < 10) {
    recommendations.push('Low healing rate indicates good AI output quality - JSON healing system is working well');
  }

  if (recommendations.length === 0) {
    recommendations.push('JSON healing statistics look healthy - no immediate issues detected');
  }

  return recommendations;
}