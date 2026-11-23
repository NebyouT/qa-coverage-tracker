import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // PGlite (local dev database) and ExcelJS run on the server only and should not be bundled.
  serverExternalPackages: ['@electric-sql/pglite', 'exceljs'],
};

export default nextConfig;
