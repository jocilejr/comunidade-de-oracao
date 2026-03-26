import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  base: "/",
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Core React — sempre necessário
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/') || id.includes('node_modules/react-router-dom/')) {
            return 'vendor-react';
          }
          // Supabase — necessário na página pública para buscar o funil
          if (id.includes('@supabase/')) {
            return 'vendor-supabase';
          }
          // Radix UI (pesado) — apenas dashboard
          if (id.includes('@radix-ui/')) {
            return 'vendor-radix';
          }
          // Recharts — apenas dashboard
          if (id.includes('recharts') || id.includes('d3-')) {
            return 'vendor-charts';
          }
          // Páginas de admin — apenas dashboard
          if (id.includes('/pages/Admin') || id.includes('/pages/Login') || id.includes('/pages/Index')) {
            return 'admin-pages';
          }
        },
      },
    },
    target: 'es2020',
    cssMinify: true,
    cssCodeSplit: true,
  },
}));
