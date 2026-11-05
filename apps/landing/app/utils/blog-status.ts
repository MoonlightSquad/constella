/**
 * Сторінка блогу не повинна плутати два різні стани: «такої статті чи архіву немає» (404)
 * і «даних зараз не дістати» (відмова бази, вичерпаний ліміт з'єднань, 5xx апстриму).
 * Перше Google прибирає з індексу й не повертається, друге — тимчасове, і для нього
 * правильний 5xx: краулер і читач повернуться, а індекс не переписати порожнім.
 * Порожній список без помилки лишається порожнім списком: він і є чесний «архів без статей».
 */
export const throwBlogUnavailable = (error: unknown, labels: { notFound: string; unavailable: string }): never => {
  const notFound = (error as { statusCode?: number } | null)?.statusCode === 404;
  throw createError({
    statusCode: notFound ? 404 : 502,
    statusMessage: notFound ? labels.notFound : labels.unavailable,
  });
};
