/**
 * @file Feed Parser - Parses RSS and Atom feeds
 *
 * This module handles parsing both RSS and Atom feed formats,
 * extracting relevant post information.
 */

interface FeedPost {
  title: string;
  url: string;
  description: string;
  date: string;
}

/**
 * Feed parser class
 */
export class FeedParser {
  // Regex for RSS format
  private static readonly ITEM_REGEX = /<item[^>]*>([\s\S]*?)<\/item>/g;
  private static readonly RSS_TITLE_REGEX =
    /<title[^>]*><!\[CDATA\[(.*?)\]\]><\/title>|<title[^>]*>(.*?)<\/title>/;
  private static readonly RSS_LINK_REGEX = /<link[^>]*>(.*?)<\/link>/;
  private static readonly RSS_DESC_REGEX =
    /<description[^>]*><!\[CDATA\[(.*?)\]\]><\/description>|<description[^>]*>(.*?)<\/description>/;
  private static readonly RSS_DATE_REGEX = /<pubDate[^>]*>(.*?)<\/pubDate>/;

  // Regex for Atom format
  private static readonly ENTRY_REGEX = /<entry[^>]*>([\s\S]*?)<\/entry>/g;
  private static readonly ATOM_TITLE_REGEX =
    /<title[^>]*><!\[CDATA\[(.*?)\]\]><\/title>|<title[^>]*>(.*?)<\/title>/;
  private static readonly ATOM_LINK_REGEX = /<link[^>]*href=['"]([^'"]*)['"]/;
  private static readonly ATOM_CONTENT_REGEX =
    /<content[^>]*><!\[CDATA\[(.*?)\]\]><\/content>|<content[^>]*>(.*?)<\/content>/;
  private static readonly ATOM_SUMMARY_REGEX =
    /<summary[^>]*><!\[CDATA\[(.*?)\]\]><\/summary>|<summary[^>]*>(.*?)<\/summary>/;
  private static readonly ATOM_DATE_REGEX =
    /<published[^>]*>(.*?)<\/published>|<updated[^>]*>(.*?)<\/updated>/;

  /**
   * Parse RSS feed content and extract post information
   * Supports both RSS format (<item>) and Atom format (<entry>)
   */
  parseRSSFeed(rssContent: string): FeedPost[] {
    // Detect feed format
    const isAtomFeed =
      rssContent.includes('<entry') && rssContent.includes('</entry>');

    if (isAtomFeed) {
      return this._parseAtomFeed(rssContent);
    }
    return this._parseRSSFormat(rssContent);
  }

  /**
   * Parse RSS format feeds (<item> tags)
   */
  _parseRSSFormat(rssContent: string): FeedPost[] {
    const posts: FeedPost[] = [];

    let matchResult: RegExpExecArray | null;
    while ((matchResult = FeedParser.ITEM_REGEX.exec(rssContent)) !== null) {
      const itemContent = matchResult[1];

      const titleMatch = FeedParser.RSS_TITLE_REGEX.exec(itemContent);
      const linkMatch = FeedParser.RSS_LINK_REGEX.exec(itemContent);
      const descMatch = FeedParser.RSS_DESC_REGEX.exec(itemContent);
      const dateMatch = FeedParser.RSS_DATE_REGEX.exec(itemContent);

      if (titleMatch && linkMatch) {
        posts.push({
          title: titleMatch[1] || titleMatch[2] || '',
          url: linkMatch[1] || '',
          description: descMatch ? descMatch[1] || descMatch[2] || '' : '',
          date: dateMatch ? dateMatch[1] : '',
        });
      }
    }

    return posts;
  }

  /**
   * Parse Atom format feeds (<entry> tags)
   */
  _parseAtomFeed(atomContent: string): FeedPost[] {
    const posts: FeedPost[] = [];

    let matchResult: RegExpExecArray | null;
    while ((matchResult = FeedParser.ENTRY_REGEX.exec(atomContent)) !== null) {
      const entryContent = matchResult[1];

      const titleMatch = FeedParser.ATOM_TITLE_REGEX.exec(entryContent);
      const linkMatch = FeedParser.ATOM_LINK_REGEX.exec(entryContent);
      const contentMatch = FeedParser.ATOM_CONTENT_REGEX.exec(entryContent);
      const summaryMatch = FeedParser.ATOM_SUMMARY_REGEX.exec(entryContent);
      const dateMatch = FeedParser.ATOM_DATE_REGEX.exec(entryContent);

      if (titleMatch && linkMatch) {
        // Use content if available, otherwise summary, otherwise empty
        let description = '';
        if (contentMatch) {
          description = contentMatch[1] || contentMatch[2] || '';
        } else if (summaryMatch) {
          description = summaryMatch[1] || summaryMatch[2] || '';
        }

        posts.push({
          title: titleMatch[1] || titleMatch[2] || '',
          url: linkMatch[1] || '',
          description,
          date: dateMatch ? dateMatch[1] || dateMatch[2] || '' : '',
        });
      }
    }

    return posts;
  }
}

export default FeedParser;
