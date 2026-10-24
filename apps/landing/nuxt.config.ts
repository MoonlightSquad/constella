export default defineNuxtConfig({
  ssr: false,
  compatibilityDate: '2024-04-03',
  modules: ['@nuxtjs/tailwindcss'],

  app: {
    head: {
      title: 'Constella',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1.0' }
      ]
    }
  },

  vite: {
    server: {
      allowedHosts: true
    }
  }
})