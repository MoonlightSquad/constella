type PublishablePost = {
  title: string | null;
  excerpt: string | null;
  bodyMarkdown: string | null;
};

export const missingPublicationFields = (post: PublishablePost) =>
  ([
    !post.title?.trim() ? 'title' : null,
    !post.excerpt?.trim() ? 'excerpt' : null,
    !post.bodyMarkdown?.trim() ? 'bodyMarkdown' : null,
  ] as const).filter((field): field is 'title' | 'excerpt' | 'bodyMarkdown' => field !== null);
