/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_FIBER_NODE_URL: string;
    readonly VITE_FIBER_INVOICE_NODE_URL: string;
    readonly VITE_ALLOW_DIRECT_RPC: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}

declare module "*.module.css" {
    const classes: { [key: string]: string };
    export default classes;
}
