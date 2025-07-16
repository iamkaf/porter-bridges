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
    return { 
      valid: true, 
      repaired: jsonString,
      strategy: 'already-valid'
    };
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
      return { 
        valid: true, 
        repaired: primary,
        strategy: 'jsonrepair'
      };
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
      return { 
        valid: true, 
        repaired,
        strategy: 'dirty-json'
      };
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
        return { 
          valid: true, 
          repaired,
          strategy: 'jsonc-parser'
        };
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
    return { 
      valid: true, 
      repaired: result,
      strategy: 'custom-newline'
    };
  }
  
  // Then fix unescaped quotes
  result = fixUnescapedQuotes(result);
  if (validateJSON(result).valid) {
    logger.debug('JSON healed using custom quote fix');
    return { 
      valid: true, 
      repaired: result,
      strategy: 'custom-full'
    };
  }

  // All strategies failed
  const finalValidation = validateJSON(result);
  logger.warn(`JSON healing failed - all strategies exhausted. Final error: ${finalValidation.error}`);
  
  return {
    valid: false,
    error: finalValidation.error || originalValidation.error,
    repaired: result // Return best attempt
  };
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