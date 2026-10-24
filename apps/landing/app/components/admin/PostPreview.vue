<script setup lang="ts">
const props = defineProps<{ markdown: string; active: boolean }>();

const api = useAdminApi();
const rendered = ref('');
const error = ref('');

// The same server function the published page uses, so this preview cannot flatter the author.
const render = async () => {
  try {
    const result = await api.post<{ html: string }>('/api/admin/render', { markdown: props.markdown });
    rendered.value = result?.html ?? '';
    error.value = '';
  } catch (cause) {
    error.value = (cause as Error).message;
  }
};

let timer: ReturnType<typeof setTimeout> | undefined;
watch(
  () => [props.markdown, props.active] as const,
  ([markdown, active]) => {
    clearTimeout(timer);
    if (!active || !String(markdown).trim()) return;
    timer = setTimeout(render, 400);
  },
  { immediate: true },
);
onBeforeUnmount(() => clearTimeout(timer));

const docHtml = computed(
  () => `<!doctype html><html lang="uk"><head><meta charset="utf-8"><style>
body{margin:0;padding:20px;background:#0d1718;color:#f3f5f2;font:16px/1.7 system-ui,sans-serif;max-width:720px}
h1,h2,h3{line-height:1.2;letter-spacing:-.01em;margin:1.4em 0 .5em}h2{font-size:24px}h3{font-size:19px}
p{margin:0 0 1em}a{color:#9bd5c5}img{max-width:100%;height:auto;border-radius:10px}
blockquote{margin:1em 0;padding:0 0 0 16px;border-left:2px solid #82c7b7;color:#aab9b6}
pre{overflow:auto;padding:14px;border-radius:10px;background:#0b1214}code{font-family:ui-monospace,monospace;font-size:.92em}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #314343;padding:8px;text-align:start}
hr{border:0;border-top:1px solid #314343;margin:2em 0}ul,ol{padding-inline-start:1.3em}
</style></head><body>${rendered.value || '<p style="color:#9aaba7">Порожньо. Пиши текст — передивиться тут.</p>'}</body></html>`,
);
</script>

<template>
  <div>
    <iframe class="adm__preview" sandbox="" :srcdoc="docHtml" title="Попередній перегляд поста" />
    <p v-if="error" class="adm__error">{{ error }}</p>
    <p v-else class="adm__hint">Пісочниця без скриптів: це точна копія того, що віддасть продакшн.</p>
  </div>
</template>
