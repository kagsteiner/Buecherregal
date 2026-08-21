import { defineConfig } from 'vite';
import { handleBooksApi } from './src/books-api.js';

function booksApi() {
  return {
    name: 'books-api',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (!await handleBooksApi(request, response)) next();
      });
    },
  };
}

export default defineConfig({
  plugins: [booksApi()],
  build: { outDir: 'dist/client', emptyOutDir: true },
});
