import { defineConfig } from 'vite';
import { listBooks } from './src/books.js';

function booksApi() {
  return {
    name: 'books-api',
    configureServer(server) {
      server.middlewares.use('/api/books', (_request, response) => {
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.setHeader('Cache-Control', 'no-store');
        response.end(JSON.stringify({ books: listBooks() }));
      });
    },
  };
}

export default defineConfig({
  plugins: [booksApi()],
  build: { outDir: 'dist/client', emptyOutDir: true },
});
