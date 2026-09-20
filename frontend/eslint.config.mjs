import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Two distinct cases, both deliberate:
      //   - the logo is sized with CSS percentages inside a round frame, which
      //     next/image cannot express without intrinsic width/height;
      //   - student photoUrl values are arbitrary remote URLs, so next/image
      //     would require opening up images.remotePatterns to hosts we do not
      //     control.
      // Revisit if either becomes a measured LCP problem.
      "@next/next/no-img-element": "off",

      // React Compiler advisory, downgraded from error to warning.
      //
      // The remaining hits are patterns with no better formulation: reading
      // localStorage on mount (it cannot be touched during render), closing
      // the mobile sidebar on a route change, and resetting a form when its
      // subject prop changes. Each costs one extra render and none is a
      // correctness bug. Kept as a warning so genuinely new cases still show
      // up rather than being silenced.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
