import { defineConfig } from 'vite';

// base relativa: funciona en https://<usuario>.github.io/<repo>/ sin importar el nombre del repo
export default defineConfig({ base: './' });
