import { getLogger } from "@logtape/logtape";
import {
  type DocumentLoader,
  fetchDocumentLoader,
} from "../runtime/docloader.ts";
import { lookupWebFinger } from "../webfinger/lookup.ts";
import { type Collection, type Link, Object } from "./vocab.ts";

const logger = getLogger(["fedify", "vocab", "lookup"]);

/**
 * Options for the {@link lookupObject} function.
 *
 * @since 0.2.0
 */
export interface LookupObjectOptions {
  /**
   * The document loader for loading remote JSON-LD documents.
   */
  documentLoader?: DocumentLoader;

  /**
   * The context loader for loading remote JSON-LD contexts.
   * @since 0.8.0
   */
  contextLoader?: DocumentLoader;
}

const handleRegexp =
  /^@?((?:[-A-Za-z0-9._~!$&'()*+,;=]|%[A-Fa-f0-9]{2})+)@([^@]+)$/;

/**
 * Looks up an ActivityStreams object by its URI (including `acct:` URIs)
 * or a fediverse handle (e.g., `@user@server` or `user@server`).
 *
 * @example
 * ``` typescript
 * // Look up an actor by its fediverse handle:
 * await lookupObject("@hongminhee@fosstodon.org");
 * // returning a `Person` object.
 *
 * // A fediverse handle can omit the leading '@':
 * await lookupObject("hongminhee@fosstodon.org");
 * // returning a `Person` object.
 *
 * // A `acct:` URI can be used as well:
 * await lookupObject("acct:hongminhee@fosstodon.org");
 * // returning a `Person` object.
 *
 * // Look up an object by its URI:
 * await lookupObject("https://todon.eu/@hongminhee/112060633798771581");
 * // returning a `Note` object.
 *
 * // It can be a `URL` object as well:
 * await lookupObject(new URL("https://todon.eu/@hongminhee/112060633798771581"));
 * // returning a `Note` object.
 * ```
 *
 * @param identifier The URI or fediverse handle to look up.
 * @param options Lookup options.
 * @returns The object, or `null` if not found.
 * @since 0.2.0
 */
export async function lookupObject(
  identifier: string | URL,
  options: LookupObjectOptions = {},
): Promise<Object | null> {
  const documentLoader = options.documentLoader ?? fetchDocumentLoader;
  if (typeof identifier === "string") {
    const match = handleRegexp.exec(identifier);
    if (match) identifier = `acct:${match[1]}@${match[2]}`;
    identifier = new URL(identifier);
  }
  let document: unknown | null = null;
  if (identifier.protocol === "http:" || identifier.protocol === "https:") {
    try {
      const remoteDoc = await documentLoader(identifier.href);
      document = remoteDoc.document;
    } catch (error) {
      logger.debug("Failed to fetch remote document:\n{error}", { error });
    }
  }
  if (document == null) {
    const jrd = await lookupWebFinger(identifier);
    if (jrd?.links == null) return null;
    for (const l of jrd.links) {
      if (
        l.type !== "application/activity+json" &&
          !l.type?.match(
            /application\/ld\+json;\s*profile="https:\/\/www.w3.org\/ns\/activitystreams"/,
          ) || l.rel !== "self"
      ) continue;
      try {
        const remoteDoc = await documentLoader(l.href);
        document = remoteDoc.document;
        break;
      } catch (error) {
        logger.debug("Failed to fetch remote document:\n{error}", { error });
        continue;
      }
    }
  }
  if (document == null) return null;
  try {
    return await Object.fromJsonLd(document, {
      documentLoader,
      contextLoader: options.contextLoader,
    });
  } catch (error) {
    if (error instanceof TypeError) {
      logger.debug("Failed to parse JSON-LD document:\n{error}", { error });
      return null;
    }
    throw error;
  }
}

/**
 * Options for the {@link traverseCollection} function.
 * @since 1.1.0
 */
export interface TraverseCollectionOptions {
  /**
   * The document loader for loading remote JSON-LD documents.
   */
  documentLoader?: DocumentLoader;

  /**
   * The context loader for loading remote JSON-LD contexts.
   */
  contextLoader?: DocumentLoader;
}

/**
 * Traverses a collection, yielding each item in the collection.
 * If the collection is paginated, it will fetch the next page
 * automatically.
 *
 * @example
 * ``` typescript
 * const collection = await lookupObject(collectionUrl);
 * if (collection instanceof Collection) {
 *   for await (const item of traverseCollection(collection)) {
 *     console.log(item.id?.href);
 *   }
 * }
 * ```
 *
 * @param collection The collection to traverse.
 * @param options Options for traversing the collection.
 * @returns An async iterable of each item in the collection.
 * @since 1.1.0
 */
export async function* traverseCollection(
  collection: Collection,
  options: TraverseCollectionOptions = {},
): AsyncIterable<Object | Link> {
  if (collection.firstId == null) {
    for await (const item of collection.getItems(options)) {
      yield item;
    }
  } else {
    let page = await collection.getFirst(options);
    while (page != null) {
      for await (const item of page.getItems(options)) {
        yield item;
      }
      page = await page.getNext(options);
    }
  }
}
