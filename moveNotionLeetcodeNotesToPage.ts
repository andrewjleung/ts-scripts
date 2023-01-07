import { Client } from "@notionhq/client";
import {
  PageObjectResponse,
  RichTextItemResponse,
  BlockObjectRequest,
  QueryDatabaseResponse,
} from "@notionhq/client/build/src/api-endpoints";

type ParagraphBlockObjectRequest = Extract<
  BlockObjectRequest,
  { type?: "paragraph" }
>;

type RichTextItemRequest = Extract<
  BlockObjectRequest,
  { type?: "paragraph" }
>["paragraph"]["rich_text"][number];

function richTextMentionItemResponseToRequest(
  mention: Extract<RichTextItemResponse, { type?: "mention" }>["mention"]
): Extract<RichTextItemRequest, { type?: "mention" }>["mention"] {
  switch (mention.type) {
    case "database":
      return {
        database: mention.database,
      };
    case "date":
      return {
        date: mention.date,
      };
    case "page":
      return {
        page: mention.page,
      };
    case "user":
      return {
        user: mention.user,
      };
    case "link_preview":
    case "template_mention":
      throw new Error("Unsupported.");
    default:
      throw new Error("Unrecognized mention type.");
  }
}

function richTextItemResponseToRequest(
  response: RichTextItemResponse
): RichTextItemRequest {
  switch (response.type) {
    case "text":
    case "equation":
      return response;
    case "mention":
      return {
        ...response,
        mention: richTextMentionItemResponseToRequest(response.mention),
      };
    default:
      throw new Error("Unrecognized rich text type.");
  }
}

function block(richText: RichTextItemRequest[]): ParagraphBlockObjectRequest {
  return {
    type: "paragraph",
    paragraph: {
      rich_text: richText,
    },
  };
}

function splitDoubleNewlinesIntoBlocksReducer(
  acc: ParagraphBlockObjectRequest[],
  request: RichTextItemRequest
): ParagraphBlockObjectRequest[] {
  const lastBlock = acc.pop() || block([]);

  if (request.type !== "text") {
    lastBlock.paragraph.rich_text.push(request);
    acc.push(lastBlock);
    return acc;
  }

  // If it is text, check if this text needs to be split. If so, then the first
  // member of the split needs to be merged with the previous block, and all
  // subsequent member should become their own SINGLE blocks. This is necessary
  // to convert newlines within the property into different blocks ONLY. Other
  // things like annotated spans of text should not become new blocks.

  // There should be at least one element returned from this.
  const splits = request.text.content.split("\n\n");
  const first = splits.shift();

  if (first === undefined) {
    throw new Error("Request missing content.");
  }

  lastBlock.paragraph.rich_text.push({
    ...request,
    text: {
      ...request.text,
      content: first,
    },
  });

  acc.push(lastBlock);
  return acc.concat(
    splits.map((split) => block([{ ...request, text: { content: split } }]))
  );
}

const notion = new Client({
  auth: process.env.NOTION_TOKEN,
});

const searchResponse = await notion.search({
  query: "Leetcode",
  filter: {
    property: "object",
    value: "database",
  },
});

const leetcodeDatabaseId = (() => {
  if (searchResponse.results[0]?.id === undefined) {
    process.exit(1);
  }

  return searchResponse.results[0]?.id;
})();

let hasMore: boolean = true;
let nextCursor: string | undefined = undefined;

while (hasMore) {
  const databaseResponse: QueryDatabaseResponse = await notion.databases.query({
    database_id: leetcodeDatabaseId,
    start_cursor: nextCursor,
    page_size: 100,
    filter: {
      and: [
        {
          property: "Notes",
          rich_text: {
            is_not_empty: true,
          },
        },
      ],
    },
  });

  await Promise.allSettled(
    databaseResponse.results.map(async (page) => {
      const pageResponse = await notion.pages.retrieve({
        page_id: page.id,
      });

      const notes = (pageResponse as PageObjectResponse).properties["Notes"];

      if (notes.type !== "rich_text") {
        throw new Error("Expecting rich text within the notes property.");
      }

      await notion.blocks.children.append({
        block_id: page.id,
        children: notes.rich_text
          .map(richTextItemResponseToRequest)
          .reduce(splitDoubleNewlinesIntoBlocksReducer, []),
      });
    })
  );

  hasMore = databaseResponse.has_more;
  nextCursor = databaseResponse.next_cursor || undefined;
}
