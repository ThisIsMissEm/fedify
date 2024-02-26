import { Federation } from "fedify/federation/middleware.ts";
import {
  Activity,
  Create,
  CryptographicKey,
  Note,
  Person,
} from "fedify/vocab/mod.ts";
import { getBlog } from "../models/blog.ts";
import { countPosts, getPosts } from "../models/post.ts";

// The `Federation<TContextData>` object is a registry that registers
// federation-related callbacks:
export const federation = new Federation<Deno.Kv>();

// Registers the actor dispatcher, which is responsible for creating a
// `Actor` object (`Person` in this case) for a given actor URI.
// The actor dispatch is not only used for the actor URI, but also for
// the WebFinger resource:
federation.setActorDispatcher("/users/{handle}", async (ctx, handle) => {
  const blog = await getBlog();
  if (blog == null) return null;
  else if (blog.handle !== handle) return null;
  return new Person({
    id: ctx.getActorUri(handle),
    name: blog.title,
    summary: blog.description,
    preferredUsername: handle,
    url: new URL("/", ctx.request.url),
    outbox: ctx.getOutboxUri(handle),
    inbox: new URL(`${ctx.getActorUri(handle)}/inbox`), // FIXME
    publicKey: new CryptographicKey({
      id: new URL(`${ctx.getActorUri(handle)}#main-key`),
      owner: ctx.getActorUri(handle),
      publicKey: blog.publicKey,
    }),
  });
});

// Registers the outbox dispatcher, which is responsible for listing
// activities in the outbox:
federation.setOutboxDispatcher(
  "/users/{handle}/outbox",
  async (ctx, handle, cursor) => {
    if (cursor == null) return null;
    const blog = await getBlog();
    if (blog == null) return null;
    else if (blog.handle !== handle) return null;
    const activities: Activity[] = [];
    const { posts, nextCursor } = await getPosts(
      undefined,
      // Treat the empty string as the first cursor:
      cursor === "" ? undefined : cursor,
    );
    for await (const post of posts) {
      const activity = new Create({
        actor: ctx.getActorUri(handle),
        object: new Note({
          attributedTo: ctx.getActorUri(handle),
          content: post.content,
          published: post.published,
          url: new URL(`/posts/${post.uuid}`, ctx.request.url),
        }),
      });
      activities.push(activity);
    }
    return {
      items: activities,
      nextCursor,
    };
  },
)
  // Registers the outbox counter, which is responsible for counting the
  // total number of activities in the outbox:
  .setCounter(async (_ctx, handle) => {
    const blog = await getBlog();
    if (blog == null) return null;
    else if (blog.handle !== handle) return null;
    return countPosts();
  })
  // Registers the first cursor.  The cursor value here is arbitrary, but
  // it must be parsable by the outbox dispatcher:
  .setFirstCursor(async (_ctx, handle) => {
    const blog = await getBlog();
    if (blog == null) return null;
    else if (blog.handle !== handle) return null;
    // Treat the empty string as the first cursor:
    return "";
  });
