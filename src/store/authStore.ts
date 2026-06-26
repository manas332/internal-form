import { create } from "zustand"

interface User {
  name?: string | null
  email?: string | null
  image?: string | null
}

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  setAuth: (user: User | null) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  setAuth: (user) => set({ user, isAuthenticated: !!user }),
  logout: () => set({ user: null, isAuthenticated: false }),
}))
