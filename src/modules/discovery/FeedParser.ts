/**
 * @file Feed Parser - Parses RSS and Atom feeds
 *
 * This module handles parsing both RSS and Atom feed formats,
 * extracting relevant post information.
 */

/**
 * Feed parser class
 */
export class FeedParser {
  /**
   * Parse RSS feed content and extract post information
   * Supports both RSS format (<item>) and Atom format (<entry>)
   */
  parseRSSFeed(rssContent: string) {
    // Detect feed format
    const isAtomFeed = rssContent.includes('<entry') && rssContent.includes('</entry>');

    if (isAtomFeed) {
      return this._parseAtomFeed(rssContent);
    } else {
      return this._parseRSSFormat(rssContent);
    }
  }

  /**
   * Parse RSS format feeds (<item> tags)
   */
  _parseRSSFormat(rssContent: string) {
    const posts = [];

    const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/g;
    const titleRegex = /<title[^>]*><!\[CDATA\[(.*?)\]\]><\/title>|<title[^>]*>(.*?)<\/title>/;
    const linkRegex = /<link[^>]*>(.*?)<\/link>/;
    const descRegex =
      /<description[^>]*><!\[CDATA\[(.*?)\]\]><\/description>|<description[^>]*>(.*?)<\/description>/;
    const dateRegex = /<pubDate[^>]*>(.*?)<\/pubDate>/;

    let match;
    while ((match = itemRegex.exec(rssContent)) !== null) {
      const itemContent = match[1];

      const titleMatch = titleRegex.exec(itemContent);
      const linkMatch = linkRegex.exec(itemContent);
      const descMatch = descRegex.exec(itemContent);
      const dateMatch = dateRegex.exec(itemContent);

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
  _parseAtomFeed(atomContent: string) {
    const posts = [];

    const entryRegex = /<entry[^>]*>([\s\S]*?)<\/entry>/g;
    const titleRegex = /<title[^>]*><!\[CDATA\[(.*?)\]\]><\/title>|<title[^>]*>(.*?)<\/title>/;
    const linkRegex = /<link[^>]*href=['"]([^'"]*)['"]/;
    const contentRegex =
      /<content[^>]*><!\[CDATA\[(.*?)\]\]><\/content>|<content[^>]*>(.*?)<\/content>/;
    const summaryRegex =
      /<summary[^>]*><!\[CDATA\[(.*?)\]\]><\/summary>|<summary[^>]*>(.*?)<\/summary>/;
    const dateRegex = /<published[^>]*>(.*?)<\/published>|<updated[^>]*>(.*?)<\/updated>/;

    let match;
    while ((match = entryRegex.exec(atomContent)) !== null) {
      const entryContent = match[1];

      const titleMatch = titleRegex.exec(entryContent);
      const linkMatch = linkRegex.exec(entryContent);
      const contentMatch = contentRegex.exec(entryContent);
      const summaryMatch = summaryRegex.exec(entryContent);
      const dateMatch = dateRegex.exec(entryContent);

      if (titleMatch && linkMatch) {
        // Use content if available, otherwise summary, otherwise empty
        const description = contentMatch
          ? contentMatch[1] || contentMatch[2] || ''
          : summaryMatch
            ? summaryMatch[1] || summaryMatch[2] || ''
            : '';

        posts.push({
          title: titleMatch[1] || titleMatch[2] || '',
          url: linkMatch[1] || '',
          description: description,
          date: dateMatch ? dateMatch[1] || dateMatch[2] || '' : '',
        });
      }
    }

    return posts;
  }
}

export default FeedParser;
