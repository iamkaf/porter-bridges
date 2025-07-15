/**
 * @file Cross Reference Analyzer - Analyzes relationships between content items
 *
 * This module handles the complex logic for identifying relationships between
 * different content items (breaking changes, API updates, etc.) and creates
 * cross-references to improve content discoverability.
 */

import { logger } from '../../utils/logger';

export interface ICrossReferenceItem {
  id?: string;
  title?: string;
  description?: string;
  affected_apis?: string[];
  severity?: string;
  source_url?: string;
  cross_references?: IRelatedItem[];
  deduplication_key?: string;
  sources?: string[];
}

export interface IRelatedItem {
  id: string;
  title: string;
  relationship_type: string;
  relationship_score: number;
}

/**
 * Analyzes and creates cross-references between content items
 */
export class CrossReferenceAnalyzer {
  /**
   * Calculate relationship score between two items (0-1)
   */
  calculateRelationshipScore(
    item1: ICrossReferenceItem,
    item2: ICrossReferenceItem
  ): number {
    let score = 0;

    // API overlap (weighted heavily)
    const apis1 = new Set(
      (item1.affected_apis || []).map((api) => api.toLowerCase())
    );
    const apis2 = new Set(
      (item2.affected_apis || []).map((api) => api.toLowerCase())
    );
    const commonApis = new Set([...apis1].filter((x) => apis2.has(x)));

    if (apis1.size > 0 && apis2.size > 0) {
      const apiOverlap = commonApis.size / Math.min(apis1.size, apis2.size);
      score += apiOverlap * 0.6; // 60% weight for API overlap
    }

    // Title similarity (keyword overlap)
    const words1 = (item1.title || '')
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3);
    const words2 = (item2.title || '')
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3);
    const commonWords = words1.filter((w) => words2.includes(w));

    if (words1.length > 0 && words2.length > 0) {
      const titleSimilarity =
        commonWords.length / Math.max(words1.length, words2.length);
      score += titleSimilarity * 0.3; // 30% weight for title similarity
    }

    // Severity/type match (bonus)
    if (item1.severity === item2.severity) {
      score += 0.1; // 10% bonus for same severity
    }

    return Math.min(score, 1);
  }

  /**
   * Determine the type of relationship between items
   */
  determineRelationshipType(
    item1: ICrossReferenceItem,
    item2: ICrossReferenceItem,
    score: number
  ): string {
    const apis1 = new Set(
      (item1.affected_apis || []).map((api) => api.toLowerCase())
    );
    const apis2 = new Set(
      (item2.affected_apis || []).map((api) => api.toLowerCase())
    );
    const commonApis = new Set([...apis1].filter((x) => apis2.has(x)));

    if (commonApis.size > 0) {
      if (score > 0.7) {
        return 'strongly_related';
      }
      if (score > 0.5) {
        return 'related';
      }
      return 'affects_same_apis';
    }

    if (score > 0.4) {
      return 'similar';
    }
    return 'tangentially_related';
  }

  /**
   * Add cross-references between related items
   */
  addCrossReferences(items: ICrossReferenceItem[]): ICrossReferenceItem[] {
    const withCrossRefs = items.map((item) => ({ ...item }));

    for (let i = 0; i < withCrossRefs.length; i++) {
      const currentItem = withCrossRefs[i];
      const relatedItems: IRelatedItem[] = [];

      for (let j = 0; j < withCrossRefs.length; j++) {
        if (i === j) {
          continue;
        }

        const otherItem = withCrossRefs[j];
        const relationshipScore = this.calculateRelationshipScore(
          currentItem,
          otherItem
        );

        if (relationshipScore > 0.3) {
          // Threshold for related items
          relatedItems.push({
            id: otherItem.id || `item_${j}`,
            title: otherItem.title || 'Unknown',
            relationship_type: this.determineRelationshipType(
              currentItem,
              otherItem,
              relationshipScore
            ),
            relationship_score: Math.round(relationshipScore * 100) / 100,
          });
        }
      }

      if (relatedItems.length > 0) {
        currentItem.cross_references = relatedItems.sort(
          (a, b) => b.relationship_score - a.relationship_score
        );
      }
    }

    return withCrossRefs;
  }

  /**
   * Count total cross-references added
   */
  countCrossReferences(items: ICrossReferenceItem[]): number {
    return items.reduce((total, item) => {
      return total + (item.cross_references ? item.cross_references.length : 0);
    }, 0);
  }

  /**
   * Apply cross-referencing and de-duplication to content items
   */
  processWithCrossReferences(
    items: ICrossReferenceItem[],
    itemType: string
  ): ICrossReferenceItem[] {
    if (!items || items.length === 0) {
      return [];
    }

    logger.info(
      `🔗 Processing ${itemType} with cross-referencing and de-duplication`,
      {
        count: items.length,
      }
    );

    // Step 1: De-duplicate by similarity
    const deduplicated = this.deduplicateItems(items);

    // Step 2: Add cross-references
    const withCrossRefs = this.addCrossReferences(deduplicated);

    return withCrossRefs;
  }

  /**
   * Remove duplicate items based on title and affected APIs similarity
   */
  private deduplicateItems(
    items: ICrossReferenceItem[]
  ): ICrossReferenceItem[] {
    const seen = new Map<string, ICrossReferenceItem>();
    const deduplicated: ICrossReferenceItem[] = [];

    for (const item of items) {
      const key = this.generateDeduplicationKey(item);

      if (seen.has(key)) {
        const existing = seen.get(key)!;
        // Merge affected_apis and update description if current is more detailed
        if (
          item.description &&
          item.description.length > (existing.description?.length || 0)
        ) {
          existing.description = item.description;
        }
        if (item.affected_apis) {
          existing.affected_apis = [
            ...new Set([
              ...(existing.affected_apis || []),
              ...item.affected_apis,
            ]),
          ];
        }
        existing.sources = existing.sources || [];
        existing.sources.push(item.source_url || 'unknown');
      } else {
        const processedItem = {
          ...item,
          sources: [item.source_url || 'unknown'],
          deduplication_key: key,
        };
        seen.set(key, processedItem);
        deduplicated.push(processedItem);
      }
    }

    return deduplicated;
  }

  /**
   * Generate a key for deduplication based on title similarity and API overlap
   */
  private generateDeduplicationKey(item: ICrossReferenceItem): string {
    const title = (item.title || '').toLowerCase().trim();
    const apis = (item.affected_apis || [])
      .map((api) => api.toLowerCase().trim())
      .sort();

    // Create key from normalized title + first few APIs
    const titleKey = title.replace(/[^a-z0-9]/g, '').substring(0, 20);
    const apiKey = apis.slice(0, 3).join('-');

    return `${titleKey}-${apiKey}`;
  }
}
