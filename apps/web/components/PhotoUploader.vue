<script setup lang="ts">
import { onMounted, ref } from 'vue'
const props = defineProps<{ modelValue: string[] }>()
const emit = defineEmits<{ 'update:modelValue': [photos: string[]] }>()
const { $trpc } = useNuxtApp() as any
const assets = ref<any[]>([]), busy = ref(false), error = ref('')
const approved = () => {
  const set = new Set(assets.value.filter((a) => a.status === 'approved').map((a) => a.publicUrl))
  emit('update:modelValue', props.modelValue.filter((url) => set.has(url)))
}
const refresh = async () => { assets.value = await $trpc.photos.mine.query(); approved() }
const status = (v: string) => ({ approved: 'Схвалено', pending: 'На перевірці', rejected: 'Відхилено' } as any)[v] || v
const upload = async (event: Event) => {
  const input = event.target as HTMLInputElement, file = input.files?.[0]
  input.value = ''
  if (!file) return
  error.value = ''
  if (!['image/jpeg','image/png','image/webp'].includes(file.type)) { error.value = 'Підтримуються JPEG, PNG та WebP.'; return }
  if (file.size > 10 * 1024 * 1024) { error.value = 'Максимальний розмір фото — 10 МБ.'; return }
  if (assets.value.filter((a) => a.status !== 'rejected').length >= 6) { error.value = 'Можна завантажити до 6 фото.'; return }
  busy.value = true
  try {
    const target = await $trpc.photos.createUpload.mutate({ contentType: file.type })
    const response = await fetch(target.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file })
    if (!response.ok) throw new Error('Не вдалося завантажити фото у сховище.')
    await $trpc.photos.confirmUpload.mutate({ objectKey: target.objectKey, contentType: file.type })
    await refresh()
  } catch (e: any) { error.value = e?.message || 'Не вдалося обробити фото.' }
  finally { busy.value = false }
}
const remove = async (asset: any) => {
  try { await $trpc.photos.remove.mutate({ id: asset.id }); await refresh() }
  catch (e: any) { error.value = e?.message || 'Не вдалося видалити фото.' }
}
const toggle = (asset: any) => {
  const selected = props.modelValue.includes(asset.publicUrl)
  const next = selected ? props.modelValue.filter((u) => u !== asset.publicUrl) : [...props.modelValue, asset.publicUrl]
  if (next.length > 6) return
  emit('update:modelValue', next)
}
onMounted(() => { void refresh() })
</script>
<template><div class="photos"><label class="upload">Додати фото <input type="file" accept="image/jpeg,image/png,image/webp" :disabled="busy" @change="upload"/></label><span class="hint">JPEG, PNG або WebP · до 10 МБ · максимум 6 фото</span><p v-if="busy" class="hint">Завантажуємо та перевіряємо…</p><p v-if="error" class="error" role="alert">{{ error }}</p><div class="grid"><article v-for="asset in assets" :key="asset.id"><img :src="asset.publicUrl" alt="Фото профілю"/><strong>{{ status(asset.status) }}</strong><label v-if="asset.status === 'approved'"><input type="checkbox" :checked="modelValue.includes(asset.publicUrl)" @change="toggle(asset)"/> Додати до профілю</label><small v-if="asset.note">{{ asset.note }}</small><button type="button" @click="remove(asset)">Видалити</button></article></div><p>Для публікації анкети виберіть щонайменше два схвалені фото ({{ modelValue.length }}/6).</p></div></template>
<style scoped>
.photos{display:grid;gap:10px}.upload{position:relative;display:inline-flex;width:max-content;padding:11px 14px;border:1px solid #82c7b7;border-radius:9px;color:#d9f0e8;cursor:pointer}.upload input{position:absolute;inset:0;width:100%;opacity:0;cursor:pointer}.hint,.photos>p{color:#91a39f;font-size:12px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px}.grid article{display:grid;gap:7px;border:1px solid #344748;border-radius:10px;padding:8px;font-size:11px}.grid img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:7px}.grid button{border:0;background:transparent;color:#f29b8e;text-align:left;padding:2px}.error{color:#ff9c8f;font-size:12px}
</style>
