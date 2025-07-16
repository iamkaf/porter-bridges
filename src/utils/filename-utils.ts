/**
 * @file Filename Utilities - Standardized filename generation across modules
 * 
 * This module provides consistent filename generation logic to avoid mismatches
 * between discovery, collection, and packaging modules.
 */

/**
 * Generate a safe filename from a URL with standardized encoding
 */
export function generateSafeFilename(url: string): string {
  // Decode URL-encoded characters first to handle %2B, %20, etc.
  const decoded = decodeURIComponent(url);
  
  // Convert to safe filename
  const cleaned = decoded
    .replace(/^https?:\/\//, '')
    .replace(/[^\w\-_.~]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  
  return cleaned;
}

/**
 * Generate collected content filename with appropriate extension
 */
export function generateCollectedContentFilename(url: string, sourceType?: string): string {
  const baseName = generateSafeFilename(url);
  
  // Determine extension based on source type or URL
  let extension = '.html'; // default
  
  if (sourceType === 'changelog' || url.includes('changelog')) {
    if (url.includes('github.com') && url.includes('releases')) {
      extension = '.md'; // GitHub releases are markdown
    } else {
      extension = '.txt'; // Maven changelog files are text
    }
  } else if (url.includes('github.com') && url.includes('releases')) {
    extension = '.md'; // GitHub releases are markdown
  } else if (url.includes('.md')) {
    extension = '.md';
  }
  
  return `${baseName}${extension}`;
}

/**
 * Generate distilled content filename
 */
export function generateDistilledContentFilename(url: string): string {
  const baseName = url.replace(/[^a-zA-Z0-9]/g, '_');
  return `${baseName}.json`;
}

/**
 * Generate raw content filename for packaging
 */
export function generateRawContentFilename(source: any): string {
  const type = source.source_type || 'unknown';
  const loaderType = source.loader_type || 'unknown';
  const version = source.minecraft_version || 'unknown';

  // Determine file extension based on source type
  let extension: string;
  if (source.source_type === 'primer') {
    extension = 'md';
  } else if (source.source_type === 'blog_post') {
    extension = 'html';
  } else if (source.source_type === 'changelog') {
    extension = 'txt';
  } else {
    extension = 'html';
  }

  return `${loaderType}-${type}-${version}.${extension}`;
}