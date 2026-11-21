import { create } from 'zustand';

export type ToastTone = 'success' | 'error' | 'info';

export interface Toast {
  readonly id: number;
  readonly tone: ToastTone;
  readonly title: string;
  readonly description?: string | undefined;
  /** Toasts with the same key replace each other instead of stacking. */
  readonly key?: string | undefined;
}

interface ToastState {
  readonly toasts: readonly Toast[];
  readonly push: (toast: Omit<Toast, 'id'>) => number;
  readonly dismiss: (id: number) => void;
}

const MAX_VISIBLE = 4;
let nextId = 1;

/** Transient UI feedback. Never business state: nothing here is persisted. */
export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],
  push: (toast) => {
    const id = nextId++;
    set((state) => ({
      toasts: [
        ...state.toasts.filter((item) => toast.key === undefined || item.key !== toast.key),
        { ...toast, id },
      ].slice(-MAX_VISIBLE),
    }));
    return id;
  },
  dismiss: (id) => {
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }));
  },
}));

export const toast = {
  success: (title: string, description?: string) =>
    useToastStore.getState().push({ tone: 'success', title, description }),
  error: (title: string, description?: string, key?: string) =>
    useToastStore.getState().push({ tone: 'error', title, description, key }),
  info: (title: string, description?: string) =>
    useToastStore.getState().push({ tone: 'info', title, description }),
};
