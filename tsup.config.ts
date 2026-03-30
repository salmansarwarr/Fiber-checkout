import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],       // dual output
  dts: true,                    // generate .d.ts files
  sourcemap: true,
  clean: true,                  // wipe dist/ before each build
  external: ["react", "react-dom", "react/jsx-runtime"],// don't bundle peer deps
  treeshake: true,
  splitting: true
});