import { defineConfig } from 'vite';
import { handleBooksApi } from './src/books-api.js';
import { DEVELOPMENT_PUBLIC_TOKEN_SECRET, handlePublicBook } from './src/public-books.js';

function booksApi() {
  return {
    name: 'books-api',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (await handlePublicBook(request, response, {
          secret: DEVELOPMENT_PUBLIC_TOKEN_SECRET,
        })) return;
        if (!await handleBooksApi(request, response)) next();
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [booksApi()],
  build: { outDir: 'dist/client', emptyOutDir: true },
});
