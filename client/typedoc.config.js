/** @type {import('typedoc').TypeDocOptions & import('typedoc-plugin-markdown').PluginOptions} */
const config = {
  entryPoints: ["./src/index.ts"],
  plugin: [
    "typedoc-plugin-markdown",
    "typedoc-plugin-frontmatter",
    "./typedoc-plugin-frontmatter.mjs",
  ],
  out: "../../cloudburst_website/content/docs/client-reference/",
  readme: "none",
  cleanOutputDir: true,
  hideBreadcrumbs: true,
  hidePageHeader: true,
  useCodeBlocks: true,
  expandObjects: true,
  expandParameters: true,
  publicPath: "/docs/client-reference",
};

export default config;
