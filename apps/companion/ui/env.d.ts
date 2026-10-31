declare module "*.png" {
  const src: string;
  export default src;
}

interface TauriDialog {
  open: (options: Record<string, unknown>) => Promise<string | string[] | null>;
  ask: (message: string, options?: Record<string, unknown>) => Promise<boolean>;
}

interface Window {
  __TAURI__?: {
    core?: {
      invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
    };
    dialog?: TauriDialog;
    event?: {
      listen: (event: string, handler: () => void) => Promise<unknown>;
    };
  };
}
