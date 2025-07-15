/**
 * @file HTTP Client Utilities
 *
 * Centralized HTTP client configuration using ky for consistent
 * request handling, retry logic, and error management across all modules.
 */

import ky, { type KyInstance, type Options } from 'ky';

// Default HTTP client configuration
const DEFAULT_OPTIONS: Options = {
  retry: {
    limit: 3,
    methods: ['get', 'head'],
    statusCodes: [408, 413, 429, 500, 502, 503, 504],
    backoffLimit: 3000,
  },
  timeout: 30_000,
  headers: {
    'User-Agent': 'linkie-porting-intelligence/1.0.0',
  },
};

/**
 * Create a configured HTTP client instance
 */
export function createHttpClient(options: Partial<Options> = {}): KyInstance {
  return ky.create({
    ...DEFAULT_OPTIONS,
    ...options,
    headers: {
      ...DEFAULT_OPTIONS.headers,
      ...options.headers,
    },
  });
}

/**
 * Default HTTP client instance
 */
export const httpClient = createHttpClient();

/**
 * GitHub API client with appropriate headers
 */
export const githubClient = createHttpClient({
  headers: {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'linkie-porting-intelligence/1.0.0',
  },
});

/**
 * Maven repository client
 */
export const mavenClient = createHttpClient({
  headers: {
    Accept: 'application/xml, text/xml',
  },
});

/**
 * RSS/XML feed client
 */
export const rssClient = createHttpClient({
  headers: {
    Accept: 'application/rss+xml, application/xml, text/xml',
  },
});

/**
 * Type-safe JSON response helper
 */
export async function fetchJson<T>(url: string, options?: Options): Promise<T> {
  return httpClient.get(url, options).json<T>();
}

/**
 * Type-safe text response helper
 */
export async function fetchText(
  url: string,
  options?: Options
): Promise<string> {
  return httpClient.get(url, options).text();
}

/**
 * Error handling utilities
 */
export class HttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly url: string
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/**
 * Create HTTP error from ky response
 */
export function createHttpError(error: any, url: string): HttpError {
  const status = error.response?.status || 0;
  const message = `HTTP ${status}: ${error.message}`;
  return new HttpError(message, status, url);
}
