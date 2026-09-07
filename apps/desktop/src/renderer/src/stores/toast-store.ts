import { create } from 'zustand';
import type { NotificationDto } from '@rekordly/shared/contracts';

export interface Toast {
  id: number;
  level: NotificationDto['level'];
  title: string;
  message: string;
}

interface ToastState {
  toasts: Toast[];
  push(toast: Omit<Toast, 'id'>): void;
  remove(id: number): void;
}

let nextToastId = 1;

export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],
  push: (toast) => {
    const id = nextToastId;
    nextToastId += 1;
    set((state) => ({ toasts: [...state.toasts.slice(-4), { ...toast, id }] }));
  },
  remove: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}));
